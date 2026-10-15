
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import prisma from "./db.js";

const app = express();
const PORT = Number(process.env.PORT) || 4002;
const AUTH_URL =
  process.env.AUTH_SERVICE_URL || "http://localhost:4001";

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());

// Verify the user's session with the Auth Service.
async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const cookie = req.headers.cookie;

    if (!cookie) {
      return res.status(401).json({ message: "Please log in first." });
    }

    const authResponse = await fetch(`${AUTH_URL}/api/auth/me`, {
      headers: { cookie },
    });

    if (!authResponse.ok) {
      return res.status(401).json({ message: "Invalid or expired session." });
    }

    next();
  } catch {
    return res.status(503).json({
      message: "Authentication service is unavailable.",
    });
  }
}

app.get("/health", (_req, res) => {
  res.json({ service: "employee-service", status: "running" });
});

app.get("/api/employees", requireAuth, async (_req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { id: "asc" },
    });
    res.json(employees);
  } catch {
    res.status(500).json({ message: "Could not fetch employees." });
  }
});

app.get("/api/employees/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  try {
    const employee = await prisma.employee.findUnique({ where: { id } });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    res.json(employee);
  } catch {
    res.status(500).json({ message: "Could not fetch employee." });
  }
});

app.post("/api/employees", requireAuth, async (req, res) => {
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
      data: { name: name.trim(), role: role.trim() },
    });
    res.status(201).json(employee);
  } catch {
    res.status(500).json({ message: "Could not create employee." });
  }
});

app.put("/api/employees/:id", requireAuth, async (req, res) => {
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
      data: { name: name.trim(), role: role.trim() },
    });
    res.json(employee);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ message: "Employee not found." });
    }
    res.status(500).json({ message: "Could not update employee." });
  }
});

app.delete("/api/employees/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ message: "Invalid employee ID." });
  }

  try {
    await prisma.employee.delete({ where: { id } });
    res.json({ message: "Employee deleted successfully." });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ message: "Employee not found." });
    }
    res.status(500).json({ message: "Could not delete employee." });
  }
});

app.listen(PORT, () => {
  console.log(`Employee Service running at http://localhost:${PORT}`);
});
