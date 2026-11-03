import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import jwt, { type JwtPayload } from "jsonwebtoken";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import prisma from "./db.js";

const app = express();
const PORT = Number(process.env.PORT) || 4002;

const JWT_ISSUER = "employee-directory-auth";
const ACCESS_TOKEN_COOKIE = "access_token";
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const PROFILE_UPLOAD_DIR = path.resolve(
  process.cwd(),
  "uploads",
  "profiles",
);

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

type UserRole = "employee" | "manager" | "hr";

interface AuthenticatedUser {
  email: string;
  role: UserRole;
  sessionId: string;
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

app.use(express.json({ limit: "1mb" }));

app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), "uploads"), {
    dotfiles: "deny",
    index: false,
    maxAge: "1h",
  }),
);

// --------------------------------------------------
// COMMON HELPERS
// --------------------------------------------------

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Safely converts Express route parameters into a string.
function getRouteParam(
  value: string | string[] | undefined,
): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isUserRole(value: unknown): value is UserRole {
  return (
    value === "employee" ||
    value === "manager" ||
    value === "hr"
  );
}

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");

    if (separator < 0) continue;

    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(
          part.slice(separator + 1).trim(),
        );
      } catch {
        return null;
      }
    }
  }

  return null;
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getTodayDateOnly(): Date {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ),
  );
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function getSignedInEmployee(email: string) {
  return prisma.employee.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      managerId: true,
    },
  });
}

async function getReporteeIds(managerEmployeeId: number) {
  const reportees = await prisma.employee.findMany({
    where: {
      managerId: managerEmployeeId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  return reportees.map((employee) => employee.id);
}

// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const jwtSecret = process.env.JWT_ACCESS_SECRET;

  if (!jwtSecret || jwtSecret.length < 32) {
    console.error("JWT_ACCESS_SECRET is missing or too short.");

    res.status(503).json({
      message: "Authentication service is not configured.",
    });

    return;
  }

  const cookieToken = getCookie(req, ACCESS_TOKEN_COOKIE);
  const authorization = req.headers.authorization;

  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : null;

  const token = cookieToken || bearerToken;

  if (!token) {
    res.status(401).json({
      message: "Please log in first.",
    });

    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
    });
    if (typeof decoded !== "string") {
  console.log("JWT CLAIM DIAGNOSTICS:", {
  decodedIsString: typeof decoded === "string",
  hasSubject: typeof decoded !== "string" && typeof decoded.sub === "string",
  hasEmail: typeof decoded !== "string" && typeof decoded.email === "string",
  hasSessionId: typeof decoded !== "string" && typeof decoded.sid === "string",
  hasRole: typeof decoded !== "string" && typeof decoded.role === "string",
  hasSessionIdValue: typeof decoded !== "string" && Boolean(decoded.sid),
  subjectMatchesEmail:
    typeof decoded !== "string" &&
    typeof decoded.sub === "string" &&
    typeof decoded.email === "string" &&
    normalizeEmail(decoded.sub) === normalizeEmail(decoded.email),
});
}

    if (
  typeof decoded === "string" ||
  typeof decoded.sub !== "string" ||
  typeof decoded.email !== "string" ||
  typeof decoded.sid !== "string" ||
  !decoded.sid ||
  normalizeEmail(decoded.sub) !== normalizeEmail(decoded.email)
) {
      res.status(401).json({
        message: "Invalid authentication token.",
      });

      return;
    }

    const payload = decoded as JwtPayload & {
      email: string;
      sid: string;
    };

    const email = normalizeEmail(payload.email);
    const now = new Date();
    const idleCutoff = new Date(
      now.getTime() - IDLE_TIMEOUT_MS,
    );

    const session = await prisma.authSession.findUnique({
      where: {
        id: payload.sid,
      },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        lastActivityAt: true,
      },
    });

    if (
      !session ||
      normalizeEmail(session.email) !== email
    ) {
      res.status(401).json({
        message: "Your session is no longer valid. Please sign in again.",
      });

      return;
    }

    if (
      session.expiresAt <= now ||
      session.lastActivityAt <= idleCutoff
    ) {
      await prisma.authSession.deleteMany({
        where: {
          id: session.id,
        },
      });

      res.status(401).json({
        message:
          "Your session expired due to inactivity. Please sign in again.",
      });

      return;
    }

    const assignment = await prisma.userRoleAssignment.findUnique({
      where: {
        email,
      },
      select: {
        role: true,
      },
    });

    if (!assignment || !isUserRole(assignment.role)) {
      await prisma.authSession.deleteMany({
        where: {
          id: session.id,
        },
      });

      res.status(403).json({
        message: "Your account does not have a valid application role.",
      });

      return;
    }

    const employee = await prisma.employee.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: {
        isActive: true,
      },
    });

    if (employee && !employee.isActive) {
      await prisma.authSession.deleteMany({
        where: {
          id: session.id,
        },
      });

      res.status(403).json({
        message: "Your account is inactive. Contact HR.",
      });

      return;
    }

    const updated = await prisma.authSession.updateMany({
      where: {
        id: session.id,
        email: session.email,
        expiresAt: {
          gt: now,
        },
        lastActivityAt: {
          gt: idleCutoff,
        },
      },
      data: {
        lastActivityAt: now,
      },
    });

    if (updated.count !== 1) {
      res.status(401).json({
        message: "Your session expired. Please sign in again.",
      });

      return;
    }

    req.user = {
      email,
      role: assignment.role,
      sessionId: session.id,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        message: "Invalid or expired access token.",
      });

      return;
    }

    console.error("Authentication middleware failed:", error);

    res.status(500).json({
      message: "Could not validate your session.",
    });
  }
}

function requireRole(...allowedRoles: UserRole[]) {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      res.status(401).json({
        message: "Please log in first.",
      });

      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        message: "You do not have permission to perform this action.",
      });

      return;
    }

    next();
  };
}

const requireHR = requireRole("hr");
const requireManager = requireRole("manager");
const requireEmployeeOrManager = requireRole(
  "employee",
  "manager",
);

