import express from "express";

import {
  getAllDatasets,
  getDatasetById,
  getDatasetStatus,
  updateDatasetStatus,
  cleanDataset,
  trainDataset,
  getAnalysis,
  getMetrics,
  getSummaryReport,
} from "../controllers/datasetController.js";

const router = express.Router();

/* =====================================================
   DATASET MANAGEMENT (PROTECTED)
===================================================== */

// Get all datasets
router.get("/datasets", getAllDatasets);

// Get dataset by ID
router.get("/datasets/:id", getDatasetById);

// Get dataset status
router.get("/dataset-status/:id", getDatasetStatus);

// Update dataset status (admin / debug)
router.patch("/datasets/:id/status", updateDatasetStatus);

/* =====================================================
   ML PIPELINE AUTOMATION (PROTECTED)
===================================================== */

// Clean dataset (Python script)
router.post("/datasets/:id/clean", cleanDataset);

// Train ML model (Python script)
router.post("/datasets/:id/train", trainDataset);

// Get data analysis report
router.get("/datasets/:id/analysis", getAnalysis);

// Get trained model metrics
router.get("/datasets/:id/metrics", getMetrics);

// Download detailed summary report
router.get("/datasets/:id/summary-report", getSummaryReport);

export default router;
