"""
summary.py — DataInsights.ai
/ml_engine/summary.py

Generates a full dataset summary from a cleaned CSV or Excel file.
Called by the Node.js controller after cleaning is complete.
Returns a structured dict that the Node controller forwards as JSON to the frontend.

Usage (from Node.js Python bridge):
    from summary import generate_summary

    result = generate_summary(
        file_path        = "/uploads/cleaned/dataset_xyz.csv",
        dataset_id       = "abc123",
        version          = 3,
        cleaning_summary = { ...dict from clean.py... },
    )
"""

import os
import math
from datetime import datetime

import pandas as pd
import numpy as np


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def safe_val(val):
    """Convert numpy/pandas types to JSON-safe Python types."""
    if val is None:
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        if math.isnan(val) or math.isinf(val):
            return None
        return round(float(val), 4)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, (pd.Timestamp,)):
        return val.isoformat()
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return round(val, 4)
    return val


def infer_semantic_type(col_name: str, dtype_str: str, sample_vals: list) -> str:
    """
    Best-effort semantic type label shown in the UI schema table.
    Keeps the raw dtype as fallback.
    """
    name_lower = col_name.lower()

    date_keywords = ["date", "time", "created", "updated", "timestamp", "joined", "signup"]
    id_keywords   = ["_id", "id", "uuid", "key", "code"]
    email_kw      = ["email", "mail"]
    phone_kw      = ["phone", "mobile", "tel"]
    bool_kw       = ["is_", "has_", "flag", "active", "enabled", "status"]

    if any(k in name_lower for k in date_keywords):
        return "datetime"
    if any(k in name_lower for k in email_kw):
        return "email"
    if any(k in name_lower for k in phone_kw):
        return "phone"
    if any(name_lower.startswith(k) for k in bool_kw):
        # Check if values look boolean
        unique_lower = {str(v).strip().lower() for v in sample_vals if v is not None}
        if unique_lower.issubset({"true", "false", "1", "0", "yes", "no"}):
            return "boolean"
    if any(k in name_lower for k in id_keywords):
        return "string"

    # Fall back to pandas dtype string
    dtype_map = {
        "int64": "int64",
        "int32": "int64",
        "float64": "float64",
        "float32": "float64",
        "object": "string",
        "bool": "boolean",
        "datetime64[ns]": "datetime",
        "category": "categorical",
    }
    return dtype_map.get(dtype_str, dtype_str)


def get_date_range_years(df: pd.DataFrame) -> float | None:
    """Return approximate year span across all datetime columns."""
    spans = []
    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
        mn = df[col].min()
        mx = df[col].max()
        if pd.notna(mn) and pd.notna(mx):
            spans.append((mx - mn).days / 365.25)
    if spans:
        return round(max(spans), 1)
    return None


# ─────────────────────────────────────────────
# SECTION BUILDERS
# ─────────────────────────────────────────────

def build_basic_info(df: pd.DataFrame, file_path: str, version: int, dataset_id: str) -> dict:
    """Top-level dataset stats shown in the header card."""
    file_size_bytes = os.path.getsize(file_path)
    file_size_mb    = round(file_size_bytes / (1024 * 1024), 1)

    total_rows, total_cols = df.shape

    # Data quality score: % of non-null cells across the entire dataframe
    total_cells   = total_rows * total_cols
    non_null_cells = df.count().sum()
    quality_score = round((non_null_cells / total_cells) * 100, 1) if total_cells > 0 else 100.0

    date_range_yrs = get_date_range_years(df)

    return {
        "dataset_id"    : dataset_id,
        "version"       : version,
        "file_path"     : file_path,
        "file_name"     : os.path.basename(file_path),
        "file_size_mb"  : file_size_mb,
        "total_rows"    : total_rows,
        "total_columns" : total_cols,
        "data_quality"  : quality_score,       # e.g. 99.9  (shown as "99.9%")
        "date_range_yrs": date_range_yrs,      # e.g. 3  (shown as "3 yrs"), null if no datetime cols
        "status"        : "ready",
        "generated_at"  : datetime.utcnow().isoformat() + "Z",
    }


def build_schema(df: pd.DataFrame) -> list[dict]:
    """
    One entry per column — all columns returned.
    Frontend handles "Show all" toggling.
    """
    schema = []
    for idx, col in enumerate(df.columns):
        dtype_str  = str(df[col].dtype)
        non_null   = df[col].notna().sum()
        null_count = int(df[col].isna().sum())
        unique_cnt = int(df[col].nunique(dropna=True))
        nullable   = null_count > 0

        # Sample values: up to 3 non-null, cast to str
        sample_raw = df[col].dropna().head(3).tolist()
        sample_vals = [str(safe_val(v)) for v in sample_raw]

        semantic = infer_semantic_type(col, dtype_str, sample_raw)

        schema.append({
            "index"      : idx + 1,
            "name"       : col,
            "dtype"      : dtype_str,        # raw pandas dtype
            "type"       : semantic,          # display type (string / float64 / datetime / …)
            "nullable"   : nullable,
            "null_count" : null_count,
            "unique"     : unique_cnt,
            "sample"     : sample_vals,
        })

    return schema