// --------------------------------------------------
// EMPLOYEE ACCESS CONTROL
// --------------------------------------------------

async function getEmployeeAccessWhere(user: AuthenticatedUser) {
  if (user.role === "hr") {
    return {};
  }

  const ownEmployee = await prisma.employee.findFirst({
    where: {
      email: {
        equals: user.email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
    },
  });

  if (!ownEmployee) {
    return {
      id: -1,
    };
  }

  if (user.role === "employee") {
    return {
      id: ownEmployee.id,
    };
  }

  return {
    OR: [
      {
        id: ownEmployee.id,
      },
      {
        managerId: ownEmployee.id,
      },
    ],
  };
}

// --------------------------------------------------
// PROFILE IMAGE UPLOAD
// --------------------------------------------------

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
    fields: 0,
  },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      callback(new Error("Upload a JPG, PNG, or WebP image."));
      return;
    }

    callback(null, true);
  },
});

function handleProfileUpload(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  profileUpload.single("file")(
    req,
    res,
    (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError) {
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? "Image must be 5 MB or smaller."
            : error.code === "LIMIT_UNEXPECTED_FILE"
              ? "Please upload one image file using the field named file."
              : "Could not receive the uploaded image.";

        res.status(400).json({
          message,
        });

        return;
      }

      res.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Could not receive the uploaded image.",
      });
    },
  );
}

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    service: "employee-service",
    status: "running",
  });
});

// --------------------------------------------------
// PROFILE PICTURE
// --------------------------------------------------

app.get(
  "/api/profile-picture",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const profile = await prisma.userProfile.findUnique({
        where: {
          email: req.user!.email,
        },
      });

      res.json({
        profileImagePath: profile?.profileImagePath ?? null,
      });
    } catch (error) {
      console.error("Could not fetch profile picture:", error);

      res.status(500).json({
        message: "Could not fetch profile picture.",
      });
    }
  },
);

app.post(
  "/api/profile-picture",
  requireAuth,
  handleProfileUpload,
  async (req: AuthRequest, res: Response) => {
    if (!req.user || !req.file) {
      res.status(400).json({
        message: "Please select an image.",
      });

      return;
    }

    let savedFilePath: string | null = null;

    try {
      const image = sharp(req.file.buffer, {
        limitInputPixels: 20_000_000,
        failOn: "error",
      });

      const metadata = await image.metadata();

      if (
        !metadata.format ||
        !["jpeg", "png", "webp"].includes(metadata.format)
      ) {
        res.status(400).json({
          message: "Upload a valid JPG, PNG, or WebP image.",
        });

        return;
      }

      await mkdir(PROFILE_UPLOAD_DIR, {
        recursive: true,
      });

      const filename = `${randomUUID()}.webp`;

      savedFilePath = path.join(
        PROFILE_UPLOAD_DIR,
        filename,
      );

      await image
        .rotate()
        .resize(512, 512, {
          fit: "cover",
          position: "centre",
        })
        .webp({
          quality: 85,
        })
        .toFile(savedFilePath);

      const profileImagePath = `/uploads/profiles/${filename}`;

      const existingProfile = await prisma.userProfile.findUnique({
        where: {
          email: req.user.email,
        },
      });

      await prisma.userProfile.upsert({
        where: {
          email: req.user.email,
        },
        create: {
          email: req.user.email,
          profileImagePath,
        },
        update: {
          profileImagePath,
        },
      });

      if (existingProfile?.profileImagePath) {
        const prefix = "/uploads/profiles/";
        const oldPath = existingProfile.profileImagePath;

        if (oldPath.startsWith(prefix)) {
          const oldFilename = oldPath.slice(prefix.length);

          if (
            oldFilename &&
            path.basename(oldFilename) === oldFilename &&
            !oldFilename.includes("..") &&
            oldFilename !== filename
          ) {
            await unlink(
              path.join(PROFILE_UPLOAD_DIR, oldFilename),
            ).catch(() => undefined);
          }
        }
      }

      res.json({
        message: "Profile picture updated successfully.",
        profileImagePath,
      });
    } catch (error) {
      if (savedFilePath) {
        await unlink(savedFilePath).catch(() => undefined);
      }

      console.error("Profile picture upload failed:", error);

      res.status(500).json({
        message: "Could not save the profile picture.",
      });
    }
  },
);

// --------------------------------------------------
// EMPLOYEES
// --------------------------------------------------

app.get(
  "/api/employees",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const where = await getEmployeeAccessWhere(req.user!);

      const employees = await prisma.employee.findMany({
        where,
        orderBy: {
          id: "asc",
        },
      });

      res.json(employees);
    } catch (error) {
      console.error("Could not fetch employees:", error);

      res.status(500).json({
        message: "Could not fetch employees.",
      });
    }
  },
);

app.get(
  "/api/employees/:id",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const id = Number(getRouteParam(req.params.id));

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({
        message: "Invalid employee ID.",
      });

      return;
    }

    try {
      const accessWhere = await getEmployeeAccessWhere(req.user!);

      const employee = await prisma.employee.findFirst({
        where: {
          AND: [
            {
              id,
            },
            accessWhere,
          ],
        },
      });

      if (!employee) {
        res.status(404).json({
          message: "Employee not found.",
        });

        return;
      }

      res.json(employee);
    } catch (error) {
      console.error("Could not fetch employee:", error);

      res.status(500).json({
        message: "Could not fetch employee.",
      });
    }
  },
);

