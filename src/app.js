import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import teacherRoutes from "./routes/teacherRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = express();

app.set("views", path.join(rootDir, "views"));
app.set("view engine", "html");

app.use(express.static(path.join(rootDir, "public")));
app.use("/uploads", express.static(path.join(rootDir, "uploads")));
// Increase payload limits for large CSV imports (up to 50MB)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "markin_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 4, // 4 hours
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: "lax",
    },
  }),
);

app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "views", "login.html"));
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);

// fallback for other views
app.get("/admin", (req, res) => {
  res.sendFile(path.join(rootDir, "views", "admin.html"));
});

app.get("/teacher", (req, res) => {
  res.sendFile(path.join(rootDir, "views", "teacher.html"));
});

app.get("/student", (req, res) => {
  res.sendFile(path.join(rootDir, "views", "student.html"));
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
  });
});

export default app;
