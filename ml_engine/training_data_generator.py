"""
training_data_generator.py — Generate training data for Text-to-Pandas fine-tuning
===================================================================================
Generates thousands of (schema + question) → Pandas code training pairs.

Usage:
    python training_data_generator.py                        # 5000 samples (default)
    python training_data_generator.py --num_samples 10000    # custom count
    python training_data_generator.py --output my_data.jsonl # custom output file

Output: training_data.jsonl — one JSON object per line, ready for HuggingFace SFTTrainer.
"""

import json
import random
import argparse
import os
from itertools import product as iterproduct

# ══════════════════════════════════════════════════════════════════════════════
#  DIVERSE DATASET SCHEMAS (20+ domain schemas)
# ══════════════════════════════════════════════════════════════════════════════

SCHEMAS = [
    # ── E-Commerce / Retail ───────────────────────────────────────────────────
    {
        "domain": "e-commerce sales",
        "columns": {
            "product_name": "string", "category": "string", "region": "string",
            "sales_amount": "float", "quantity": "int", "discount": "float",
            "order_date": "datetime",
        },
        "cat_cols": ["product_name", "category", "region"],
        "num_cols": ["sales_amount", "quantity", "discount"],
        "date_cols": ["order_date"],
    },
    {
        "domain": "online store orders",
        "columns": {
            "customer_name": "string", "product": "string", "payment_method": "string",
            "order_total": "float", "items_count": "int", "shipping_cost": "float",
            "order_date": "datetime",
        },
        "cat_cols": ["customer_name", "product", "payment_method"],
        "num_cols": ["order_total", "items_count", "shipping_cost"],
        "date_cols": ["order_date"],
    },
    # ── Finance ───────────────────────────────────────────────────────────────
    {
        "domain": "financial transactions",
        "columns": {
            "account_holder": "string", "transaction_type": "string", "branch": "string",
            "amount": "float", "balance": "float",
            "transaction_date": "datetime",
        },
        "cat_cols": ["account_holder", "transaction_type", "branch"],
        "num_cols": ["amount", "balance"],
        "date_cols": ["transaction_date"],
    },
    {
        "domain": "investment portfolio",
        "columns": {
            "stock_symbol": "string", "sector": "string", "exchange": "string",
            "price": "float", "volume": "int", "market_cap": "float",
            "trade_date": "datetime",
        },
        "cat_cols": ["stock_symbol", "sector", "exchange"],
        "num_cols": ["price", "volume", "market_cap"],
        "date_cols": ["trade_date"],
    },
    # ── HR / Employees ────────────────────────────────────────────────────────
    {
        "domain": "employee records",
        "columns": {
            "employee_name": "string", "department": "string", "job_title": "string",
            "salary": "float", "experience_years": "int", "performance_score": "float",
        },
        "cat_cols": ["employee_name", "department", "job_title"],
        "num_cols": ["salary", "experience_years", "performance_score"],
        "date_cols": [],
    },
    {
        "domain": "recruitment pipeline",
        "columns": {
            "candidate_name": "string", "position": "string", "source": "string",
            "interview_score": "float", "years_experience": "int", "offer_salary": "float",
        },
        "cat_cols": ["candidate_name", "position", "source"],
        "num_cols": ["interview_score", "years_experience", "offer_salary"],
        "date_cols": [],
    },
    # ── Healthcare ────────────────────────────────────────────────────────────
    {
        "domain": "hospital patient records",
        "columns": {
            "patient_id": "string", "diagnosis": "string", "department": "string",
            "treatment_cost": "float", "stay_days": "int", "age": "int",
            "admission_date": "datetime",
        },
        "cat_cols": ["patient_id", "diagnosis", "department"],
        "num_cols": ["treatment_cost", "stay_days", "age"],
        "date_cols": ["admission_date"],
    },
    # ── Education ─────────────────────────────────────────────────────────────
    {
        "domain": "student academic records",
        "columns": {
            "student_name": "string", "course": "string", "grade": "string",
            "score": "float", "attendance_percent": "float", "credits": "int",
        },
        "cat_cols": ["student_name", "course", "grade"],
        "num_cols": ["score", "attendance_percent", "credits"],
        "date_cols": [],
    },
    # ── Manufacturing ─────────────────────────────────────────────────────────
    {
        "domain": "manufacturing production",
        "columns": {
            "product_line": "string", "factory": "string", "shift": "string",
            "units_produced": "int", "defect_rate": "float", "cost_per_unit": "float",
            "production_date": "datetime",
        },
        "cat_cols": ["product_line", "factory", "shift"],
        "num_cols": ["units_produced", "defect_rate", "cost_per_unit"],
        "date_cols": ["production_date"],
    },
    # ── Marketing ─────────────────────────────────────────────────────────────
    {
        "domain": "marketing campaign metrics",
        "columns": {
            "campaign_name": "string", "channel": "string", "target_audience": "string",
            "impressions": "int", "clicks": "int", "conversions": "int",
            "spend": "float", "revenue": "float",
        },
        "cat_cols": ["campaign_name", "channel", "target_audience"],
        "num_cols": ["impressions", "clicks", "conversions", "spend", "revenue"],
        "date_cols": [],
    },
    # ── Real Estate ───────────────────────────────────────────────────────────
    {
        "domain": "real estate listings",
        "columns": {
            "property_type": "string", "city": "string", "neighborhood": "string",
            "price": "float", "area_sqft": "int", "bedrooms": "int", "bathrooms": "int",
        },
        "cat_cols": ["property_type", "city", "neighborhood"],
        "num_cols": ["price", "area_sqft", "bedrooms", "bathrooms"],
        "date_cols": [],
    },
    # ── Logistics ─────────────────────────────────────────────────────────────
    {
        "domain": "shipping and logistics",
        "columns": {
            "shipment_id": "string", "origin": "string", "destination": "string",
            "carrier": "string",
            "weight_kg": "float", "delivery_days": "int", "shipping_cost": "float",
        },
        "cat_cols": ["origin", "destination", "carrier"],
        "num_cols": ["weight_kg", "delivery_days", "shipping_cost"],
        "date_cols": [],
    },
    # ── Energy / Utilities ────────────────────────────────────────────────────
    {
        "domain": "energy consumption",
        "columns": {
            "building_name": "string", "energy_type": "string", "city": "string",
            "consumption_kwh": "float", "cost": "float", "carbon_emission": "float",
            "billing_date": "datetime",
        },
        "cat_cols": ["building_name", "energy_type", "city"],
        "num_cols": ["consumption_kwh", "cost", "carbon_emission"],
        "date_cols": ["billing_date"],
    },
    # ── Sports ────────────────────────────────────────────────────────────────
    {
        "domain": "sports player statistics",
        "columns": {
            "player_name": "string", "team": "string", "position": "string",
            "goals": "int", "assists": "int", "minutes_played": "int",
            "rating": "float",
        },
        "cat_cols": ["player_name", "team", "position"],
        "num_cols": ["goals", "assists", "minutes_played", "rating"],
        "date_cols": [],
    },
    # ── Customer Support ──────────────────────────────────────────────────────
    {
        "domain": "customer support tickets",
        "columns": {
            "ticket_id": "string", "customer_name": "string", "category": "string",
            "priority": "string", "status": "string",
            "resolution_hours": "float", "satisfaction_score": "float",
        },
        "cat_cols": ["customer_name", "category", "priority", "status"],
        "num_cols": ["resolution_hours", "satisfaction_score"],
        "date_cols": [],
    },
    # ── Inventory ─────────────────────────────────────────────────────────────
    {
        "domain": "inventory management",
        "columns": {
            "item_name": "string", "warehouse": "string", "supplier": "string",
            "stock_quantity": "int", "unit_price": "float", "reorder_level": "int",
        },
        "cat_cols": ["item_name", "warehouse", "supplier"],
        "num_cols": ["stock_quantity", "unit_price", "reorder_level"],
        "date_cols": [],
    },
    # ── SaaS Metrics ──────────────────────────────────────────────────────────
    {
        "domain": "SaaS subscription metrics",
        "columns": {
            "customer_name": "string", "plan": "string", "country": "string",
            "monthly_revenue": "float", "usage_hours": "float", "support_tickets": "int",
            "signup_date": "datetime",
        },
        "cat_cols": ["customer_name", "plan", "country"],
        "num_cols": ["monthly_revenue", "usage_hours", "support_tickets"],
        "date_cols": ["signup_date"],
    },
    # ── Agriculture ───────────────────────────────────────────────────────────
    {
        "domain": "agricultural crop yield",
        "columns": {
            "crop": "string", "region": "string", "season": "string",
            "yield_tons": "float", "rainfall_mm": "float", "area_hectares": "float",
        },
        "cat_cols": ["crop", "region", "season"],
        "num_cols": ["yield_tons", "rainfall_mm", "area_hectares"],
        "date_cols": [],
    },
    # ── Telecom ───────────────────────────────────────────────────────────────
    {
        "domain": "telecom usage data",
        "columns": {
            "customer_id": "string", "plan_type": "string", "region": "string",
            "data_usage_gb": "float", "call_minutes": "int", "monthly_bill": "float",
            "churn": "string",
        },
        "cat_cols": ["customer_id", "plan_type", "region", "churn"],
        "num_cols": ["data_usage_gb", "call_minutes", "monthly_bill"],
        "date_cols": [],
    },
    # ── Restaurant / Food ────────────────────────────────────────────────────
    {
        "domain": "restaurant sales",
        "columns": {
            "menu_item": "string", "category": "string", "chef": "string",
            "price": "float", "orders_count": "int", "rating": "float",
        },
        "cat_cols": ["menu_item", "category", "chef"],
        "num_cols": ["price", "orders_count", "rating"],
        "date_cols": [],
    },
]