// HR creates employee record and application role assignment together.
app.post(
  "/api/employees",
  requireAuth,
  requireHR,
  async (req: AuthRequest, res: Response) => {
    const {
      name,
      role,
      email,
      accessRole = "employee",
      managerId,
      phoneNumber,
      gender,
    } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof role !== "string" ||
      !role.trim() ||
      typeof email !== "string" ||
      !validEmail(email.trim())
    ) {
      res.status(400).json({
        message: "Name, job title, and a valid email are required.",
      });

      return;
    }

    if (!isUserRole(accessRole)) {
      res.status(400).json({
        message: "Access role must be employee, manager, or hr.",
      });

      return;
    }

    if (
      managerId !== undefined &&
      managerId !== null &&
      (!Number.isInteger(managerId) || managerId < 1)
    ) {
      res.status(400).json({
        message: "Manager ID must be a positive integer or null.",
      });

      return;
    }

    const normalizedEmail = normalizeEmail(email);

    try {
      if (managerId != null) {
        const manager = await prisma.employee.findUnique({
          where: {
            id: managerId,
          },
          select: {
            id: true,
            email: true,
            isActive: true,
          },
        });

        if (!manager || !manager.isActive || !manager.email) {
          res.status(400).json({
            message: "The selected manager does not exist or is inactive.",
          });

          return;
        }

        const managerAssignment =
          await prisma.userRoleAssignment.findUnique({
            where: {
              email: normalizeEmail(manager.email),
            },
            select: {
              role: true,
            },
          });

        if (managerAssignment?.role !== "manager") {
          res.status(400).json({
            message: "The selected employee does not have the manager access role.",
          });

          return;
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            name: name.trim(),
            role: role.trim(),
            email: normalizedEmail,
            managerId: managerId ?? null,
            phoneNumber:
              typeof phoneNumber === "string"
                ? phoneNumber.trim() || null
                : null,
            gender:
              typeof gender === "string"
                ? gender.trim() || null
                : null,
          },
        });

        await tx.userRoleAssignment.upsert({
          where: {
            email: normalizedEmail,
          },
          create: {
            email: normalizedEmail,
            role: accessRole,
          },
          update: {
            role: accessRole,
          },
        });

        return employee;
      });

      res.status(201).json({
        message: "Employee created and access role assigned successfully.",
        employee: result,
        accessRole,
      });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        res.status(409).json({
          message: "An employee or role assignment already exists for this email.",
        });

        return;
      }

      console.error("Could not create employee:", error);

      res.status(500).json({
        message: "Could not create employee.",
      });
    }
  },
);

// HR updates employee profile fields.
app.put(
  "/api/employees/:id",
  requireAuth,
  requireHR,
  async (req: AuthRequest, res: Response) => {
    const id = Number(getRouteParam(req.params.id));
    const body = req.body ?? {};

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({
        message: "A valid employee ID is required.",
      });

      return;
    }

    if (typeof body.isActive === "boolean") {
      try {
        const employee = await prisma.employee.update({
          where: {
            id,
          },
          data: {
            isActive: body.isActive,
          },
        });

        if (!body.isActive && employee.email) {
          const email = normalizeEmail(employee.email);

          await prisma.authSession.deleteMany({
            where: {
              email: {
                equals: email,
                mode: "insensitive",
              },
            },
          });

          await prisma.refreshToken.updateMany({
            where: {
              email: {
                equals: email,
                mode: "insensitive",
              },
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });
        }

        res.json({
          message: body.isActive
            ? "Employee activated successfully."
            : "Employee deactivated successfully.",
          employee,
        });
      } catch (error) {
        if (isPrismaError(error, "P2025")) {
          res.status(404).json({
            message: "Employee not found.",
          });

          return;
        }

        console.error("Could not update employee status:", error);

        res.status(500).json({
          message: "Could not update employee status.",
        });
      }

      return;
    }

    const {
      name,
      role,
      email,
      phoneNumber,
      gender,
      managerId,
    } = body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof role !== "string" ||
      !role.trim()
    ) {
      res.status(400).json({
        message: "A valid name and job title are required.",
      });

      return;
    }

    if (
      email !== undefined &&
      (typeof email !== "string" || !validEmail(email.trim()))
    ) {
      res.status(400).json({
        message: "Please provide a valid email address.",
      });

      return;
    }

    if (
      managerId !== undefined &&
      managerId !== null &&
      (!Number.isInteger(managerId) ||
        managerId < 1 ||
        managerId === id)
    ) {
      res.status(400).json({
        message: "A valid manager ID is required.",
      });

      return;
    }

    try {
      const existing = await prisma.employee.findUnique({
        where: {
          id,
        },
      });

      if (!existing) {
        res.status(404).json({
          message: "Employee not found.",
        });

        return;
      }

      const oldEmail = existing.email
        ? normalizeEmail(existing.email)
        : null;

      const newEmail =
        email !== undefined
          ? normalizeEmail(email)
          : oldEmail;

      if (managerId != null) {
        const manager = await prisma.employee.findUnique({
          where: {
            id: managerId,
          },
          select: {
            id: true,
            email: true,
            isActive: true,
          },
        });

        if (!manager || !manager.isActive || !manager.email) {
          res.status(400).json({
            message: "The selected manager does not exist or is inactive.",
          });

          return;
        }

        const managerRole = await prisma.userRoleAssignment.findUnique({
          where: {
            email: normalizeEmail(manager.email),
          },
          select: {
            role: true,
          },
        });

        if (managerRole?.role !== "manager") {
          res.status(400).json({
            message: "The selected employee is not assigned the manager role.",
          });

          return;
        }
      }

      const employee = await prisma.$transaction(async (tx) => {
        const updatedEmployee = await tx.employee.update({
          where: {
            id,
          },
          data: {
            name: name.trim(),
            role: role.trim(),
            ...(email !== undefined ? { email: newEmail } : {}),
            ...(phoneNumber !== undefined
              ? {
                  phoneNumber:
                    typeof phoneNumber === "string"
                      ? phoneNumber.trim() || null
                      : null,
                }
              : {}),
            ...(gender !== undefined
              ? {
                  gender:
                    typeof gender === "string"
                      ? gender.trim() || null
                      : null,
                }
              : {}),
            ...(managerId !== undefined ? { managerId } : {}),
          },
        });

        if (oldEmail && newEmail && oldEmail !== newEmail) {
          const assignment = await tx.userRoleAssignment.findUnique({
            where: {
              email: oldEmail,
            },
          });

          if (assignment) {
            await tx.userRoleAssignment.delete({
              where: {
                email: oldEmail,
              },
            });

            await tx.userRoleAssignment.upsert({
              where: {
                email: newEmail,
              },
              create: {
                email: newEmail,
                role: assignment.role,
              },
              update: {
                role: assignment.role,
              },
            });
          }

          await tx.userProfile.updateMany({
            where: {
              email: oldEmail,
            },
            data: {
              email: newEmail,
            },
          });

          await tx.authSession.deleteMany({
            where: {
              email: oldEmail,
            },
          });

          await tx.refreshToken.updateMany({
            where: {
              email: oldEmail,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });

          await tx.otpChallenge.deleteMany({
            where: {
              email: oldEmail,
            },
          });
        }

        return updatedEmployee;
      });

      res.json({
        message: "Employee details updated successfully.",
        employee,
      });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        res.status(409).json({
          message: "The email address is already assigned to another account.",
        });

        return;
      }

      if (isPrismaError(error, "P2025")) {
        res.status(404).json({
          message: "Employee not found.",
        });

        return;
      }

      console.error("Could not update employee:", error);

      res.status(500).json({
        message: "Could not update employee.",
      });
    }
  },
);

