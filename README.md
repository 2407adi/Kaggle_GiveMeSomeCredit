# Kaggle_GiveMeSomeCredit — LendSure

An end-to-end AI-assisted credit risk engine built on the Kaggle "Give Me Some Credit" dataset, deployed as a React frontend + FastAPI backend on Azure Container Apps.

Live demo: https://creditrisk-frontend.thankfulhill-d4542afa.australiasoutheast.azurecontainerapps.io/

## How it works

- **Model**: XGBoost classifier (test AUC ≈ 0.868) on 10 raw Kaggle features + 5 engineered features, with a sigmoid calibration layer for well-calibrated default probabilities. The trained artifacts live in `src/backend/model/` and are **baked into the backend Docker image** — no external model registry or hosting needed.
- **Backend** (`src/backend/`): FastAPI server (`serve_local_2.py`) exposing:
  - `POST /predict` — `{"customer_id": <int>}` → score, percentile, SHAP explanations + force plot, OpenAI analyst summary, risk-based pricing, loan offers
  - `POST /predict_1` — the 10 raw features → same response shape
  - `GET /health`
- **Frontend** (`src/frontend/`): Vite + React + TypeScript + Tailwind (shadcn/ui). Talks to the backend via `VITE_BACKEND_URL`.

## Repo layout

- `data/` — Kaggle CSVs (`cs-training.csv` is the training set)
- `src/backend/` — FastAPI server, training script, model artifacts, reference data
  - `train.py` — trains the model locally and writes `model/*.joblib` + `metadata.json`
  - `model_local.py` — loads the local artifacts and serves predictions (preprocess → predict → calibrate → SHAP)
  - `preprocess.py`, `utils.py` — feature engineering, scoring, and pricing helpers
  - `GiveMeSomeCredit.ipynb`, `DataSynth.ipynb` — legacy notebooks from the original Databricks-era pipeline (kept for reference; training now happens via `train.py`)
- `src/frontend/` — the web app
- `src/docker-compose.dev.yaml` — local dev stack (backend on :8000, frontend dev server on :8080)

## Quick start

### 1. Train the model (one-time, ~2 minutes)

```bash
python -m venv venv && source venv/bin/activate
pip install -r src/backend/requirements.txt
python src/backend/train.py
```

This writes `src/backend/model/xgb_model.joblib`, `calibrator.joblib`, and `metadata.json`, and regenerates the percentile reference parquet. Use `--tune` to re-run the Bayesian hyperparameter search (slow; `pip install scikit-optimize` first).

### 2. Configure environment

```bash
cp src/backend/.env.example src/backend/.env
# then fill in OPENAI_API_KEY (required for the analyst summary)
```

Optional vars: `ALLOWED_ORIGINS` (comma-separated CORS origins — add your deployed frontend URL), `MODEL_DIR`, `SCORE_BASE`, `SCORE_FACTOR`.

### 3. Run locally

```bash
cd src
docker compose -f docker-compose.dev.yaml up
# frontend: http://localhost:8080   backend: http://localhost:8000
```

Or without Docker:

```bash
cd src/backend && uvicorn serve_local_2:app --port 8000
cd src/frontend && npm install && npm run dev
```

## Deployment (Azure Container Apps)

Build and push both images to ACR, then deploy. The model ships inside the backend image, so the only runtime secret is the OpenAI key:

```bash
# backend
az acr build -r <registry> -t creditrisk-backend:latest src/backend
az containerapp update -n creditrisk-backend -g <rg> \
  --image <registry>.azurecr.io/creditrisk-backend:latest \
  --set-env-vars OPENAI_API_KEY=<key> ALLOWED_ORIGINS=https://<frontend-url>

# frontend (backend URL is baked in at build time)
az acr build -r <registry> -t creditrisk-frontend:latest \
  --build-arg VITE_BACKEND_URL=https://<backend-url> src/frontend
az containerapp update -n creditrisk-frontend -g <rg> \
  --image <registry>.azurecr.io/creditrisk-frontend:latest
```

Cost tip: use the consumption plan with `--min-replicas 0` so both apps scale to zero when idle.

## Notes

- The frontend login is a demo gate only (client-side check against `VITE_DEMO_USERNAME` / `VITE_DEMO_PASSWORD`, defaults `nu10admin`/`admin123`). It provides no real security — add backend auth before using with real data.
- Retraining: rerun `python src/backend/train.py`, rebuild the backend image, redeploy.
