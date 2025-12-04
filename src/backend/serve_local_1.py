from fastapi import FastAPI, Body
import pandas as pd
import numpy as np
import nest_asyncio
import uvicorn
import os
import mlflow
import shap
import base64
from io import BytesIO
import matplotlib.pyplot as plt
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import scipy.stats as stats

# Load env
load_dotenv()
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")
MODEL_URI = os.getenv("MODEL_URI")

os.environ["DATABRICKS_HOST"] = DATABRICKS_HOST
os.environ["DATABRICKS_TOKEN"] = DATABRICKS_TOKEN
mlflow.set_registry_uri("databricks-uc")

# Load customer + reference score data
customers_df = pd.read_csv("data/cs_test_synth.csv")        # already has synthesized features
reference_scores = pd.read_parquet("data/train_predictions.parquet")  # column: credit_score

# Load model
model = mlflow.pyfunc.load_model(MODEL_URI)

app = FastAPI(title="Credit Risk Model (local)")

# Allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# Model input schema
# -------------------------
MODEL_FEATURES = [
    'RevolvingUtilizationOfUnsecuredLines',
    'age',
    'NumberOfTime30_59DaysPastDueNotWorse',
    'DebtRatio',
    'MonthlyIncome',
    'NumberOfOpenCreditLinesAndLoans',
    'NumberOfTimes90DaysLate',
    'NumberRealEstateLoansOrLines',
    'NumberOfTime60_89DaysPastDueNotWorse',
    'NumberOfDependents'
]

schema = {f: 'float' for f in MODEL_FEATURES}

# -------------------------
# Utility: synthesis function
# -------------------------
def synthesize_bureau_fields(df: pd.DataFrame, seed: int = 42) -> pd.DataFrame:
    np.random.seed(seed)
    df = df.copy()

    df["TotalObligation"] = (df["DebtRatio"] * df["MonthlyIncome"]).fillna(0).astype(int)

    total_open = df["NumberOfOpenCreditLinesAndLoans"].fillna(0).astype(int)
    df["TotalUnsecuredLoans"] = (total_open * np.random.uniform(0.5, 0.7, size=len(df))).astype(int)
    df["TotalSecuredLoans"] = (total_open - df["TotalUnsecuredLoans"]).astype(int)

    unsecured = df["TotalUnsecuredLoans"]
    weights_unsecured = np.random.dirichlet([4, 2, 2, 1], size=len(df))
    df["CreditCards"] = (unsecured * weights_unsecured[:, 0]).astype(int)
    df["PersonalLoans"] = (unsecured * weights_unsecured[:, 1]).astype(int)
    df["BNPLLoans"] = (unsecured * weights_unsecured[:, 2]).astype(int)
    df["OtherUnsecured"] = (unsecured - (df["CreditCards"] + df["PersonalLoans"] + df["BNPLLoans"])).astype(int)

    secured = df["TotalSecuredLoans"]
    weights_secured = np.random.dirichlet([3, 2, 2, 1], size=len(df))
    df["RealEstateLoans"] = (secured * weights_secured[:, 0]).astype(int)
    df["GoldLoans"] = (secured * weights_secured[:, 1]).astype(int)
    df["VehicleLoans"] = (secured * weights_secured[:, 2]).astype(int)
    df["OtherSecured"] = (secured - (df["RealEstateLoans"] + df["GoldLoans"] + df["VehicleLoans"])).astype(int)

    df["HasDelinquencyHistory"] = (
        (df["NumberOfTime30_59DaysPastDueNotWorse"] +
         df["NumberOfTimes90DaysLate"] +
         df["NumberOfTime60_89DaysPastDueNotWorse"]) > 0
    ).astype(int)

    df["DependentsFlag"] = (df["NumberOfDependents"].fillna(0) > 0).astype(int)
    df["TotalLoanUtilization"] = np.random.uniform(0, 1, size=len(df))
    df["BureauVintage"] = [
        np.random.randint(1, max(2, age - 18)) if age > 18 else 1
        for age in df["age"]
    ]
    df["NumberOfEnquiriesInLast6Months"] = np.random.randint(0, 61, size=len(df))

    return df