app.delete(
  "/api/employees/:id",
  requireAuth,
  requireHR,
  async (req: AuthRequest, res: Response) => {
    const id = Number(getRouteParam(req.params.id));

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({
        message: "Invalid employee ID.",
      });

      return;
    }

    try {
      const employee = await prisma.employee.update({
        where: {
          id,
        },
        data: {
          isActive: false,
        },
        select: {
          id: true,
          email: true,
          isActive: true,
        },
      });

      if (employee.email) {
        const email = normalizeEmail(employee.email);

        await prisma.authSession.deleteMany({
          where: {
            email,
          },
        });

        await prisma.refreshToken.updateMany({
          where: {
            email,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }

      res.json({
        message: "Employee deactivated successfully.",
        employee,
      });
    } catch (error) {
      if (isPrismaError(error, "P2025")) {
        res.status(404).json({
          message: "Employee not found.",
        });

        return;
      }

      console.error("Could not deactivate employee:", error);

      res.status(500).json({
        message: "Could not deactivate employee.",
      });
    }
  },
);

app.patch(
  "/api/employees/:id/access-role",
  requireAuth,
  requireHR,
  async (req: AuthRequest, res: Response) => {
    const id = Number(getRouteParam(req.params.id));
    const { accessRole } = req.body ?? {};

    if (!Number.isInteger(id) || id < 1 || !isUserRole(accessRole)) {
      res.status(400).json({
        message: "Provide a valid employee ID and access role.",
      });

      return;
    }

    try {
      const employee = await prisma.employee.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          email: true,
        },
      });

      if (!employee?.email) {
        res.status(404).json({
          message: "Employee or employee email not found.",
        });

        return;
      }

      const email = normalizeEmail(employee.email);

      await prisma.userRoleAssignment.upsert({
        where: {
          email,
        },
        create: {
          email,
          role: accessRole,
        },
        update: {
          role: accessRole,
        },
      });

      await prisma.authSession.deleteMany({
        where: {
          email,
        },
      });

      await prisma.refreshToken.updateMany({
        where: {
          email,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      res.json({
        message: "Access role updated. The user must sign in again.",
        email,
        accessRole,
      });
    } catch (error) {
      console.error("Could not update access role:", error);

      res.status(500).json({
        message: "Could not update access role.",
      });
    }
  },
);

app.patch(
  "/api/employees/:id/manager",
  requireAuth,
  requireHR,
  async (req: AuthRequest, res: Response) => {
    const id = Number(getRouteParam(req.params.id));
    const { managerId } = req.body ?? {};

    if (
      !Number.isInteger(id) ||
      id < 1 ||
      (managerId !== null &&
        (!Number.isInteger(managerId) || managerId < 1))
    ) {
      res.status(400).json({
        message: "Provide a valid employee ID and manager ID (or null).",
      });

      return;
    }

    if (managerId === id) {
      res.status(400).json({
        message: "An employee cannot be their own manager.",
      });

      return;
    }

    try {
      if (managerId !== null) {
        const manager = await prisma.employee.findUnique({
          where: {
            id: managerId,
          },
          select: {
            email: true,
            isActive: true,
          },
        });

        if (!manager?.email || !manager.isActive) {
          res.status(400).json({
            message: "The selected manager does not exist or is inactive.",
          });

          return;
        }

        const assignment = await prisma.userRoleAssignment.findUnique({
          where: {
            email: normalizeEmail(manager.email),
          },
          select: {
            role: true,
          },
        });

        if (assignment?.role !== "manager") {
          res.status(400).json({
            message: "The selected employee does not have the manager role.",
          });

          return;
        }
      }

      const employee = await prisma.employee.update({
        where: {
          id,
        },
        data: {
          managerId,
        },
      });

      res.json({
        message: "Reporting manager updated successfully.",
        employee,
      });
    } catch (error) {
      if (isPrismaError(error, "P2025")) {
        res.status(404).json({
          message: "Employee not found.",
        });

        return;
      }

      console.error("Could not assign manager:", error);

      res.status(500).json({
        message: "Could not assign manager.",
      });
    }
  },
);

// --------------------------------------------------
// TEAM MANAGEMENT
// --------------------------------------------------

const teamInclude = {
  leader: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  members: {
    orderBy: {
      createdAt: "asc" as const,
    },
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  },
  _count: {
    select: {
      members: true,
    },
  },
};

app.get(
  "/api/teams",
  requireAuth,
  requireRole("manager", "hr"),
  async (_req: Request, res: Response) => {
    try {
      const teams = await prisma.team.findMany({
        orderBy: {
          name: "asc",
        },
        include: teamInclude,
      });

      res.json(teams);
    } catch (error) {
      console.error("Could not fetch teams:", error);

      res.status(500).json({
        message: "Could not fetch teams.",
      });
    }
  },
);

app.get(
  "/api/teams/:id",
  requireAuth,
  requireRole("manager", "hr"),
  async (req: Request, res: Response) => {
    const id = Number(getRouteParam(req.params.id));

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({
        message: "Invalid team ID.",
      });

      return;
    }

    try {
      const team = await prisma.team.findUnique({
        where: {
          id,
        },
        include: teamInclude,
      });

      if (!team) {
        res.status(404).json({
          message: "Team not found.",
        });

        return;
      }

      res.json(team);
    } catch (error) {
      console.error("Could not fetch team:", error);

      res.status(500).json({
        message: "Could not fetch team.",
      });
    }
  },
);

app.post(
  "/api/teams",
  requireAuth,
  requireRole("manager", "hr"),
  async (req: Request, res: Response) => {
    const { name, description, leaderEmployeeId } = req.body ?? {};

    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({
        message: "Team name is required.",
      });

      return;
    }

    if (
      leaderEmployeeId !== undefined &&
      leaderEmployeeId !== null &&
      (!Number.isInteger(leaderEmployeeId) || leaderEmployeeId < 1)
    ) {
      res.status(400).json({
        message: "Leader employee ID must be a positive integer or null.",
      });

      return;
    }

    try {
      if (leaderEmployeeId != null) {
        const leader = await prisma.employee.findUnique({
          where: {
            id: leaderEmployeeId,
          },
          select: {
            id: true,
            isActive: true,
          },
        });

        if (!leader || !leader.isActive) {
          res.status(400).json({
            message: "The selected team leader does not exist or is inactive.",
          });

          return;
        }
      }

      const team = await prisma.team.create({
        data: {
          name: name.trim(),
          description:
            typeof description === "string"
              ? description.trim() || null
              : null,
          leaderEmployeeId: leaderEmployeeId ?? null,
        },
        include: teamInclude,
      });

      res.status(201).json({
        message: "Team created successfully.",
        team,
      });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        res.status(409).json({
          message: "A team with this name already exists.",
        });

        return;
      }

      console.error("Could not create team:", error);

      res.status(500).json({
        message: "Could not create team.",
      });
    }
  },
);

