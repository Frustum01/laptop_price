import express from "express";

const router = express.Router();

router.get(
  "/employee/:employee_id/datasets/:dataset_id/summary",
  (req, res) => {
    const { employee_id, dataset_id } = req.params;

    res.json({
      employee_id,
      dataset_id,
      summary: {
        totalRows: 1000,
        avgPM25: 120,
        maxPM25: 300,
      },
    });
  }
);

export default router;