# -------------------------
# Shared response builder
# -------------------------
def build_response(X: pd.DataFrame, pred: pd.DataFrame, explainer, row_full: pd.Series):
    score = 1 - float(pred.loc[0, "probability"])
    percentile = stats.percentileofscore(reference_scores["score"], score, kind="rank")

    shap_values = explainer(X)
    feature_contribs = dict(zip(X.columns, shap_values.values[0]))

    pos = sorted([(k, v) for k, v in feature_contribs.items() if v > 0],
                 key=lambda x: -x[1])[:2]
    neg = sorted([(k, v) for k, v in feature_contribs.items() if v < 0],
                 key=lambda x: x[1])[:2]

    fieldLabels = {
        "RevolvingUtilizationOfUnsecuredLines": "Revolving Utilization",
        "age": "Age",
        "DebtRatio": "Debt Ratio",
        "MonthlyIncome": "Monthly Income",
        "NumberOfOpenCreditLinesAndLoans": "Open Credit Lines",
        "NumberOfDependents": "Number of Dependents",
        "NumberOfTime30_59DaysPastDueNotWorse": "30-59 Days Past Due",
        "NumberOfTimes90DaysLate": "Number of times 90 Days Late",
        "NumberRealEstateLoansOrLines": "Number of Real Estate Loans",
        "NumberOfTime60_89DaysPastDueNotWorse": "Number of times 60-89 Days Past Due",
        "TotalObligation": "Total Obligation",
        "TotalUnsecuredLoans": "Total Unsecured Loans",
        "CreditCards": "Credit Cards",
        "PersonalLoans": "Personal Loans",
        "BNPLLoans": "BNPL Loans",
        "OtherUnsecured": "Other Unsecured Loans",
        "TotalSecuredLoans": "Total Secured Loans",
        "RealEstateLoans": "Real Estate Loans",
        "GoldLoans": "Gold Loans",
        "VehicleLoans": "Vehicle Loans",
        "OtherSecured": "Other Secured Loans",
        "HasDelinquencyHistory": "Has Delinquency History",
    }

    pos_features = ", ".join([fieldLabels.get(p[0], p[0]) for p in pos]) if pos else "none"
    neg_features = ", ".join([fieldLabels.get(n[0], n[0]) for n in neg]) if neg else "none"

    explanations = [
        f"Your credit score is positively impacted by {pos_features}.",
        f"Your credit score is negatively impacted by {neg_features}."
    ]

    shap.plots.force(shap_values[0], matplotlib=True, show=False)
    buf = BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight")
    plt.close()
    force_plot_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    # Features: keep raw keys (frontend already knows these)
    features_out = {}
    for k, v in row_full.items():
        if k in ["Unnamed: 0", "Identifier"]:
            continue
        try:
            features_out[k] = round(float(v), 2)
        except Exception:
            features_out[k] = v


    return {
        "score": float(pred.loc[0, "credit_score"]),
        "percentile": round(percentile, 2),
        "explanations": explanations,
        "features": features_out,
        "force_plot": force_plot_b64
    }

# -------------------------
# Endpoints
# -------------------------

@app.post("/predict")
def predict(payload: dict = Body(...)):
    customer_id = payload.get("customer_id")
    if customer_id is None:
        return {"error": "customer_id is required"}

    row_full = customers_df[customers_df["Identifier"] == customer_id]
    if row_full.empty:
        return {"error": f"Customer {customer_id} not found"}

    # only pass model features to model
    X = row_full[MODEL_FEATURES].astype(schema, errors="ignore")
    X, explainer, pred = model.predict(X)

    return build_response(X, pred, explainer, row_full.iloc[0])

@app.post("/predict_1")
def predict_1(payload: dict = Body(...)):
    row = pd.DataFrame([payload]).astype(schema, errors="ignore")

    # synthesize missing features
    row_full = synthesize_bureau_fields(row)

    # only pass model features to model
    X = row_full[MODEL_FEATURES].astype(schema, errors="ignore")
    X, explainer, pred = model.predict(X)

    return build_response(X, pred, explainer, row_full.iloc[0])

@app.get("/health")
def health():
    return {"status": "ok"}

def run():
    nest_asyncio.apply()
    uvicorn.run(app, host="0.0.0.0", port=8000)
