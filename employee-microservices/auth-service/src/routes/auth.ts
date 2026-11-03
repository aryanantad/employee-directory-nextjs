
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
const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const COOKIE_NAME = "auth_session";
const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";

const JWT_ISSUER = "employee-directory-auth";

type UserRole = "employee" | "hr" | "manager";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;

  const role = value.trim().toLowerCase();

  if (
    role === "employee" ||
    role === "hr" ||
    role === "manager"
  ) {
    return role;
  }

  return null;
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

async function isEmployeeInactive(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);

  const employee = await prisma.employee.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
    select: {
      isActive: true,
    },
  });

  return employee !== null && employee.isActive === false;
}

async function getUserRole(email: string): Promise<UserRole> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("Cannot resolve role without an email.");
  }

  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);

  // The previously configured administrator is now an HR account.
  if (adminEmail && normalizedEmail === adminEmail) {
    return "hr";
  }

  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
    select: {
      email: true,
      role: true,
    },
  });

  if (!assignment) return "employee";

  return normalizeRole(assignment.role) ?? "employee";
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

function clearAuthCookies(res: Response) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };

  res.clearCookie(COOKIE_NAME, options);
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
}

async function findSession(req: Request) {
  const token = getCookie(req, COOKIE_NAME);

  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
  });

  if (!session) return null;

  const now = new Date();

  const idleExpired =
    now.getTime() - session.lastActivityAt.getTime() >=
    IDLE_TIMEOUT_MS;

  if (session.expiresAt <= now || idleExpired) {
    await prisma.authSession.deleteMany({
      where: { id: session.id },
    });
    return null;
  }

  if (await isEmployeeInactive(session.email)) {
    await prisma.authSession.deleteMany({
      where: { id: session.id },
    });
    return null;
  }

  const updated = await prisma.authSession.updateMany({
    where: {
      id: session.id,
      expiresAt: { gt: now },
      lastActivityAt: {
        gt: new Date(now.getTime() - IDLE_TIMEOUT_MS),
      },
    },
    data: {
      lastActivityAt: now,
    },
  });

  if (updated.count !== 1) {
    await prisma.authSession.deleteMany({
      where: { id: session.id },
    });
    return null;
  }

  return {
    ...session,
    lastActivityAt: now,
  };
}

/**
 * Sign an access token and verify that the expected claims were included.
 * Never log the token or the JWT secret.
 */
function createAccessToken(
  email: string,
  role: UserRole,
  sessionId: string,
  jwtSecret: string
): string {
  if (!sessionId) {
    throw new Error("Cannot create access token without a session ID.");
  }

  const normalizedEmail = normalizeEmail(email);

  const accessToken = jwt.sign(
    {
      email: normalizedEmail,
      role,
      sid: sessionId,
    },
    jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
      issuer: JWT_ISSUER,
      subject: normalizedEmail,
    }
  );

  const decoded = jwt.decode(accessToken);

  console.info("[auth] Access token claim diagnostics:", {
    decodedIsObject:
      typeof decoded === "object" && decoded !== null,
    hasSubject:
      typeof decoded === "object" &&
      decoded !== null &&
      typeof decoded.sub === "string",
    hasEmail:
      typeof decoded === "object" &&
      decoded !== null &&
      typeof decoded.email === "string",
    hasSessionId:
      typeof decoded === "object" &&
      decoded !== null &&
      typeof decoded.sid === "string" &&
      decoded.sid.length > 0,
    hasRole:
      typeof decoded === "object" &&
      decoded !== null &&
      typeof decoded.role === "string",
    subjectMatchesEmail:
      typeof decoded === "object" &&
      decoded !== null &&
      normalizeEmail(decoded.sub) === normalizedEmail,
  });

  return accessToken;
}

/**
 * POST /api/auth/request-otp
 */
