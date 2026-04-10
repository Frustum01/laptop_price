import express from "express";
import cors from "cors";
import dotenv from "dotenv";

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

// ✅ NEW ROUTES
import chatbotRoutes from "./routes/chatbotRoutes.js";
import summaryRoutes from "./routes/summaryRoutes.js";

dotenv.config();
connectDB();

const app = express();

/* ========== MIDDLEWARE ========== */
app.use(cors());
app.use(express.json());

/* ========== ROUTES ========== */
app.use("/api", chatRoutes);
app.use("/api", visualizationRoutes);
app.use("/api", uploadRoutes);
app.use("/api", datasetRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/data", dataOperationsRoutes);
app.use("/api", filterRoutes);

// ✅ ADD THESE (NEW FEATURES)
app.use("/api", chatbotRoutes);
app.use("/api", summaryRoutes);

/* ========== HEALTH CHECK ========== */
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

/* ========== DIAGNOSTIC ENDPOINT ========== */
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

/* ========== ERROR HANDLER ========== */
app.use(errorHandler);

/* ========== SERVER ========== */
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

// PREVENT CLEAN EXIT DURING NATIVE MOCKING
setInterval(() => {}, 1000 * 60 * 60);

export default app;