# ══════════════════════════════════════════════════════════════════════════════
#  QUESTION TEMPLATES — 30+ intent categories
# ══════════════════════════════════════════════════════════════════════════════

TEMPLATES = {
    # ── Basic Aggregations ────────────────────────────────────────────────────
    "total": [
        ("What is the total {num}?",
         "result = df['{num}'].sum()"),
        ("Calculate the sum of {num}",
         "result = df['{num}'].sum()"),
        ("Give me the total {num} across all records",
         "result = df['{num}'].sum()"),
    ],
    "average": [
        ("What is the average {num}?",
         "result = round(df['{num}'].mean(), 2)"),
        ("Calculate the mean {num}",
         "result = round(df['{num}'].mean(), 2)"),
        ("What is the typical {num} value?",
         "result = round(df['{num}'].mean(), 2)"),
    ],
    "maximum": [
        ("What is the maximum {num}?",
         "result = df['{num}'].max()"),
        ("What is the highest {num}?",
         "result = df['{num}'].max()"),
        ("Find the peak value of {num}",
         "result = df['{num}'].max()"),
    ],
    "minimum": [
        ("What is the minimum {num}?",
         "result = df['{num}'].min()"),
        ("What is the lowest {num}?",
         "result = df['{num}'].min()"),
        ("Find the smallest {num}",
         "result = df['{num}'].min()"),
    ],
    "count": [
        ("How many records are there?",
         "result = len(df)"),
        ("What is the total number of rows?",
         "result = len(df)"),
        ("Count the number of entries",
         "result = len(df)"),
    ],
    "median": [
        ("What is the median {num}?",
         "result = df['{num}'].median()"),
        ("Find the median value of {num}",
         "result = df['{num}'].median()"),
    ],
    "std_dev": [
        ("What is the standard deviation of {num}?",
         "result = round(df['{num}'].std(), 2)"),
        ("How much does {num} vary?",
         "result = round(df['{num}'].std(), 2)"),
    ],

    # ── Grouped Aggregations ──────────────────────────────────────────────────
    "total_by_category": [
        ("What is the total {num} by {cat}?",
         "result = df.groupby('{cat}')['{num}'].sum().to_dict()"),
        ("Show me the sum of {num} for each {cat}",
         "result = df.groupby('{cat}')['{num}'].sum().to_dict()"),
        ("Break down the total {num} per {cat}",
         "result = df.groupby('{cat}')['{num}'].sum().to_dict()"),
        ("How does total {num} distribute across {cat}?",
         "result = df.groupby('{cat}')['{num}'].sum().to_dict()"),
    ],
    "average_by_category": [
        ("What is the average {num} by {cat}?",
         "result = df.groupby('{cat}')['{num}'].mean().round(2).to_dict()"),
        ("Show me mean {num} per {cat}",
         "result = df.groupby('{cat}')['{num}'].mean().round(2).to_dict()"),
        ("Compare average {num} across different {cat}",
         "result = df.groupby('{cat}')['{num}'].mean().round(2).to_dict()"),
    ],
    "count_by_category": [
        ("How many records are there per {cat}?",
         "result = df['{cat}'].value_counts().to_dict()"),
        ("What is the count of entries for each {cat}?",
         "result = df['{cat}'].value_counts().to_dict()"),
        ("Show the distribution of {cat}",
         "result = df['{cat}'].value_counts().to_dict()"),
        ("How many unique {cat} are there and what are the counts?",
         "result = df['{cat}'].value_counts().to_dict()"),
    ],
    "max_by_category": [
        ("What is the maximum {num} for each {cat}?",
         "result = df.groupby('{cat}')['{num}'].max().to_dict()"),
        ("Show the highest {num} by {cat}",
         "result = df.groupby('{cat}')['{num}'].max().to_dict()"),
    ],
    "min_by_category": [
        ("What is the minimum {num} for each {cat}?",
         "result = df.groupby('{cat}')['{num}'].min().to_dict()"),
        ("Show the lowest {num} by {cat}",
         "result = df.groupby('{cat}')['{num}'].min().to_dict()"),
    ],

    # ── Top-N / Ranking ───────────────────────────────────────────────────────
    "top_by_value": [
        ("Which {cat} has the highest {num}?",
         "result = df.loc[df['{num}'].idxmax(), '{cat}']"),
        ("What is the {cat} with the most {num}?",
         "result = df.loc[df['{num}'].idxmax(), '{cat}']"),
        ("Find the {cat} that has the highest {num}",
         "result = df.loc[df['{num}'].idxmax(), '{cat}']"),
    ],
    "bottom_by_value": [
        ("Which {cat} has the lowest {num}?",
         "result = df.loc[df['{num}'].idxmin(), '{cat}']"),
        ("What is the {cat} with the least {num}?",
         "result = df.loc[df['{num}'].idxmin(), '{cat}']"),
        ("Find the {cat} with the minimum {num}",
         "result = df.loc[df['{num}'].idxmin(), '{cat}']"),
    ],
    "top_n": [
        ("What are the top 5 {cat} by {num}?",
         "result = df.groupby('{cat}')['{num}'].sum().nlargest(5).to_dict()"),
        ("Show me the top 5 {cat} with highest {num}",
         "result = df.groupby('{cat}')['{num}'].sum().nlargest(5).to_dict()"),
        ("List the best performing {cat} by {num}",
         "result = df.groupby('{cat}')['{num}'].sum().nlargest(5).to_dict()"),
        ("What are the leading {cat} by total {num}?",
         "result = df.groupby('{cat}')['{num}'].sum().nlargest(5).to_dict()"),
    ],
    "top_3": [
        ("What are the top 3 {cat} by {num}?",
         "result = df.groupby('{cat}')['{num}'].sum().nlargest(3).to_dict()"),
        ("Show me the 3 best {cat} based on {num}",
         "result = df.groupby('{cat}')['{num}'].sum().nlargest(3).to_dict()"),
    ],
    "top_10": [
        ("What are the top 10 {cat} by {num}?",
         "result = df.groupby('{cat}')['{num}'].sum().nlargest(10).to_dict()"),
        ("Show top 10 {cat} with the highest {num}",
         "result = df.groupby('{cat}')['{num}'].sum().nlargest(10).to_dict()"),
    ],
    "bottom_n": [
        ("What are the bottom 5 {cat} by {num}?",
         "result = df.groupby('{cat}')['{num}'].sum().nsmallest(5).to_dict()"),
        ("Show me the worst performing {cat} by {num}",
         "result = df.groupby('{cat}')['{num}'].sum().nsmallest(5).to_dict()"),
        ("Which {cat} have the lowest {num}?",
         "result = df.groupby('{cat}')['{num}'].sum().nsmallest(5).to_dict()"),
    ],

    # ── Filtering ─────────────────────────────────────────────────────────────
    "filter_greater": [
        ("Show records where {num} is greater than {threshold}",
         "result = df[df['{num}'] > {threshold}]['{cat}'].tolist()"),
        ("Which {cat} have {num} above {threshold}?",
         "result = df[df['{num}'] > {threshold}]['{cat}'].tolist()"),
        ("Filter all entries where {num} exceeds {threshold}",
         "result = df[df['{num}'] > {threshold}]['{cat}'].tolist()"),
    ],
    "filter_less": [
        ("Show records where {num} is less than {threshold}",
         "result = df[df['{num}'] < {threshold}]['{cat}'].tolist()"),
        ("Which {cat} have {num} below {threshold}?",
         "result = df[df['{num}'] < {threshold}]['{cat}'].tolist()"),
    ],
    "filter_equals_cat": [
        ("Show all records where {cat} is '{cat_value}'",
         "result = df[df['{cat}'] == '{cat_value}'].to_dict('records')"),
        ("Filter data for {cat} equal to '{cat_value}'",
         "result = df[df['{cat}'] == '{cat_value}'].to_dict('records')"),
    ],
    "filter_and_aggregate": [
        ("What is the total {num} where {num2} is greater than {threshold}?",
         "result = df[df['{num2}'] > {threshold}]['{num}'].sum()"),
        ("Calculate the average {num} for records where {num2} exceeds {threshold}",
         "result = round(df[df['{num2}'] > {threshold}]['{num}'].mean(), 2)"),
    ],

    # ── Unique / Distinct ─────────────────────────────────────────────────────
    "unique_values": [
        ("What are the unique values of {cat}?",
         "result = df['{cat}'].unique().tolist()"),
        ("List all distinct {cat}",
         "result = df['{cat}'].unique().tolist()"),
        ("Show me the different {cat} in the dataset",
         "result = df['{cat}'].unique().tolist()"),
    ],
    "unique_count": [
        ("How many unique {cat} are there?",
         "result = df['{cat}'].nunique()"),
        ("What is the number of distinct {cat}?",
         "result = df['{cat}'].nunique()"),
    ],

    # ── Distribution / Statistics ─────────────────────────────────────────────
    "describe": [
        ("Describe the distribution of {num}",
         "result = df['{num}'].describe().to_dict()"),
        ("Give me statistics for {num}",
         "result = df['{num}'].describe().to_dict()"),
        ("What is the statistical summary of {num}?",
         "result = df['{num}'].describe().to_dict()"),
    ],
    "percentile": [
        ("What is the 90th percentile of {num}?",
         "result = df['{num}'].quantile(0.9)"),
        ("Find the 75th percentile value of {num}",
         "result = df['{num}'].quantile(0.75)"),
    ],
    "range": [
        ("What is the range of {num}?",
         "result = df['{num}'].max() - df['{num}'].min()"),
        ("How wide is the spread of {num}?",
         "result = df['{num}'].max() - df['{num}'].min()"),
    ],

    # ── Correlation / Relationships ───────────────────────────────────────────
    "correlation": [
        ("Is there a correlation between {num} and {num2}?",
         "result = round(df['{num}'].corr(df['{num2}']), 4)"),
        ("What is the relationship between {num} and {num2}?",
         "result = round(df['{num}'].corr(df['{num2}']), 4)"),
        ("How strongly related are {num} and {num2}?",
         "result = round(df['{num}'].corr(df['{num2}']), 4)"),
    ],

    # ── Ratios / Derived Metrics ──────────────────────────────────────────────
    "ratio": [
        ("What is the ratio of {num} to {num2}?",
         "result = round(df['{num}'].sum() / df['{num2}'].sum(), 4) if df['{num2}'].sum() != 0 else 'undefined'"),
        ("Calculate {num} divided by {num2} in total",
         "result = round(df['{num}'].sum() / df['{num2}'].sum(), 4) if df['{num2}'].sum() != 0 else 'undefined'"),
    ],
    "percentage_share": [
        ("What percentage of total {num} does each {cat} contribute?",
         "result = df.groupby('{cat}')['{num}'].sum().apply(lambda x: round(x / df['{num}'].sum() * 100, 2)).to_dict()"),
        ("Show the {cat}-wise share of {num} in percentage",
         "result = df.groupby('{cat}')['{num}'].sum().apply(lambda x: round(x / df['{num}'].sum() * 100, 2)).to_dict()"),
    ],

    # ── Data Quality ──────────────────────────────────────────────────────────
    "missing_values": [
        ("Are there any missing values in the dataset?",
         "result = df.isnull().sum().to_dict()"),
        ("Which columns have null values?",
         "result = df.isnull().sum()[df.isnull().sum() > 0].to_dict()"),
        ("Show me the missing data count per column",
         "result = df.isnull().sum().to_dict()"),
    ],
    "duplicates": [
        ("Are there any duplicate rows?",
         "result = int(df.duplicated().sum())"),
        ("How many duplicate records exist?",
         "result = int(df.duplicated().sum())"),
    ],

    # ── Dataset Metadata ──────────────────────────────────────────────────────
    "shape": [
        ("How many rows and columns are in the dataset?",
         "result = {{'rows': df.shape[0], 'columns': df.shape[1]}}"),
        ("What is the size of the dataset?",
         "result = {{'rows': df.shape[0], 'columns': df.shape[1]}}"),
        ("Tell me the dimensions of this data",
         "result = {{'rows': df.shape[0], 'columns': df.shape[1]}}"),
    ],
    "columns_list": [
        ("What columns are in this dataset?",
         "result = df.columns.tolist()"),
        ("List all the column names",
         "result = df.columns.tolist()"),
        ("Show me the fields in this dataset",
         "result = df.columns.tolist()"),
    ],
    "dtypes": [
        ("What are the data types of each column?",
         "result = df.dtypes.astype(str).to_dict()"),
        ("Show me the column types",
         "result = df.dtypes.astype(str).to_dict()"),
    ],

    # ── Sorting ──────────────────────────────────────────────────────────────
    "sort_desc": [
        ("Sort data by {num} in descending order and show top 5",
         "result = df.nlargest(5, '{num}')[['{cat}', '{num}']].to_dict('records')"),
        ("Show the 5 highest {num} records",
         "result = df.nlargest(5, '{num}')[['{cat}', '{num}']].to_dict('records')"),
    ],
    "sort_asc": [
        ("Sort data by {num} in ascending order and show top 5",
         "result = df.nsmallest(5, '{num}')[['{cat}', '{num}']].to_dict('records')"),
        ("Show the 5 lowest {num} records",
         "result = df.nsmallest(5, '{num}')[['{cat}', '{num}']].to_dict('records')"),
    ],

    # ── Conditional / Complex ────────────────────────────────────────────────
    "conditional_avg": [
        ("What is the average {num} for the top 10% of records by {num2}?",
         "threshold = df['{num2}'].quantile(0.9)\nresult = round(df[df['{num2}'] >= threshold]['{num}'].mean(), 2)"),
        ("Among records with above-average {num2}, what is the mean {num}?",
         "avg = df['{num2}'].mean()\nresult = round(df[df['{num2}'] > avg]['{num}'].mean(), 2)"),
    ],
    "group_and_rank": [
        ("Rank {cat} by total {num} from highest to lowest",
         "result = df.groupby('{cat}')['{num}'].sum().sort_values(ascending=False).to_dict()"),
        ("Create a ranking of {cat} based on their {num}",
         "result = df.groupby('{cat}')['{num}'].sum().sort_values(ascending=False).to_dict()"),
    ],
    "compare_two": [
        ("Which {cat} has higher total {num}, the top or bottom half?",
         "median = df['{num}'].median()\nresult = {{'above_median_count': int((df['{num}'] > median).sum()), 'below_median_count': int((df['{num}'] <= median).sum())}}"),
    ],
    "growth_rate": [
        ("What is the percentage difference between the max and min {num}?",
         "result = round((df['{num}'].max() - df['{num}'].min()) / df['{num}'].min() * 100, 2) if df['{num}'].min() != 0 else 'undefined'"),
    ],
    "cumulative": [
        ("What is the cumulative sum of {num}?",
         "result = df['{num}'].cumsum().tolist()"),
    ],

    # ── Variance / Outliers ───────────────────────────────────────────────────
    "variance": [
        ("What is the variance of {num}?",
         "result = round(df['{num}'].var(), 2)"),
    ],
    "outliers": [
        ("Are there any outliers in {num}?",
         "Q1 = df['{num}'].quantile(0.25)\nQ3 = df['{num}'].quantile(0.75)\nIQR = Q3 - Q1\noutliers = df[(df['{num}'] < Q1 - 1.5 * IQR) | (df['{num}'] > Q3 + 1.5 * IQR)]\nresult = {{'count': len(outliers), 'min_outlier': outliers['{num}'].min() if len(outliers) > 0 else None, 'max_outlier': outliers['{num}'].max() if len(outliers) > 0 else None}}"),
        ("How many outliers exist in {num}?",
         "Q1 = df['{num}'].quantile(0.25)\nQ3 = df['{num}'].quantile(0.75)\nIQR = Q3 - Q1\nresult = int(((df['{num}'] < Q1 - 1.5 * IQR) | (df['{num}'] > Q3 + 1.5 * IQR)).sum())"),
    ],
}

