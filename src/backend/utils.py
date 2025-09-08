import numpy as np
import pandas as pd
from skopt.space import Real, Integer

def load_training_data(TRAIN_PATH) -> pd.DataFrame:
    df = pd.read_csv(TRAIN_PATH)
    return df

def prob_to_log_odds(prob: np.ndarray, eps: float = 1e-9) -> np.ndarray:
    """Convert probability to log-odds safely."""
    p = np.clip(prob, eps, 1 - eps)
    return np.log(p / (1 - p))

def log_odds_to_score(log_odds: np.ndarray, base: float = 600.0, factor: float = 50.0) -> np.ndarray:
    """Map log-odds to a credit-score-like scale. Tweak base/factor to taste."""
    return base + factor * log_odds

def to_2d_frame(X):
    """Ensure input is a 2D pandas DataFrame (for predict pipelines)."""
    if isinstance(X, pd.DataFrame):
        return X
    if isinstance(X, dict):
        return pd.DataFrame([X])
    if isinstance(X, (list, tuple)):
        return pd.DataFrame(X)
    raise ValueError("Unsupported input type for predict; pass dict / list[dict] / DataFrame.")

def build_search_space():
    return {
    # --- Learning Parameters ---
    'learning_rate': Real(0.001, 0.2, prior='log-uniform'),  # Smaller range for log-scale
    'n_estimators': Integer(100, 500),  # Boosting rounds

    # --- Tree Structure ---
    'max_depth': Integer(2, 8),  # Depth of tree
    'min_child_weight': Integer(1, 20),  # Min sum of instance weight in child
    'gamma': Real(0, 10, prior='uniform'),  # Min loss reduction to split
    'max_leaves': Integer(0, 256),  # 0 means no limit

    # --- Subsampling ---
    'subsample': Real(0.4, 1.0, prior='uniform'),  # Row sampling
    'colsample_bytree': Real(0.4, 1.0, prior='uniform'),  # Feature sampling (per tree)
    'colsample_bylevel': Real(0.4, 1.0, prior='uniform'),  # Feature sampling (per level)
    'colsample_bynode': Real(0.4, 1.0, prior='uniform'),  # Feature sampling (per split)

    # --- Regularization ---
    'reg_alpha': Real(0, 50, prior='uniform'),  # L1 regularization
    'reg_lambda': Real(0, 50, prior='uniform'),  # L2 regularization
    'scale_pos_weight': Real(10, 20, prior='log-uniform'),  # Class imbalance adjustment
}
