import fs from "fs";
import path from "path";
import csvParser from "csv-parser";

/**
 * GET CLEANED DATA
 */
export const getCleanedData = async (req, res) => {
  try {
    const datasetId = req.params.id;

    const filePath = path.join(
      process.cwd(),
      "uploads",
      "cleaned",
      `${datasetId}.csv`
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "Cleaned dataset file not found",
      });
    }

    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (data) => rows.push(data))
      .on("end", () => {
        return res.json({
          success: true,
          rows: rows,
          headers: rows.length > 0 ? Object.keys(rows[0]) : [],
          totalRows: rows.length,
          totalColumns: rows.length > 0 ? Object.keys(rows[0]).length : 0,
        });
      })
      .on("error", (err) => {
        console.error("CSV Read Error:", err);
        return res.status(500).json({
          success: false,
          message: "Error reading cleaned CSV file",
        });
      });

  } catch (error) {
    console.error("getCleanedData error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching cleaned data",
    });
  }
};

/**
 * GET ORIGINAL DATA
 */
export const getOriginalData = async (req, res) => {
  try {
    const datasetId = req.params.id;

    const filePath = path.join(
      process.cwd(),
      "uploads",
      "raw",
      `${datasetId}.csv`
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "Original dataset file not found",
      });
    }

    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (data) => rows.push(data))
      .on("end", () => {
        return res.json({
          success: true,
          rows: rows,
          headers: rows.length > 0 ? Object.keys(rows[0]) : [],
          totalRows: rows.length,
          totalColumns: rows.length > 0 ? Object.keys(rows[0]).length : 0,
        });
      })
      .on("error", (err) => {
        console.error("CSV Read Error:", err);
        return res.status(500).json({
          success: false,
          message: "Error reading original CSV file",
        });
      });

  } catch (error) {
    console.error("getOriginalData error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching original data",
    });
  }
};