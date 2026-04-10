import express from "express";
import {
  getVisualization,
  getDatasetVisualization,
} from "../controllers/visualizationController.js";

const router = express.Router();

router.get("/dashboard/:id", getVisualization);

router.get(
  "/employee/:employee_id/datasets/:dataset_id/visualization",
  getDatasetVisualization
);

export default router;