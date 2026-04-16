import express from "express";
import {
  getCleanedData,
  getOriginalData
} from "../controllers/cleanedDataController.js";

import { protect } from "../middleware/protect.js";

const router = express.Router();

/* GET CLEANED DATA */
router.get("/:id", protect, getCleanedData);

/* GET ORIGINAL DATA */
router.get("/original/:id", protect, getOriginalData);

export default router;