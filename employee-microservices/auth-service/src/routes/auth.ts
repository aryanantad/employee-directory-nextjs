
import { Router, type Request, type Response, type NextFunction } from "express";
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
const MAX_OTP_ATTEMPTS = 5;
const COOKIE_NAME = "auth_session";

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
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
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
        auth: { user: smtpUser, pass: smtpPass },
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
      message: "If the address can receive email, a sign-in code has been sent.",
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
    const otp = typeof req.body?.otp === "string"
      ? req.body.otp.trim()
      : "";

    if (!validEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        message: "Enter a valid email address and six-digit code.",
      });
    }

    const secret = process.env.OTP_HMAC_SECRET;
    if (!secret) {
      return res.status(500).json({
        message: "Authentication service is not configured.",
      });
    }

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        email,
        consumedAt: null,
      },
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
    const providedHash = Buffer.from(hashOtp(email, otp, secret), "hex");

    if (
      expectedHash.length !== providedHash.length ||
      !timingSafeEqual(expectedHash, providedHash)
    ) {
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

      return res.status(400).json({
        message: attempts >= MAX_OTP_ATTEMPTS
          ? "Too many incorrect attempts. Request a new code."
          : "The code is incorrect.",
      });
    }

    // Consume the code before creating a session, so it cannot be reused.
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

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    await prisma.authSession.create({
      data: {
        tokenHash: hashSessionToken(token),
        email,
        expiresAt,
      },
    });

    const isProduction = process.env.NODE_ENV === "production";

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_LIFETIME_MS,
    });

    return res.json({
      message: "Login successful.",
      user: { email },
    });
  } catch (error) {
    console.error("OTP verification failed:", error);
    return res.status(500).json({
      message: "Could not verify the code. Please try again.",
    });
  }
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  try {
    const session = await findSession(req);

    if (!session) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(401).json({ message: "Not logged in." });
    }

    return res.json({
      authenticated: true,
      user: { email: session.email },
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
    const token = getCookie(req, COOKIE_NAME);

    if (token) {
      await prisma.authSession.deleteMany({
        where: { tokenHash: hashSessionToken(token) },
      });
    }

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return res.json({ message: "Logged out successfully." });
  } catch (error) {
    console.error("Logout failed:", error);
    return res.status(500).json({
      message: "Could not log out. Please try again.",
    });
  }
});

export default router;