def build_null_analysis(df: pd.DataFrame) -> list[dict]:
    """
    Post-cleaning null analysis per column.
    Only includes columns that had nulls originally OR still have nulls.
    Frontend filters/displays as needed.
    """
    results = []
    total_rows = len(df)

    for col in df.columns:
        null_count = int(df[col].isna().sum())
        null_pct   = round((null_count / total_rows) * 100, 2) if total_rows > 0 else 0.0
        results.append({
            "column"    : col,
            "null_count": null_count,
            "null_pct"  : null_pct,           # e.g. 0.19  (shown as "0.19%")
            "filled"    : null_count == 0,     # true → "fully filled" badge
        })

    # Sort: fully-filled first (they're the "good news"), then by null_pct desc
    results.sort(key=lambda x: (not x["filled"], -x["null_pct"]))
    return results


def build_numeric_stats(df: pd.DataFrame) -> list[dict]:
    """
    Min / max / mean / median / std dev / null count for every numeric column.
    """
    stats = []
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            continue

        stats.append({
            "column" : col,
            "min"    : safe_val(series.min()),
            "max"    : safe_val(series.max()),
            "mean"   : safe_val(series.mean()),
            "median" : safe_val(series.median()),
            "std_dev": safe_val(series.std()),
            "nulls"  : int(df[col].isna().sum()),
        })

    return stats


def build_categorical_profiles(df: pd.DataFrame, max_categories: int = 20) -> list[dict]:
    """
    Frequency distribution for string / categorical columns with low cardinality.
    Capped at max_categories unique values to keep payload lean.
    """
    profiles = []
    total_rows = len(df)

    candidate_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    for col in candidate_cols:
        unique_cnt = df[col].nunique(dropna=True)
        if unique_cnt > max_categories:
            # Too many unique values (e.g. free-text, IDs) — skip
            continue

        freq = df[col].value_counts(dropna=True)
        distribution = []
        for val, count in freq.items():
            distribution.append({
                "value"  : str(val),
                "count"  : int(count),
                "pct"    : round((count / total_rows) * 100, 1),
            })

        profiles.append({
            "column"       : col,
            "unique_count" : int(unique_cnt),
            "distribution" : distribution,
        })

    return profiles


# ─────────────────────────────────────────────
# MAIN ENTRY
# ─────────────────────────────────────────────

def generate_summary(
    file_path       : str,
    dataset_id      : str,
    version         : int       = 1,
    cleaning_summary: dict      = None,   # Passed in from clean.py — do NOT recompute here
) -> dict:
    """
    Core function. Returns the full summary payload as a Python dict.
    Node.js serialises this to JSON.
    """

    # ── Load file ──────────────────────────────────────────────────────────
    ext = os.path.splitext(file_path)[-1].lower()
    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(file_path)
    elif ext == ".csv":
        df = pd.read_csv(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext!r}. Expected .csv or .xlsx")

    # Attempt datetime parsing for columns with date/time keywords — failures are silent
    for col in df.columns:
        if any(kw in col.lower() for kw in ["date", "time", "timestamp", "signup", "created", "updated"]):
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce")
            except Exception:
                pass

    # ── Build each section independently ──────────────────────────────────
    # Each section is wrapped so a failure in one never kills the full payload.
    # Node receives null for that section and can render a graceful fallback.

    def safe_build(fn, *args, fallback=None):
        try:
            return fn(*args)
        except Exception as e:
            return {"_error": str(e), "data": fallback}

    basic_info           = safe_build(build_basic_info,           df, file_path, version, dataset_id, fallback={})
    schema               = safe_build(build_schema,               df, fallback=[])
    null_analysis        = safe_build(build_null_analysis,        df, fallback=[])
    numeric_stats        = safe_build(build_numeric_stats,        df, fallback=[])
    categorical_profiles = safe_build(build_categorical_profiles, df, fallback=[])

    # ── Assemble payload ───────────────────────────────────────────────────
    payload = {
        "basic_info"           : basic_info,
        "cleaning_summary"     : cleaning_summary or {},  # Injected from clean.py — untouched
        "schema"               : schema,
        "null_analysis"        : null_analysis,
        "numeric_stats"        : numeric_stats,
        "categorical_profiles" : categorical_profiles,

        # ── LLM summary paragraph ──────────────────────────────────────────
        # TODO: Populate this after user approves cleaning.
        # Single LLM call per dataset. Generated in the approval flow, not here.
        # Shape: { "text": "This dataset contains ...", "generated_at": "..." }
        "llm_summary": None,
    }

    return payload


if __name__ == "__main__":
    import sys
    import json
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--file_path", required=True)
    parser.add_argument("--dataset_id", required=True)
    parser.add_argument("--version", type=int, default=1)
    args = parser.parse_args()
    
    try:
        summary = generate_summary(args.file_path, args.dataset_id, args.version)
        print(json.dumps({"success": True, "data": summary}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