app.put(
  "/api/teams/:id",
  requireAuth,
  requireRole("manager", "hr"),
  async (req: Request, res: Response) => {
    const id = Number(getRouteParam(req.params.id));
    const { name, description, leaderEmployeeId } = req.body ?? {};

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({
        message: "Invalid team ID.",
      });

      return;
    }

    if (
      name === undefined &&
      description === undefined &&
      leaderEmployeeId === undefined
    ) {
      res.status(400).json({
        message: "Provide at least one team field to update.",
      });

      return;
    }

    if (
      name !== undefined &&
      (typeof name !== "string" || !name.trim())
    ) {
      res.status(400).json({
        message: "Team name must be a non-empty string.",
      });

      return;
    }

    if (
      leaderEmployeeId !== undefined &&
      leaderEmployeeId !== null &&
      (!Number.isInteger(leaderEmployeeId) || leaderEmployeeId < 1)
    ) {
      res.status(400).json({
        message: "Leader employee ID must be a positive integer or null.",
      });

      return;
    }

    try {
      if (leaderEmployeeId != null) {
        const leader = await prisma.employee.findUnique({
          where: {
            id: leaderEmployeeId,
          },
          select: {
            id: true,
            isActive: true,
          },
        });

        if (!leader || !leader.isActive) {
          res.status(400).json({
            message: "The selected team leader does not exist or is inactive.",
          });

          return;
        }
      }

      const team = await prisma.team.update({
        where: {
          id,
        },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(description !== undefined
            ? {
                description:
                  typeof description === "string"
                    ? description.trim() || null
                    : null,
              }
            : {}),
          ...(leaderEmployeeId !== undefined
            ? { leaderEmployeeId }
            : {}),
        },
        include: teamInclude,
      });

      res.json({
        message: "Team updated successfully.",
        team,
      });
    } catch (error) {
      if (isPrismaError(error, "P2025")) {
        res.status(404).json({
          message: "Team not found.",
        });

        return;
      }

      if (isPrismaError(error, "P2002")) {
        res.status(409).json({
          message: "A team with this name already exists.",
        });

        return;
      }

      console.error("Could not update team:", error);

      res.status(500).json({
        message: "Could not update team.",
      });
    }
  },
);

app.post(
  "/api/teams/:id/members",
  requireAuth,
  requireRole("manager", "hr"),
  async (req: Request, res: Response) => {
    const teamId = Number(getRouteParam(req.params.id));
    const { employeeId } = req.body ?? {};

    if (
      !Number.isInteger(teamId) ||
      teamId < 1 ||
      !Number.isInteger(employeeId) ||
      employeeId < 1
    ) {
      res.status(400).json({
        message: "Valid team and employee IDs are required.",
      });

      return;
    }

    try {
      const membership = await prisma.teamMembership.create({
        data: {
          teamId,
          employeeId,
        },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Team member added successfully.",
        membership,
      });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        res.status(409).json({
          message: "This employee is already a member of the team.",
        });

        return;
      }

      if (isPrismaError(error, "P2003")) {
        res.status(400).json({
          message: "The team or employee does not exist.",
        });

        return;
      }

      console.error("Could not add team member:", error);

      res.status(500).json({
        message: "Could not add team member.",
      });
    }
  },
);

app.delete(
  "/api/teams/:id/members/:employeeId",
  requireAuth,
  requireRole("manager", "hr"),
  async (req: Request, res: Response) => {
    const teamId = Number(getRouteParam(req.params.id));
    const employeeId = Number(getRouteParam(req.params.employeeId));

    if (
      !Number.isInteger(teamId) ||
      teamId < 1 ||
      !Number.isInteger(employeeId) ||
      employeeId < 1
    ) {
      res.status(400).json({
        message: "Invalid team ID or employee ID.",
      });

      return;
    }

    try {
      const result = await prisma.teamMembership.deleteMany({
        where: {
          teamId,
          employeeId,
        },
      });

      if (result.count === 0) {
        res.status(404).json({
          message: "This employee is not a member of the team.",
        });

        return;
      }

      res.json({
        message: "Team member removed successfully.",
      });
    } catch (error) {
      console.error("Could not remove team member:", error);

      res.status(500).json({
        message: "Could not remove team member.",
      });
    }
  },
);

