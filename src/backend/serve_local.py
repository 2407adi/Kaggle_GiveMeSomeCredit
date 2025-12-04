from fastapi import FastAPI, Body
import pandas as pd
import nest_asyncio
import uvicorn
import os
import mlflow
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env file (only needed for local/dev)
load_dotenv()

# Read secrets from env
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")
MODEL_URI = os.getenv("MODEL_URI")

os.environ["DATABRICKS_HOST"] = DATABRICKS_HOST
os.environ["DATABRICKS_TOKEN"] = DATABRICKS_TOKEN
mlflow.set_registry_uri("databricks-uc")

# Load model from registry
model = mlflow.pyfunc.load_model(MODEL_URI)

app = FastAPI(title="Credit Risk Model (local)")

# Allow frontend to call backend (adjust origins as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # vite dev
        "http://localhost:8080",   # nginx prod
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def to_float(val):
    try:
        return float(val) if val is not None else None
    except ValueError:
        return None
    
def to_int(val):
    try:
        return int(val) if val is not None else None
    except ValueError:
        return None

@app.post("/predict")
def predict(data: dict = Body(...)):
    row = {
        'RevolvingUtilizationOfUnsecuredLines': to_float(data.get('RevolvingUtilizationOfUnsecuredLines')),
        'age': to_int(data.get('age')),
        'NumberOfTime30_59DaysPastDueNotWorse': to_int(data.get('NumberOfTime30_59DaysPastDueNotWorse')),
        'DebtRatio': to_float(data.get('DebtRatio')),
        'MonthlyIncome': to_float(data.get('MonthlyIncome')),
        'NumberOfOpenCreditLinesAndLoans': to_int(data.get('NumberOfOpenCreditLinesAndLoans')),
        'NumberOfTimes90DaysLate': to_int(data.get('NumberOfTimes90DaysLate')),
        'NumberRealEstateLoansOrLines': to_int(data.get('NumberRealEstateLoansOrLines')),
        'NumberOfTime60_89DaysPastDueNotWorse': to_int(data.get('NumberOfTime60_89DaysPastDueNotWorse')),
        'NumberOfDependents': to_float(data.get('NumberOfDependents'))
        # 'CreditUtilizationPerLine': to_float(data.get('CreditUtilizationPerLine')),
        # 'DebtBurdenPerDependent': to_float(data.get('DebtBurdenPerDependent')),
        # 'SeriousDelinqRate': to_float(data.get('SeriousDelinqRate')),
        # 'RealEstateLoanShare': to_float(data.get('RealEstateLoanShare')),
        # 'AgePerCreditLine': to_float(data.get('AgePerCreditLine')),
    }

    X = pd.DataFrame([row])
    print(X)
    X, explainer, pred = model.predict(X)

    result = {
        "probability": float(pred.loc[0, 'probability']),
        "log_odds": float(pred.loc[0, 'log_odds']),
        "credit_score": float(pred.loc[0, 'credit_score'])
    }
    return result

@app.get("/health")
def health():
    return {"status": "ok"}

def run():
    nest_asyncio.apply()
    uvicorn.run(app, host="0.0.0.0", port=8000)
