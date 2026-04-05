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

/**
 * GET /api/datasets/:id/summary-report
 * Aggregates all pipeline artifacts into a rich Markdown report and streams it
 * as a downloadable .md file.
 */
export const getSummaryReport = async (req, res) => {
  const datasetId = req.params.id;
  const userId = req.user?.id || "default_user";
  const baseDir = path.resolve(process.cwd(), `../ml_engine/data/users/${userId}/${datasetId}`);

  // Helper: read JSON artifact or return null
  const readJSON = async (filename) => {
    try {
      const raw = await fs.readFile(path.join(baseDir, filename), "utf-8");
      return JSON.parse(raw);
    } catch { return null; }
  };

  try {
    const [meta, schema, profile, insights, kpi, metrics, metricsDefn, dashboard] = await Promise.all([
      readJSON("dataset_metadata.json"),
      readJSON("schema.json"),
      readJSON("profile_report.json"),
      readJSON("insights.json"),
      readJSON("kpi_summary.json"),
      readJSON("metrics.json"),
      readJSON("metrics_definition.json"),
      readJSON("dashboard_config.json"),
    ]);

    if (!meta && !schema) {
      return res.status(404).json({ success: false, message: "Summary data not available yet. The dataset may still be processing." });
    }

    // ── Build Markdown report ────────────────────────────────────────────
    const lines = [];
    const hr = "---";
    const now = new Date().toLocaleString();

    lines.push(`# 📊 DataInsights.ai — Dataset Summary Report`);
    lines.push(`> Generated on ${now}`);
    lines.push("");

    // ── Basic Info ──────────────────────────────────────────────────────
    if (meta) {
      lines.push(`## 1. Dataset Overview`);
      lines.push("");
      lines.push(`| Property | Value |`);
      lines.push(`|----------|-------|`);
      if (meta.file_name)      lines.push(`| **File Name** | ${meta.file_name} |`);
      if (meta.total_rows != null)    lines.push(`| **Total Rows** | ${Number(meta.total_rows).toLocaleString()} |`);
      if (meta.total_columns != null) lines.push(`| **Total Columns** | ${meta.total_columns} |`);
      if (meta.file_size_mb != null)  lines.push(`| **File Size** | ${meta.file_size_mb} MB |`);
      if (meta.data_quality != null)  lines.push(`| **Data Quality Score** | ${meta.data_quality}% |`);
      lines.push("");
      lines.push(hr);
      lines.push("");
    }

    // ── Executive Summary (from dashboard/insights) ────────────────────
    if (dashboard?.executive_summary) {
      lines.push(`## 2. Executive Summary`);
      lines.push("");
      lines.push(dashboard.executive_summary);
      lines.push("");
      lines.push(hr);
      lines.push("");
    }

    // ── KPIs ───────────────────────────────────────────────────────────
    if (kpi?.kpis && typeof kpi.kpis === "object") {
      lines.push(`## 3. Key Performance Indicators`);
      lines.push("");
      lines.push(`| KPI | Value |`);
      lines.push(`|-----|-------|`);
      for (const [key, val] of Object.entries(kpi.kpis)) {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        const display = typeof val === "number" ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(val);
        lines.push(`| ${label} | ${display} |`);
      }
      lines.push("");
      lines.push(hr);
      lines.push("");
    } else if (dashboard?.kpis?.length) {
      lines.push(`## 3. Key Performance Indicators`);
      lines.push("");
      lines.push(`| KPI | Value |`);
      lines.push(`|-----|-------|`);
      for (const k of dashboard.kpis) {
        lines.push(`| ${k.label} | ${k.value} |`);
      }
      lines.push("");
      lines.push(hr);
      lines.push("");
    }

    // ── Schema ─────────────────────────────────────────────────────────
    const schemaList = schema?.schema || schema;
    if (Array.isArray(schemaList) && schemaList.length) {
      lines.push(`## 4. Column Schema`);
      lines.push("");
      lines.push(`| # | Column Name | Type | Nulls | Unique | Sample Values |`);
      lines.push(`|---|-------------|------|-------|--------|---------------|`);
      for (const col of schemaList) {
        const idx      = col.index ?? "";
        const name     = col.name ?? col.column ?? "";
        const dtype    = col.type ?? col.dtype ?? "";
        const nulls    = col.null_count ?? 0;
        const unique   = col.unique ?? "";
        const sample   = Array.isArray(col.sample) ? col.sample.join(", ") : "";
        lines.push(`| ${idx} | ${name} | ${dtype} | ${nulls} | ${unique} | ${sample} |`);
      }
      lines.push("");
      lines.push(hr);
      lines.push("");
    }

    // ── Numeric Statistics ──────────────────────────────────────────────
    const numStats = profile?.numeric_stats || profile?.statistics;
    if (Array.isArray(numStats) && numStats.length) {
      lines.push(`## 5. Numeric Column Statistics`);
      lines.push("");
      lines.push(`| Column | Min | Max | Mean | Median | Std Dev |`);
      lines.push(`|--------|-----|-----|------|--------|---------|`);
      for (const s of numStats) {
        const fmt = (v) => v != null ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
        lines.push(`| ${s.column} | ${fmt(s.min)} | ${fmt(s.max)} | ${fmt(s.mean)} | ${fmt(s.median)} | ${fmt(s.std_dev)} |`);
      }
      lines.push("");
      lines.push(hr);
      lines.push("");
    }

    // ── Null Analysis ──────────────────────────────────────────────────
    const nullInfo = profile?.null_analysis;
    if (Array.isArray(nullInfo) && nullInfo.length) {
      const withNulls = nullInfo.filter(n => n.null_count > 0);
      lines.push(`## 6. Null Value Analysis`);
      lines.push("");
      if (withNulls.length === 0) {
        lines.push(`✅ **No null values found in any column.**`);
      } else {
        lines.push(`| Column | Null Count | Null % | Status |`);
        lines.push(`|--------|-----------|--------|--------|`);
        for (const n of nullInfo) {
          const status = n.null_count === 0 ? "✅ Clean" : "⚠️ Has Nulls";
          lines.push(`| ${n.column} | ${n.null_count} | ${n.null_pct}% | ${status} |`);
        }
      }
      lines.push("");
      lines.push(hr);
      lines.push("");
    }

    // ── Categorical Profiles ───────────────────────────────────────────
    const catProfiles = profile?.categorical_profiles;
    if (Array.isArray(catProfiles) && catProfiles.length) {
      lines.push(`## 7. Categorical Column Profiles`);
      lines.push("");
      for (const cp of catProfiles) {
        lines.push(`### ${cp.column} (${cp.unique_count} unique values)`);
        lines.push("");
        lines.push(`| Value | Count | % |`);
        lines.push(`|-------|-------|---|`);
        for (const d of (cp.distribution || []).slice(0, 15)) {
          lines.push(`| ${d.value} | ${d.count} | ${d.pct}% |`);
        }
        lines.push("");
      }
      lines.push(hr);
      lines.push("");
    }

    // ── AI Insights ────────────────────────────────────────────────────
    const insightList = insights?.insights || (Array.isArray(insights) ? insights : []);
    if (insightList.length) {
      lines.push(`## 8. AI-Generated Insights`);
      lines.push("");
      for (const ins of insightList) {
        const severity = ins.severity ? ` [${ins.severity.toUpperCase()}]` : "";
        lines.push(`- **${ins.title || ins.key || "Insight"}**${severity}: ${ins.description || ins.value || ""}`);
      }
      lines.push("");
      lines.push(hr);
      lines.push("");
    }

    // ── Metrics Definitions ────────────────────────────────────────────
    if (metricsDefn && Array.isArray(metricsDefn.definitions)) {
      lines.push(`## 9. Metric Definitions`);
      lines.push("");
      for (const md of metricsDefn.definitions) {
        lines.push(`- **${md.name || md.metric}**: ${md.description || md.formula || ""}`);
      }
      lines.push("");
      lines.push(hr);
      lines.push("");
    }

    // ── Footer ─────────────────────────────────────────────────────────
    lines.push(`---`);
    lines.push(`*Report generated by DataInsights.ai • Dataset ID: ${datasetId}*`);

    const markdown = lines.join("\n");
    const filename = `DataInsights_Summary_${datasetId.slice(0, 12)}.md`;

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(markdown);

  } catch (err) {
    console.error("Summary report generation error:", err);
    return res.status(500).json({ success: false, message: "Failed to generate summary report", error: err.message });
  }
};
