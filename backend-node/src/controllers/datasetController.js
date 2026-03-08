import Dataset from "../models/Dataset.js";
import path from "path";
import fs from "fs/promises";

export const getAllDatasets = async (req, res) => {
  const userId = req.user?.id || "default_user";
  const datasets = await Dataset.find({ userId }).sort({ uploadedAt: -1 });
  return res.json({ success: true, count: datasets.length, data: datasets });
};

export const getDatasetById = async (req, res) => {
  const dataset = await Dataset.findById(req.params.id);
  if (!dataset) return res.status(404).json({ success: false, message: "Dataset not found" });

  const datasetObj = dataset.toObject();
  datasetObj.path = datasetObj.filepath;
  return res.json({ success: true, data: datasetObj });
};

export const getDatasetStatus = async (req, res) => {
  try {
    const dataset = await Dataset.findById(req.params.id).select("status metadata");
    if (!dataset) throw new Error("Not found in Mongo");
    console.log(`[STATUS-CHECK] dataset_id=${req.params.id} status=${dataset.status}`);
    return res.json({ success: true, status: dataset.status, metadata: dataset.metadata });
  } catch(err) {
    // Native Fallback: If Mongo fails, check if the Python pipeline finished writing the final artifact (insights.json)
    const datasetId = req.params.id;
    const userId = req.user?.id || "default_user";
    const finalArtifactPath = path.resolve(process.cwd(), `../ml_engine/data/users/${userId}/${datasetId}/insights.json`);
    
    try {
      await fs.access(finalArtifactPath);
      // Final artifact exists -> completed
      console.log(`[STATUS-CHECK] dataset_id=${datasetId} status=completed (fallback)`);
      return res.json({ success: true, status: "completed", metadata: { fallback: true } });
    } catch {
      try {
        const crashArtifactPath = path.resolve(process.cwd(), `../ml_engine/data/users/${userId}/${datasetId}/crash.json`);
        const crashData = await fs.readFile(crashArtifactPath, 'utf8');
        const errorMsg = JSON.parse(crashData).error || "Unknown pipeline error";
        console.log(`[STATUS-CHECK] dataset_id=${datasetId} status=failed (fallback)`);
        return res.json({ success: true, status: "failed", error: errorMsg, metadata: { fallback: true } });
      } catch {
        // Doesn't exist yet -> still processing
        console.log(`[STATUS-CHECK] dataset_id=${datasetId} status=processing (fallback)`);
        return res.json({ success: true, status: "processing", metadata: { fallback: true } });
      }
    }
  }
};

export const updateDatasetStatus = async (req, res) => {
  const { status } = req.body;
  const allowedStatus = ["uploaded", "processing", "trained", "failed"];

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status value: ${status}` });
  }

  const dataset = await Dataset.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!dataset) return res.status(404).json({ success: false, message: "Dataset not found" });

  return res.json({ success: true, message: "Dataset status updated", data: dataset });
};

export const cleanDataset = async (req, res) => {
  return res.json({
    success: true,
    message: "Data cleaning is automatically handled by the background AI pipeline.",
  });
};

export const trainDataset = async (req, res) => {
  return res.json({
    success: true,
    message: "Model training is automatically handled by the background AI pipeline.",
  });
};

export const getAnalysis = async (req, res) => {
  const datasetId = req.params.id;
  const userId = req.user?.id || "default_user";
  const profilePath = path.resolve(process.cwd(), `../ml_engine/data/users/${userId}/${datasetId}/profile_report.json`);
  
  try {
    const data = await fs.readFile(profilePath, "utf-8");
    return res.json(JSON.parse(data));
  } catch (err) {
    return res.status(404).json({ success: false, message: "Profile report not found" });
  }
};

export const getMetrics = async (req, res) => {
  const datasetId = req.params.id;
  const userId = req.user?.id || "default_user";
  const metricsPath = path.resolve(process.cwd(), `../ml_engine/data/users/${userId}/${datasetId}/metrics.json`);
  
  try {
    const data = await fs.readFile(metricsPath, "utf-8");
    return res.json(JSON.parse(data));
  } catch (err) {
    return res.status(404).json({ success: false, message: "Metrics not found" });
  }
};
