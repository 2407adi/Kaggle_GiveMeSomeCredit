import numpy as np
import pandas as pd
from skopt.space import Real, Integer


# --- Constants ---
COST_OF_FUNDS = 0.08
OPEX = 0.01
ROA = 0.02
FOIR_CAP = 0.60  # 60% affordability ceiling
TENURE_OPTIONS = [6, 12, 18, 24]  # months


def load_training_data(TRAIN_PATH) -> pd.DataFrame:
    df = pd.read_csv(TRAIN_PATH)
    return df

def prob_to_log_odds(prob: np.ndarray, eps: float = 1e-9) -> np.ndarray:
    """Convert probability to log-odds safely."""
    p = np.clip(1-prob, eps, 1 - eps)
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
    'learning_rate': Real(0.001, 0.1, prior='log-uniform'),  # Smaller range for log-scale
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


# --- 1️⃣ Risk-based pricing ---
def compute_risk_based_rate(pd_prob: float) -> float:
    """
    Calculates annualized interest rate based on risk-adjusted formula:
    rate = PD + CoF + Opex + RoA
    Clamped between 11% and 36%.
    """
    base = COST_OF_FUNDS + OPEX + ROA
    apr = base + float(pd_prob)
    return float(np.clip(apr, base, 0.36))


# --- 2️⃣ Loan amount calculator (per tenure) ---
def emi(principal: float, annual_rate: float, tenure_months: int) -> float:
    """Standard EMI formula."""
    r = annual_rate / 12.0
    if r <= 0 or tenure_months <= 0:
        return 0.0
    f = (1 + r) ** tenure_months
    return principal * r * f / (f - 1)


def principal_from_emi(emi_amt: float, annual_rate: float, tenure_months: int) -> float:
    """Inverse EMI: given EMI, rate, tenure -> principal."""
    r = annual_rate / 12.0
    if r <= 0 or tenure_months <= 0:
        return emi_amt * tenure_months
    f = (1 + r) ** tenure_months
    return emi_amt * (f - 1) / (r * f)


def calculate_loan_options(monthly_income: float,
                           debt_ratio: float,
                           annual_rate: float,
                           foir_cap: float = FOIR_CAP,
                           tenures: list[int] = TENURE_OPTIONS):
    """
    Calculates maximum loan amount affordable at each tenure,
    assuming FOIR cap (e.g., 60% of income).
    DebtRatio ≈ current FOIR.
    """
    results = []
    if monthly_income <= 0:
        return results

    # Current obligations
    current_emi = monthly_income * debt_ratio

    # Headroom for new EMI
    max_new_emi = max(0.0, foir_cap * monthly_income - current_emi)

    for tenure in tenures:
        principal = principal_from_emi(max_new_emi, annual_rate, tenure)
        results.append({
            "tenure_months": tenure,
            "approved_loan_amount": round(principal, 2),
            "max_new_emi": round(max_new_emi, 2),
            "foir_used": round(debt_ratio, 3)
        })

    return results
