import express from "express";
import {
  analyticsSummary,
  analyticsChart
} from "../controllers/analyticsController.js";
// import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// router.use(protect); // protect all analytics routes

router.get("/", analyticsSummary);
router.post("/summary", analyticsSummary);
router.post("/chart", analyticsChart);

export default router;
