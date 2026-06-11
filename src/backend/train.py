"""
Train the credit-risk model locally and save artifacts for the server.

Replicates the original Databricks notebook pipeline (GiveMeSomeCredit.ipynb)
without MLflow: XGBoost with the hyperparameters tuned in the original run
(test AUC ~0.868), plus a sigmoid calibration layer fit on a holdout split.

Usage:
    python train.py                       # train with the tuned params (~1-2 min)
    python train.py --tune                # re-run BayesSearchCV (slow; needs scikit-optimize)
    python train.py --data path/to.csv    # custom training data

Outputs (in --out, default ./model):
    xgb_model.joblib    - fitted XGBClassifier
    calibrator.joblib   - CalibratedClassifierCV (sigmoid, prefit)
    metadata.json       - params, AUCs, feature list, train date

Also regenerates data/train_predictions.parquet (calibrated scores over the
full training set) used by the server as the percentile reference population.
"""
import argparse
import json
import os
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from preprocess import preprocess_input
from utils import load_training_data

SEED = 42
TARGET_COL = "SeriousDlqin2yrs"

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA = os.path.join(BACKEND_DIR, "..", "..", "data", "cs-training.csv")
DEFAULT_OUT = os.path.join(BACKEND_DIR, "model")

# Best hyperparameters from the original BayesSearchCV run
# (mlruns run 919dcb71d14a44119fc133704f71a501, cv_auc 0.8648, test_auc 0.8683)
TUNED_PARAMS = {
    "colsample_bylevel": 0.6460623753119883,
    "colsample_bynode": 0.836635445906395,
    "colsample_bytree": 0.9597207993087004,
    "gamma": 3.1579959348704874,
    "learning_rate": 0.03483618036871094,
    "max_depth": 4,
    "max_leaves": 90,
    "min_child_weight": 15,
    "n_estimators": 222,
    "reg_alpha": 32.38957941734388,
    "reg_lambda": 27.498197090489207,
    "scale_pos_weight": 10.918947649884663,
    "subsample": 0.5068503510376384,
}


def load_features(data_path: str):
    raw = load_training_data(data_path)
    raw.columns = ['Unnamed: 0', 'SeriousDlqin2yrs',
                   'RevolvingUtilizationOfUnsecuredLines', 'age',
                   'NumberOfTime30_59DaysPastDueNotWorse', 'DebtRatio', 'MonthlyIncome',
                   'NumberOfOpenCreditLinesAndLoans', 'NumberOfTimes90DaysLate',
                   'NumberRealEstateLoansOrLines', 'NumberOfTime60_89DaysPastDueNotWorse',
                   'NumberOfDependents']
    X_raw = raw.drop(columns=[TARGET_COL, 'Unnamed: 0'])
    y = raw[TARGET_COL].astype(int)

    # all-float so NaNs survive
    X_raw = X_raw.astype({col: 'float' for col in X_raw.columns})
    X = preprocess_input(X_raw)
    return X, y


def build_model(args, X_train, y_train):
    base = XGBClassifier(
        objective="binary:logistic",
        eval_metric="auc",
        tree_method="hist",
        random_state=SEED,
        n_jobs=-1,
        **({} if args.tune else TUNED_PARAMS),
    )

    if not args.tune:
        return base, TUNED_PARAMS

    # Lazy import: scikit-optimize is only needed for --tune
    from skopt import BayesSearchCV
    from sklearn.model_selection import StratifiedKFold
    from utils import build_search_space

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    opt = BayesSearchCV(
        estimator=base,
        search_spaces=build_search_space(),
        scoring="roc_auc",
        cv=cv,
        n_iter=int(os.getenv("BAYES_N_ITER", "100")),
        n_jobs=-1,
        verbose=1,
        random_state=SEED,
        refit=True,
    )
    opt.fit(X_train, y_train)
    print(f"Bayes search best CV AUC: {opt.best_score_:.4f}")
    return opt.best_estimator_, dict(opt.best_params_)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default=DEFAULT_DATA, help="training CSV path")
    parser.add_argument("--out", default=DEFAULT_OUT, help="artifact output directory")
    parser.add_argument("--tune", action="store_true",
                        help="re-run BayesSearchCV instead of using the tuned params")
    args = parser.parse_args()

    print(f"Loading training data from {os.path.abspath(args.data)} ...")
    X, y = load_features(args.data)
    print(f"{len(X)} rows, {X.shape[1]} features (10 raw + 5 engineered)")

    # Same split scheme as the notebook: 75/25 test split,
    # then a 20% calibration holdout carved from the training portion.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, stratify=y, random_state=SEED)
    X_train_sub, X_calib, y_train_sub, y_calib = train_test_split(
        X_train, y_train, test_size=0.2, random_state=42, stratify=y_train)

    model, params = build_model(args, X_train_sub, y_train_sub)
    if not args.tune:
        print("Training XGBoost with tuned hyperparameters ...")
        model.fit(X_train_sub, y_train_sub)

    print("Fitting sigmoid calibration layer on the holdout split ...")
    calibrator = CalibratedClassifierCV(estimator=model, method="sigmoid", cv="prefit")
    calibrator.fit(X_calib, y_calib)

    raw_auc = roc_auc_score(y_test, model.predict_proba(X_test)[:, 1])
    cal_auc = roc_auc_score(y_test, calibrator.predict_proba(X_test)[:, 1])
    print(f"Raw Test AUC: {raw_auc:.4f} | Calibrated Test AUC: {cal_auc:.4f}")

    os.makedirs(args.out, exist_ok=True)
    joblib.dump(model, os.path.join(args.out, "xgb_model.joblib"))
    joblib.dump(calibrator, os.path.join(args.out, "calibrator.joblib"))

    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "data": os.path.abspath(args.data),
        "n_rows": int(len(X)),
        "features": list(X.columns),
        "params": {k: (float(v) if isinstance(v, (int, float, np.floating)) else v)
                   for k, v in params.items()},
        "raw_test_auc": round(float(raw_auc), 6),
        "calibrated_test_auc": round(float(cal_auc), 6),
        "seed": SEED,
    }
    with open(os.path.join(args.out, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Artifacts saved to {os.path.abspath(args.out)}")

    # Percentile reference population for the server (calibrated probs over
    # the full training set; serve_local_2 reads column 'score').
    ref_path = os.path.join(BACKEND_DIR, "data", "train_predictions.parquet")
    train_preds = calibrator.predict_proba(X)[:, 1]
    pd.DataFrame({"score": train_preds, "label": y}, index=y.index).to_parquet(ref_path)
    print(f"Regenerated percentile reference: {ref_path}")


if __name__ == "__main__":
    main()
