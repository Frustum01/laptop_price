import pandas as pd
import json
from filelock import FileLock
import os
import sys
import logging
import datetime
import re
from rapidfuzz import process, fuzz

try:
    from pipeline.ollama_client import greeting_response as _ollama_greeting
except ImportError:
    try:
        from ollama_client import greeting_response as _ollama_greeting
    except ImportError:
        _ollama_greeting = None

logger = logging.getLogger("system_logger")

# Greeting keywords — handled by Ollama before the dataset query engine
GREETING_TRIGGERS = {
    "hello", "hi", "hey", "help", "who are you", "what can you do",
    "how are you", "good morning", "good afternoon", "good evening"
}

# Non-data questions that have no meaningful dataset answer
NON_DATA_QUESTIONS = [
    "what is the capital", "ceo of", "founder of", "weather"
]

def check_guardrails(question):
    q_lower = str(question).lower()
    for trigger in NON_DATA_QUESTIONS:
        if trigger in q_lower:
            return "This question cannot be answered using the uploaded dataset."
    return None

def detect_intent(question):
    """
    Rule-based intent routing mapping questions to templates.
    Dataset exploration intents are detected first.
    """
    q_lower = str(question).lower()

    # ── Dataset exploration intents (highest priority, checked first) ──────────
    if any(p in q_lower for p in [
        "tell me about", "describe dataset", "dataset summary",
        "what data is available", "about this dataset", "overview of dataset"
    ]):
        return "dataset_summary"

    if any(p in q_lower for p in [
        "list products", "show products", "name of products",
        "what products", "which products", "all products"
    ]):
        return "list_products"

    if any(p in q_lower for p in [
        "what columns", "dataset columns", "show columns",
        "list columns", "column names", "available columns"
    ]):
        return "show_columns"

    if any(p in q_lower for p in [
        "dataset overview", "executive summary", "key findings",
        "main insights", "overview"
    ]):
        return "dataset_overview"

    # ── Ranking / Top-N intents ───────────────────────────────────────────────
    if any(p in q_lower for p in [
        "top", "best", "highest", "most profitable", "best performing",
        "leading", "number one", "rank"
    ]):
        return "top_performers"

    if any(p in q_lower for p in [
        "bottom", "worst", "lowest", "least", "underperform", "poor"
    ]):
        return "bottom_performers"

    # ── Grouping / Segmentation ───────────────────────────────────────────────
    if any(p in q_lower for p in [
        "count by", "number of", "how many", "breakdown", "split by", "per category"
    ]):
        return "count_by_category"

    if any(p in q_lower for p in [
        "average by", "avg by", "mean by", "average per", "mean per"
    ]):
        return "average_by_category"

    # ── Time-based ──────────────────────────────────────────────────────────
    if any(p in q_lower for p in [
        "monthly", "by month", "per month", "month over month", "month wise"
    ]):
        return "monthly_breakdown"

    if any(p in q_lower for p in [
        "daily", "by day", "per day", "day wise"
    ]):
        return "daily_breakdown"

    if any(p in q_lower for p in [
        "date range", "earliest", "latest", "oldest", "newest", "when did", "start date", "end date"
    ]):
        return "date_range_info"

    # ── Profit / Financial ───────────────────────────────────────────────────
    if any(p in q_lower for p in [
        "profit", "margin", "earnings", "net income"
    ]):
        return "profit_analysis"

    # ── Data quality ─────────────────────────────────────────────────────────
    if any(p in q_lower for p in [
        "missing", "null", "empty", "data quality", "incomplete"
    ]):
        return "data_quality"

    if any(p in q_lower for p in [
        "distribution", "spread", "outlier", "range of", "min max"
    ]):
        return "distribution"

    # ── Analytical intents ─────────────────────────────────────────────────────
    if "why" in q_lower or "cause" in q_lower or "reason" in q_lower or "drop" in q_lower:
        return "root_cause"
    if "predict" in q_lower or "future" in q_lower or "next" in q_lower or "forecast" in q_lower:
        return "trend_analysis"
    if "recommend" in q_lower or "increase" in q_lower or "improve" in q_lower or "should i do" in q_lower:
        return "recommendation"
    if "affect" in q_lower or "impact" in q_lower or "most important" in q_lower or "drive" in q_lower:
        return "feature_importance"
    if "compare" in q_lower or "vs" in q_lower or "versus" in q_lower:
        return "comparison"
    if "insight" in q_lower or "summary" in q_lower or "analyze" in q_lower:
        return "analyst_summary"
    if "filter" in q_lower or "only" in q_lower or "greater than" in q_lower or "less than" in q_lower or "where" in q_lower or "exclude" in q_lower:
        return "filtering"
    if "average" in q_lower or "sum" in q_lower or "total" in q_lower or "minimum" in q_lower or "maximum" in q_lower or "how many" in q_lower:
        return "aggregation"

    # Default
    return "aggregation"