app.delete(
  "/api/teams/:id",
  requireAuth,
  requireHR,
  async (req: Request, res: Response) => {
    const id = Number(getRouteParam(req.params.id));

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({
        message: "Invalid team ID.",
      });

      return;
    }

    try {
      await prisma.team.delete({
        where: {
          id,
        },
      });

      res.json({
        message: "Team deleted successfully.",
      });
    } catch (error) {
      if (isPrismaError(error, "P2025")) {
        res.status(404).json({
          message: "Team not found.",
        });

        return;
      }

      console.error("Could not delete team:", error);

      res.status(500).json({
        message: "Could not delete team.",
      });
    }
  },
);

// --------------------------------------------------
// LEAVE TYPES
// --------------------------------------------------

const DEFAULT_LEAVE_TYPES = [
  {
    name: "Casual Leave",
    description: "Leave for personal matters",
    isPaid: true,
  },
  {
    name: "Sick Leave",
    description: "Leave for illness or medical needs",
    isPaid: true,
  },
  {
    name: "Earned Leave",
    description: "Planned earned leave",
    isPaid: true,
  },
];

app.get(
  "/api/leave-types",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      for (const type of DEFAULT_LEAVE_TYPES) {
        await prisma.leaveType.upsert({
          where: {
            name: type.name,
          },
          create: type,
          update: {},
        });
      }

      const leaveTypes = await prisma.leaveType.findMany({
        where:
          req.user!.role === "hr"
            ? {}
            : {
                isActive: true,
              },
        orderBy: {
          name: "asc",
        },
      });

      res.json(leaveTypes);
    } catch (error) {
      console.error("Could not fetch leave types:", error);

      res.status(500).json({
        message: "Could not fetch leave types.",
      });
    }
  },
);

app.post(
  "/api/leave-types",
  requireAuth,
  requireHR,
  async (req: Request, res: Response) => {
    const {
      name,
      description,
      isPaid = true,
    } = req.body ?? {};

    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({
        message: "Leave type name is required.",
      });

      return;
    }

    if (typeof isPaid !== "boolean") {
      res.status(400).json({
        message: "isPaid must be true or false.",
      });

      return;
    }

    try {
      const leaveType = await prisma.leaveType.create({
        data: {
          name: name.trim(),
          description:
            typeof description === "string"
              ? description.trim() || null
              : null,
          isPaid,
        },
      });

      res.status(201).json({
        message: "Leave type created successfully.",
        leaveType,
      });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        res.status(409).json({
          message: "A leave type with this name already exists.",
        });

        return;
      }

      console.error("Could not create leave type:", error);

      res.status(500).json({
        message: "Could not create leave type.",
      });
    }
  },
);

app.patch(
  "/api/leave-types/:id",
  requireAuth,
  requireHR,
  async (req: Request, res: Response) => {
    const id = getRouteParam(req.params.id);

    const {
      name,
      description,
      isPaid,
      isActive,
    } = req.body ?? {};

    if (!id) {
      res.status(400).json({
        message: "A valid leave type ID is required.",
      });

      return;
    }

    if (
      name === undefined &&
      description === undefined &&
      isPaid === undefined &&
      isActive === undefined
    ) {
      res.status(400).json({
        message: "Provide at least one field to update.",
      });

      return;
    }

    if (
      name !== undefined &&
      (typeof name !== "string" || !name.trim())
    ) {
      res.status(400).json({
        message: "Leave type name must be a non-empty string.",
      });

      return;
    }

    if (isPaid !== undefined && typeof isPaid !== "boolean") {
      res.status(400).json({
        message: "isPaid must be true or false.",
      });

      return;
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
      res.status(400).json({
        message: "isActive must be true or false.",
      });

      return;
    }

    try {
      const leaveType = await prisma.leaveType.update({
        where: {
          id,
        },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(description !== undefined
            ? {
                description:
                  typeof description === "string"
                    ? description.trim() || null
                    : null,
              }
            : {}),
          ...(isPaid !== undefined ? { isPaid } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      res.json({
        message: "Leave type updated successfully.",
        leaveType,
      });
    } catch (error) {
      if (isPrismaError(error, "P2025")) {
        res.status(404).json({
          message: "Leave type not found.",
        });

        return;
      }

      if (isPrismaError(error, "P2002")) {
        res.status(409).json({
          message: "A leave type with this name already exists.",
        });

        return;
      }

      console.error("Could not update leave type:", error);

      res.status(500).json({
        message: "Could not update leave type.",
      });
    }
  },
);

// --------------------------------------------------
// ATTENDANCE
// --------------------------------------------------

app.post(
  "/api/attendance/check-in",
  requireAuth,
  requireEmployeeOrManager,
  async (req: AuthRequest, res: Response) => {
    try {
      const employee = await getSignedInEmployee(req.user!.email);

      if (!employee) {
        res.status(404).json({
          message: "No active employee account matches your login.",
        });

        return;
      }

      const attendanceDate = getTodayDateOnly();

      const existing = await prisma.attendanceRecord.findUnique({
        where: {
          employeeId_attendanceDate: {
            employeeId: employee.id,
            attendanceDate,
          },
        },
      });

      if (existing) {
        res.status(409).json({
          message: existing.checkOut
            ? "You have already completed attendance for today."
            : "You have already checked in today.",
          attendance: existing,
        });

        return;
      }

      const attendance = await prisma.attendanceRecord.create({
        data: {
          employeeId: employee.id,
          attendanceDate,
          checkIn: new Date(),
          status: "present",
        },
      });

      res.status(201).json({
        message: "Check-in recorded successfully.",
        attendance,
      });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        res.status(409).json({
          message: "Attendance has already been recorded for today.",
        });

        return;
      }

      console.error("Check-in failed:", error);

      res.status(500).json({
        message: "Could not record check-in.",
      });
    }
  },
);

app.post(
  "/api/attendance/check-out",
  requireAuth,
  requireEmployeeOrManager,
  async (req: AuthRequest, res: Response) => {
    try {
      const employee = await getSignedInEmployee(req.user!.email);

      if (!employee) {
        res.status(404).json({
          message: "No active employee account matches your login.",
        });

        return;
      }

      const attendanceDate = getTodayDateOnly();

      const existing = await prisma.attendanceRecord.findUnique({
        where: {
          employeeId_attendanceDate: {
            employeeId: employee.id,
            attendanceDate,
          },
        },
      });

      if (!existing) {
        res.status(400).json({
          message: "Check in before checking out.",
        });

        return;
      }

      if (existing.checkOut) {
        res.status(409).json({
          message: "You have already checked out today.",
          attendance: existing,
        });

        return;
      }

      const checkOut = new Date();

      if (checkOut <= existing.checkIn) {
        res.status(400).json({
          message: "Check-out time must be after check-in time.",
        });

        return;
      }

      const result = await prisma.attendanceRecord.updateMany({
        where: {
          id: existing.id,
          checkOut: null,
        },
        data: {
          checkOut,
        },
      });

      if (result.count !== 1) {
        res.status(409).json({
          message: "Attendance was already updated.",
        });

        return;
      }

      const attendance = await prisma.attendanceRecord.findUnique({
        where: {
          id: existing.id,
        },
      });

      res.json({
        message: "Check-out recorded successfully.",
        attendance,
        durationMinutes: Math.floor(
          (checkOut.getTime() - existing.checkIn.getTime()) / 60000,
        ),
      });
    } catch (error) {
      console.error("Check-out failed:", error);

      res.status(500).json({
        message: "Could not record check-out.",
      });
    }
  },
);

app.get(
  "/api/attendance",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const allRecords =
        req.query.all === "true" && req.user!.role === "hr";

      if (
        req.query.all === "true" &&
        req.user!.role !== "hr"
      ) {
        res.status(403).json({
          message: "Only HR can view organization-wide attendance.",
        });

        return;
      }

      const employee = allRecords
        ? null
        : await getSignedInEmployee(req.user!.email);

      if (!allRecords && !employee) {
        res.status(404).json({
          message: "No active employee account matches your login.",
        });

        return;
      }

      const records = await prisma.attendanceRecord.findMany({
        where: allRecords
          ? {}
          : {
              employeeId: employee!.id,
            },
        include: allRecords
          ? {
              employee: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            }
          : undefined,
        orderBy: [
          {
            attendanceDate: "desc",
          },
          {
            checkIn: "desc",
          },
        ],
        take: 365,
      });

      res.json(records);
    } catch (error) {
      console.error("Could not fetch attendance:", error);

      res.status(500).json({
        message: "Could not fetch attendance records.",
      });
    }
  },
);

