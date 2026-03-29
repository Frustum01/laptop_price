import express from "express";
import { fillNulls, updateValues, deleteRows, addRow, addColumn } from "../controllers/dataOperationsController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/fill-null", protect, fillNulls);
router.post("/update", protect, updateValues);
router.post("/delete", protect, deleteRows);
router.post("/add-row", protect, addRow);
router.post("/add-column", protect, addColumn);

export default router;
