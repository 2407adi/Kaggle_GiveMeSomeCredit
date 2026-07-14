"""Unit tests for ecl.py. Run with: pytest test_ecl.py (dev-only dependency)."""

import math

import pytest

import ecl


def test_monthly_hazard_inverts_to_12m_pd():
    pd_12m = 0.034
    pd_m = ecl.monthly_hazard(pd_12m)
    assert (1 - pd_m) ** 12 == pytest.approx(1 - pd_12m, rel=1e-9)


def test_amortization_starts_at_principal_and_ends_near_zero():
    balances = ecl.amortization_balances(10000, 0.15, 12)
    assert len(balances) == 12
    assert balances[0] == pytest.approx(10000)
    payment = balances[-1] * (1 + 0.15 / 12)
    # last opening balance should be paid off by one final EMI
    from utils import emi
    assert payment == pytest.approx(emi(10000, 0.15, 12), rel=1e-6)


def test_ecl_12m_equals_lifetime_for_short_tenures():
    for tenure in (6, 12):
        full = ecl.expected_credit_loss(0.05, 0.55, 20000, 0.15, tenure)
        capped = ecl.expected_credit_loss(0.05, 0.55, 20000, 0.15, tenure,
                                          horizon_months=12)
        assert capped == pytest.approx(full)


def test_ecl_lifetime_exceeds_12m_for_long_tenures():
    full = ecl.expected_credit_loss(0.05, 0.55, 20000, 0.15, 24)
    capped = ecl.expected_credit_loss(0.05, 0.55, 20000, 0.15, 24,
                                      horizon_months=12)
    assert full > capped


def test_ecl_monotone_in_pd_and_lgd():
    base = ecl.expected_credit_loss(0.03, 0.55, 20000, 0.15, 24)
    assert ecl.expected_credit_loss(0.06, 0.55, 20000, 0.15, 24) > base
    assert ecl.expected_credit_loss(0.03, 0.70, 20000, 0.15, 24) > base


def test_basel_correlation_bounds():
    assert ecl.basel_correlation_other_retail(1e-9) == pytest.approx(0.16, abs=1e-6)
    assert ecl.basel_correlation_other_retail(0.9999) == pytest.approx(0.03, abs=1e-3)


def test_basel_k_spot_check():
    # Hand-computed for PD=1%, LGD=55%: R=0.121609, K=0.04477
    assert ecl.basel_correlation_other_retail(0.01) == pytest.approx(0.121609, abs=1e-5)
    assert ecl.basel_capital_k(0.01, 0.55) == pytest.approx(0.04477, abs=1e-4)


def test_irb_floors_applied():
    out = ecl.irb_capital(0.0001, 0.20, 10000)
    assert out["pd_floor_applied"] and out["pd_used"] == ecl.PD_FLOOR
    assert out["lgd_floor_applied"] and out["lgd_used"] == ecl.LGD_FLOOR


def test_output_floor_binds_at_low_pd():
    capital = ecl.irb_capital(ecl.PD_FLOOR, 0.55, 10000)
    floor = ecl.rwa_with_output_floor(capital["rwa_irb"], 10000)
    assert floor["output_floor_binding"]
    assert floor["rwa_final"] == pytest.approx(0.725 * 0.75 * 10000)


def test_output_floor_not_binding_at_high_pd():
    capital = ecl.irb_capital(0.10, 0.55, 10000)
    floor = ecl.rwa_with_output_floor(capital["rwa_irb"], 10000)
    assert not floor["output_floor_binding"]
    assert floor["rwa_final"] == pytest.approx(capital["rwa_irb"])


@pytest.mark.parametrize("kwargs,expected_stage", [
    (dict(pd_12m=0.02, n_90_plus=1), 3),
    (dict(pd_12m=0.02, n_30_59=2), 2),
    (dict(pd_12m=0.02, n_60_89=1), 2),
    (dict(pd_12m=0.25), 2),
    (dict(pd_12m=0.02), 1),
    (dict(pd_12m=0.02, n_90_plus=3, override=1), 1),
])
def test_staging_matrix(kwargs, expected_stage):
    stage, reason = ecl.assign_stage(**kwargs)
    assert stage == expected_stage
    assert reason


def test_suite_zero_amount_safety():
    out = ecl.compute_ecl_suite(0.03, 0.15, [
        {"tenure_months": 6, "approved_loan_amount": 0.0},
        {"tenure_months": 12, "approved_loan_amount": 15000.0},
    ], delinquency={"n_30_59": 0, "n_60_89": 0, "n_90_plus": 0})
    assert "note" in out["results"][0]
    assert out["results"][1]["provision"] > 0
    assert out["stage"] == 1


def test_suite_stage_appropriate_provision():
    options = [{"tenure_months": 24, "approved_loan_amount": 20000.0}]
    s1 = ecl.compute_ecl_suite(0.03, 0.15, options)
    assert s1["results"][0]["provision"] == s1["results"][0]["ecl_12m"]
    s2 = ecl.compute_ecl_suite(0.03, 0.15, options,
                               delinquency={"n_30_59": 1})
    assert s2["results"][0]["provision"] == s2["results"][0]["ecl_lifetime"]
    s3 = ecl.compute_ecl_suite(0.03, 0.15, options,
                               delinquency={"n_90_plus": 1})
    assert s3["results"][0]["provision"] == pytest.approx(0.55 * 20000, abs=1)


def test_processing_fee_capped():
    assert ecl.processing_fee(21500) == pytest.approx(215.0)   # 1% of principal
    assert ecl.processing_fee(900000) == ecl.PROCESSING_FEE_CAP  # SAR 5,000 cap


def test_processing_fee_flips_short_tenure_viable():
    # A prime borrower's 6-month loan: not viable without the fee, viable with it
    out = ecl.compute_ecl_suite(0.034, 0.144, [
        {"tenure_months": 6, "approved_loan_amount": 21500.0},
    ])
    prof = out["results"][0]["profitability"]
    assert prof["processing_fee"] == pytest.approx(215.0)
    # net margin already includes the fee; without it the loan would lose money
    assert prof["net_margin"] - prof["processing_fee"] < 0
    assert prof["viable"]


def test_suite_capital_consistency():
    out = ecl.compute_ecl_suite(0.034, 0.144, [
        {"tenure_months": 12, "approved_loan_amount": 30000.0},
    ])
    basel = out["results"][0]["basel"]
    assert basel["risk_weight_pct"] == pytest.approx(basel["capital_K"] * 1250, abs=0.5)
    assert basel["capital_pillar1"] == pytest.approx(0.08 * basel["rwa_final"], abs=1)
    assert basel["capital_with_ccb"] == pytest.approx(0.105 * basel["rwa_final"], abs=1)
    assert basel["rwa_final"] >= basel["rwa_irb"]
