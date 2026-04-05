# 🧠 DataInsights.ai — Setup Guide

> **Stack:** React (Vite) · Node.js (Express) · Python 3.10+ (ML/RAG Engine) · MongoDB · Redis · Ollama (local LLM)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Structure](#2-project-structure)
3. [Clone & First Steps](#3-clone--first-steps)
4. [Python ML Engine Setup](#4-python-ml-engine-setup)
5. [Ollama (Local LLM) Setup](#5-ollama-local-llm-setup)
6. [Node.js Backend Setup](#6-nodejs-backend-setup)
7. [React Frontend Setup](#7-react-frontend-setup)
8. [Running All Services](#8-running-all-services)
9. [API Reference](#9-api-reference)
10. [Data Write + Confirmation Flow](#10-data-write--confirmation-flow)
11. [Docker (Optional)](#11-docker-optional)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Make sure all of the following are installed **before** you start:

| Tool | Version | Download |
|---|---|---|
| **Node.js** | ≥ 18.x | https://nodejs.org |
| **Python** | 3.10 or 3.11 (recommended) | https://python.org |
| **pip** | latest | bundled with Python |
| **MongoDB** | ≥ 6.x (Community) | https://www.mongodb.com/try/download/community |
| **Redis** | ≥ 7.x | https://redis.io/download (Windows: use WSL or [Memurai](https://www.memurai.com/)) |
| **Ollama** | latest | https://ollama.com |
| **Git** | any | https://git-scm.com |

> **GPU note:** An NVIDIA GPU with CUDA 12.x dramatically speeds up embedding and inference. CPU-only works but is slower.

---

## 2. Project Structure

```
DataInsights.ai/
├── backend-node/          # Express API server
│   ├── src/
│   │   ├── controllers/   # Route logic (chat, upload, data ops)
│   │   ├── routes/        # Express routers
│   │   ├── middleware/    # Auth (JWT), error handling
│   │   ├── models/        # Mongoose schemas
│   │   ├── queue/         # BullMQ pipeline worker
│   │   └── index.js       # Entry point — port 5000
│   └── .env.example       # Copy to .env and fill in
│
├── frontend-react/        # React + Vite SPA
│   ├── src/
│   │   ├── components/    # QueryAssistant (chat + confirmation)
│   │   ├── pages/         # Dashboard, Chat, Upload, Datasets
│   │   └── services/api.js  # All API calls (axios)
│   └── vite.config.js     # Dev server — port 5173
│
├── ml_engine/             # Python intelligence layer
│   ├── pipeline/
│   │   ├── query_engine.py      # RAG chat + data ops CLI
│   │   ├── run_pipeline.py      # Full dataset ML pipeline
│   │   ├── cleaner.py           # Data cleaning
│   │   ├── trainer.py           # ML model training
│   │   ├── forecaster.py        # Time-series forecasting
│   │   ├── dashboard.py         # Dashboard config generator
│   │   └── insight_engine.py    # KPI & insight extraction
│   ├── data/
│   │   └── users/<user_id>/<dataset_id>/
│   │       └── cleaned_data.csv  # Live dataset (read + written by ops)
│   └── requirements.txt
│
├── docker-compose.yml     # Optional one-command startup
└── SETUP.md               # This file
```

---

## 3. Clone & First Steps

```bash
git clone <your-repo-url> DataInsights.ai
cd DataInsights.ai
```

---

## 4. Python ML Engine Setup

### 4a. Create a virtual environment (recommended)

```bash
cd ml_engine
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 4b. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4c. PyTorch — choose your variant

**CPU only (default after requirements.txt):**
```bash
pip install torch torchvision torchaudio
```

**NVIDIA GPU (CUDA 12.x):**
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### 4d. Verify the engine works

```bash
# From the ml_engine/ directory
python pipeline/query_engine.py --dataset_id test --help
```

You should see the argparse help message — no errors.

---

## 5. Ollama (Local LLM) Setup

The RAG chat engine calls Ollama on `http://localhost:11434`. You need at least one model pulled.

```bash
# Start Ollama service
ollama serve

# Pull a model (Mistral is recommended, ~4 GB)
ollama pull mistral

# Other supported models:
# ollama pull codellama:7b
# ollama pull llama3.2
# ollama pull gemma2:2b   ← smallest, good for low-RAM machines
```

> **Verify:** Open http://localhost:11434 in a browser — you should see `Ollama is running`.

---

## 6. Node.js Backend Setup

### 6a. Install dependencies

```bash
cd backend-node
npm install
```

### 6b. Create your `.env` file

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `.env` and fill in the values:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/datainsights
REDIS_URI=redis://127.0.0.1:6379
JWT_SECRET=replace_this_with_a_long_random_string
NODE_ENV=development
```

> **MongoDB:** Make sure `mongod` is running before starting the backend.  
> **Redis:** Make sure `redis-server` (or Memurai on Windows) is running.

### 6c. Start the backend

```bash
npm run dev
```

Expected output:
```
Server running on port 5000
MongoDB Connected: 127.0.0.1
```

Health check: http://localhost:5000/api/health

---

## 7. React Frontend Setup

### 7a. Install dependencies

```bash
cd frontend-react
npm install
```

### 7b. Environment (optional)

By default the frontend points to `http://localhost:5000/api`.  
If your backend is on a different host, create `frontend-react/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### 7c. Start the dev server

```bash
npm run dev
```

Open: **http://localhost:5173**

---

## 8. Running All Services

You need **5 things running at the same time**. Open 5 terminal windows:

| # | Terminal | Command | Port |
|---|---|---|---|
| 1 | MongoDB | `mongod` | 27017 |
| 2 | Redis | `redis-server` (or Memurai) | 6379 |
| 3 | Ollama | `ollama serve` | 11434 |
| 4 | Backend | `cd backend-node && npm run dev` | 5000 |
| 5 | Frontend | `cd frontend-react && npm run dev` | 5173 |

> **Tip (Windows):** Use Windows Terminal tabs to keep all 5 visible at once.

---

## 9. API Reference

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login → returns JWT token |

### Dataset & Pipeline
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a CSV / XLSX / PDF |
| `GET` | `/api/dataset-status/:id` | Poll pipeline progress |
| `GET` | `/api/dashboard/:id` | Get pre-computed dashboard config |
| `GET` | `/api/datasets` | List all user datasets |

### Chat / Query
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/query` | Ask a natural-language question (read-only RAG) |

### Data Operations *(require auth token)*
| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/data/preview` | `{ datasetId, operation_type, column, condition, new_value }` | **Read-only preview** — returns row count that WILL be affected |
| `POST` | `/api/data/update` | `{ datasetId, column, condition, new_value }` | Update column values where condition matches |
| `POST` | `/api/data/delete` | `{ datasetId, condition }` | Delete rows matching condition |
| `POST` | `/api/data/fill-null` | `{ datasetId, column, method, value }` | Fill null values (mean/median/mode/value) |
| `POST` | `/api/data/add-row` | `{ datasetId, row_data }` | Append a new row |
| `POST` | `/api/data/add-column` | `{ datasetId, column, value }` | Add a new column with default value |

---

## 10. Data Write + Confirmation Flow

This is how the chat-based data modification works end-to-end:

```
User types: "Update price to 45000 where Company == Dell"
        │
        ▼
[QueryAssistant.jsx]
  detectWriteIntent() — regex matches UPDATE pattern
        │
        ▼
POST /api/data/preview
  { datasetId, operation_type: "update",
    column: "price", condition: "Company == 'Dell'", new_value: "45000" }
        │
        ▼
[query_engine.py --action preview]
  Loads CSV → df.eval(condition).sum() → returns preview_count: 12
  (NO disk write)
        │
        ▼
[QueryAssistant.jsx — Confirmation Card appears in chat]
  ⚠️  Confirm Data Change
  ┌─────────────────────────────────────────┐
  │ Operation  UPDATE                       │
  │ Column     price                        │
  │ Condition  Company == 'Dell'            │
  │ New Value  45000                        │
  │ Rows       12 of 1,200 rows             │
  └─────────────────────────────────────────┘
  [✅ Yes, apply changes]   [❌ Cancel]
        │
        ▼ (user clicks Confirm)
POST /api/data/update
  { datasetId, column, condition, new_value }
        │
        ▼
[query_engine.py --action update]
  Applies df.loc[mask, column] = new_value
  Saves cleaned_data.csv to disk
        │
        ▼
✅ Updated 12 row(s) in column "price"
```

### Supported natural-language patterns

| Query Example | Detected As |
|---|---|
| `Update price to 45000 where Company == Dell` | `update` |
| `Change RAM to 16 where price > 80000` | `update` |
| `Set discount to 0 where Brand is Apple` | `update` |
| `Delete rows where RAM == 4 GB` | `delete` |
| `Remove all rows where price < 10000` | `delete` |
| `Fill null values in price with mean` | `fill_null` |
| `Fill missing RAM with 8` | `fill_null` |

---

## 11. Docker (Optional)

A `docker-compose.yml` is included for a single-command start:

```bash
# From the project root
docker compose up --build
```

This starts MongoDB, Redis, the Node backend, and the ML engine in one network.  
You still need to run `ollama serve` separately on your host machine.

---

## 12. Troubleshooting

### `❌ Ollama not running. Run: ollama serve`
Start Ollama: `ollama serve` and make sure a model is pulled (`ollama pull mistral`).

### `No output from python script` in the backend logs
- Make sure `python` is in your PATH: `python --version`
- On some systems use `python3` — check the spawn command in `dataOperationsController.js`
- Make sure all Python deps are installed in the **active** venv

### MongoDB connection error
Make sure `mongod` is running: `mongod --dbpath C:\data\db` (Windows) or `sudo systemctl start mongod` (Linux)

### Redis connection error (BullMQ queue fails)
Start Redis: `redis-server` or start Memurai from the system tray (Windows)

### Confirmation card doesn't appear for a query
The regex may not match your phrasing. Try more explicit patterns like:
- `"Update [column] to [value] where [condition]"`
- `"Delete rows where [condition]"`
- `"Fill null values in [column] with mean"`

### CSV not being written after data operations
Check that the `ml_engine/data/users/<user_id>/<dataset_id>/cleaned_data.csv` path exists. The dataset must have been processed first via the upload pipeline.

### CORS error in browser
Make sure the backend is running on port `5000` and the frontend on `5173`. CORS is enabled by default in `index.js` for all origins during development.

---

## Quick Reference — Start Commands

```bash
# Terminal 1 — MongoDB
mongod

# Terminal 2 — Redis
redis-server

# Terminal 3 — Ollama
ollama serve

# Terminal 4 — Backend
cd backend-node && npm run dev

# Terminal 5 — Frontend
cd frontend-react && npm run dev
```

**Frontend:** http://localhost:5173  
**Backend:**  http://localhost:5000  
**Health:**   http://localhost:5000/api/health