router.post("/request-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!validEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    if (await isEmployeeInactive(email)) {
      return res.status(403).json({
        message: "This account is inactive. Contact HR or an administrator.",
      });
    }

    const secret = process.env.OTP_HMAC_SECRET;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!secret || !smtpUser || !smtpPass) {
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
      where: {
        email,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    const challenge = await prisma.otpChallenge.create({
      data: {
        email,
        codeHash,
        expiresAt,
      },
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
        text:
          `Your sign-in code is ${otp}. It expires in 5 minutes. ` +
          "If you did not request it, you can ignore this email.",
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

/**
 * POST /api/auth/verify-otp
 */
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

    if (!otpSecret || !jwtSecret || jwtSecret.length < 32) {
      return res.status(500).json({
        message: "Authentication service is not configured.",
      });
    }

    if (await isEmployeeInactive(email)) {
      return res.status(403).json({
        message: "This account is inactive. Contact HR or an administrator.",
      });
    }

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        email,
        consumedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
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
    const providedHash = Buffer.from(
      hashOtp(email, otp, otpSecret),
      "hex"
    );

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

      return res
        .status(attempts >= MAX_OTP_ATTEMPTS ? 429 : 400)
        .json({
          message:
            attempts >= MAX_OTP_ATTEMPTS
              ? "Too many incorrect attempts. Request a new code."
              : "The code is incorrect.",
        });
    }

    const consumed = await prisma.otpChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        attempts: { lt: MAX_OTP_ATTEMPTS },
        expiresAt: { gt: new Date() },
      },
      data: {
        consumedAt: new Date(),
      },
    });

    if (consumed.count !== 1) {
      return res.status(400).json({
        message: "The code is invalid or expired. Request a new code.",
      });
    }

    const role = await getUserRole(email);

    const sessionToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");
    const now = new Date();

    const sessionExpiresAt = new Date(
      now.getTime() + SESSION_LIFETIME_MS
    );

    const refreshTokenExpiresAt = new Date(
      now.getTime() + REFRESH_TOKEN_LIFETIME_MS
    );

    const session = await prisma.$transaction(async (tx) => {
      const createdSession = await tx.authSession.create({
        data: {
          tokenHash: hashSessionToken(sessionToken),
          email,
          expiresAt: sessionExpiresAt,
          lastActivityAt: now,
        },
      });

      await tx.refreshToken.create({
        data: {
          tokenHash: hashSessionToken(refreshToken),
          email,
          expiresAt: refreshTokenExpiresAt,
        },
      });

      return createdSession;
    });

    const accessToken = createAccessToken(
      email,
      role,
      session.id,
      jwtSecret
    );

    res.cookie(
      COOKIE_NAME,
      sessionToken,
      setAuthCookieOptions(SESSION_LIFETIME_MS)
    );

    res.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      setAuthCookieOptions(ACCESS_TOKEN_LIFETIME_SECONDS * 1000)
    );

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      setAuthCookieOptions(REFRESH_TOKEN_LIFETIME_MS)
    );

    console.info("[auth] Login successful; authentication cookies issued.", {
      sessionCreated: Boolean(session.id),
      cookieNames: [
        COOKIE_NAME,
        ACCESS_TOKEN_COOKIE,
        REFRESH_TOKEN_COOKIE,
      ],
    });

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

/**
 * POST /api/auth/refresh
 */
router.post("/refresh", async (req, res) => {
  try {
    const session = await findSession(req);

    if (!session) {
      clearAuthCookies(res);
      return res.status(401).json({
        message: "Your session expired. Please sign in again.",
      });
    }

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
      existing.expiresAt <= now ||
      normalizeEmail(existing.email) !== normalizeEmail(session.email)
    ) {
      clearAuthCookies(res);
      return res.status(401).json({
        message: "Refresh token is invalid or expired. Please sign in again.",
      });
    }

    if (await isEmployeeInactive(existing.email)) {
      await prisma.authSession.deleteMany({
        where: { id: session.id },
      });

      clearAuthCookies(res);
      return res.status(403).json({
        message: "This account is inactive. Contact HR or an administrator.",
      });
    }

    const jwtSecret = process.env.JWT_ACCESS_SECRET;

    if (!jwtSecret || jwtSecret.length < 32) {
      return res.status(500).json({
        message: "Authentication service is not configured.",
      });
    }

    const newRefreshToken = randomBytes(32).toString("hex");
    const newRefreshTokenHash = hashSessionToken(newRefreshToken);

    const newRefreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_LIFETIME_MS
    );

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

      if (result.count !== 1) return false;

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

    const role = await getUserRole(existing.email);

    const accessToken = createAccessToken(
      existing.email,
      role,
      session.id,
      jwtSecret
    );

    res.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      setAuthCookieOptions(ACCESS_TOKEN_LIFETIME_SECONDS * 1000)
    );

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      newRefreshToken,
      setAuthCookieOptions(REFRESH_TOKEN_LIFETIME_MS)
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

