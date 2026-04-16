import express from "express";
import {
  saveTempProgress,
  loadTempProgress,
  deleteTempProgress
} from "../controllers/tempController.js";

const router = express.Router();

router.post("/save", saveTempProgress);
router.get("/resume/:employeeId/:datasetId", loadTempProgress);
router.delete("/delete/:employeeId/:datasetId", deleteTempProgress);

export default router;