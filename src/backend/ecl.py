"""IFRS 9 ECL and Basel III (finalized) A-IRB retail capital calculations.

Pure functions, no FastAPI/model dependencies. The borrower's calibrated
12-month PD from the XGBoost model is the single risk input; everything else
is loan structure (amount, tenure, APR) plus documented regulatory assumptions.

References:
- BIS CRE31.15-16 — IRB risk-weight function and asset correlation for
  "other retail" exposures (no maturity adjustment, no 1.06 scalar in the
  finalized framework).
- BIS CRE20 — standardised approach, 75% risk weight for regulatory retail.
- Basel III finalized (d424) — input floors (PD 0.05%, unsecured retail
  LGD 30%) and the 72.5% output floor on standardised RWA.
- IFRS 9 — three-stage ECL with the 30-days-past-due SICR backstop.
"""

import math

from scipy.stats import norm

from utils import emi

# --- Regulatory and modelling assumptions ---
LGD_DEFAULT = 0.55          # unsecured consumer lending, mid-range assumption
LGD_FLOOR = 0.30            # Basel III A-IRB floor, unsecured retail
PD_FLOOR = 0.0005           # Basel III A-IRB retail PD floor (0.05%)
SA_RISK_WEIGHT = 0.75       # CRE20 regulatory retail
OUTPUT_FLOOR = 0.725        # Basel 3.1 output floor (fully phased, 2030)
PILLAR1_RATIO = 0.08        # minimum total capital ratio
CCB_TOTAL_RATIO = 0.105     # 8% + 2.5% capital conservation buffer
COST_OF_EQUITY = 0.15       # hurdle rate on regulatory capital
STAGE2_PD_THRESHOLD = 0.20  # 12m PD level treated as SICR

# Upfront origination fee. SAMA caps it at the lower of 1% of the financing
# amount or SAR 5,000 (Responsible Lending / Fees Guide). It is a fixed,
# per-loan charge that recovers origination cost regardless of tenure, which
# is what makes short-tenure loans viable.
PROCESSING_FEE_RATE = 0.01
PROCESSING_FEE_CAP = 5000.0


def assign_stage(pd_12m, n_30_59=0, n_60_89=0, n_90_plus=0, override=None):
    """Map delinquency history + PD to an IFRS 9 stage. Returns (stage, reason)."""
    if override in (1, 2, 3):
        return override, f"Stage {override} set by analyst override"
    if n_90_plus > 0:
        return 3, "Borrower has 90+ days-past-due history (credit-impaired proxy)"
    if n_30_59 > 0 or n_60_89 > 0:
        return 2, "Past-due history of 30+ days (IFRS 9 30 DPD SICR backstop)"
    if pd_12m >= STAGE2_PD_THRESHOLD:
        return 2, f"12-month PD {pd_12m:.1%} >= {STAGE2_PD_THRESHOLD:.0%} SICR threshold"
    return 1, "No significant increase in credit risk detected"


def monthly_hazard(pd_12m):
    """Constant monthly default hazard implied by a 12-month PD."""
    pd_12m = min(max(pd_12m, 0.0), 1.0 - 1e-12)
    return 1.0 - (1.0 - pd_12m) ** (1.0 / 12.0)


def amortization_balances(principal, annual_rate, tenure_months):
    """Opening outstanding balance for each month 1..tenure (the EAD path)."""
    payment = emi(principal, annual_rate, tenure_months)
    r = annual_rate / 12.0
    balances = []
    balance = principal
    for _ in range(tenure_months):
        balances.append(balance)
        balance = max(0.0, balance * (1 + r) - payment)
    return balances


