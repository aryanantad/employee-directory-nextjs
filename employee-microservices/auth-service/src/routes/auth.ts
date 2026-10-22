
import jwt from "jsonwebtoken";
import { Router, type Request, type Response } from "express";
import nodemailer from "nodemailer";
import {
  createHmac,
  randomInt,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "crypto";
import { prisma } from "../db.js";

const router = Router();

const OTP_LIFETIME_MS = 5 * 60 * 1000;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_LIFETIME_SECONDS = 60;
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const COOKIE_NAME = "auth_session";
const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";

const JWT_ISSUER = "employee-directory-auth";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hashOtp(email: string, otp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${email}:${otp}`)
    .digest("hex");
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim();

    if (key === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }

  return null;
}

function getUserRole(email: string): "admin" | "user" {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  return adminEmail && email === adminEmail ? "admin" : "user";
}

function clearAuthCookies(res: Response) {
  const isProduction = process.env.NODE_ENV === "production";

  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
  };

  res.clearCookie(COOKIE_NAME, options);
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
}

function setAuthCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

async function findSession(req: Request) {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.authSession.deleteMany({
        where: { id: session.id },
      });
    }

    return null;
  }

  return session;
}

// POST /api/auth/request-otp
router.post("/request-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!validEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    const secret = process.env.OTP_HMAC_SECRET;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!secret || !smtpUser || !smtpPass) {
      console.error("OTP or SMTP environment variables are missing.");

      return res.status(500).json({
        message: "Email service is not configured.",
      });
    }

    const windowStart = new Date(Date.now() - 15 * 60 * 1000);

    const recentRequests = await prisma.otpChallenge.count({
      where: {
        email,
        createdAt: { gte: windowStart },
      },
    });

    if (recentRequests >= 3) {
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
      });
    }

    const otp = randomInt(100000, 1000000).toString();
    const codeHash = hashOtp(email, otp, secret);
    const expiresAt = new Date(Date.now() + OTP_LIFETIME_MS);

    await prisma.otpChallenge.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const challenge = await prisma.otpChallenge.create({
      data: { email, codeHash, expiresAt },
    });

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: smtpUser,
        to: email,
        subject: "Your sign-in code",
        text: `Your sign-in code is ${otp}. It expires in 5 minutes. If you did not request it, you can ignore this email.`,
      });
    } catch (error) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });

      throw error;
    }

    return res.json({
      message:
        "If the address can receive email, a sign-in code has been sent.",
    });
  } catch (error) {
    console.error("OTP request failed:", error);

    return res.status(500).json({
      message: "Could not request a sign-in code. Please try again later.",
    });
  }
});

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp =
      typeof req.body?.otp === "string" ? req.body.otp.trim() : "";

    if (!validEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: "Enter a valid email address and six-digit code.",
      });
    }

    const otpSecret = process.env.OTP_HMAC_SECRET;
    const jwtSecret = process.env.JWT_ACCESS_SECRET;

    if (!otpSecret) {
      return res.status(500).json({
        message: "Authentication service is not configured.",
      });
    }

    if (!jwtSecret || jwtSecret.length < 32) {
      console.error("JWT_ACCESS_SECRET is missing or too short.");

      return res.status(500).json({
        message: "Authentication service is not configured.",
      });
    }

    const challenge = await prisma.otpChallenge.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge || challenge.expiresAt <= new Date()) {
      return res.status(400).json({
        message: "The code is invalid or expired. Request a new code.",
      });
    }

    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });

      return res.status(429).json({
        message: "Too many incorrect attempts. Request a new code.",
      });
    }

    const expectedHash = Buffer.from(challenge.codeHash, "hex");
    const providedHash = Buffer.from(hashOtp(email, otp, otpSecret), "hex");

    const isValid =
      expectedHash.length === providedHash.length &&
      timingSafeEqual(expectedHash, providedHash);

    if (!isValid) {
      const attempts = challenge.attempts + 1;

      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          ...(attempts >= MAX_OTP_ATTEMPTS
            ? { consumedAt: new Date() }
            : {}),
        },
      });

      return res.status(attempts >= MAX_OTP_ATTEMPTS ? 429 : 400).json({
        message:
          attempts >= MAX_OTP_ATTEMPTS
            ? "Too many incorrect attempts. Request a new code."
            : "The code is incorrect.",
      });
    }

    // Atomically consume the OTP so it cannot be reused.
    const consumed = await prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        attempts: { lt: MAX_OTP_ATTEMPTS },
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });

    if (consumed.count !== 1) {
      return res.status(400).json({
        message: "The code is invalid or expired. Request a new code.",
      });
    }

    const role = getUserRole(email);
    const sessionToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");

    const sessionExpiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    const refreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_LIFETIME_MS,
    );

    // Create the session and refresh token together.
    await prisma.$transaction([
      prisma.authSession.create({
        data: {
          tokenHash: hashSessionToken(sessionToken),
          email,
          expiresAt: sessionExpiresAt,
        },
      }),
      prisma.refreshToken.create({
        data: {
          tokenHash: hashSessionToken(refreshToken),
          email,
          expiresAt: refreshTokenExpiresAt,
        },
      }),
    ]);

    const accessToken = jwt.sign(
      { email, role },
      jwtSecret,
      {
        algorithm: "HS256",
        expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
        issuer: JWT_ISSUER,
        subject: email,
      },
    );

    res.cookie(
      COOKIE_NAME,
      sessionToken,
      setAuthCookieOptions(SESSION_LIFETIME_MS),
    );

    res.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      setAuthCookieOptions(ACCESS_TOKEN_LIFETIME_SECONDS * 1000),
    );

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      setAuthCookieOptions(REFRESH_TOKEN_LIFETIME_MS),
    );

    return res.json({
      message: "Login successful.",
      user: { email, role },
      accessTokenExpiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    });
  } catch (error) {
    console.error("OTP verification failed:", error);

    return res.status(500).json({
      message: "Could not verify the code. Please try again.",
    });
  }
});

// POST /api/auth/refresh
// Rotates the refresh token and issues a new short-lived access token.
router.post("/refresh", async (req, res) => {
  try {
    const rawToken = getCookie(req, REFRESH_TOKEN_COOKIE);

    if (!rawToken) {
      clearAuthCookies(res);

      return res.status(401).json({
        message: "Refresh token missing. Please sign in again.",
      });
    }

    const tokenHash = hashSessionToken(rawToken);
    const now = new Date();

    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (
      !existing ||
      existing.revokedAt !== null ||
      existing.expiresAt <= now
    ) {
      clearAuthCookies(res);

      return res.status(401).json({
        message: "Refresh token is invalid or expired. Please sign in again.",
      });
    }

    const jwtSecret = process.env.JWT_ACCESS_SECRET;

    if (!jwtSecret || jwtSecret.length < 32) {
      console.error("JWT_ACCESS_SECRET is missing or too short.");

      return res.status(500).json({
        message: "Authentication service is not configured.",
      });
    }

    const newRefreshToken = randomBytes(32).toString("hex");
    const newRefreshTokenHash = hashSessionToken(newRefreshToken);
    const newRefreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_LIFETIME_MS,
    );

    // Revoke the old token and store its replacement atomically.
    const rotated = await prisma.$transaction(async (tx) => {
      const result = await tx.refreshToken.updateMany({
        where: {
          id: existing.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          replacedByTokenHash: newRefreshTokenHash,
        },
      });

      if (result.count !== 1) {
        return false;
      }

      await tx.refreshToken.create({
        data: {
          tokenHash: newRefreshTokenHash,
          email: existing.email,
          expiresAt: newRefreshTokenExpiresAt,
        },
      });

      return true;
    });

    if (!rotated) {
      clearAuthCookies(res);

      return res.status(401).json({
        message: "Refresh token has already been used. Please sign in again.",
      });
    }

    const role = getUserRole(existing.email);
    const accessToken = jwt.sign(
      { email: existing.email, role },
      jwtSecret,
      {
        algorithm: "HS256",
        expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
        issuer: JWT_ISSUER,
        subject: existing.email,
      },
    );

    res.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      setAuthCookieOptions(ACCESS_TOKEN_LIFETIME_SECONDS * 1000),
    );

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      newRefreshToken,
      setAuthCookieOptions(REFRESH_TOKEN_LIFETIME_MS),
    );

    return res.json({
      message: "Access token refreshed.",
      accessTokenExpiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    });
  } catch (error) {
    console.error("Token refresh failed:", error);

    return res.status(500).json({
      message: "Could not refresh the session. Please try again.",
    });
  }
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  try {
    const session = await findSession(req);

    if (!session) {
      clearAuthCookies(res);

      return res.status(401).json({
        message: "Not logged in.",
      });
    }

    const role = getUserRole(session.email.toLowerCase());

    return res.json({
      authenticated: true,
      user: {
        email: session.email,
        role,
      },
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("Session check failed:", error);

    return res.status(500).json({
      message: "Could not check the session.",
    });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  try {
    const sessionToken = getCookie(req, COOKIE_NAME);
    const refreshToken = getCookie(req, REFRESH_TOKEN_COOKIE);

    await prisma.$transaction(async (tx) => {
      if (sessionToken) {
        await tx.authSession.deleteMany({
          where: { tokenHash: hashSessionToken(sessionToken) },
        });
      }

      if (refreshToken) {
        await tx.refreshToken.updateMany({
          where: {
            tokenHash: hashSessionToken(refreshToken),
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }
    });

    clearAuthCookies(res);

    return res.json({
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("Logout failed:", error);

    return res.status(500).json({
      message: "Could not log out. Please try again.",
    });
  }
});

export default router;
