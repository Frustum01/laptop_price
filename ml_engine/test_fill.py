import subprocess, json, sys, os

# Simulate: chat detects fill intent, builds previewData, then calls fill_null
# First test: chat path
result = subprocess.run(
    [sys.executable, os.path.join(os.path.dirname(__file__), "pipeline", "query_engine.py"),
     "--user_id", "default_user",
     "--dataset_id", "mock-1775282795585",
     "--action", "chat",
     "--question", "fill all nan value in gender column with M"],
    capture_output=True, cwd=os.path.dirname(__file__) or "."
)

out_path = os.path.join(os.path.dirname(__file__), "test_result_final.json")
with open(out_path, "w", encoding="utf-8") as f:
    stdout = result.stdout.decode("utf-8", errors="replace")
    f.write("=== CHAT RESPONSE ===\n")
    f.write(stdout + "\n")
    
    if stdout.strip():
        try:
            data = json.loads(stdout.strip())
            f.write("\nParsed JSON:\n")
            f.write(json.dumps(data, indent=2, default=str) + "\n")
            
            # Check if value is properly set
            if data.get("intent") == "requires_confirmation":
                pd = data.get("previewData", {})
                f.write(f"\n=== PREVIEW DATA CHECK ===\n")
                f.write(f"operation_type: {pd.get('operation_type')}\n")
                f.write(f"column: {pd.get('column')}\n")
                f.write(f"method: {pd.get('method')}\n")
                f.write(f"value: '{pd.get('value')}'\n")
                f.write(f"new_value: '{pd.get('new_value')}'\n")
                
                val = pd.get('value') or pd.get('new_value') or ''
                f.write(f"\nEffective fill value: '{val}'\n")
                f.write(f"Value is non-empty: {bool(val)}\n")
        except Exception as e:
            f.write(f"\nJSON PARSE ERROR: {e}\n")

print(f"Results written to {out_path}")