def expected_credit_loss(pd_12m, lgd, principal, annual_rate, tenure_months,
                         horizon_months=None):
    """Discounted expected credit loss over the horizon (lifetime if None).

    ECL = sum_t survival_{t-1} * pd_monthly * LGD * EAD_t / (1 + EIR/12)^t
    with EIR taken as the loan APR (IFRS 9 discounts at the effective rate).
    """
    if principal <= 0 or tenure_months <= 0:
        return 0.0
    horizon = tenure_months if horizon_months is None else min(horizon_months, tenure_months)
    pd_m = monthly_hazard(pd_12m)
    balances = amortization_balances(principal, annual_rate, tenure_months)
    r = annual_rate / 12.0
    ecl = 0.0
    survival = 1.0
    for t in range(1, horizon + 1):
        marginal_pd = survival * pd_m
        ecl += marginal_pd * lgd * balances[t - 1] / (1 + r) ** t
        survival *= 1.0 - pd_m
    return ecl


def basel_correlation_other_retail(pd):
    """Asset correlation R for "other retail" (CRE31.16): 0.03 -> 0.16 in PD."""
    w = (1 - math.exp(-35 * pd)) / (1 - math.exp(-35))
    return 0.03 * w + 0.16 * (1 - w)


def basel_capital_k(pd, lgd):
    """Capital requirement K per unit EAD (CRE31.15, retail: no maturity adj.)."""
    r = basel_correlation_other_retail(pd)
    conditional_pd = float(norm.cdf(
        (norm.ppf(pd) + math.sqrt(r) * norm.ppf(0.999)) / math.sqrt(1 - r)
    ))
    return lgd * conditional_pd - pd * lgd


def irb_capital(pd_12m, lgd, ead):
    """A-IRB risk weight and RWA with Basel III input floors applied."""
    pd_used = min(max(pd_12m, PD_FLOOR), 1.0 - 1e-9)
    lgd_used = max(lgd, LGD_FLOOR)
    k = basel_capital_k(pd_used, lgd_used)
    return {
        "pd_used": pd_used,
        "lgd_used": lgd_used,
        "pd_floor_applied": pd_12m < PD_FLOOR,
        "lgd_floor_applied": lgd < LGD_FLOOR,
        "correlation_R": basel_correlation_other_retail(pd_used),
        "capital_K": k,
        "risk_weight_pct": k * 12.5 * 100,
        "rwa_irb": k * 12.5 * ead,
    }


def rwa_with_output_floor(rwa_irb, ead):
    """Final RWA = max(IRB RWA, 72.5% of standardised RWA)."""
    rwa_sa = SA_RISK_WEIGHT * ead
    floored = OUTPUT_FLOOR * rwa_sa
    return {
        "rwa_sa": rwa_sa,
        "rwa_final": float(max(rwa_irb, floored)),
        "output_floor_binding": bool(floored > rwa_irb),
    }


def processing_fee(principal):
    """Upfront origination fee: 1% of principal, capped at SAR 5,000 (SAMA)."""
    return min(PROCESSING_FEE_RATE * principal, PROCESSING_FEE_CAP)


def profitability_check(principal, annual_rate, tenure_months, ecl_lifetime,
                        capital_with_ccb):
    """Do interest income + the upfront fee cover funding, opex, EL and capital?"""
    from utils import COST_OF_FUNDS, OPEX

    payment = emi(principal, annual_rate, tenure_months)
    interest_income = payment * tenure_months - principal
    fee_income = processing_fee(principal)
    balances = amortization_balances(principal, annual_rate, tenure_months)
    avg_balance = sum(balances) / len(balances) if balances else 0.0
    years = tenure_months / 12.0
    funding_cost = COST_OF_FUNDS * avg_balance * years
    opex_cost = OPEX * principal
    capital_cost = capital_with_ccb * COST_OF_EQUITY * years
    net_margin = (interest_income + fee_income
                  - funding_cost - opex_cost - ecl_lifetime - capital_cost)
    return {
        "interest_income": interest_income,
        "processing_fee": fee_income,
        "funding_cost": funding_cost,
        "opex_cost": opex_cost,
        "expected_loss": ecl_lifetime,
        "capital_cost": capital_cost,
        "net_margin": float(net_margin),
        "viable": bool(net_margin > 0),
    }