app.get(
  "/api/attendance/team",
  requireAuth,
  requireRole("manager", "hr"),
  async (req: AuthRequest, res: Response) => {
    try {
      let employeeIds: number[] | undefined;

      if (req.user!.role === "manager") {
        const manager = await getSignedInEmployee(req.user!.email);

        if (!manager) {
          res.status(404).json({
            message: "Manager employee record not found.",
          });

          return;
        }

        employeeIds = await getReporteeIds(manager.id);
      }

      const records = await prisma.attendanceRecord.findMany({
        where: employeeIds
          ? {
              employeeId: {
                in: employeeIds,
              },
            }
          : {},
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: [
          {
            attendanceDate: "desc",
          },
          {
            checkIn: "desc",
          },
        ],
        take: 1000,
      });

      res.json(records);
    } catch (error) {
      console.error("Could not fetch team attendance:", error);

      res.status(500).json({
        message: "Could not fetch team attendance.",
      });
    }
  },
);

app.get(
  "/api/attendance/organization",
  requireAuth,
  requireHR,
  async (_req: Request, res: Response) => {
    try {
      const records = await prisma.attendanceRecord.findMany({
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: [
          {
            attendanceDate: "desc",
          },
          {
            checkIn: "desc",
          },
        ],
        take: 2000,
      });

      res.json(records);
    } catch (error) {
      console.error("Could not fetch organization attendance:", error);

      res.status(500).json({
        message: "Could not fetch organization attendance.",
      });
    }
  },
);

app.get(
  "/api/attendance/today",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const employee = await getSignedInEmployee(req.user!.email);

      if (!employee) {
        res.status(404).json({
          message: "No active employee account matches your login.",
        });

        return;
      }

      const attendance = await prisma.attendanceRecord.findUnique({
        where: {
          employeeId_attendanceDate: {
            employeeId: employee.id,
            attendanceDate: getTodayDateOnly(),
          },
        },
      });

      res.json({
        attendance,
      });
    } catch (error) {
      console.error("Could not fetch today's attendance:", error);

      res.status(500).json({
        message: "Could not fetch today's attendance.",
      });
    }
  },
);

// --------------------------------------------------
// LEAVE APPLICATION
// --------------------------------------------------

