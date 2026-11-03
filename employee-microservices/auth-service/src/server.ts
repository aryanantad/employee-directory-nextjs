
import authRoutes from "./routes/auth.js";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Parse cookies without requiring an additional package.
app.use((req: Request, _res: Response, next: NextFunction) => {
  const cookieHeader = req.headers.cookie || "";

  const cookies: Record<string, string> = {};

  cookieHeader.split(";").forEach((cookie) => {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) return;

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();

    if (name) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
  });

  (req as Request & { cookies: Record<string, string> }).cookies = cookies;

  next();
});

app.use("/api/auth", authRoutes);

app.get("/health", (_req, res) => {
  res.json({
    service: "auth-service",
    status: "running",
  });
});

app.listen(PORT, () => {
  console.log(`Auth Service running at http://localhost:${PORT}`);
});
