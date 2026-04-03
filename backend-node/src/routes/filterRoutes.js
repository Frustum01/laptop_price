import express from "express";
import { getFilteredChart } from "../controllers/filterController.js";

const router = express.Router();

// 🔥 API endpoint
router.post("/filter-chart", getFilteredChart);

// ✅ VERY IMPORTANT LINE
export default router;