app.post(
  "/api/leaves",
  requireAuth,
  requireEmployeeOrManager,
  async (req: AuthRequest, res: Response) => {
    const {
      leaveTypeId,
      startDate,
      endDate,
      reason,
    } = req.body ?? {};

    if (
      typeof leaveTypeId !== "string" ||
      !leaveTypeId.trim() ||
      typeof startDate !== "string" ||
      typeof endDate !== "string" ||
      typeof reason !== "string" ||
      !reason.trim()
    ) {
      res.status(400).json({
        message: "Leave type, start date, end date, and reason are required.",
      });

      return;
    }

    if (
      !isValidCalendarDate(startDate) ||
      !isValidCalendarDate(endDate)
    ) {
      res.status(400).json({
        message: "Provide valid dates in YYYY-MM-DD format.",
      });

      return;
    }

    if (endDate < startDate) {
      res.status(400).json({
        message: "End date cannot be before start date.",
      });

      return;
    }

    const today = getTodayDateOnly()
      .toISOString()
      .slice(0, 10);

    if (startDate < today) {
      res.status(400).json({
        message: "Leave cannot start in the past.",
      });

      return;
    }

    if (reason.trim().length > 1000) {
      res.status(400).json({
        message: "Leave reason must be 1000 characters or fewer.",
      });

      return;
    }

    try {
      const employee = await getSignedInEmployee(req.user!.email);

      if (!employee) {
        res.status(404).json({
          message: "No active employee account matches your login.",
        });

        return;
      }

      const leaveType = await prisma.leaveType.findFirst({
        where: {
          id: leaveTypeId.trim(),
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      if (!leaveType) {
        res.status(400).json({
          message: "The selected leave type does not exist or is inactive.",
        });

        return;
      }

      const overlapping = await prisma.leaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          status: {
            in: ["pending", "approved"],
          },
          startDate: {
            lte: dateOnly(endDate),
          },
          endDate: {
            gte: dateOnly(startDate),
          },
        },
        select: {
          id: true,
        },
      });

      if (overlapping) {
        res.status(409).json({
          message:
            "You already have a pending or approved leave for these dates.",
        });

        return;
      }

      const leave = await prisma.leaveRequest.create({
        data: {
          employeeId: employee.id,
          leaveTypeId: leaveTypeId.trim(),
          startDate: dateOnly(startDate),
          endDate: dateOnly(endDate),
          reason: reason.trim(),
          status: "pending",
        },
        include: {
          leaveType: {
            select: {
              id: true,
              name: true,
              isPaid: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Leave request submitted successfully.",
        leave,
      });
    } catch (error) {
      console.error("Could not submit leave request:", error);

      res.status(500).json({
        message: "Could not submit leave request.",
      });
    }
  },
);

app.get(
  "/api/leaves",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const allRequests =
        req.query.all === "true" && req.user!.role === "hr";

      if (
        req.query.all === "true" &&
        req.user!.role !== "hr"
      ) {
        res.status(403).json({
          message: "Only HR can view all organization leave requests.",
        });

        return;
      }

      const employee = allRequests
        ? null
        : await getSignedInEmployee(req.user!.email);

      if (!allRequests && !employee) {
        res.status(404).json({
          message: "No active employee account matches your login.",
        });

        return;
      }

      const leaves = await prisma.leaveRequest.findMany({
        where: allRequests
          ? {}
          : {
              employeeId: employee!.id,
            },
        include: {
          leaveType: {
            select: {
              id: true,
              name: true,
              isPaid: true,
            },
          },
          ...(allRequests
            ? {
                employee: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              }
            : {}),
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 500,
      });

      res.json(leaves);
    } catch (error) {
      console.error("Could not fetch leave requests:", error);

      res.status(500).json({
        message: "Could not fetch leave requests.",
      });
    }
  },
);

app.get(
  "/api/leaves/team",
  requireAuth,
  requireManager,
  async (req: AuthRequest, res: Response) => {
    try {
      const manager = await getSignedInEmployee(req.user!.email);

      if (!manager) {
        res.status(404).json({
          message: "Manager employee record not found.",
        });

        return;
      }

      const reporteeIds = await getReporteeIds(manager.id);

      const leaves = await prisma.leaveRequest.findMany({
        where: {
          employeeId: {
            in: reporteeIds,
          },
        },
        include: {
          leaveType: {
            select: {
              id: true,
              name: true,
              isPaid: true,
            },
          },
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 500,
      });

      res.json(leaves);
    } catch (error) {
      console.error("Could not fetch team leave requests:", error);

      res.status(500).json({
        message: "Could not fetch team leave requests.",
      });
    }
  },
);

app.patch(
  "/api/leaves/:id/review",
  requireAuth,
  requireManager,
  async (req: AuthRequest, res: Response) => {
    const id = getRouteParam(req.params.id);
    const { status, decisionRemark } = req.body ?? {};

    if (
      !id ||
      (status !== "approved" && status !== "rejected")
    ) {
      res.status(400).json({
        message:
          "A valid leave ID and status (approved or rejected) are required.",
      });

      return;
    }

    if (
      decisionRemark !== undefined &&
      decisionRemark !== null &&
      typeof decisionRemark !== "string"
    ) {
      res.status(400).json({
        message: "Decision remark must be a string or null.",
      });

      return;
    }

    if (
      typeof decisionRemark === "string" &&
      decisionRemark.length > 1000
    ) {
      res.status(400).json({
        message: "Decision remark must be 1000 characters or fewer.",
      });

      return;
    }

    try {
      const reviewer = await getSignedInEmployee(req.user!.email);

      if (!reviewer) {
        res.status(404).json({
          message: "Manager employee record not found.",
        });

        return;
      }

      const existing = await prisma.leaveRequest.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          employeeId: true,
          status: true,
        },
      });

      if (!existing) {
        res.status(404).json({
          message: "Leave request not found.",
        });

        return;
      }

      if (existing.employeeId === reviewer.id) {
        res.status(403).json({
          message: "You cannot review your own leave request.",
        });

        return;
      }

      const reportee = await prisma.employee.findFirst({
        where: {
          id: existing.employeeId,
          managerId: reviewer.id,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      if (!reportee) {
        res.status(403).json({
          message: "You can only review leave requests from your direct reportees.",
        });

        return;
      }

      if (existing.status !== "pending") {
        res.status(409).json({
          message: "Only pending leave requests can be reviewed.",
        });

        return;
      }

      const updated = await prisma.leaveRequest.updateMany({
        where: {
          id,
          status: "pending",
          employeeId: reportee.id,
        },
        data: {
          status,
          decisionRemark:
            typeof decisionRemark === "string"
              ? decisionRemark.trim() || null
              : null,
          reviewerId: reviewer.id,
          reviewedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        res.status(409).json({
          message: "This leave request has already been reviewed.",
        });

        return;
      }

      const leave = await prisma.leaveRequest.findUnique({
        where: {
          id,
        },
        include: {
          leaveType: true,
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      res.json({
        message: `Leave request ${status}.`,
        leave,
      });
    } catch (error) {
      console.error("Could not review leave request:", error);

      res.status(500).json({
        message: "Could not review leave request.",
      });
    }
  },
);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Employee Service running at http://localhost:${PORT}`,
  );
});