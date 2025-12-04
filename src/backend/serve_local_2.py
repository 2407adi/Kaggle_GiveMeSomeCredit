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
from openai import OpenAI
import json
import re
from utils import compute_risk_based_rate, calculate_loan_options

# Load env
load_dotenv()
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")
MODEL_URI = os.getenv("MODEL_URI")

# init client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

os.environ["DATABRICKS_HOST"] = DATABRICKS_HOST
os.environ["DATABRICKS_TOKEN"] = DATABRICKS_TOKEN
mlflow.set_registry_uri("databricks-uc")

# -------------------------
# Data: customers + reference + external (Saudi) enrichment
# -------------------------
# customers_df previously came from CSV; replaced with parquet per user's note
customers_df = pd.read_parquet("data/train_predictions_1.parquet")  # expects an 'Identifier' column
# reference_scores unchanged
reference_scores = pd.read_parquet("data/train_predictions.parquet")  # column: credit_score or score
# additional enrichment dataframe from Saudi dataset
try:
    saudi_df = pd.read_csv("data/saudi_lean_customers_enriched.csv")
    print(saudi_df.columns)
except FileNotFoundError:
    # fallback to empty frame if not present during local dev/testing
    saudi_df = pd.DataFrame()

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
    score = float(pred.loc[0, "calibrated_probability"])
    percentile = stats.percentileofscore(reference_scores["score"], score, kind="rank")

    feature_abbrev = {
        "RevolvingUtilizationOfUnsecuredLines": "UnsecUtil",
        "age": "Age",
        "NumberOfTime30_59DaysPastDueNotWorse": "30-59DPD",
        "DebtRatio": "DebtRatio",
        "MonthlyIncome": "Income",
        "NumberOfOpenCreditLinesAndLoans": "NumLoans",
        "NumberOfTimes90DaysLate": "90DPD",
        "NumberRealEstateLoansOrLines": "RealEstateLoans",
        "NumberOfTime60_89DaysPastDueNotWorse": "60-89DPD",
        "NumberOfDependents": "Dependents", 'CreditUtilizationPerLine':"UtilPerLine",
       'DebtBurdenPerDependent':"", 'SeriousDelinqRate':"SeriousDelinq", 'RealEstateLoanShare':"RealEstateShare",
       'AgePerCreditLine':"AgePerLine"
    }

    shap_values = explainer(X)
    # Round the feature values for display
    rounded_data = np.round(shap_values.data, 2)

    # Optionally round the SHAP values too
    rounded_values = np.round(shap_values.values, 2)
    rounded_base_values = np.round(shap_values.base_values, 2)

    # Create a new Explanation object with rounded feature values and SHAP values
    shap_values_rounded = shap.Explanation(
        values=rounded_values,
        base_values=rounded_base_values,
        data=rounded_data,
        feature_names=shap_values.feature_names
    )

    # Plot
    shap.plots.force(
        shap_values_rounded[0], 
        matplotlib=True, 
        show=False,
        feature_names=[feature_abbrev.get(c, c) for c in X.columns]
    )

    buf = BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight")
    plt.close()
    force_plot_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    feature_contribs = dict(zip(X.columns, rounded_values[0]))
    # Flip logic: pos = most positive, neg = most negative
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
    }

    pos_features = ", ".join([fieldLabels.get(p[0], p[0]) for p in pos]) if pos else "none"
    neg_features = ", ".join([fieldLabels.get(n[0], n[0]) for n in neg]) if neg else "none"

    explanations = [
        f"Your credit score is positively impacted by {neg_features}.",
        f"Your credit score is negatively impacted by {pos_features}."
    ]

    features_out = {}
    for k, v in row_full.items():
        if k in ["Unnamed: 0", "Identifier"]:
            continue
        try:
            features_out[k] = round(float(v), 2)
        except Exception:
            features_out[k] = str(v)

    result_dict = {
        "score": float(pred.loc[0, "credit_score"]),
        "raw_prob":float(pred.loc[0, "raw_probability"]),
        "percentile": round(percentile, 2),
        "explanations": explanations,
        "features": features_out,
        "force_plot": force_plot_b64
    }

    # ---------------------------
    # Call OpenAI for Analyst Summary
    # ---------------------------

    prompt = f"""
    You are a senior credit risk analyst. Analyze the following customer credit risk output:

    Credit Score: {result_dict['score']}
    Percentile vs reference: {result_dict['percentile']}
    Key impacts: {result_dict['explanations']}
    Customer features: {result_dict['features']}

    Please provide your output strictly as a JSON object with two keys:

    1. "Final_Recommendation": one of "Approve", "Further Review", "Reject"
    2. "AI_Summary": a concise 4-5 line summary of the client for a credit officer. 
    - If the Final_Recommendation is "Further Review", also include in the summary what aspects should be checked further.

    Make sure the JSON is properly formatted and nothing else is returned. Do not include any additional commentary outside the JSON.
    """

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",  # or "gpt-4.1-mini"
            messages=[
                {"role": "system", "content": "You are a senior credit risk analyst."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=250
        )
        
        # Parse the JSON returned by the AI
        analyst_output = response.choices[0].message.content.strip()
        analyst_output = re.sub(r"^```json\s*|\s*```$", "", analyst_output, flags=re.DOTALL).strip()
        # # Extract the JSON object from the AI output
        # match = re.search(r"\{.*\}", analyst_output, re.DOTALL)
        # if match:
        #     json_str = match.group(0)
        #     try:
        #         result_json = json.loads(json_str)
        #     except json.JSONDecodeError as e:
        #         result_json = {
        #             "Final_Recommendation": "Unavailable",
        #             "AI_Summary": f"(AI summary unavailable: {e})"
        #         }
        # else:
        #     # fallback if no JSON found
        #     result_json = {
        #         "Final_Recommendation": "Unavailable",
        #         "AI_Summary": f"(AI summary unavailable: invalid format)"
        #     }
        print(analyst_output)
        result_json = json.loads(analyst_output)

    except Exception as e:
        # Fallback in case of error
        result_json = {
            "Final_Recommendation": "Unavailable",
            "AI_Summary": f"(AI summary unavailable: {e})"
        }

    # Store in your result dictionary
    result_dict["Final_Recommendation"] = result_json.get("Final_Recommendation")
    result_dict["analyst_summary"] = result_json.get("AI_Summary")

    return result_dict

# -------------------------
# Endpoints
# -------------------------

@app.post("/predict")
def predict(payload: dict = Body(...)):
    customer_id = payload.get("customer_id")
    if customer_id is None:
        return {"error": "customer_id is required"}

    # locate customer in the new customers dataframe
    row_full = customers_df[customers_df["Identifier"] == customer_id]
    if row_full.empty:
        return {"error": f"Customer {customer_id} not found"}

    # try to attach enrichment from saudi_lean_customers.csv if available
    if not saudi_df.empty:
        # attempt to detect identifier column in saudi_df
        if "Identifier" in saudi_df.columns:
            key_col = "Identifier"
        elif "CustomerID" in saudi_df.columns:
            key_col = "CustomerID"
        else:
            key_col = None

        if key_col is not None:
            extra = saudi_df[saudi_df[key_col] == customer_id]
            print(extra.columns)
            if not extra.empty:
                # ensure we don't accidentally duplicate the index; do a left-merge
                # use suffixes to avoid collisions
                row_full = row_full.merge(extra, left_on="Identifier", right_on=key_col, how="left", suffixes=("", "_saudi"))
                print(row_full.columns)

    # only pass model features to model
    print("done till here")
    X = row_full[MODEL_FEATURES].astype(schema, errors="ignore")
    X, explainer, pred = model.predict(X)
    print("model pred done")

    # --- New: Risk-based pricing and FOIR-based loan amounts ---
    pd_prob = float(pred.loc[0, "calibrated_probability"])
    apr = compute_risk_based_rate(pd_prob)
    print("calibration done")

    monthly_income = float(row_full["MonthlyIncome"].iloc[0]) if "MonthlyIncome" in row_full else 0.0
    debt_ratio = float(row_full["DebtRatio"].iloc[0]) if "DebtRatio" in row_full else 0.0
    loan_options = calculate_loan_options(monthly_income, debt_ratio, apr)
    print("calibration done 1")

    result = build_response(X, pred, explainer, row_full.iloc[0])
    print("calibration done 2")
    result["pricing"] = {
    "pd": round(pd_prob, 6),
    "apr_decimal": round(apr, 6),
    "apr_percent": round(apr * 100, 3)}

    result["loan_options"] = loan_options

    return result

@app.post("/predict_1")
def predict_1(payload: dict = Body(...)):
    row = pd.DataFrame([payload]).astype(schema, errors="ignore")

    # synthesize missing features
    row_full = synthesize_bureau_fields(row)

    print("done till here")

    # only pass model features to model
    X = row_full[MODEL_FEATURES].astype(schema, errors="ignore")
    X, explainer, pred = model.predict(X)
    print("model pred done")
    
    # --- New: Risk-based pricing and FOIR-based loan amounts ---
    pd_prob = float(pred.loc[0, "calibrated_probability"])
    apr = compute_risk_based_rate(pd_prob)
    print("calibration done")

    monthly_income = float(row_full["MonthlyIncome"].iloc[0]) if "MonthlyIncome" in row_full else 0.0
    debt_ratio = float(row_full["DebtRatio"].iloc[0]) if "DebtRatio" in row_full else 0.0
    loan_options = calculate_loan_options(monthly_income, debt_ratio, apr)
    print("calibration done 1")

    result = build_response(X, pred, explainer, row_full.iloc[0])
    print("calibration done 2")
    result["pricing"] = {
    "pd": round(pd_prob, 6),
    "apr_decimal": round(apr, 6),
    "apr_percent": round(apr * 100, 3)}
    
    result["loan_options"] = loan_options

    return result

@app.get("/health")
def health():
    return {"status": "ok"}

def run():
    nest_asyncio.apply()
    uvicorn.run(app, host="0.0.0.0", port=8000)
