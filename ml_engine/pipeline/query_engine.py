"""
DataChat RAG Engine — v7 (Self-Routing with RBAC & Data Operations)
===================================================================
Flow:
  1. LLM sees the question + dataset schema + role/permissions
  2. LLM decides: "needs_code" or "needs_explanation"
  3. If needs_code  → LLM writes Pandas code → Python runs it → exact answer
  4. If needs_explanation → LLM explains using schema knowledge
  5. Supports data operations (fill_null, update, delete) from CLI

This handles ANY question correctly while respecting user roles.
"""

import os, json, re
import pandas as pd
import numpy as np
import faiss
import pdfplumber
import chardet
import torch
from sentence_transformers import SentenceTransformer


def get_device():
    if torch.cuda.is_available():
        name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_memory / 1024**3
        print(f"  🎮 GPU: {name} ({vram:.1f} GB VRAM) → CUDA")
        return 'cuda'
    print("  💻 No GPU → CPU")
    return 'cpu'


class RAGEngine:

    def __init__(self):
        self.device = get_device()
        print("⏳ Loading embedding model…")
        self.embedder     = SentenceTransformer('all-MiniLM-L6-v2', device=self.device)
        self.dim          = 384
        self.index        = None
        self.chunks       = []
        self.doc_meta     = {}
        self._loaded      = False
        self._df          = None
        self._df_schema   = ''
        self._hf_pipeline = None
        print(f"✅ Ready on {self.device.upper()}.\n")

    # ── Document loading ──────────────────────────────────────
    def load_document(self, filepath, filename):
        ext = filename.rsplit('.', 1)[-1].lower()
        print(f"📂 Loading {filename} …")
        loaders = {'csv': self._load_csv, 'xlsx': self._load_xlsx,
                   'pdf': self._load_pdf,  'txt':  self._load_txt,
                   'json': self._load_json}
        if ext not in loaders:
            raise ValueError(f"Unsupported: {ext}")
        chunks, meta = loaders[ext](filepath, filename)
        self._build_index(chunks)
        self.doc_meta = meta
        self._loaded  = True
        print(f"✅ Indexed {len(chunks)} chunks.\n")
        return {**meta, 'chunks': len(chunks), 'status': 'ok'}

    def _load_csv(self, path, name):
        df = pd.read_csv(path)
        for col in df.columns:
            if any(x in col.lower() for x in ['date','time','month','year']):
                try: df[col] = pd.to_datetime(df[col], errors='coerce')
                except: pass
        self._df = df
        self._df_schema = self._build_schema(df, name)
        meta = {'filename': name, 'type': 'csv', 'rows': len(df),
                'columns': list(df.columns),
                'preview': df.head(5).to_dict(orient='records')}
        return self._df_to_chunks(df, name), meta

    def _load_xlsx(self, path, name):
        df = pd.read_excel(path)
        self._df = df
        self._df_schema = self._build_schema(df, name)
        meta = {'filename': name, 'type': 'xlsx', 'rows': len(df),
                'columns': list(df.columns),
                'preview': df.head(5).to_dict(orient='records')}
        return self._df_to_chunks(df, name), meta

    def _build_schema(self, df, name):
        lines = [
            f"DataFrame: df  |  File: {name}  |  {len(df)} rows × {len(df.columns)} columns",
            "", "Columns:"
        ]
        for col in df.columns:
            dtype  = str(df[col].dtype)
            sample = df[col].dropna().head(3).tolist()
            lines.append(f"  '{col}' ({dtype}) — e.g. {', '.join(str(v) for v in sample)}")
        cat_cols = df.select_dtypes(include='object').columns.tolist()
        if cat_cols:
            lines.append("\nUnique values:")
            for col in cat_cols[:10]:
                uv = df[col].dropna().unique().tolist()
                lines.append(f"  '{col}': {[str(v) for v in uv[:20]]}")
        num_cols = df.select_dtypes(include='number').columns.tolist()
        if num_cols:
            lines.append("\nNumeric ranges:")
            for col in num_cols:
                lines.append(f"  '{col}': min={df[col].min():,.2f}, max={df[col].max():,.2f}, "
                             f"mean={df[col].mean():,.2f}, nulls={df[col].isnull().sum()}")
        return '\n'.join(lines)

    def _df_to_chunks(self, df, name):
        chunks = [self._df_schema]
        num_cols = df.select_dtypes(include='number').columns.tolist()
        cat_cols = df.select_dtypes(include='object').columns.tolist()
        if num_cols:
            chunks.append(f"Stats:\n{df[num_cols].describe().round(2).to_string()}")
        for col in cat_cols[:8]:
            chunks.append(f"Value counts '{col}':\n{df[col].value_counts().head(15).to_string()}")
        for i in range(0, len(df), 30):
            chunks.append(df.iloc[i:i+30].to_string(index=False))
        return chunks

    def _load_pdf(self, path, name):
        self._df = None; self._df_schema = ''
        pages = []
        with pdfplumber.open(path) as pdf:
            for i, p in enumerate(pdf.pages):
                t = p.extract_text() or ''
                if t.strip(): pages.append(f"[Page {i+1}]\n{t}")
        full = '\n\n'.join(pages)
        return self._split_text(full), {'filename': name, 'type': 'pdf',
                                        'pages': len(pages), 'preview': full[:500]}

    def _load_txt(self, path, name):
        self._df = None; self._df_schema = ''
        with open(path, 'rb') as f: raw = f.read()
        enc = chardet.detect(raw)['encoding'] or 'utf-8'
        text = raw.decode(enc, errors='replace')
        return self._split_text(text), {'filename': name, 'type': 'txt',
                                        'chars': len(text), 'preview': text[:500]}

    def _load_json(self, path, name):
        with open(path) as f: data = json.load(f)
        if isinstance(data, list):
            try:
                df = pd.json_normalize(data); self._df = df
                self._df_schema = self._build_schema(df, name)
                return self._df_to_chunks(df, name), {
                    'filename': name, 'type': 'json',
                    'rows': len(df), 'columns': list(df.columns),
                    'preview': df.head(5).to_dict(orient='records')}
            except: pass
        self._df = None; self._df_schema = ''
        text = json.dumps(data, indent=2)
        return self._split_text(text), {'filename': name, 'type': 'json', 'preview': text[:500]}

    def _split_text(self, text, chunk_size=400, overlap=60):
        words = text.split()
        out = []
        for i in range(0, len(words), chunk_size - overlap):
            c = ' '.join(words[i:i+chunk_size])
            if c.strip(): out.append(c)
        return out or [text[:chunk_size]]

    # ── FAISS ─────────────────────────────────────────────
    def _build_index(self, chunks):
        self.chunks = chunks
        emb = self.embedder.encode(chunks, show_progress_bar=False, batch_size=64)
        emb = np.array(emb, dtype='float32')
        faiss.normalize_L2(emb)
        self.index = faiss.IndexFlatIP(self.dim)
        self.index.add(emb)

    def _retrieve(self, query, top_k=5):
        q = np.array(self.embedder.encode([query]), dtype='float32')
        faiss.normalize_L2(q)
        scores, idxs = self.index.search(q, top_k)
        return [(float(s), self.chunks[i]) for s, i in zip(scores[0], idxs[0]) if i >= 0]

    # ── Safe code execution ─────────────────────────────────────
    def _execute_code(self, code, df):
        safe_builtins = {
            'len': len, 'sum': sum, 'min': min, 'max': max,
            'round': round, 'abs': abs, 'int': int, 'float': float,
            'str': str, 'bool': bool, 'list': list, 'dict': dict,
            'range': range, 'enumerate': enumerate, 'zip': zip,
            'sorted': sorted, 'print': print, 'isinstance': isinstance,
            'type': type, 'any': any, 'all': all,
        }
        local_vars   = {'df': df, 'pd': pd, 'np': np}
        exec_globals = {'__builtins__': safe_builtins}
        try:
            exec(code, exec_globals, local_vars)
            result = local_vars.get('result', None)
            if result is None:
                lines = [l.strip() for l in code.strip().split('\n') if l.strip()]
                if lines:
                    result = eval(lines[-1], exec_globals, local_vars)
            return result, None
        except Exception as e:
            return None, str(e)

    def _result_to_str(self, result):
        if result is None: return "No result"
        if isinstance(result, pd.DataFrame):
            return (result.head(30).to_string() +
                    (f"\n... ({len(result)} rows total)" if len(result) > 30 else ""))
        if isinstance(result, pd.Series):
            return (result.head(30).to_string() +
                    (f"\n... ({len(result)} items)" if len(result) > 30 else ""))
        if isinstance(result, (int, np.integer)): return f"{result:,}"
        if isinstance(result, (float, np.floating)): return f"{result:,.4f}"
        if isinstance(result, list):
            return str(result[:50]) + (f"... ({len(result)} total)" if len(result) > 50 else "")
        return str(result)

    # ── MAIN ASK — Self-routing + Role-Aware ───────────────────
    def ask(self, question, backend='ollama', role='viewer', permissions=None):
        if permissions is None:
            permissions = ['read']

        if self._df is not None:
            return self._ask_smart(question, backend, role, permissions)
        return self._ask_rag(question, backend)

    def _ask_smart(self, question, backend, role, permissions):
        # Build permission context for the LLM
        perm_note = f"""
USER ROLE: {role}
ALLOWED ACTIONS: {', '.join(permissions)}
"""
        if 'delete' not in permissions:
            perm_note += "IMPORTANT: This user CANNOT delete rows. If asked to delete, politely refuse.\n"
        if 'update' not in permissions:
            perm_note += "IMPORTANT: This user CANNOT update values. If asked to update, politely refuse.\n"
        if 'fill_null' not in permissions:
            perm_note += "IMPORTANT: This user CANNOT fill null values. If asked, politely refuse.\n"

        prompt = f"""You are a data analyst assistant. A dataset is loaded as `df`.
{perm_note}
SCHEMA:
{self._df_schema}

STRICT RULES:
1. Any NUMBER answer → must use CODE. NEVER guess numbers.
2. DIRECT only for: greetings, column definitions, explanations (no numbers).
3. If DIRECT would contain a number → use CODE instead.
4. RESPECT the user's role — refuse operations they don't have permission for.
5. NEVER CREATE MOCK DATA! You MUST use the pre-loaded `df`. Do NOT write `df = pd.DataFrame(...)`.
6. If the user asks to modify the data (e.g. fill nulls, replace values), write CODE that mutates `df` directly (e.g. `df['col'].fillna(..., inplace=True)`) and set `result = "Data updated successfully"`.

FORMAT — pick one:
CODE:
result = <pandas expression>
EXPLAIN: <one line>

or

DIRECT: <plain English, no numbers>

QUESTION: {question}
RESPONSE:"""

        raw = self._call_llm(prompt, backend, max_tokens=300)
        print(f"  🤖 LLM: {raw[:150]}")

        code_str = None
        hint = ''
        if 'CODE:' in raw:
            code_match = re.search(r'CODE:\s*(.*?)(?:EXPLAIN:|$)', raw, re.DOTALL)
            if code_match: code_str = code_match.group(1)
            explain_match = re.search(r'EXPLAIN:\s*(.*?)$', raw, re.DOTALL)
            if explain_match: hint = explain_match.group(1).strip()
        elif '```python' in raw:
            # Fallback if the LLM just gave markdown code
            fallback = re.search(r'```python\s*(.*?)\s*```', raw, re.DOTALL)
            if fallback:
                code_str = fallback.group(1)
                hint_match = re.search(r'```.*\s+(.*)$', raw, re.DOTALL)
                if hint_match: hint = hint_match.group(1).strip()

        if code_str:
            code = re.sub(r'```python|```', '', code_str).strip()
            print(f"  📝 Code: {code}")

            result, error = self._execute_code(code, self._df)

            if error:
                fix_prompt = f"""Code failed: {error}\nCode: {code}\nSchema:\n{self._df_schema}\nFix it (result = ...):"""
                fixed = re.sub(r'```python|```|CODE:|EXPLAIN:.*', '',
                               self._call_llm(fix_prompt, backend, max_tokens=150)).strip()
                result, error2 = self._execute_code(fixed, self._df)
                if error2:
                    return self._ask_rag(question, backend)

            result_str = self._result_to_str(result)
            print(f"  ✅ Result: {result_str[:80]}")

            if isinstance(result, (pd.DataFrame, pd.Series)):
                return f"Here are the results ({len(result)} {'row' if len(result)==1 else 'rows'}):\n\n{result_str}"

            if isinstance(result, (int, float, np.integer, np.floating)):
                ep = f"""User asked: "{question}"\nExact answer: {result_str}\n{f'({hint})' if hint else ''}\nWrite ONE clear sentence with this number."""
                return self._call_llm(ep, backend, max_tokens=80)

            ep = f"""User asked: "{question}"\nResult:\n{result_str}\n{f'Context: {hint}' if hint else ''}\nGive a concise answer."""
            return self._call_llm(ep, backend, max_tokens=200)

        if 'DIRECT:' in raw:
            m = re.search(r'DIRECT:\s*(.*?)$', raw, re.DOTALL)
            if m: return m.group(1).strip()

        cleaned = re.sub(r'CODE:|DIRECT:|EXPLAIN:|```python|```', '', raw).strip()
        return cleaned or self._ask_rag(question, backend)

    def _ask_rag(self, question, backend):
        hits    = self._retrieve(question, top_k=5)
        context = '\n\n---\n\n'.join(c for _, c in hits)
        if self._df_schema:
            context = self._df_schema + '\n\n---\n\n' + context
        prompt = (f"You are a helpful analyst. Answer using ONLY the context.\n"
                  f"CONTEXT:\n{context}\n\nQUESTION: {question}\n\nANSWER:")
        return self._call_llm(prompt, backend, max_tokens=350)

    # ── Data modification methods ──────────────────────────
    def fill_nulls(self, column: str, method: str = 'mean', value=None) -> dict:
        """Fill null values in a column."""
        if self._df is None:
            raise ValueError("No dataset loaded")
        if column not in self._df.columns:
            raise ValueError(f"Column '{column}' not found. Available: {list(self._df.columns)}")

        null_count_before = self._df[column].isnull().sum()

        if method == 'mean':
            fill_val = self._df[column].mean()
        elif method == 'median':
            fill_val = self._df[column].median()
        elif method == 'mode':
            fill_val = self._df[column].mode()[0]
        elif method == 'value' and value is not None:
            # try to cast value to the column type if possible
            try:
                col_type = self._df[column].dtype
                if pd.api.types.is_numeric_dtype(col_type):
                    fill_val = float(value) if '.' in str(value) else int(value)
                else:
                    fill_val = str(value)
            except:
                fill_val = value
        else:
            raise ValueError(f"Unknown method '{method}'. Use: mean, median, mode, value")

        self._df[column].fillna(fill_val, inplace=True)
        null_count_after = self._df[column].isnull().sum()

        return {
            'column':       column,
            'method':       method,
            'fill_value':   str(fill_val),
            'filled':       int(null_count_before - null_count_after),
            'remaining_nulls': int(null_count_after),
        }

    def update_values(self, column: str, condition: str, new_value) -> dict:
        """Update values in column where condition is true."""
        if self._df is None:
            raise ValueError("No dataset loaded")
        if column not in self._df.columns:
            raise ValueError(f"Column '{column}' not found")

        try:
            mask = self._df.eval(condition)
        except Exception as e:
            raise ValueError(f"Invalid condition '{condition}': {e}")

        rows_affected = int(mask.sum())
        
        # Cast new_value if applicable
        try:
            col_type = self._df[column].dtype
            if pd.api.types.is_numeric_dtype(col_type):
                new_value = float(new_value) if '.' in str(new_value) else int(new_value)
        except:
            pass

        self._df.loc[mask, column] = new_value

        return {
            'column':        column,
            'condition':     condition,
            'new_value':     str(new_value),
            'rows_updated':  rows_affected,
        }

    def delete_rows(self, condition: str) -> dict:
        """Delete rows matching condition."""
        if self._df is None:
            raise ValueError("No dataset loaded")

        try:
            mask = self._df.eval(condition)
        except Exception as e:
            raise ValueError(f"Invalid condition '{condition}': {e}")

        rows_before = len(self._df)
        self._df    = self._df[~mask].reset_index(drop=True)
        rows_after  = len(self._df)

        return {
            'condition':     condition,
            'rows_deleted':  rows_before - rows_after,
            'rows_remaining': rows_after,
        }

    def add_row(self, row_data: dict) -> dict:
        """Add a new row to the dataset."""
        if self._df is None:
            raise ValueError("No dataset loaded")
        
        try:
            new_row_df = pd.DataFrame([row_data])
            self._df = pd.concat([self._df, new_row_df], ignore_index=True)
            return {
                'action': 'add_row',
                'new_total_rows': len(self._df),
                'row_added': row_data
            }
        except Exception as e:
            raise ValueError(f"Failed to add row: {e}")

    def add_column(self, col_name: str, default_val) -> dict:
        """Add a new column with a default value."""
        if self._df is None:
            raise ValueError("No dataset loaded")
        if col_name in self._df.columns:
            raise ValueError(f"Column '{col_name}' already exists.")
            
        try:
            self._df[col_name] = default_val
            return {
                'action': 'add_column',
                'column': col_name,
                'default_value': str(default_val),
                'total_columns': len(self._df.columns)
            }
        except Exception as e:
            raise ValueError(f"Failed to add column: {e}")

    # ── LLM caller ────────────────────────────────────────
    def _call_llm(self, prompt, backend, max_tokens=350):
        if backend == 'ollama':      return self._ask_ollama(prompt, max_tokens)
        if backend == 'huggingface': return self._ask_hf(prompt, max_tokens)
        raise ValueError(f"Unknown: {backend}")

    def _ask_ollama(self, prompt, max_tokens=350):
        import requests
        def get_models():
            try: return [m['name'] for m in
                         requests.get('http://localhost:11434/api/tags', timeout=5)
                         .json().get('models', [])]
            except: return []
        available = get_models()
        preferred = ['codellama:7b','codellama:latest','mistral','mistral:latest',
                     'llama3.2','llama3.2:latest','gemma2:2b','tinyllama']
        model = next((p for p in preferred if p in available),
                     available[0] if available else 'mistral')
        print(f"  🦙 {model}")
        try:
            resp = requests.post('http://localhost:11434/api/generate',
                json={'model': model, 'prompt': prompt, 'stream': False,
                      'options': {'temperature': 0.1, 'num_predict': max_tokens, 'num_gpu': 99}},
                timeout=300)
            resp.raise_for_status()
            return resp.json().get('response', '').strip() or "❌ Empty response."
        except requests.exceptions.ConnectionError:
            return "❌ Ollama not running. Run: ollama serve"
        except requests.exceptions.Timeout:
            return "❌ Timed out. Wait 30s and retry."
        except Exception as e:
            return f"❌ Error: {e}"

    def _ask_hf(self, prompt, max_tokens=350):
        try:
            if self._hf_pipeline is None:
                from transformers import pipeline
                model_id = 'TinyLlama/TinyLlama-1.1B-Chat-v1.0'
                self._hf_pipeline = pipeline('text-generation', model=model_id,
                    device_map='auto',
                    torch_dtype=torch.float16 if self.device=='cuda' else torch.float32,
                    max_new_tokens=max_tokens, do_sample=False, temperature=None, top_p=None)
            msgs = [{"role":"system","content":"You are a data analyst."},
                    {"role":"user","content":prompt}]
            out  = self._hf_pipeline(msgs)
            text = out[0]['generated_text']
            if isinstance(text, list):
                for m in reversed(text):
                    if m.get('role') == 'assistant': return m['content'].strip()
            return str(text).strip()
        except Exception as e:
            return f"❌ HuggingFace error: {e}"

    def is_loaded(self): return self._loaded

    def clear(self):
        self.index=None; self.chunks=[]; self.doc_meta={}
        self._loaded=False; self._df=None; self._df_schema=''


