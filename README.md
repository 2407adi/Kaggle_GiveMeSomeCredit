# LendSure — End-to-End Credit Risk Engine

A production-shaped credit risk platform built on the Kaggle ["Give Me Some Credit"](https://www.kaggle.com/c/GiveMeSomeCredit) dataset: an XGBoost default-probability model with calibrated PDs feeds risk-based loan pricing, affordability-capped offers, SHAP explainability, an AI analyst summary, and a **Basel III / IFRS 9 Expected Credit Loss suite** that computes the provision and regulatory capital a bank must hold to issue each loan.

React + FastAPI, fully Dockerized, running on Azure Container Apps with scale-to-zero (~$5/month idle).

**Live demo:** https://creditrisk-frontend.thankfulhill-d4542afa.australiasoutheast.azurecontainerapps.io (demo login: `nu10admin` / `admin123`; first request may take ~20s while the backend cold-starts from zero replicas)

---

## Highlights (the 60-second version)

- **Calibrated ML model** — XGBoost with Bayesian-tuned hyperparameters, **test AUC 0.868**, plus a sigmoid calibration layer so the output is a *usable probability of default*, not just a ranking score.
- **Model self-hosted in the image** — trained locally by `train.py`, joblib artifacts baked into the Docker image. No model registry, no external hosting, zero model-serving cost.
- **Risk-based pricing** — APR built from cost of funds + opex + return target + the borrower's own PD, clamped to [11%, 36%]; loan sizes solved from an affordability (FOIR) cap via the inverse-EMI formula across 4 tenures.
- **Basel / IFRS 9 ECL suite** — per-loan IFRS 9 staging (30-DPD backstop), 12-month & lifetime ECL via a survival/hazard model discounted at EIR, Basel A-IRB retail capital (asset correlation, the CRE31 K formula, PD/LGD floors), the standardised-approach comparison with the 72.5% output floor, and a loan-viability P&L including a SAMA-capped origination fee. **Verified against BIS CRE31/CRE20; 21 unit tests.**
- **Explainability** — SHAP force plots rendered per prediction, plus a GPT-generated analyst summary and recommendation.
- **Polished frontend** — React 18 + TypeScript + Tailwind (shadcn/ui), dark/light theme, responsive, PDF export of the assessment.
- **Documented for humans** — [docs/ECL_EXPLAINED.md](docs/ECL_EXPLAINED.md) walks through the entire ECL/capital math with a worked example and interview-ready explanations.

---

## What it does

1. **Assess** — look a customer up by ID (synthetic Saudi bureau enrichment) or enter the 10 raw credit features manually.
2. **Score** — the model returns a calibrated PD, a credit score (log-odds scaled), a percentile vs. the training population, SHAP explanations, and an AI analyst summary.
3. **Price** — the PD drives a personalized APR; the borrower's income and debt ratio drive maximum loan amounts for 6/12/18/24-month tenures under a 60% FOIR cap.
4. **Provision & capitalize (the bank's view)** — one click runs the Basel ECL analysis: IFRS 9 stage, ECL provision, risk weight, RWA (IRB vs. standardised vs. output floor), Pillar-1 and buffered capital requirements, and whether the loan is economically viable to issue.

```
Borrower data ──► XGBoost + calibration ──► PD ──► Pricing (APR, offers)
                        │                            │
                        ▼                            ▼
                  SHAP + GPT summary        IFRS 9 ECL + Basel capital
                                            (provision, RWA, viability)
```

## Architecture

```
┌──────────────────────────┐        ┌──────────────────────────────────┐
│  Frontend (nginx :80)    │  HTTPS │  Backend (uvicorn :8000)         │
│  React 18 + Vite + TS    │ ─────► │  FastAPI (serve_local_2.py)      │
│  Tailwind + shadcn/ui    │  CORS  │  ├─ model_local.py  (predict)    │
│  next-themes dark mode   │        │  ├─ preprocess.py   (features)   │
│                          │        │  ├─ utils.py        (pricing)    │
│  VITE_BACKEND_URL baked  │        │  ├─ ecl.py          (Basel/IFRS9)│
│  at build time           │        │  └─ model/*.joblib  (baked in)   │
└──────────────────────────┘        └──────────────────────────────────┘
        Azure Container Apps · consumption plan · scale-to-zero
```

**API surface**

| Endpoint | Purpose |
|---|---|
| `POST /predict` | `{"customer_id": <int>}` → score, PD, SHAP force plot, analyst summary, pricing, loan offers |
| `POST /predict_1` | The 10 raw Kaggle features → same response shape |
| `POST /ecl` | PD + loan options + delinquency history → IFRS 9 stage, ECL, RWA, capital, viability per tenure |
| `GET /health` | Liveness check |

## The model

- **Data**: 150k borrowers, 10 features (utilization, age, delinquency counts, debt ratio, income, open lines, real-estate lines, dependents) + 5 engineered features (`preprocess.py`).
- **Training** (`src/backend/train.py`): 75/25 stratified split, XGBoost with hyperparameters from a Bayesian search (`--tune` re-runs it), then `CalibratedClassifierCV` (sigmoid) fit on a held-out calibration slice. Raw and calibrated **test AUC: 0.868**.
- **Serving** (`model_local.py`): preprocess → predict → calibrate → SHAP TreeExplainer, returning `(features, explainer, results)` with raw/calibrated PD, log-odds, and a scaled credit score.
- **Retraining**: `python train.py` → rebuild the Docker image. That's the whole MLOps story, by design — the artifacts are ~650 KB and versioned with the code.

## The ECL suite (`src/backend/ecl.py`)

Implements the regulatory math a lender runs before issuing a loan, per **BIS CRE31 (A-IRB retail)**, **CRE20 (standardised)**, and **Basel III finalized**:

- **IFRS 9 staging** — Stage 2 on any 30–59/60–89 DPD history (30-DPD backstop) or PD ≥ 20%; Stage 3 on 90+ DPD; analyst override supported.
- **ECL** — constant-hazard survival model spreads the 12-month PD across the EMI amortization schedule; marginal PD × LGD × EAD discounted monthly at the loan APR. 12-month and lifetime horizons; stage-appropriate provision.
- **Basel capital** — PD-dependent asset correlation, the K formula at the 99.9th percentile, PD floor 0.05%, LGD floor 30% (LGD 55% assumption for unsecured retail), RWA = K × 12.5 × EAD, output floor `max(RWA_IRB, 72.5% × 75% × EAD)`, capital at 8% (Pillar 1) and 10.5% (incl. conservation buffer).
- **Viability** — lifetime P&L: interest + a 1% origination fee (capped SAR 5,000, per SAMA) vs. funding cost, opex, expected loss, and cost of equity on the capital consumed.

Want to actually understand this? Read **[docs/ECL_EXPLAINED.md](docs/ECL_EXPLAINED.md)** — every term defined, one fully worked example, and a deep-dive Q&A (what capital *actually* is, why survival weighting, the 75%-vs-72.5% confusion, staging misconceptions).

## Repo layout

```
data/                      Kaggle CSVs (cs-training.csv = training set)
docs/ECL_EXPLAINED.md      The ECL/Basel math, explained for humans
src/backend/
  train.py                 Trains the model, writes model/*.joblib
  model_local.py           Loads artifacts, serves predictions
  serve_local_2.py         FastAPI app (predict, ecl, health)
  ecl.py                   IFRS 9 + Basel III calculations (pure functions)
  test_ecl.py              21 pytest tests incl. hand-computed Basel K checks
  preprocess.py, utils.py  Feature engineering, scoring, pricing
  model/                   Trained artifacts (baked into the image)
src/frontend/              Vite + React + TS app (shadcn/ui, dark mode)
src/docker-compose.dev.yaml  Local dev stack (backend :8000, frontend :8080)
```

## Quick start

```bash
# 1. Train the model (~2 min, one time)
python -m venv venv && source venv/bin/activate
pip install -r src/backend/requirements.txt
python src/backend/train.py

# 2. Configure
cp src/backend/.env.example src/backend/.env   # add OPENAI_API_KEY (required)

# 3. Run
cd src/backend && uvicorn serve_local_2:app --port 8000   # terminal 1
cd src/frontend && npm install && npm run dev             # terminal 2
# → app on http://localhost:8080 (demo login: nu10admin / admin123)
```

Or with Docker: `cd src && docker compose -f docker-compose.dev.yaml up`.

**Tests**: `pip install pytest && pytest src/backend/test_ecl.py` — covers hazard inversion, ECL monotonicity, a hand-computed Basel K spot-check, PD/LGD/output floors, the staging matrix, and fee-driven viability.

## Deployment (Azure Container Apps)

One command after `az login`:

```bash
./deploy.sh all        # or: backend | frontend
```

The script runs the test gates (pytest / vite build) and **aborts on failure**, cloud-builds both images via `az acr build` (no local Docker needed), tags them `<git-sha>-<timestamp>`, and rolls new Container Apps revisions. The frontend build always fetches the *current* backend FQDN, so the baked `VITE_BACKEND_URL` can never go stale. Resource names are configurable via a gitignored `.deploy.env`.

Runtime config on the backend app: `OPENAI_API_KEY` stored as a Container Apps **secret** (referenced via `secretref`, never plaintext) and `ALLOWED_ORIGINS=https://<frontend-fqdn>` for CORS. Both apps run on the consumption plan with `--min-replicas 0` (scale-to-zero), so idle cost is just the container registry (~$5/mo).

## Engineering notes

- **Cost-driven re-architecture**: the model originally lived in a Databricks/MLflow registry; it was rebuilt as a local-training + bake-into-image pipeline to bring model hosting cost to zero without changing the serving contract.
- **Proper HTTP semantics**: errors are 4xx with detail payloads, not 200s with `{"error": ...}`.
- **Config via environment**: CORS origins, model directory, and score scaling are env vars with sane defaults; secrets never live in the image or the repo.
- **Numerics discipline**: scipy/numpy types cast at the boundary so FastAPI's JSON encoder never sees `numpy.bool_`; regulatory constants documented with their BIS sources inline.

## Disclaimers

- The frontend login is a **client-side demo gate** (`VITE_DEMO_USERNAME`/`VITE_DEMO_PASSWORD`, defaults `nu10admin`/`admin123`) — it provides no real security.
- Customer "bureau" data is **synthetic** (generated enrichment over Kaggle rows); no real personal data anywhere.
- The ECL suite uses documented simplifying assumptions (constant hazard, fixed LGD) — a demonstration of the regulatory framework, **not regulatory advice**.
