import fs from "fs";
import path from "path";

/**
 * SAVE TEMP PROGRESS
 */
export const saveTempProgress = async (req, res) => {
  try {
    const { employeeId, datasetId, progressData } = req.body;

    const tempPath = path.join(
      process.cwd(),
      "uploads",
      "temp",
      `${employeeId}_${datasetId}.json`
    );

    fs.writeFileSync(tempPath, JSON.stringify(progressData, null, 2));

    res.json({
      success: true,
      message: "Temp progress saved successfully"
    });

  } catch (error) {
    console.error("saveTempProgress error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save temp progress"
    });
  }
};

/**
 * LOAD TEMP PROGRESS
 */
export const loadTempProgress = async (req, res) => {
  try {
    const { employeeId, datasetId } = req.params;

    const tempPath = path.join(
      process.cwd(),
      "uploads",
      "temp",
      `${employeeId}_${datasetId}.json`
    );

    if (!fs.existsSync(tempPath)) {
      return res.status(404).json({
        success: false,
        message: "No saved temp progress found"
      });
    }

    const savedData = JSON.parse(fs.readFileSync(tempPath));

    res.json({
      success: true,
      data: savedData
    });

  } catch (error) {
    console.error("loadTempProgress error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load temp progress"
    });
  }
};

/**
 * DELETE TEMP FILE AFTER COMPLETE
 */
export const deleteTempProgress = async (req, res) => {
  try {
    const { employeeId, datasetId } = req.params;

    const tempPath = path.join(
      process.cwd(),
      "uploads",
      "temp",
      `${employeeId}_${datasetId}.json`
    );

    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    res.json({
      success: true,
      message: "Temp file deleted successfully"
    });

  } catch (error) {
    console.error("deleteTempProgress error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete temp file"
    });
  }
};