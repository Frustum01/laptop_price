import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getFilteredChart = (req, res) => {
  try {
    const inputData = JSON.stringify(req.body);

    const pythonPath = path.join(__dirname, "../../python/filter_engine.py");

    const python = spawn("python", [pythonPath, inputData]);

    let result = "";

    python.stdout.on("data", (data) => {
      result += data.toString();
    });

    python.stderr.on("data", (err) => {
      console.error("Python Error:", err.toString());
    });

    python.on("close", () => {
      try {
        const parsed = JSON.parse(result);
        res.json(parsed);
      } catch {
        res.status(500).json({ error: "Invalid Python response" });
      }
    });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
};