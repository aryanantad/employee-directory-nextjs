import authRoutes from "./routes/auth.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();



const app = express();
const PORT = Number(process.env.PORT) || 4001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
  })
);

app.use(express.json());
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
