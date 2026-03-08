import Dataset from "../models/Dataset.js";
import path from "path";
// import mongoose from "mongoose";
import { pipelineQueue } from "../queue/pipelineQueue.js";

export const uploadDataset = async (req, res) => {
  try {
    const totalElapsed = () => Date.now() - req.uploadStartTime;
    const stepElapsed = () => {
      const now = Date.now();
      const elapsed = now - (req.lastStepTime || req.uploadStartTime);
      req.lastStepTime = now;
      return elapsed;
    };

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded. Use key 'dataset'." });
    }

    const isMongoConnected = true; // Hardcoded true to force the mock execution flow
    const userId = req.user?.id || "default_user"; 
    let datasetId = `temp-${Date.now()}`;
    let datasetPath = path.resolve(req.file.path);

    if (isMongoConnected) {
      const dataset = await Dataset.create({
        filename: req.file.originalname,
        filepath: datasetPath,
        status: "processing", 
        userId: userId
      });
      datasetId = dataset._id.toString();
      const dbMsg = `[DATASET-CREATED] database record created in ${stepElapsed()}ms`;
      console.log(dbMsg);
      if (req.metrics) req.metrics.push(dbMsg);
    }

    console.log(`🚀 Queuing ML Pipeline for Dataset: ${datasetId} by ${userId}`);

    try {
      await pipelineQueue.add("processDataset", {
        datasetId,
        datasetPath,
        userId
      });
      console.log(`✅ Job added to BullMQ Queue`);
      const pipeMsg = `[PIPELINE-SPAWNED] ML pipeline started in ${stepElapsed()}ms`;
      console.log(pipeMsg);
      if (req.metrics) req.metrics.push(pipeMsg);
    } catch (queueErr) {
      console.warn("⚠️ Queue connection failed. Falling back to native child_process spawn:", queueErr.message);
      
      // Native Synchronous Fallback (Great for testing environments w/o Redis)
      const { spawn } = await import("child_process");
      
      const pythonScript = path.resolve(process.cwd(), '../ml_engine/run_pipeline.py');
      const mlCwd = path.resolve(process.cwd(), '../ml_engine');
      
      const startTime = Date.now();
      console.log(`[ML-START] Spawning python process at ${new Date(startTime).toISOString()}`);
      console.log(`[PIPELINE-JOB-START] dataset_id=${datasetId}`);
      
      const mlProcess = spawn('python', [
          `"${pythonScript}"`,
          '--dataset_path', `"${datasetPath}"`,
          '--dataset_id', datasetId,
          '--user_id', userId
      ], { cwd: mlCwd, shell: true });

      const pipeMsgFallback = `[PIPELINE-SPAWNED] ML pipeline started in ${stepElapsed()}ms`;
      console.log(pipeMsgFallback);
      if (req.metrics) req.metrics.push(pipeMsgFallback);

      const fs = await import("fs/promises");
      const logPath = path.resolve(mlCwd, 'logs/system.log');
      let mlStderrAccumulator = "";

      mlProcess.stdout.on('data', (data) => console.log(`[ML-STDOUT]: ${data}`));
      mlProcess.stderr.on('data', (data) => {
          console.error(`[ML-STDERR]: ${data}`);
          mlStderrAccumulator += data.toString();
      });

      mlProcess.on('exit', async (code) => {
          console.log(`[PIPELINE-JOB-END] dataset_id=${datasetId}`);
          const duration = (Date.now() - startTime) / 1000;
          console.log(`[ML-END] Process completed in ${duration.toFixed(2)}s with code ${code}`);
          
          if (code !== 0) {
              const errMsg = mlStderrAccumulator ? mlStderrAccumulator.trim() : `Process exited with code ${code}`;
              const errorLog = `\n[${new Date().toISOString()}] PIPELINE_CRASH | Dataset: ${datasetId} | ExitCode: ${code} | Error: ${errMsg}`;
              try {
                  await fs.appendFile(logPath, errorLog);
                  
                  // Add fallback crash signal
                  const crashSignalPath = path.resolve(`../ml_engine/data/users/${userId}/${datasetId}/crash.json`);
                  await fs.mkdir(path.dirname(crashSignalPath), { recursive: true });
                  await fs.writeFile(crashSignalPath, JSON.stringify({ error: errMsg }));
              } catch (err) {
                  console.error("Could not write crash signals:", err);
              }
          }

          if (isMongoConnected) {
              const finalStatus = code === 0 ? "completed" : "failed";
              let metadataUpdate = { status: finalStatus };
              
              if (code === 0) {
                  try {
                      const metaPath = path.resolve(`../ml_engine/data/users/${userId}/${datasetId}/dataset_metadata.json`);
                      const metaRaw = await fs.readFile(metaPath, "utf-8");
                      const metaJson = JSON.parse(metaRaw);
                      metadataUpdate.rows = metaJson.total_rows;
                      metadataUpdate.columns = metaJson.total_columns;
                  } catch (err) {
                      console.warn("Could not load metadata for DB update:", err.message);
                  }
              }
              
              await Dataset.findByIdAndUpdate(datasetId, metadataUpdate);
              console.log(`[DB] Updated dataset ${datasetId} status to ${finalStatus}`);
              console.log(`[STATUS-UPDATED] dataset marked ${finalStatus}`);
          }
      });
    }

    const respMsg = `[UPLOAD-RESPONSE-SENT] response returned in ${totalElapsed()}ms total`;
    console.log(respMsg);
    if (req.metrics) req.metrics.push(respMsg);

    return res.status(200).json({
      success: true,
      datasetId: datasetId,
      path: datasetPath,
      originalName: req.file.originalname,
      size: req.file.size,
      message: "Dataset is being processed in the background. Please poll the status endpoint.",
      metrics: req.metrics
    });

  } catch (error) {
    console.error("❌ UPLOAD ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Upload failed" });
  }
};