def extract_entities(question, df_columns):
    """
    NLP Entity Extraction using RapidFuzz to map words in the question to DataFrame columns.
    """
    words = str(question).replace("?", "").replace(",", "").split()
    entities = []
    
    for word in words:
        if len(word) < 3: continue
        result = process.extractOne(word, df_columns, scorer=fuzz.WRatio)
        if result:
            match_col, score, _ = result
            if score > 80:
                entities.append(match_col)
                
    return list(set(entities))

_ARTIFACT_CACHE = {}

def execute_query(user_id, dataset_id, question):
    """
    Executes the query against the dataset.
    Order: greeting check → guardrails → intent routing → pandas templates.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_dir = os.path.join(base_dir, "data", "users", str(user_id), str(dataset_id))
    q_lower = str(question).lower().strip()

    # ── 0. Greeting Detection (Ollama) ────────────────────────────────────────
    is_greeting = any(trigger in q_lower for trigger in GREETING_TRIGGERS)
    if is_greeting:
        static_fallback = (
            "Hello! I'm your DataInsights.ai assistant. "
            "Ask me about totals, trends, averages, or insights from your uploaded dataset."
        )
        if _ollama_greeting:
            answer = _ollama_greeting(question) or static_fallback
        else:
            answer = static_fallback
        return {
            "intent": "greeting",
            "question": question,
            "answer": answer,
            "confidence": 1.0
        }

    # ── 1. Guardrails (non-data questions) ────────────────────────────────────
    guard = check_guardrails(question)
    if guard:
        return {"intent": "rejected", "answer": guard, "confidence": "high"}
        
    intent = detect_intent(question)
    confidence = "high"
    
    # Pre-load artifacts (Caching Layer)
    global _ARTIFACT_CACHE
    cache_key = f"{user_id}_{dataset_id}"
    
    if cache_key not in _ARTIFACT_CACHE:
        _ARTIFACT_CACHE[cache_key] = {}
        for f in ["kpi_summary.json", "feature_importance.json", "forecast.json", "schema.json", "metrics.json", "insights.json"]:
            path = os.path.join(dataset_dir, f)
            if os.path.exists(path):
                with open(path, 'r') as fp:
                    _ARTIFACT_CACHE[cache_key][f] = json.load(fp)
                    
    artifacts = _ARTIFACT_CACHE[cache_key]
    answer = None
    
    # ── Fast-Path Artifact Routing ──────────────────────────────────────────

    # ──  Dataset Exploration Intents  ──────────────────────────────────────────
    if intent == "dataset_summary":
        meta    = {}
        meta_p  = os.path.join(dataset_dir, "dataset_metadata.json")
        schema  = artifacts.get("schema.json", {})
        kpi     = artifacts.get("kpi_summary.json", {})
        if os.path.exists(meta_p):
            with open(meta_p) as fh:
                meta = json.load(fh)

        rows    = meta.get("total_rows", "unknown")
        cols    = meta.get("total_columns", "unknown")
        sales_col = schema.get("sales_column", "")
        date_col  = schema.get("date_column", "")
        top_product = None
        product_col = schema.get("product_column")
        total_sales = None

        try:
            if "cleaned_data" in artifacts:
                df_sum = artifacts["cleaned_data"]
            else:
                df_sum = pd.read_csv(os.path.join(dataset_dir, "cleaned_data.csv"))
                artifacts["cleaned_data"] = df_sum

            if sales_col and sales_col in df_sum.columns:
                total_sales = round(df_sum[sales_col].sum(), 2)
            if product_col and product_col in df_sum.columns and sales_col in df_sum.columns:
                top_product = df_sum.groupby(product_col)[sales_col].sum().idxmax()
        except Exception:
            pass

        lines = [f"**Dataset Summary**",
                 f"- Rows: {rows} | Columns: {cols}"]
        if date_col:
            lines.append(f"- Date column: {date_col}")
        if total_sales is not None:
            lines.append(f"- Total {sales_col}: {total_sales:,}")
        if top_product:
            lines.append(f"- Top product: {top_product}")
        answer = "\n".join(lines)

    elif intent == "list_products":
        schema     = artifacts.get("schema.json", {})
        product_col = schema.get("product_column")
        if product_col:
            try:
                if "cleaned_data" in artifacts:
                    df_p = artifacts["cleaned_data"]
                else:
                    df_p = pd.read_csv(os.path.join(dataset_dir, "cleaned_data.csv"))
                    artifacts["cleaned_data"] = df_p

                if product_col in df_p.columns:
                    products = sorted(df_p[product_col].dropna().unique().tolist())
                    answer   = f"**Products in dataset** ({len(products)} unique):\n" + "\n".join(f"- {p}" for p in products[:30])
                    if len(products) > 30:
                        answer += f"\n... and {len(products)-30} more."
                else:
                    answer = f"Product column '{product_col}' not found in cleaned data."
            except Exception as e:
                answer = f"Could not retrieve product list: {e}"
        else:
            answer = "No product column was detected in this dataset."

    elif intent == "show_columns":
        try:
            if "cleaned_data" in artifacts:
                df_c = artifacts["cleaned_data"]
            else:
                df_c = pd.read_csv(os.path.join(dataset_dir, "cleaned_data.csv"))
                artifacts["cleaned_data"] = df_c

            cols_l = df_c.columns.tolist()
            answer = f"**Dataset columns** ({len(cols_l)} total):\n" + "\n".join(f"- {c}" for c in cols_l)
        except Exception as e:
            answer = f"Could not read dataset columns: {e}"

    elif intent == "dataset_overview":
        ins = artifacts.get("insights.json", {})
        if ins:
            exec_summary = ins.get("executive_summary") or ins.get("summary", "")
            key_insights = ins.get("insights", [])[:4]
            answer = f"**Executive Summary**\n{exec_summary}"
            if key_insights:
                answer += "\n\n**Key Findings:**\n"
                answer += "\n".join(f"- [{i.get('severity','').upper()}] {i.get('description','')}" for i in key_insights)
        else:
            answer = "No insights report found. The dataset may still be processing."

    # ── Analytical Artifact Routing ──────────────────────────────────────────
    elif intent == "root_cause" and "kpi_summary.json" in artifacts:
        rca = artifacts["kpi_summary.json"].get("root_cause_analysis", {})
        major_factors = rca.get("major_contributing_factors", [])
        if major_factors:
            answer = "Based on Root Cause Analysis:\n" + "\n".join([f"- {m}" for m in major_factors])

    elif intent == "feature_importance" and "feature_importance.json" in artifacts:
        fi = artifacts["feature_importance.json"].get("importance", {})
        top_3 = list(fi.items())[:3]
        if top_3:
            answer = f"The factors having the highest impact on {artifacts.get('schema.json', {}).get('target_column', 'the target')} are:\n"
            answer += "\n".join([f"- {k} (Score: {round(v, 4)})" for k, v in top_3])
            
    elif intent == "recommendation" and "kpi_summary.json" in artifacts:
        recs = artifacts["kpi_summary.json"].get("recommendations", [])
        if recs:
            answer = "Based on current data patterns, I recommend:\n" + "\n".join([f"- {r}" for r in recs])
            
    elif intent == "trend_analysis" and "forecast.json" in artifacts:
        fc = artifacts["forecast.json"]
        if fc.get("forecast"):
            next_val = fc["forecast"][0]
            answer = f"The predicted {fc.get('target', 'value')} for the next period is {next_val:.2f}."
            
    elif intent == "analyst_summary" and "insights.json" in artifacts:
        ins = artifacts["insights.json"]
        answer = ins.get("summary", "Analysis completed.") + "\n\nKey Insights:\n"
        for i in ins.get("insights", [])[:3]:
            answer += f"- [{i['severity'].upper()}] {i['description']}\n"
            
    # Semantic Metric Fast-Path
    elif intent == "aggregation" and "metrics.json" in artifacts:
        metrics = artifacts["metrics.json"]
        q_lower = str(question).lower()
        if "profit margin" in q_lower and "profit_margin" in metrics:
            answer = f"The profit margin is {round(metrics['profit_margin'] * 100, 2)}%."
        elif "revenue" in q_lower and "total_revenue" in metrics:
            answer = f"The total revenue is {metrics['total_revenue']}."
        elif "cost" in q_lower and "total_cost" in metrics:
            answer = f"The total cost is {metrics['total_cost']}."

    # Deep Pandas Fallback query execution
    if not answer:
        try:
            if "cleaned_data" in artifacts:
                df = artifacts["cleaned_data"]
            else:
                df = pd.read_csv(os.path.join(dataset_dir, "cleaned_data.csv"))
                artifacts["cleaned_data"] = df

            schema = artifacts.get("schema.json", {})
            sales_col = schema.get("sales_column", df.columns[-1])
            date_col = schema.get("date_column")
            
            # Extract column entities from the question using NLP String Matching
            entities = extract_entities(question, df.columns.tolist())
            target_col = entities[0] if entities else sales_col
            
            q_lower = str(question).lower()
            
            # Template 1: Basic Aggregation
            if intent == "aggregation":
                if "minimum" in q_lower:
                    answer = f"The minimum value of {target_col} is {df[target_col].min()}."
                elif "maximum" in q_lower:
                    answer = f"The maximum value of {target_col} is {df[target_col].max()}."
                elif "average" in q_lower:
                    answer = f"The average value of {target_col} is {df[target_col].mean():.2f}."
                elif "total" in q_lower or "sum" in q_lower:
                    answer = f"The total sum of {target_col} is {df[target_col].sum():.2f}."
                    
            # Template 2: Comparison
            elif intent == "comparison" and len(entities) >= 1:
                cat_cols = df.select_dtypes(include=['object']).columns.tolist()
                cat_col = cat_cols[0] if cat_cols else None
                if cat_col:
                    grouped = df.groupby(cat_col)[target_col].sum().sort_values(ascending=False)
                    if len(grouped) >= 2:
                        answer = f"Comparing {target_col} by {cat_col}:\n1. {grouped.index[0]}: {grouped.iloc[0]:.2f}\n2. {grouped.index[1]}: {grouped.iloc[1]:.2f}"
            
            # Template 3: Filtering
            elif intent == "filtering" and len(entities) >= 1:
                cat_cols = df.select_dtypes(include=['object']).columns.tolist()
                filter_col = cat_cols[0] if cat_cols else entities[0]
                val_counts = df[filter_col].value_counts()
                if not val_counts.empty:
                    top_val = val_counts.index[0]
                    filtered_df = df[df[filter_col] == top_val]
                    answer = f"Filtering where {filter_col} = '{top_val}': The total {target_col} is {filtered_df[target_col].sum():.2f} across {len(filtered_df)} records."

            # Template 4: Top Performers
            elif intent == "top_performers":
                cat_cols = df.select_dtypes(include=['object']).columns.tolist()
                cat_col = next((c for c in cat_cols if df[c].nunique() < 50), cat_cols[0] if cat_cols else None)
                if cat_col:
                    top5 = df.groupby(cat_col)[target_col].sum().sort_values(ascending=False).head(5)
                    answer = f"**Top 5 by {target_col}:**\n"
                    for rank, (name, val) in enumerate(top5.items(), 1):
                        answer += f"{rank}. {name}: {val:,.2f}\n"

            # Template 5: Bottom Performers
            elif intent == "bottom_performers":
                cat_cols = df.select_dtypes(include=['object']).columns.tolist()
                cat_col = next((c for c in cat_cols if df[c].nunique() < 50), cat_cols[0] if cat_cols else None)
                if cat_col:
                    bottom5 = df.groupby(cat_col)[target_col].sum().sort_values(ascending=True).head(5)
                    answer = f"**Bottom 5 by {target_col}:**\n"
                    for rank, (name, val) in enumerate(bottom5.items(), 1):
                        answer += f"{rank}. {name}: {val:,.2f}\n"

            # Template 6: Count By Category
            elif intent == "count_by_category":
                cat_cols = df.select_dtypes(include=['object']).columns.tolist()
                cat_col = next((c for c in cat_cols if df[c].nunique() < 50), cat_cols[0] if cat_cols else None)
                if cat_col:
                    counts = df[cat_col].value_counts().head(10)
                    answer = f"**Record count by {cat_col}:**\n"
                    for name, cnt in counts.items():
                        answer += f"- {name}: {cnt:,} records\n"

            # Template 7: Average By Category
            elif intent == "average_by_category":
                cat_cols = df.select_dtypes(include=['object']).columns.tolist()
                cat_col = next((c for c in cat_cols if df[c].nunique() < 50), cat_cols[0] if cat_cols else None)
                if cat_col:
                    avgs = df.groupby(cat_col)[target_col].mean().sort_values(ascending=False).head(8)
                    answer = f"**Average {target_col} by {cat_col}:**\n"
                    for name, avg in avgs.items():
                        answer += f"- {name}: {avg:,.2f}\n"

            # Template 8: Monthly Breakdown
            elif intent == "monthly_breakdown":
                if date_col and date_col in df.columns:
                    tmp = df.copy()
                    tmp[date_col] = pd.to_datetime(tmp[date_col], errors='coerce')
                    tmp['_month'] = tmp[date_col].dt.to_period('M').astype(str)
                    monthly = tmp.groupby('_month')[target_col].sum().sort_index().tail(12)
                    answer = f"**Monthly {target_col} (last 12 months):**\n"
                    for period, val in monthly.items():
                        answer += f"- {period}: {val:,.2f}\n"
                else:
                    answer = "No date column detected. Cannot compute monthly breakdown."

            # Template 9: Daily Breakdown
            elif intent == "daily_breakdown":
                if date_col and date_col in df.columns:
                    tmp = df.copy()
                    tmp[date_col] = pd.to_datetime(tmp[date_col], errors='coerce')
                    tmp['_day'] = tmp[date_col].dt.date.astype(str)
                    daily = tmp.groupby('_day')[target_col].sum().sort_index().tail(14)
                    answer = f"**Daily {target_col} (last 14 days):**\n"
                    for day, val in daily.items():
                        answer += f"- {day}: {val:,.2f}\n"
                else:
                    answer = "No date column detected. Cannot compute daily breakdown."

            # Template 10: Date Range Info
            elif intent == "date_range_info":
                if date_col and date_col in df.columns:
                    dates = pd.to_datetime(df[date_col], errors='coerce').dropna()
                    if len(dates):
                        answer = (f"**Date range in dataset:**\n"
                                  f"- Earliest: {dates.min().date()}\n"
                                  f"- Latest:   {dates.max().date()}\n"
                                  f"- Span: {(dates.max() - dates.min()).days} days")
                    else:
                        answer = "Could not parse date column."
                else:
                    answer = "No date column detected in this dataset."

            # Template 11: Profit Analysis
            elif intent == "profit_analysis":
                profit_candidates = [c for c in df.columns if 'profit' in str(c).lower() or 'margin' in str(c).lower()]
                if profit_candidates:
                    pc = profit_candidates[0]
                    total_p = df[pc].sum()
                    avg_p   = df[pc].mean()
                    answer  = (f"**Profit Analysis ({pc}):**\n"
                               f"- Total Profit: {total_p:,.2f}\n"
                               f"- Average Profit per Row: {avg_p:,.2f}\n"
                               f"- Max: {df[pc].max():,.2f} | Min: {df[pc].min():,.2f}")
                elif sales_col in df.columns:
                    answer = f"No explicit profit column found. Total {sales_col}: {df[sales_col].sum():,.2f}"

            # Template 12: Data Quality
            elif intent == "data_quality":
                missing = df.isnull().sum()
                missing = missing[missing > 0]
                if missing.empty:
                    answer = "Great news! This dataset has **no missing values**."
                else:
                    answer = f"**Missing values by column:**\n"
                    for col, cnt in missing.sort_values(ascending=False).head(10).items():
                        pct = 100 * cnt / len(df)
                        answer += f"- {col}: {cnt:,} missing ({pct:.1f}%)\n"

            # Template 13: Distribution
            elif intent == "distribution":
                if pd.api.types.is_numeric_dtype(df[target_col]):
                    s = df[target_col].dropna()
                    answer = (f"**Distribution of {target_col}:**\n"
                              f"- Min:    {s.min():,.2f}\n"
                              f"- Max:    {s.max():,.2f}\n"
                              f"- Mean:   {s.mean():,.2f}\n"
                              f"- Median: {s.median():,.2f}\n"
                              f"- Std Dev:{s.std():,.2f}")
            
            if not answer:
                answer = f"I scanned the dataset but could not confidently execute a specific query for this question. Try asking about {target_col} totals or averages."
                confidence = "low"
                
        except Exception as e:
            logger.error(f"Fallback computation failed: {str(e)}")
            answer = "Sorry, an error occurred while computing the answer directly from the dataset."
            confidence = "low"

    # Log query output safely using filelock
    log_dir = os.path.join(base_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "query_logs.json")
    
    log_entry = {
        "user_id": user_id,
        "dataset_id": dataset_id,
        "question": question,
        "intent": intent,
        "timestamp": datetime.datetime.now().isoformat(),
        "answer_preview": str(answer)[:100]
    }
    
    logs = []
    if os.path.exists(log_path):
        try:
            with open(log_path, 'r') as f:
                logs = json.load(f)
        except: pass
    logs.append(log_entry)
    with FileLock(log_path + ".lock"):
        with open(log_path, 'w') as f:
            json.dump(logs, f, indent=4)
        
    logger.info(f"Query executed. Intent: {intent}")
    return {
        "intent": intent, 
        "question": question, 
        "answer": answer, 
        "confidence": confidence
    }

if __name__ == "__main__":
    import argparse
    import sys
    parser = argparse.ArgumentParser(description="Run the DataInsights.ai Query Engine")
    parser.add_argument("--user_id", type=str, default="default_user", help="Organizational User ID")
    parser.add_argument("--dataset_id", type=str, required=True, help="Dataset ID to query")
    parser.add_argument("--question", type=str, required=True, help="User question to answer")
    
    args = parser.parse_args()
    
    try:
        res = execute_query(args.user_id, args.dataset_id, args.question)
        output = json.dumps(res)
        # Force UTF-8 encoding for reliable cross-platform piping
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.flush()
    except Exception as e:
        sys.stderr.write(str(e))
        err_res = json.dumps({"error": str(e), "answer": "An error occurred in the query engine.", "intent": "error"})
        sys.stdout.buffer.write(err_res.encode('utf-8'))
        sys.stdout.buffer.flush()
    
    # Force exit to prevent any subsequent prints from libraries or cleanup
    os._exit(0)