# ── Template for date-specific questions ──────────────────────────────────────
DATE_TEMPLATES = {
    "monthly_breakdown": [
        ("Show me the monthly breakdown of {num}",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = df.groupby(df['{date}'].dt.to_period('M').astype(str))['{num}'].sum().to_dict()"),
        ("What is the total {num} per month?",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = df.groupby(df['{date}'].dt.to_period('M').astype(str))['{num}'].sum().to_dict()"),
        ("Give me a monthly summary of {num}",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = df.groupby(df['{date}'].dt.to_period('M').astype(str))['{num}'].sum().to_dict()"),
    ],
    "daily_breakdown": [
        ("Show me the daily breakdown of {num}",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = df.groupby(df['{date}'].dt.date.astype(str))['{num}'].sum().to_dict()"),
        ("What is the {num} per day?",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = df.groupby(df['{date}'].dt.date.astype(str))['{num}'].sum().to_dict()"),
    ],
    "date_range": [
        ("What is the date range of the dataset?",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = {{'earliest': str(df['{date}'].min().date()), 'latest': str(df['{date}'].max().date())}}"),
        ("When does the data start and end?",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = {{'earliest': str(df['{date}'].min().date()), 'latest': str(df['{date}'].max().date())}}"),
    ],
    "trend_direction": [
        ("Is {num} trending up or down over time?",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nmonthly = df.groupby(df['{date}'].dt.to_period('M'))['{num}'].sum()\nresult = 'increasing' if monthly.iloc[-1] > monthly.iloc[0] else 'decreasing'"),
        ("What is the trend of {num} over time?",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nmonthly = df.groupby(df['{date}'].dt.to_period('M'))['{num}'].sum()\nresult = 'increasing' if monthly.iloc[-1] > monthly.iloc[0] else 'decreasing'"),
    ],
    "best_month": [
        ("Which month had the highest {num}?",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = df.groupby(df['{date}'].dt.to_period('M').astype(str))['{num}'].sum().idxmax()"),
        ("What was the best month for {num}?",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = df.groupby(df['{date}'].dt.to_period('M').astype(str))['{num}'].sum().idxmax()"),
    ],
    "worst_month": [
        ("Which month had the lowest {num}?",
         "df['{date}'] = pd.to_datetime(df['{date}'])\nresult = df.groupby(df['{date}'].dt.to_period('M').astype(str))['{num}'].sum().idxmin()"),
    ],
}

# ── Example category values for filter templates ─────────────────────────────
CAT_VALUES = {
    "product_name": ["Laptop", "Mobile", "Tablet", "Monitor", "Keyboard"],
    "category": ["Electronics", "Clothing", "Food", "Office", "Sports"],
    "region": ["East", "West", "North", "South", "Central"],
    "department": ["Engineering", "Sales", "Marketing", "HR", "Finance"],
    "job_title": ["Manager", "Engineer", "Analyst", "Director", "Intern"],
    "payment_method": ["Credit Card", "Cash", "UPI", "Bank Transfer"],
    "diagnosis": ["Fever", "Fracture", "Diabetes", "Hypertension"],
    "course": ["Mathematics", "Physics", "Chemistry", "English", "History"],
    "grade": ["A", "B", "C", "D", "F"],
    "channel": ["Email", "Social Media", "Google Ads", "Organic", "Referral"],
    "property_type": ["Apartment", "Villa", "Duplex", "Studio"],
    "city": ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad"],
    "carrier": ["FedEx", "DHL", "UPS", "BlueDart"],
    "energy_type": ["Solar", "Wind", "Grid", "Diesel"],
    "plan_type": ["Basic", "Premium", "Enterprise", "Free"],
    "plan": ["Starter", "Pro", "Business", "Enterprise"],
    "season": ["Kharif", "Rabi", "Zaid"],
    "crop": ["Wheat", "Rice", "Cotton", "Sugarcane", "Maize"],
    "shift": ["Morning", "Evening", "Night"],
    "priority": ["Low", "Medium", "High", "Critical"],
    "status": ["Open", "Closed", "Pending", "In Progress"],
    "churn": ["Yes", "No"],
    "target_audience": ["Youth", "Professionals", "Seniors"],
}


# ══════════════════════════════════════════════════════════════════════════════
#  PROMPT FORMATTER
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_INSTRUCTION = (
    "Given the following dataset schema, write Pandas code to answer the question. "
    "The dataframe is already loaded as `df`. Store the final answer in a variable called `result`."
)

def build_instruction(schema, question_text):
    """Format the instruction prompt that the model will see at inference time."""
    schema_str = "\n".join(
        f"- {col} ({dtype})" for col, dtype in schema["columns"].items()
    )
    return (
        f"{SYSTEM_INSTRUCTION}\n\n"
        f"Dataset domain: {schema['domain']}\n\n"
        f"Schema:\n{schema_str}\n\n"
        f"Question: {question_text}"
    )


# ══════════════════════════════════════════════════════════════════════════════
#  GENERATOR
# ══════════════════════════════════════════════════════════════════════════════

def _get_cat_value(cat_col):
    """Return a plausible example value for a categorical column."""
    if cat_col in CAT_VALUES:
        return random.choice(CAT_VALUES[cat_col])
    return "ExampleValue"


def generate_training_data(num_samples=5000):
    """Generate training examples by combining schemas × templates × columns."""
    data = []
    all_intents = list(TEMPLATES.keys())
    all_date_intents = list(DATE_TEMPLATES.keys())

    for _ in range(num_samples):
        schema = random.choice(SCHEMAS)

        # 25% chance to use a date-specific template if schema has dates
        use_date = schema["date_cols"] and random.random() < 0.25
        if use_date:
            intent = random.choice(all_date_intents)
            q_template, code_template = random.choice(DATE_TEMPLATES[intent])
            date_col = random.choice(schema["date_cols"])
            num_col  = random.choice(schema["num_cols"])

            question = q_template.format(num=num_col, date=date_col)
            code     = code_template.format(num=num_col, date=date_col)
        else:
            intent = random.choice(all_intents)
            q_template, code_template = random.choice(TEMPLATES[intent])

            cat_col  = random.choice(schema["cat_cols"])
            num_col  = random.choice(schema["num_cols"])
            num_cols = schema["num_cols"]
            num2_col = random.choice([n for n in num_cols if n != num_col] or num_cols)
            threshold = random.choice([10, 50, 100, 500, 1000, 5000, 10000])
            cat_val  = _get_cat_value(cat_col)

            question = q_template.format(
                cat=cat_col, num=num_col, num2=num2_col,
                threshold=threshold, cat_value=cat_val,
            )
            code = code_template.format(
                cat=cat_col, num=num_col, num2=num2_col,
                threshold=threshold, cat_value=cat_val,
            )

        instruction = build_instruction(schema, question)
        data.append({"instruction": instruction, "output": code})

    # Shuffle to avoid clusters of similar examples
    random.shuffle(data)
    return data


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Generate Text-to-Pandas training data for fine-tuning"
    )
    parser.add_argument(
        "--num_samples", type=int, default=5000,
        help="Number of training examples to generate (default: 5000)"
    )
    parser.add_argument(
        "--output", type=str, default="training_data.jsonl",
        help="Output file path (default: training_data.jsonl)"
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed for reproducibility (default: 42)"
    )
    args = parser.parse_args()

    random.seed(args.seed)

    print(f"Generating {args.num_samples} training samples...")
    print(f"  Schemas:          {len(SCHEMAS)} domains")
    print(f"  Question types:   {len(TEMPLATES) + len(DATE_TEMPLATES)} intent categories")

    samples = generate_training_data(args.num_samples)

    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), args.output)
    with open(output_path, "w", encoding="utf-8") as f:
        for sample in samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")

    print(f"\n✅ Successfully generated {len(samples)} training examples")
    print(f"   Output: {output_path}")

    # Print a few examples for verification
    print("\n── Sample Training Entries ──────────────────────────────────────\n")
    for i, s in enumerate(samples[:3], 1):
        print(f"--- Example {i} ---")
        print(f"INSTRUCTION:\n{s['instruction']}\n")
        print(f"OUTPUT:\n{s['output']}\n")


if __name__ == "__main__":
    main()
