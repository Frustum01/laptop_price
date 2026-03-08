import express from "express";
import { getVisualization } from "../controllers/visualizationController.js";
// import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/dashboard/:id",
  getVisualization
);

export default router;