/**
 * GET /api/auth/me
 */
router.get("/me", async (req, res) => {
  try {
    const session = await findSession(req);

    if (!session) {
      clearAuthCookies(res);
      return res.status(401).json({
        message: "Not logged in, or session expired due to inactivity.",
      });
    }

    const role = await getUserRole(session.email);

    return res.json({
      authenticated: true,
      user: {
        email: normalizeEmail(session.email),
        role,
      },
      expiresAt: session.expiresAt,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
    });
  } catch (error) {
    console.error("Session check failed:", error);

    return res.status(500).json({
      message: "Could not check the session.",
    });
  }
});

/**
 * GET /api/auth/roles
 */
router.get("/roles", async (req, res) => {
  try {
    const session = await findSession(req);

    if (!session) {
      clearAuthCookies(res);
      return res.status(401).json({
        message: "Not logged in.",
      });
    }

    const currentRole = await getUserRole(session.email);

    if (currentRole !== "hr") {
      return res.status(403).json({
        message: "You are not allowed to view organization roles.",
      });
    }

    const assignments = await prisma.userRoleAssignment.findMany({
      orderBy: { email: "asc" },
      select: {
        email: true,
        role: true,
      },
    });

    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);

    const roles: { email: string; role: UserRole }[] =
  assignments.map((assignment) => ({
    email: normalizeEmail(assignment.email),
    role:
      adminEmail &&
      normalizeEmail(assignment.email) === adminEmail
        ? "hr"
        : normalizeRole(assignment.role) ?? "employee",
  }));

    if (
  adminEmail &&
  !roles.some((item) => normalizeEmail(item.email) === adminEmail)
) {
  roles.unshift({
    email: adminEmail,
    role: "hr",
  });
}

    return res.json({ roles });
  } catch (error) {
    console.error("Could not list roles:", error);

    return res.status(500).json({
      message: "Could not retrieve user roles.",
    });
  }
});

/**
 * PUT /api/auth/roles
 */
/**
 * PUT /api/auth/roles
 */
router.put("/roles", async (req, res) => {
  try {
    const session = await findSession(req);

    if (!session) {
      clearAuthCookies(res);
      return res.status(401).json({
        message: "Not logged in.",
      });
    }

    const currentRole = await getUserRole(session.email);
    const email = normalizeEmail(req.body?.email);
    const role = normalizeRole(req.body?.role);
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);

    if (!validEmail(email)) {
      return res.status(400).json({
        message: "Please provide a valid email address.",
      });
    }

    if (!role) {
      return res.status(400).json({
        message: "Role must be employee, manager, or hr.",
      });
    }

    if (currentRole !== "hr") {
      return res.status(403).json({
        message: "Only HR can change user roles.",
      });
    }

    // The configured HR account cannot be demoted.
    if (adminEmail && email === adminEmail && role !== "hr") {
      return res.status(400).json({
        message: "The configured HR account cannot be demoted.",
      });
    }

    const assignment = await prisma.userRoleAssignment.upsert({
      where: { email },
      create: { email, role },
      update: { role },
    });

    return res.json({
      message: "User role updated successfully.",
      user: {
        email: normalizeEmail(assignment.email),
        role:
          adminEmail && email === adminEmail
            ? "hr"
            : normalizeRole(assignment.role) ?? "employee",
      },
    });
  } catch (error) {
    console.error("Could not update user role:", error);

    return res.status(500).json({
      message: "Could not update the user role.",
    });
  }
});

/**
 * POST /api/auth/logout
 */
router.post("/logout", async (req, res) => {
  try {
    const sessionToken = getCookie(req, COOKIE_NAME);
    const refreshToken = getCookie(req, REFRESH_TOKEN_COOKIE);

    await prisma.$transaction(async (tx) => {
      if (sessionToken) {
        await tx.authSession.deleteMany({
          where: {
            tokenHash: hashSessionToken(sessionToken),
          },
        });
      }

      if (refreshToken) {
        await tx.refreshToken.updateMany({
          where: {
            tokenHash: hashSessionToken(refreshToken),
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
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
