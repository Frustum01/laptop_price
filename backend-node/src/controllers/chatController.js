import path from "path";
import { exec } from "child_process";

export const askQuestion = async (req, res) => {
  const { message, question, datasetId } = req.body;
  const queryText = message || question;

  if (!queryText || !datasetId) {
    return res.status(400).json({ success: false, message: "message/question and datasetId are required" });
  }

  try {
    const userId = req.user?.id || "default_user";
    const scriptPath = path.resolve(process.cwd(), "../ml_engine/pipeline/query_engine.py");

    exec(`python "${scriptPath}" --user_id "${userId}" --dataset_id "${datasetId}" --question "${queryText}"`,
      (err, stdout, stderr) => {
        if (err) {
          console.error("Python Query Engine Execution Error:", err);
          console.error("STDERR:", stderr);
          return safeFallback(queryText, res);
        }

        if (!stdout) {
          console.error("Python Query Engine returned no output.");
          return safeFallback(queryText, res);
        }

        try {
          const payload = JSON.parse(stdout.trim());
          return res.json({
            success: true,
            source: "ml-engine",
            answer: payload.answer || "I could not find an answer to your question in the artifacts.",
            intent: payload.intent,
            confidence: payload.confidence
          });
        } catch (parseError) {
          console.error("Failed to parse Query Engine output:", stdout);
          return res.json({
            success: true,
            source: "ml-engine-raw",
            answer: stdout.trim() || "The query engine returned an unparseable response.",
            intent: "raw"
          });
        }
      }
    );

  } catch (error) {
    console.error("❌ CHAT ERROR:", error);
    return safeFallback(queryText, res);
  }
};

const safeFallback = (question, res) => {
  return res.json({
    success: true,
    source: "python-safe",
    answer: "I am having trouble accessing the semantic query engine right now. Please verify your dataset was processed successfully.",
  });
};