def compute_ecl_suite(pd_12m, apr_decimal, loan_options, delinquency=None,
                      lgd=LGD_DEFAULT, stage_override=None):
    """Full ECL + Basel capital view for each offered loan option.

    loan_options: [{"tenure_months": int, "approved_loan_amount": float}, ...]
    delinquency:  {"n_30_59": float, "n_60_89": float, "n_90_plus": float}
    """
    pd_12m = min(max(float(pd_12m), 1e-9), 1.0 - 1e-9)
    delinquency = delinquency or {}
    stage, stage_reason = assign_stage(
        pd_12m,
        n_30_59=delinquency.get("n_30_59", 0) or 0,
        n_60_89=delinquency.get("n_60_89", 0) or 0,
        n_90_plus=delinquency.get("n_90_plus", 0) or 0,
        override=stage_override,
    )

    results = []
    for option in loan_options:
        tenure = int(option["tenure_months"])
        principal = float(option["approved_loan_amount"])
        if principal <= 0 or tenure <= 0:
            results.append({
                "tenure_months": tenure,
                "loan_amount": principal,
                "note": "No loan amount available for this tenure",
            })
            continue

        ecl_12m = expected_credit_loss(pd_12m, lgd, principal, apr_decimal,
                                       tenure, horizon_months=12)
        ecl_lifetime = expected_credit_loss(pd_12m, lgd, principal, apr_decimal,
                                            tenure)
        if stage == 3:
            # Defaulted exposure: loss is no longer probability-weighted
            provision = lgd * principal
        elif stage == 2:
            provision = ecl_lifetime
        else:
            provision = ecl_12m

        capital = irb_capital(pd_12m, lgd, principal)
        floor = rwa_with_output_floor(capital["rwa_irb"], principal)
        capital_pillar1 = PILLAR1_RATIO * floor["rwa_final"]
        capital_with_ccb = CCB_TOTAL_RATIO * floor["rwa_final"]

        results.append({
            "tenure_months": tenure,
            "loan_amount": round(principal, 2),
            "ecl_12m": round(ecl_12m, 2),
            "ecl_lifetime": round(ecl_lifetime, 2),
            "provision": round(provision, 2),
            "provision_pct_of_loan": round(100 * provision / principal, 2),
            "basel": {
                "pd_used": round(capital["pd_used"], 6),
                "lgd_used": capital["lgd_used"],
                "pd_floor_applied": capital["pd_floor_applied"],
                "lgd_floor_applied": capital["lgd_floor_applied"],
                "correlation_R": round(capital["correlation_R"], 4),
                "capital_K": round(capital["capital_K"], 4),
                "risk_weight_pct": round(capital["risk_weight_pct"], 1),
                "rwa_irb": round(capital["rwa_irb"], 2),
                "rwa_sa": round(floor["rwa_sa"], 2),
                "rwa_final": round(floor["rwa_final"], 2),
                "output_floor_binding": floor["output_floor_binding"],
                "capital_pillar1": round(capital_pillar1, 2),
                "capital_with_ccb": round(capital_with_ccb, 2),
                "capital_pct_of_loan": round(100 * capital_with_ccb / principal, 2),
            },
            "profitability": {
                k: (round(v, 2) if isinstance(v, float) else v)
                for k, v in profitability_check(
                    principal, apr_decimal, tenure, ecl_lifetime, capital_with_ccb
                ).items()
            },
        })

    return {
        "stage": stage,
        "stage_reason": stage_reason,
        "results": results,
        "assumptions": {
            "lgd": lgd,
            "pd_floor": PD_FLOOR,
            "lgd_floor": LGD_FLOOR,
            "hazard_model": "constant monthly hazard derived from the 12-month PD",
            "eir": "loan APR, monthly discounting",
            "sa_risk_weight": SA_RISK_WEIGHT,
            "output_floor": OUTPUT_FLOOR,
            "pillar1_ratio": PILLAR1_RATIO,
            "ccb_total_ratio": CCB_TOTAL_RATIO,
            "cost_of_equity": COST_OF_EQUITY,
            "processing_fee_rate": PROCESSING_FEE_RATE,
            "processing_fee_cap": PROCESSING_FEE_CAP,
            "stage3_provision": "LGD x EAD (defaulted exposure)",
            "asset_class": "A-IRB other retail (BIS CRE31.15-16)",
        },
    }
