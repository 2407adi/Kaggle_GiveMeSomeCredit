import os
import json

import joblib
import numpy as np
import pandas as pd
import shap

from preprocess import preprocess_input
from utils import prob_to_log_odds, log_odds_to_score, to_2d_frame


class LocalCreditRiskModel:
    """
    Local replacement for the MLflow CreditRiskPyFunc wrapper.

    Loads the XGBoost classifier and calibrator from a directory of joblib
    artifacts (produced by train.py) and exposes the same predict() contract
    the server expects:

        X_preprocessed, shap_explainer, results_df = model.predict(input)

    where results_df has columns: raw_probability, calibrated_probability,
    log_odds, credit_score.
    """

    def __init__(self, model_dir: str = "model"):
        model_path = os.path.join(model_dir, "xgb_model.joblib")
        calib_path = os.path.join(model_dir, "calibrator.joblib")

        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Model artifact not found at '{model_path}'. "
                "Run `python train.py` in src/backend to generate it."
            )

        self.booster = joblib.load(model_path)

        self.calibrator = None
        if os.path.exists(calib_path):
            try:
                self.calibrator = joblib.load(calib_path)
            except Exception as e:
                print(f"Failed to load calibrator '{calib_path}': {e}")

        self.metadata = {}
        meta_path = os.path.join(model_dir, "metadata.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                self.metadata = json.load(f)

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
            if hasattr(self.calibrator, "predict_proba"):
                cal_probs = self.calibrator.predict_proba(X)[:, 1]
                return np.asarray(cal_probs, dtype=float)

            if hasattr(self.calibrator, "predict"):
                cal_probs = self.calibrator.predict(X)
                return np.asarray(cal_probs, dtype=float)

            if callable(self.calibrator):
                return np.array(self.calibrator(X)).astype(float)

        except Exception as e:
            print("Warning: calibrator application failed - returning raw probs. Error:", e)
            return raw_probs

        return raw_probs

    def predict(self, model_input):
        df_in = to_2d_frame(model_input)
        X = preprocess_input(df_in)

        raw_prob = self.booster.predict_proba(X)[:, 1]
        try:
            explainer = shap.TreeExplainer(self.booster)
        except Exception:
            explainer = None

        calibrated_prob = self._apply_calibrator(X, raw_prob)

        log_odds = prob_to_log_odds(raw_prob)
        score = log_odds_to_score(
            log_odds,
            base=float(os.getenv("SCORE_BASE", "600")),
            factor=float(os.getenv("SCORE_FACTOR", "50"))
        )

        results = pd.DataFrame({
            "raw_probability": np.asarray(raw_prob).reshape(-1,),
            "calibrated_probability": np.asarray(calibrated_prob).reshape(-1,),
            "log_odds": np.asarray(log_odds).reshape(-1,),
            "credit_score": np.asarray(score).reshape(-1,)
        })

        return X, explainer, results
