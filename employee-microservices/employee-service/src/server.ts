
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import jwt, { type JwtPayload } from "jsonwebtoken";
import prisma from "./db.js";

const app = express();
const PORT = Number(process.env.PORT) || 4002;

const JWT_ISSUER = "employee-directory-auth";
const ACCESS_TOKEN_COOKIE = "access_token";

type UserRole = "admin" | "user";

interface AuthenticatedUser {
  email: string;
  role: UserRole;
}

interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json());

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

// Authentication guard: verify the signed JWT locally.
function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const jwtSecret = process.env.JWT_ACCESS_SECRET;

  if (!jwtSecret || jwtSecret.length < 32) {
    console.error("JWT_ACCESS_SECRET is missing or too short.");

    return res.status(503).json({
      message: "Authentication service is not configured.",
    });
  }

  // Accept the access token cookie. Also allow a Bearer token
  // for API clients that send Authorization headers.
  const cookieToken = getCookie(req, ACCESS_TOKEN_COOKIE);
  const authorization = req.headers.authorization;

  const bearerToken =
    authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : null;

  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({
      message: "Please log in first.",
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
    });

    if (
      typeof decoded === "string" ||
      typeof decoded !== "object" ||
      !decoded.sub ||
      typeof decoded.email !== "string" ||
      (decoded.role !== "admin" && decoded.role !== "user") ||
      decoded.sub !== decoded.email
    ) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    const payload = decoded as JwtPayload & {
      email: string;
      role: UserRole;
    };

    req.user = {
      email: payload.email,
      role: payload.role,
    };

    return next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired access token.",
    });
  }
}

// Permission guard: only admins can modify employee records.
function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({
      message: "Please log in first.",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "You do not have permission to perform this action.",
    });
  }

  return next();
}

app.get("/health", (_req, res) => {
  res.json({
    service: "employee-service",
    status: "running",
  });
});

// Authenticated users can view employees.
app.get("/api/employees", requireAuth, async (_req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { id: "asc" },
    });

    return res.json(employees);
  } catch {
    return res.status(500).json({
      message: "Could not fetch employees.",
    });
  }
});

app.get("/api/employees/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      message: "Invalid employee ID.",
    });
  }

  try {
    const employee = await prisma.employee.findUnique({
      where: { id },
    });

    if (!employee) {
      return res.status(404).json({
        message: "Employee not found.",
      });
    }

    return res.json(employee);
  } catch {
    return res.status(500).json({
      message: "Could not fetch employee.",
    });
  }
});

// Only admins can add employees.
app.post(
  "/api/employees",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { name, role } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof role !== "string" ||
      !role.trim()
    ) {
      return res.status(400).json({
        message: "Name and role are required.",
      });
    }

    try {
      const employee = await prisma.employee.create({
        data: {
          name: name.trim(),
          role: role.trim(),
        },
      });

      return res.status(201).json(employee);
    } catch {
      return res.status(500).json({
        message: "Could not create employee.",
      });
    }
  },
);

// Only admins can edit employees.
app.put(
  "/api/employees/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const id = Number(req.params.id);
    const { name, role } = req.body ?? {};

    if (
      !Number.isInteger(id) ||
      id < 1 ||
      typeof name !== "string" ||
      !name.trim() ||
      typeof role !== "string" ||
      !role.trim()
    ) {
      return res.status(400).json({
        message: "A valid ID, name, and role are required.",
      });
    }

    try {
      const employee = await prisma.employee.update({
        where: { id },
        data: {
          name: name.trim(),
          role: role.trim(),
        },
      });

      return res.json(employee);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "P2025"
      ) {
        return res.status(404).json({
          message: "Employee not found.",
        });
      }

      return res.status(500).json({
        message: "Could not update employee.",
      });
    }
  },
);

// Only admins can delete employees.
app.delete(
  "/api/employees/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        message: "Invalid employee ID.",
      });
    }

    try {
      await prisma.employee.delete({
        where: { id },
      });

      return res.json({
        message: "Employee deleted successfully.",
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "P2025"
      ) {
        return res.status(404).json({
          message: "Employee not found.",
        });
      }

      return res.status(500).json({
        message: "Could not delete employee.",
      });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Employee Service running at http://localhost:${PORT}`);
});
