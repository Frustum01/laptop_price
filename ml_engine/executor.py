"""
executor.py
-----------
Standalone Python script called by Node.js as a child process.
Executes a validated pandas or SQL query on the dataset file.

Assumes:
- Query is already validated and permitted by validator.py
- Dataset files are stored in uploads/cleaned/
- File name starts with dataset_id (e.g. 100183_customers.csv)

Input (stdin):
{
    "query_id":        "uuid",
    "user_id":         "uuid",
    "dataset_id":      "uuid",
    "language":        "pandas" | "sql",
    "query_type":      "SELECT" | "AGGREGATE" | "INSERT" | "UPDATE" | "DELETE" | "READ" | "OTHER",
    "generated_query": "df.head(10) or SELECT * FROM df ..."
}

Output (stdout):
{
    "success":      true/false,
    "query_id":     "uuid",
    "language":     "pandas" | "sql",
    "query_type":   "...",
    "result":       [ ... ],   -- list of row dicts
    "row_count":    int,
    "error":        null | "error message"
}
"""

import sys
import os
import json
import re
import traceback
from pathlib import Path

import pandas as pd
import sqlalchemy

# ----------------------------
# PATHS
# Adjust if your project structure differs
# ml_engine/executor.py -> uploads/cleaned/ is two levels up
# ----------------------------
BASE_DIR    = Path(__file__).resolve().parent.parent  # project root
UPLOADS_DIR = BASE_DIR / "uploads" / "cleaned"

SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".json"]


# ----------------------------
# DATASET LOADER
# Scans uploads/cleaned/ for a file starting with dataset_id
# ----------------------------
def find_dataset_file(dataset_id: str) -> Path:
    """
    Finds the dataset file in uploads/cleaned/ whose name starts with dataset_id.
    Raises FileNotFoundError if no match found.
    """
    if not UPLOADS_DIR.exists():
        raise FileNotFoundError(f"uploads/cleaned/ directory not found at {UPLOADS_DIR}")

    for file in UPLOADS_DIR.iterdir():
        if file.name.startswith(str(dataset_id)) and file.suffix in SUPPORTED_EXTENSIONS:
            return file

    raise FileNotFoundError(
        f"No dataset file found starting with '{dataset_id}' in {UPLOADS_DIR}. "
        f"Supported formats: {', '.join(SUPPORTED_EXTENSIONS)}"
    )


def load_dataset(dataset_id: str) -> pd.DataFrame:
    """
    Loads the dataset file into a pandas DataFrame.
    Supports CSV, Excel, and JSON.
    """
    file_path = find_dataset_file(dataset_id)
    ext = file_path.suffix.lower()

    if ext == ".csv":
        return pd.read_csv(file_path)
    elif ext in [".xlsx", ".xls"]:
        return pd.read_excel(file_path)
    elif ext == ".json":
        return pd.read_json(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}")


# ----------------------------
# PANDAS EXECUTION
# df is injected into the execution scope so the
# generated query can reference it directly as 'df'
# ----------------------------
def execute_pandas(query: str, dataset_id: str) -> list[dict]:
    """
    Loads the dataset and executes the pandas query string.
    The query must reference the dataframe as 'df'.
    Returns result as a list of row dicts.
    """
    df = load_dataset(dataset_id)

    # Safe execution scope — only expose df and pd
    exec_scope = {"df": df, "pd": pd}

    # If query is a single expression (e.g. df.head(10)), eval it
    # If it's a multi-line block, exec it and expect result stored in 'result'
    query = query.strip()

    try:
        # Try eval first — works for single expression queries
        result = eval(query, exec_scope)
    except SyntaxError:
        # Multi-line block — exec and expect 'result' variable set inside
        exec(query, exec_scope)
        result = exec_scope.get("result", None)

    # Normalize result to list of dicts
    if isinstance(result, pd.DataFrame):
        return result.where(pd.notnull(result), None).to_dict(orient="records")
    elif isinstance(result, pd.Series):
        return result.where(pd.notnull(result), None).reset_index().to_dict(orient="records")
    elif result is None:
        # Mutation query (drop, fillna etc) — return updated df state
        updated_df = exec_scope.get("df", df)
        return updated_df.where(pd.notnull(updated_df), None).to_dict(orient="records")
    else:
        # Scalar result (e.g. df.shape, df.count())
        return [{"result": str(result)}]


# ----------------------------
# SQL EXECUTION
# Dataset is loaded into an in-memory SQLite DB as 'df' table
# so SQL queries run against it without touching production DB
# ----------------------------
def execute_sql(query: str, dataset_id: str) -> list[dict]:
    """
    Loads the dataset into an in-memory SQLite DB as table 'df'.
    Executes the SQL query against it.
    Returns result as a list of row dicts.
    """
    df = load_dataset(dataset_id)

    # In-memory SQLite — isolated, safe, no production DB involved
    engine = sqlalchemy.create_engine("sqlite:///:memory:")

    with engine.connect() as conn:
        # Load dataset as table named 'df'
        df.to_sql("df", conn, index=False, if_exists="replace")

        result = conn.execute(sqlalchemy.text(query))

        # fetchall + column names → list of dicts
        columns = list(result.keys())
        rows    = result.fetchall()

    return [dict(zip(columns, row)) for row in rows]


# ----------------------------
# MAIN
# ----------------------------
def main():
    raw = sys.stdin.read()

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        print(json.dumps({"success": False, "error": "Invalid JSON input from Node.js"}))
        sys.exit(1)

    query_id        = payload.get("query_id")
    dataset_id      = payload.get("dataset_id")
    language        = payload.get("language")
    query_type      = payload.get("query_type")
    generated_query = payload.get("generated_query")

    # Basic input validation
    if not all([query_id, dataset_id, language, generated_query]):
        print(json.dumps({"success": False, "error": "Missing required fields in payload."}))
        sys.exit(1)

    try:
        if language == "pandas":
            result = execute_pandas(generated_query, dataset_id)
        elif language == "sql":
            result = execute_sql(generated_query, dataset_id)
        else:
            print(json.dumps({"success": False, "error": f"Unknown language: {language}"}))
            sys.exit(1)

        print(json.dumps({
            "success":    True,
            "query_id":   query_id,
            "language":   language,
            "query_type": query_type,
            "result":     result,
            "row_count":  len(result),
            "error":      None,
        }))

    except FileNotFoundError as e:
        print(json.dumps({"success": False, "query_id": query_id, "error": str(e)}))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "success":  False,
            "query_id": query_id,
            "error":    f"Execution error: {str(e)}",
            "trace":    traceback.format_exc(),  # remove in production
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
