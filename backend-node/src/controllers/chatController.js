import path from "path";
import { spawn } from "child_process";

export const askQuestion = async (req, res) => {
  const { message, question, datasetId } = req.body;
  const queryText = message || question;

  if (!queryText || !datasetId) {
    return res.status(400).json({ success: false, message: "message/question and datasetId are required" });
  }

  try {
    const userId   = req.user?.id   || "default_user";
    const role     = req.user?.role || "admin";
    const permissions = Array.isArray(req.user?.permissions)
      ? req.user.permissions.join(",")
      : "read,fill_null,update,delete";

    const scriptPath = path.resolve(process.cwd(), "../ml_engine/pipeline/query_engine.py");

    // Use spawn (not exec) so large model output doesn't hit the 200KB exec buffer limit
    const pyArgs = [
      scriptPath,
      "--user_id",   userId,
      "--dataset_id", datasetId,
      "--question",  queryText,
      "--role",      role,
      "--permissions", permissions
    ];

    const proc = spawn("python", pyArgs);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("error", (err) => {
      console.error("❌ Failed to start query_engine.py:", err);
      return safeFallback(queryText, res);
    });

    proc.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        console.error("Python Query Engine exited with code:", code);
        console.error("STDERR:", stderr);
        return safeFallback(queryText, res);
      }

      try {
        const payload = JSON.parse(stdout.trim());

        if (payload.intent === "error") {
          return res.status(500).json({
            success: false,
            source: "ml-engine",
            message: payload.answer || payload.error || "Query engine returned an error."
          });
        }

        return res.json({
          success: true,
          source: "ml-engine",
          answer: payload.answer || "I could not find an answer to your question in the dataset.",
          intent: payload.intent,
          confidence: payload.confidence,
          previewData: payload.previewData
        });
      } catch (parseError) {
        console.error("Failed to parse Query Engine output:", stdout);
        // Return the raw text rather than a misleading RAW flag
        return res.json({
          success: true,
          source: "ml-engine-raw",
          answer: stdout.trim() || "The query engine returned an unparseable response.",
          intent: "raw"
        });
      }
    });

  } catch (error) {
    console.error("❌ CHAT ERROR:", error);
    return safeFallback(queryText, res);
  }
};

const safeFallback = (question, res) => {
  // Only send a response if headers haven't been sent yet
  if (!res.headersSent) {
    return res.status(503).json({
      success: false,
      source: "fallback",
      answer: "The semantic query engine is unavailable right now. Please verify your dataset was processed successfully and that Ollama is running (ollama serve).",
    });
  }
};
