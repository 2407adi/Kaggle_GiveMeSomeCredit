import os
import pandas as pd
import numpy as np
import mlflow
import mlflow.pyfunc
import xgboost as xgb
import shap
import joblib

from preprocess import preprocess_input
from utils import prob_to_log_odds, log_odds_to_score, to_2d_frame


class CreditRiskPyFunc(mlflow.pyfunc.PythonModel):
    """
    PyFunc wrapper that:
     - preprocesses inputs (via your preprocess_input)
     - loads XGBoost model and optional calibrator
     - returns raw_prob, calibrated_prob, log_odds, credit_score
     - returns explainer (shap.TreeExplainer) when possible
    """

    def load_context(self, context):
        # Load xgboost model artifact reference (this is the "runs:/<run-id>/xgb_model" string)
        self.xgb_model_uri = context.artifacts.get("xgb_model_uri")
        if not self.xgb_model_uri:
            raise ValueError("xgb_model_uri artifact missing in context.artifacts")

        self.booster = mlflow.xgboost.load_model(self.xgb_model_uri)

        # Attempt to load a calibrator artifact if provided
        self.calibrator = None
        calib_path = context.artifacts.get("calibrator_path")
        if calib_path:
            try:
                self.calibrator = joblib.load(calib_path)
                print("Loaded calibrator:", calib_path)
            except Exception as e:
                print("Failed to load calibrator artifact:", e)
                self.calibrator = None

    def _apply_calibrator(self, X, raw_probs) -> np.ndarray:
        """
        Apply calibrator in a defensive manner. Supports:
        - CalibratedClassifierCV or other objects with predict_proba(X) -> [:,1]
        - sklearn regressors like IsotonicRegression with predict(X) -> calibrated probs
        - simple callables that accept array-like
        """
        if self.calibrator is None:
            return raw_probs

        try:
            # If has predict_proba (CalibratedClassifierCV, sklearn classifier)
            if hasattr(self.calibrator, "predict_proba"):
                # calibrator expects 2D input for sklearn: reshape raw_probs to (-1,1)
                cal_probs = self.calibrator.predict_proba(X)[:, 1]
                return np.asarray(cal_probs, dtype=float)

            # If has predict
            if hasattr(self.calibrator, "predict"):
                # Some calibrators (IsotonicRegression) expect 1D input
                cal_probs = self.calibrator.predict(X)
                return np.asarray(cal_probs, dtype=float)

            # If it's callable
            if callable(self.calibrator):
                cal_probs = np.array(self.calibrator(X))
                return cal_probs.astype(float)

        except Exception as e:
            print("Warning: calibrator application failed - returning raw probs. Error:", e)
            return raw_probs

        # fallback
        return raw_probs

    def predict(self, context, model_input):
        # normalize input to 2D DataFrame
        df_in = to_2d_frame(model_input)
        X = preprocess_input(df_in)

        # Get explanatory object and raw probabilities
        if hasattr(self.booster, "predict_proba"):
            # scikit-learn wrapper (XGBClassifier)
            raw_prob = self.booster.predict_proba(X)[:, 1]
            try:
                explainer = shap.TreeExplainer(self.booster)
            except Exception:
                explainer = None
        else:
            # native xgboost Booster
            dmat = xgb.DMatrix(X.values, feature_names=list(X.columns))
            raw_prob = self.booster.predict(dmat)
            try:
                explainer = shap.TreeExplainer(self.booster)
            except Exception:
                explainer = None

        # Apply calibrator if present
        calibrated_prob = self._apply_calibrator(X, raw_prob)

        # compute log-odds & score using calibrated_prob
        log_odds = prob_to_log_odds(raw_prob)
        score = log_odds_to_score(
            log_odds,
            base=float(os.getenv("SCORE_BASE", "600")),
            factor=float(os.getenv("SCORE_FACTOR", "50"))
        )

        # return X (features after preprocess), explainer, results DataFrame
        import pandas as pd
        results = pd.DataFrame({
            "raw_probability": np.asarray(raw_prob).reshape(-1,),
            "calibrated_probability": np.asarray(calibrated_prob).reshape(-1,),
            "log_odds": np.asarray(log_odds).reshape(-1,),
            "credit_score": np.asarray(score).reshape(-1,)
        })

        return X, explainer, results
