"""
validator.py
------------
Standalone Python script called by Node.js as a child process.
Node sends JSON via stdin, this script prints JSON result to stdout.

Input (stdin):
{
    "query_id":        "uuid",
    "user_id":         "uuid",
    "dataset_id":      "uuid",
    "generated_query": "df.head(10) or SELECT * FROM ..."
}

Output (stdout):
{
    "allowed":         true/false,
    "language":        "pandas" | "sql",
    "query_type":      "SELECT" | "AGGREGATE" | "INSERT" | "UPDATE" | "DELETE" | "READ" | "OTHER",
    "message":         "...",
    "generated_query": "..." | null
}
"""

import sys
import re
import uuid
import json
from datetime import datetime

import asyncio
import asyncpg

# ----------------------------
# DB CONNECTION
# ----------------------------
DATABASE_URL = "postgresql://user:password@host:5432/dbname"


# ----------------------------
# LANGUAGE DETECTION
# ----------------------------

# Strong pandas signals — if any of these appear, it's pandas
PANDAS_SIGNALS = [
    r"\bdf\b",           # df.something
    r"\bpd\.",           # pd.read_csv, pd.concat etc
    r"\.head\(",
    r"\.tail\(",
    r"\.describe\(",
    r"\.info\(",
    r"\.shape\b",
    r"\.value_counts\(",
    r"\.groupby\(",
    r"\.agg\(",
    r"\.fillna\(",
    r"\.dropna\(",
    r"\.drop\(",
    r"\.rename\(",
    r"\.replace\(",
    r"\.update\(",
    r"\.loc\[",
    r"\.iloc\[",
    r"\.sort_values\(",
    r"\.merge\(",
    r"\.plot\(",
    r"to_sql\(",
    r"read_csv\(",
    r"read_excel\(",
]

SQL_SIGNALS = [
    r"^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|DROP|ALTER|TRUNCATE)\b",
]

def detect_language(query: str) -> str:
    """
    Returns 'pandas' or 'sql'.
    Pandas signals take priority — if any match, it's pandas.
    Falls back to sql if SQL keywords found.
    Defaults to sql if ambiguous.
    """
    for pattern in PANDAS_SIGNALS:
        if re.search(pattern, query, re.IGNORECASE):
            return "pandas"

    for pattern in SQL_SIGNALS:
        if re.search(pattern, query, re.IGNORECASE):
            return "sql"

    # Default to sql — safer to validate it as sql than skip
    return "sql"


# ----------------------------
# QUERY TYPE DETECTION — SQL
# ----------------------------
AGGREGATE_FUNCTIONS = {"count", "sum", "avg", "min", "max", "group by", "having"}

def detect_sql_query_type(query: str) -> str:
    normalized = query.strip().lower()
    normalized = re.sub(r"'[^']*'", "", normalized)  # strip string literals
    first_keyword = normalized.split()[0] if normalized.split() else ""

    if first_keyword == "select":
        if any(fn in normalized for fn in AGGREGATE_FUNCTIONS):
            return "AGGREGATE"
        return "SELECT"
    elif first_keyword == "insert":
        return "INSERT"
    elif first_keyword == "update":
        return "UPDATE"
    elif first_keyword == "delete":
        return "DELETE"
    else:
        return "OTHER"


# ----------------------------
# QUERY TYPE DETECTION — PANDAS
# ----------------------------

# Maps regex patterns to operation type
PANDAS_READ_PATTERNS = [
    r"\.head\(", r"\.tail\(", r"\.describe\(", r"\.info\(",
    r"\.shape\b", r"\.value_counts\(", r"\.groupby\(", r"\.agg\(",
    r"\.mean\(", r"\.sum\(", r"\.count\(", r"\.plot\(",
    r"\.sort_values\(", r"\.filter\(", r"\.loc\[", r"\.iloc\[",
    r"\.query\(", r"\.corr\(", r"\.nunique\(", r"\.unique\(",
]

PANDAS_INSERT_PATTERNS = [
    r"\.append\(", r"pd\.concat\(", r"to_sql\(.*if_exists=['\"]append['\"]",
]

PANDAS_UPDATE_PATTERNS = [
    r"\.update\(", r"\.fillna\(", r"\.replace\(", r"\.rename\(",
    r"\.set_index\(", r"to_sql\(.*if_exists=['\"]replace['\"]",
    r"\.astype\(", r"\.apply\(",
]

PANDAS_DELETE_PATTERNS = [
    r"\.drop\(", r"\.dropna\(", r"\bdel\s+df\b",
]

PANDAS_BLOCKED_PATTERNS = [
    r"\beval\(", r"\bexec\(",  # always dangerous
]

def detect_pandas_query_type(query: str) -> str:
    # Block dangerous patterns immediately
    for pattern in PANDAS_BLOCKED_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            return "OTHER"

    # Check from most destructive to least — order matters
    for pattern in PANDAS_DELETE_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            return "DELETE"

    for pattern in PANDAS_INSERT_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            return "INSERT"

    for pattern in PANDAS_UPDATE_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            return "UPDATE"

    for pattern in PANDAS_READ_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            return "READ"

    return "OTHER"


# ----------------------------
# PERMISSION MAP
# ----------------------------
PERMISSION_MAP = {
    # SQL types
    "SELECT":    "can_view",
    "AGGREGATE": "can_view",
    "INSERT":    "can_insert",
    "UPDATE":    "can_update",
    "DELETE":    "can_delete",
    # Pandas types
    "READ":      "can_view",
    # Always blocked
    "OTHER":     None,
}


def check_permission(user_id: str, dataset_id: str, query_type: str, permissions_list: list) -> tuple[bool, str]:
    if not permissions_list:
        permissions_list = ["can_view", "can_insert", "can_update", "can_delete"]
        
    permission_column = PERMISSION_MAP.get(query_type)

    if permission_column is None:
        return False, f"Query type '{query_type}' is not permitted on this platform."

    if permission_column not in permissions_list:
        return False, (
            f"You do not have '{query_type}' permission on this dataset. "
            f"Please contact your admin to request access."
        )

    return True, ""


# ----------------------------
# MAIN
# ----------------------------
def main():
    # Read JSON payload from stdin
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input from Node.js"}))
        sys.exit(1)

    query_id        = payload.get("query_id")
    user_id         = payload.get("user_id")
    dataset_id      = payload.get("dataset_id")
    generated_query = payload.get("generated_query", "")
    permissions     = payload.get("permissions", ["can_view", "can_insert", "can_update", "can_delete"])

    # Step 1 — Detect language
    language = detect_language(generated_query)

    # Step 2 — Detect query type based on language
    if language == "sql":
        query_type = detect_sql_query_type(generated_query)
    else:
        query_type = detect_pandas_query_type(generated_query)

    # Step 3 — Check permission
    allowed, blocked_reason = check_permission(user_id, dataset_id, query_type, permissions)

    # Step 4 — Return result to Node.js via stdout
    result = {
        "allowed":         allowed,
        "language":        language,
        "query_type":      query_type,
        "message":         "Query validated successfully." if allowed else blocked_reason,
        "generated_query": generated_query if allowed else None,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