# --- CLI WRAPPER CONSOLIDATION ---

import argparse
import sys
import warnings

# Silence ALL output so model-loading / debug prints don't corrupt the JSON response.
class DummyFile(object):
    def write(self, x): pass
    def flush(self): pass
    def isatty(self): return False

original_stdout = sys.stdout
original_stderr = sys.stderr

# Redirect immediately at module level, not inside main(), so that imports
# like sentence_transformers don't print to stdout before we take control.
sys.stdout = DummyFile()
sys.stderr = DummyFile()
warnings.filterwarnings('ignore')

def main():
    parser = argparse.ArgumentParser(description="DataChat CLI Backend Wrapper")
    parser.add_argument("--user_id", type=str, default="default_user")
    parser.add_argument("--dataset_id", type=str, required=True)
    parser.add_argument("--question", type=str, default="")
    
    # RBAC Args
    parser.add_argument("--action", type=str, default="chat") # chat, fill_null, update, delete
    parser.add_argument("--role", type=str, default="admin") # Default changed to admin if not provided
    parser.add_argument("--permissions", type=str, default="read,fill_null,update,delete") 
    
    # Data Ops Args
    parser.add_argument("--column", type=str, default="")
    parser.add_argument("--method", type=str, default="mean")
    parser.add_argument("--value", type=str, default="")
    parser.add_argument("--condition", type=str, default="")
    parser.add_argument("--new_value", type=str, default="")
    parser.add_argument("--row_data", type=str, default="", help="JSON string of the row to add")

    args = parser.parse_args()

    current_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(current_dir)
    dataset_dir = os.path.join(base_dir, "data", "users", args.user_id, args.dataset_id)
    csv_path = os.path.join(dataset_dir, "cleaned_data.csv")

    def _json_write(data_dict):
        # Custom encoder handles numpy int/float which normally crash json.dumps
        class _NpEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, (np.integer,)): return int(obj)
                if isinstance(obj, (np.floating,)): return float(obj)
                if isinstance(obj, np.ndarray):    return obj.tolist()
                return super().default(obj)
        sys.__stdout__.buffer.write(json.dumps(data_dict, cls=_NpEncoder).encode('utf-8'))
        sys.__stdout__.buffer.flush()

    if not os.path.exists(csv_path):
        err = {
            "error": f"Dataset not found at {csv_path}", 
            "answer": "Could not find the dataset to answer your query. Has it finished processing?", 
            "intent": "error", 
            "confidence": "0"
        }
        _json_write(err)
        sys.exit(0)

    try:
        import logging
        logging.getLogger().setLevel(logging.ERROR)

        engine = RAGEngine()
        engine.load_document(csv_path, "dataset.csv")
        
        permissions = [p.strip() for p in args.permissions.split(',')]
        
        res = {"source": "ml_engine"}

        if args.action == "chat":
            answer = engine.ask(args.question, backend='ollama', role=args.role, permissions=permissions)
            if engine._df is not None:
                engine._df.to_csv(csv_path, index=False)
            res.update({
                "intent": "semantic-rag",
                "question": args.question,
                "answer": answer,
                "confidence": "high"
            })

        elif args.action == "fill_null":
            if "fill_null" not in permissions:
                raise ValueError(f"Role '{args.role}' does not have fill_null permission")
            result = engine.fill_nulls(args.column, args.method, args.value if args.value else None)
            engine._df.to_csv(csv_path, index=False)
            res.update({"intent": "fill_null", "result": result, "answer": f"Successfully filled nulls in {args.column}"})

        elif args.action == "update":
            if "update" not in permissions:
                raise ValueError(f"Role '{args.role}' does not have update permission")
            result = engine.update_values(args.column, args.condition, args.new_value)
            engine._df.to_csv(csv_path, index=False)
            res.update({"intent": "update", "result": result, "answer": f"Successfully updated {args.column}"})

        elif args.action == "delete":
            if "delete" not in permissions:
                raise ValueError(f"Role '{args.role}' does not have delete permission")
            result = engine.delete_rows(args.condition)
            engine._df.to_csv(csv_path, index=False)
            res.update({"intent": "delete", "result": result, "answer": "Successfully deleted rows matching condition"})

        elif args.action == "add_row":
            if "update" not in permissions and "add" not in permissions:
                raise ValueError(f"Role '{args.role}' does not have add/update permission")
            row_dict = json.loads(args.row_data) if args.row_data else {}
            if not row_dict:
                raise ValueError("No valid JSON row_data provided")
            result = engine.add_row(row_dict)
            engine._df.to_csv(csv_path, index=False)
            res.update({"intent": "add_row", "result": result, "answer": "Successfully added new row"})

        elif args.action == "add_column":
            if "update" not in permissions and "add" not in permissions:
                raise ValueError(f"Role '{args.role}' does not have add/update permission")
            result = engine.add_column(args.column, args.value)
            engine._df.to_csv(csv_path, index=False)
            res.update({"intent": "add_column", "result": result, "answer": f"Successfully added new column {args.column}"})

        else:
            raise ValueError(f"Unknown action: {args.action}")

        sys.stdout = original_stdout
        sys.stderr = original_stderr

        _json_write(res)
        
    except Exception as e:
        sys.stdout = original_stdout
        sys.stderr = original_stderr
        err = {"error": str(e), "answer": f"RAG Engine error: {str(e)}", "intent": "error"}
        _json_write(err)

if __name__ == "__main__":
    main()
