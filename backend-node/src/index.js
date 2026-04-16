import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import connectDB from "./config/db.js";
import errorHandler from "./middleware/errorMiddleware.js";
import "./queue/pipelineWorker.js";

import analyticsRoutes from "./routes/analyticsRoutes.js";
import visualizationRoutes from "./routes/visualizationRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import datasetRoutes from "./routes/datasetRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import dataOperationsRoutes from "./routes/dataOperationsRoutes.js";
import filterRoutes from "./routes/filterRoutes.js";

/* NEW ROUTES */
import chatbotRoutes from "./routes/chatbotRoutes.js";
import summaryRoutes from "./routes/summaryRoutes.js";
import cleanedDataRoutes from "./routes/cleanedDataRoutes.js";

/* ADD TEMP ROUTES */
import tempRoutes from "./routes/tempRoutes.js";

dotenv.config();
connectDB();

const app = express();

/* ===============================
   CREATE REQUIRED UPLOAD FOLDERS
================================= */
const uploadFolders = [
  path.join(process.cwd(), "uploads"),
  path.join(process.cwd(), "uploads/raw"),
  path.join(process.cwd(), "uploads/cleaned"),
  path.join(process.cwd(), "uploads/temp"),
];

uploadFolders.forEach((folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log(`Created folder: ${folder}`);
  }
});

/* ===============================
   MIDDLEWARE
================================= */
app.use(cors());
app.use(express.json());

/* ===============================
   STATIC FILE ACCESS
================================= */
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

/* ===============================
   ROUTES
================================= */
app.use("/api", chatRoutes);
app.use("/api", visualizationRoutes);
app.use("/api", uploadRoutes);
app.use("/api", datasetRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/data", dataOperationsRoutes);
app.use("/api", filterRoutes);

/* CLEANED DATA ROUTE */
app.use("/api/cleaned-data", cleanedDataRoutes);

/* TEMP SAVE / RESUME ROUTE */
app.use("/api/temp", tempRoutes);

/* NEW FEATURES */
app.use("/api", chatbotRoutes);
app.use("/api", summaryRoutes);

/* ===============================
   HEALTH CHECK
================================= */
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({
    server: "running",
    mongodb: "mocked",
    mongodbState: 1,
    env: {
      hasMongoUri: !!process.env.MONGO_URI,
      port: process.env.PORT || 5000,
    },
  });
});

/* ===============================
   ERROR HANDLER
================================= */
app.use(errorHandler);

/* ===============================
   SERVER
================================= */
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

/* Prevent clean exit during native mocking */
setInterval(() => {}, 1000 * 60 * 60);

export default app;