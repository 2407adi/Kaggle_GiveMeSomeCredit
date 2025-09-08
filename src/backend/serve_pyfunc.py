import os
import pandas as pd
import numpy as np
import mlflow
import mlflow.pyfunc
import xgboost as xgb

from preprocess import preprocess_input
from utils import prob_to_log_odds, log_odds_to_score, to_2d_frame

class CreditRiskPyFunc(mlflow.pyfunc.PythonModel):
    """
    PyFunc wrapper that:
      - expects inputs with columns: ["age", "income"]
      - builds features (adds "income_age_ratio")
      - loads the underlying XGBoost model from an MLflow artifact URI
      - returns probability and a credit-score-like number
    """

    def load_context(self, context):
        # We pass the XGBoost MLflow artifact URI as an artifact named "xgb_model_uri"
        self.xgb_model_uri = context.artifacts["xgb_model_uri"]
        # Load the native XGBoost booster via MLflow flavor load
        self.booster = mlflow.xgboost.load_model(self.xgb_model_uri)

    def predict(self, context, model_input):
        df_in = to_2d_frame(model_input)
        X = preprocess_input(df_in)
        dmat = xgb.DMatrix(X.values, feature_names=list(X.columns))

        # If self.booster is XGBClassifier, access probas; if Booster, call predict
        if hasattr(self.booster, "predict_proba"):
            prob = self.booster.predict_proba(X)[:, 1]
        else:
            prob = self.booster.predict(dmat)

        log_odds = prob_to_log_odds(prob)
        score = log_odds_to_score(log_odds, base=float(os.getenv("SCORE_BASE", "600")),
                                  factor=float(os.getenv("SCORE_FACTOR", "50")))

        return pd.DataFrame({
            "probability": prob,
            "log_odds": log_odds,
            "credit_score": score
        })
