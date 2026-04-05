import express from "express";
import { fillNulls, updateValues, deleteRows, addRow, addColumn, previewOperation } from "../controllers/dataOperationsController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Preview — read-only: returns how many rows WILL be affected before user confirms
// No auth required — this is triggered from the unauthenticated chat flow
router.post("/preview",    previewOperation);

router.post("/fill-null",  fillNulls);
router.post("/update",     updateValues);
router.post("/delete",     deleteRows);
router.post("/add-row",    addRow);
router.post("/add-column", addColumn);

export default router;
