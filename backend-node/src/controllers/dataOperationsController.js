import path from "path";
import { spawn } from "child_process";

/**
 * Runs query_engine.py with the given action and returns its JSON result.
 * Uses spawn() instead of exec() to avoid the 200KB stdout buffer cap.
 * Each arg is a separate array element — no shell injection possible.
 */
const executeDataOperation = (req, res, action, extraArgs = []) => {
  const { datasetId } = req.body;
  if (!datasetId) {
    return res.status(400).json({ success: false, message: "datasetId is required" });
  }

  const userId      = req.user?.id   || "default_user";
  const role        = req.user?.role || "admin";
  const permissions = Array.isArray(req.user?.permissions)
    ? req.user.permissions.join(",")
    : "read,fill_null,update,delete,add";

  const scriptPath = path.resolve(process.cwd(), "../ml_engine/pipeline/query_engine.py");

  const pyArgs = [
    scriptPath,
    "--user_id",     userId,
    "--dataset_id",  datasetId,
    "--action",      action,
    "--role",        role,
    "--permissions", permissions,
    ...extraArgs          // already split into individual tokens
  ];

  const proc = spawn("python", pyArgs);

  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  proc.on("error", (err) => {
    console.error(`❌ Failed to start query_engine.py (${action}):`, err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Failed to start data operation process", error: err.message });
    }
  });

  proc.on("close", (code) => {
    if (res.headersSent) return;

    if (!stdout.trim()) {
      console.error(`No output from query engine (${action}), exit code: ${code}`);
      console.error("STDERR:", stderr);
      return res.status(500).json({ success: false, message: "No output from python script", stderr });
    }

    try {
      const payload = JSON.parse(stdout.trim());

      if (payload.intent === "error") {
        if (payload.traceback) {
          console.error("Python traceback:\n", payload.traceback);
        }
        return res.status(400).json({ success: false, message: payload.answer || payload.error });
      }

      return res.json({ success: true, data: payload });
    } catch (parseError) {
      console.error("Failed to parse data operation output:", stdout);
      return res.status(500).json({ success: false, message: "Invalid JSON from query engine", raw: stdout.slice(0, 500) });
    }
  });
};

/* ── Individual Operation Handlers ─────────────────────── */

export const fillNulls = (req, res) => {
  const { column, method, value } = req.body;
  if (!column) return res.status(400).json({ success: false, message: "column is required" });

  const safeMethod = method || "mean";
  const extra = ["--column", column, "--method", safeMethod];
  if (value !== undefined && value !== "") extra.push("--value", String(value));

  return executeDataOperation(req, res, "fill_null", extra);
};

export const updateValues = (req, res) => {
  const { column, condition, new_value } = req.body;
  if (!column || !condition || new_value === undefined) {
    return res.status(400).json({ success: false, message: "column, condition, and new_value are required" });
  }

  const extra = ["--column", column, "--condition", condition, "--new_value", String(new_value)];
  return executeDataOperation(req, res, "update", extra);
};

export const deleteRows = (req, res) => {
  const { condition } = req.body;
  if (!condition) return res.status(400).json({ success: false, message: "condition is required" });

  const extra = ["--condition", condition];
  return executeDataOperation(req, res, "delete", extra);
};

export const addRow = (req, res) => {
  const { row_data } = req.body;
  if (!row_data || typeof row_data !== "object") {
    return res.status(400).json({ success: false, message: "row_data (object) is required" });
  }

  // Pass as a clean JSON string — spawn keeps it in one arg, no shell escaping needed
  const extra = ["--row_data", JSON.stringify(row_data)];
  return executeDataOperation(req, res, "add_row", extra);
};

export const addColumn = (req, res) => {
  const { column, value } = req.body;
  if (!column || value === undefined) {
    return res.status(400).json({ success: false, message: "column and value are required" });
  }

  const extra = ["--column", column, "--value", String(value)];
  return executeDataOperation(req, res, "add_column", extra);
};

/* ── Preview Operation Handler ──────────────────────────────────────────────
 * Calls query_engine.py --action preview, which READS the CSV and counts
 * how many rows match the condition/operation — ZERO disk writes.
 * Body: { datasetId, operation_type, column, condition, new_value, method, value }
 * Returns: { operation_type, column, condition, new_value, preview_count, total_rows }
 */
export const previewOperation = (req, res) => {
  const { datasetId, operation_type, column, condition, new_value, method, value } = req.body;

  if (!datasetId) {
    return res.status(400).json({ success: false, message: "datasetId is required" });
  }
  if (!operation_type) {
    return res.status(400).json({ success: false, message: "operation_type is required (update | delete | fill_null)" });
  }

  const extra = ["--operation_type", operation_type];
  if (column)    extra.push("--column",    column);
  if (condition) extra.push("--condition", condition);
  if (new_value !== undefined && new_value !== "") extra.push("--new_value", String(new_value));
  if (method)    extra.push("--method",    method);
  if (value !== undefined && value !== "") extra.push("--value", String(value));

  return executeDataOperation(req, res, "preview", extra);
};

/* ── Arbitrary Query Execution Handler ──────────────────────────────────────────────
 * Uses query_validator.py and executor.py to securely run AI-generated pandas or SQL.
 */
export const executeAnyQuery = (req, res) => {
  const { datasetId, generated_query } = req.body;
  if (!datasetId || !generated_query) {
    return res.status(400).json({ success: false, message: "datasetId and generated_query are required" });
  }

  const userId = req.user?.id || "default_user";
  const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : ["can_view", "can_insert", "can_update", "can_delete"];

  const validatorPath = path.resolve(process.cwd(), "../ml_engine/query_validator.py");
  const validatorProc = spawn("python", [validatorPath]);
  
  let valStdout = "";
  let valStderr = "";
  validatorProc.stdout.on("data", (chunk) => { valStdout += chunk.toString(); });
  validatorProc.stderr.on("data", (chunk) => { valStderr += chunk.toString(); });
  
  validatorProc.stdin.write(JSON.stringify({ query_id: "q1", user_id: userId, dataset_id: datasetId, generated_query, permissions }));
  validatorProc.stdin.end();

  validatorProc.on("close", (code) => {
    try {
      const valPayload = JSON.parse(valStdout.trim());
      if (!valPayload.allowed) {
         return res.status(403).json({ success: false, message: valPayload.message || "Query not permitted." });
      }

      // Execute if validated!
      const executorPath = path.resolve(process.cwd(), "../ml_engine/executor.py");
      const extProc = spawn("python", [executorPath]);

      let extStdout = "";
      let extStderr = "";
      extProc.stdout.on("data", (c) => { extStdout += c.toString() });
      extProc.stderr.on("data", (c) => { extStderr += c.toString() });
      
      extProc.stdin.write(JSON.stringify({
         query_id: "q1", user_id: userId, dataset_id: datasetId, 
         language: valPayload.language, query_type: valPayload.query_type, 
         generated_query
      }));
      extProc.stdin.end();

      extProc.on("close", (extCode) => {
        try {
           const extResult = JSON.parse(extStdout.trim());
           if (!extResult.success) {
               return res.status(400).json({ success: false, message: extResult.error });
           }
           return res.json({ success: true, result: extResult.result, row_count: extResult.row_count });
        } catch (err) {
           return res.status(500).json({ success: false, message: "Executor failed to parse output", raw: extStdout.slice(0, 500) });
        }
      });
    } catch (e) {
       return res.status(500).json({ success: false, message: "Validator failed to parse output", raw: valStdout.slice(0, 500) });
    }
  });
};
