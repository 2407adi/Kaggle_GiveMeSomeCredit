# How the ECL & Capital Table Is Calculated

*A walkthrough of what happens when you click "Run Basel ECL Analysis" — written to be read once and remembered.*

---

## The 30-second story

When a bank issues a loan, regulators force it to answer two questions **before** earning a single riyal of interest:

1. **"How much do you *expect* to lose on this loan?"** → set that money aside today as a **provision** (an expense booked upfront against future losses — *ELI5: a jar of money labelled "some borrowers won't pay us back"*). This is **IFRS 9 ECL**.
2. **"How much could you lose in a *really bad year*?"** → hold shareholder money against that as **capital** (the bank's own funds, not depositors' — *ELI5: the bank's own savings that absorb a punch so depositors never feel it*). This is **Basel III**.

Expected loss → provision. Unexpected loss → capital. Everything in the table is one of those two, plus a "was this loan even worth it?" check.

---

## The three ingredients

Every number downstream is built from three quantities:

| Ingredient | What it is | Where we get it |
|---|---|---|
| **PD** — Probability of Default (*chance the borrower stops paying within 12 months. ELI5: "what are the odds this person ghosts us this year?"*) | A number between 0 and 1 | The calibrated XGBoost model output (`pricing.pd`) |
| **LGD** — Loss Given Default (*share of the money we never recover **if** they default, after collections. ELI5: "if they ghost us, how much of the loan is actually gone?"*) | We assume **55%** for unsecured personal loans (no collateral; regulatory floor is 30%) | Documented assumption |
| **EAD** — Exposure at Default (*how much they still owe us at the moment they default. ELI5: "how big is the bill when they ghost?"*) | The outstanding balance, month by month | The loan's amortization schedule (*the month-by-month payoff plan of an EMI loan*) |

The core identity to say out loud in an interview: **Expected Loss = PD × LGD × EAD.** Chance of the bad event × severity of the bad event × size of the bad event.

---

## Step 1 — Staging (IFRS 9)

IFRS 9 (*the accounting standard for loan loss provisioning*) sorts every loan into a stage, which decides **how far into the future** we must count losses:

| Stage | Trigger in our app | Provision horizon |
|---|---|---|
| **Stage 1** — performing | No delinquency history, PD < 20% | Next **12 months** of expected loss |
| **Stage 2** — significant increase in credit risk (**SICR**, *the loan has gotten noticeably riskier since we issued it*) | Any 30–59 or 60–89 days-past-due count > 0 (the regulatory "**30 DPD backstop**" — *miss payments by a month and you're flagged, no debate*), **or** PD ≥ 20% | **Lifetime** expected loss |
| **Stage 3** — credit-impaired (effectively defaulted) | Any 90+ days-past-due count > 0 | Loss is no longer probabilistic: provision = **LGD × EAD** |

Stage is per **borrower**, so all four tenure columns share one stage badge.

> **Crucial point that the table invites you to misread:** the stage is decided by *risk deterioration since origination*, **not** by elapsed time. "12-month ECL" is a smaller *measure* (loss from defaults possible in the next 12 months), not "the first 12 months of the loan." A **Stage 1** borrower provisions the **12-month ECL for every tenure — including the 24-month loan** (that's why the Provision row equals the *12-month* ECL row, not the lifetime row, in the screenshot). The lifetime column is what the provision would *jump to the instant the borrower triggers Stage 2*. See **Q5** in the deep-dive for the full explanation.

---

## Step 2 — ECL: the actual math

Four moves:

1. **Spread the annual PD over months.** A 12-month PD of 3.4% implies a constant monthly default chance (**hazard** — *the per-period chance of the bad thing, given it hasn't happened yet*):
   `pd_monthly = 1 − (1 − PD₁₂ₘ)^(1/12)` → for PD = 3.4%: **0.288% per month**. (Sanity check: failing this coin flip 12 times in a row recovers exactly 3.4%.)

2. **Build the EAD path.** Using the standard EMI formula, compute the outstanding balance at the start of each month. The exposure *shrinks* every month — that's why a 6-month loan has tiny ECL.

3. **Probability-weight each month.** The chance of defaulting exactly in month *t* is `survival up to t−1 × pd_monthly` (you can only default in month 5 if you survived months 1–4).

4. **Discount and sum** (*discounting: money lost next year hurts less than money lost today, shrink it by the interest rate. ELI5: a 100-riyal loss in 2 years ≈ 88 riyals today*). We discount at the loan's **EIR** (Effective Interest Rate — IFRS 9 requires the loan's own rate, we use the APR):

```
ECL = Σₜ  survival(t−1) × pd_monthly × LGD × Balance(t) / (1 + APR/12)ᵗ
```

- Sum over the first **12 months** → `ecl_12m` (Stage 1 provision).
- Sum over the **whole tenure** → `ecl_lifetime` (Stage 2 provision).
- For tenures ≤ 12 months the two are identical (the loan is gone before the 12-month horizon ends).

---

## Step 3 — Basel capital: the "bad year" math

ECL covers the *average* year. Capital covers the **99.9% worst-case year** (*Basel calibrates to a loss level so bad it happens once in 1,000 years*). The chain:

1. **Asset correlation R** (*how much borrowers tend to default together when the economy tanks. ELI5: if one umbrella shop fails it's bad luck; if all fail at once, it's raining — R measures the rain*). For "other retail" (unsecured consumer loans), Basel's formula slides R from 0.16 (low-PD borrowers, more macro-driven) down to 0.03 (high-PD borrowers, more idiosyncratic):

   `R = 0.03·w + 0.16·(1−w)`, where `w = (1 − e^(−35·PD)) / (1 − e^(−35))`

2. **Stressed PD → capital charge K.** The famous IRB (*Internal Ratings-Based — banks use their own PD models inside a regulator-fixed formula*) risk-weight function:

   ```
   K = LGD × N( [G(PD) + √R · G(0.999)] / √(1−R) ) − PD × LGD
   ```

   Translation: take your PD, push it through a once-in-1000-years macro shock (`G(0.999)` is the 99.9th percentile of a standard normal; N and G are the normal CDF and its inverse), multiply by LGD to get the **stressed loss rate**, then subtract expected loss (`PD × LGD`) because that part is already covered by the provision. **K is only the *unexpected* slice.** Retail has no maturity adjustment, and Basel III removed the old 1.06 scaling factor.

3. **Floors** (*regulator-imposed minimums so banks can't model their way to zero*): PD is floored at 0.05%, LGD at 30%.

4. **RWA** — Risk-Weighted Assets (*the loan amount re-expressed in "risk units"; the multiplication by 12.5 = 1/8% is just packaging so that 8% of RWA equals K × EAD*):
   `RWA_IRB = K × 12.5 × EAD`, and `risk_weight % = K × 12.5`.

5. **Output floor** (*Basel 3.1's "your fancy model can't undercut the simple method by too much" rule*): compute RWA under the **Standardised Approach** (*the no-model method: flat 75% risk weight for retail*) and enforce
   `RWA_final = max(RWA_IRB, 72.5% × RWA_SA)`.
   The ⚑ flag in the table means the floor is binding — your model said the loan was safer than the floor allows.

6. **Capital requirement**: `8% × RWA_final` (Pillar 1 minimum) and `10.5% × RWA_final` (including the **capital conservation buffer** — *an extra 2.5% cushion banks must hold in good times*).

---

## Step 4 — Viability (our own sanity check, not regulation)

Over the loan's life: **interest income** *plus* an **upfront origination fee** (1% of principal, capped at SAR 5,000 — the SAMA cap; a *fixed, per-loan* charge collected at disbursal), minus **funding cost** (8% on the average outstanding balance — *the bank borrows the money it lends*), **opex** (1% of principal, the cost of originating/servicing), the **lifetime ECL** (the expected hole), and the **cost of capital** (shareholders demand ~15% return on the equity tied up). Positive net margin → ✓ viable.

The fee is the lever that makes short loans work. Opex is a *fixed* cost per loan, but interest accrues *per month* on a shrinking balance — so a 6-month loan can't earn enough interest to cover the same fixed cost a 24-month loan amortizes comfortably. A flat per-loan fee recovers that fixed cost regardless of tenure, without charging short loans a higher *rate* (which would be unintuitive to customers). That's exactly why every real personal loan has a "processing fee" line.

---

## Worked example — PD 3.4%, APR 14.4%, 6-month loan of SAR 21,500

**Staging:** clean history, PD < 20% → **Stage 1**.

**ECL:** monthly hazard = 0.288%. EMI ≈ SAR 3,735; balance walks 21,500 → ~3,690 over 6 months. Summing `survival × 0.288% × 55% × balance`, discounted at 1.2%/month:
→ **ECL ≈ SAR 116** = **0.54%** of the loan. Lifetime = 12-month here (tenure < 12m).

**Capital:** R = 0.0695. K = 0.55 × N((G(0.034) + √0.0695·G(0.999))/√0.9305) − 0.034×0.55 = 0.55×0.1475 − 0.0187 ≈ **0.0624**.
Risk weight = 0.0624 × 12.5 = **78%** → RWA_IRB = SAR 16,780. Standardised RWA = 75% × 21,500 = 16,125; floor check: 72.5% × 16,125 = 11,691 < 16,780 → floor **not** binding.
Capital = 8% × 16,780 = **SAR 1,342** (Pillar 1), or **SAR 1,762** at 10.5%. That's **8.2% of the loan amount** the bank must fund with its own equity.

**Viability:** interest income 912 **+ origination fee 215** (1% of 21,500) − funding 507 − opex 215 − ECL 116 − capital cost 132 = **+157 → viable**. Without the fee this loan loses 58 — the fee recovers the fixed origination cost that six months of interest can't. (The same borrower at 24 months earns far more interest and clears +1,281; same risk, same rate — short tenures simply need the fee to amortize fixed cost.)

---

## Interview sound bites

- **"Provision covers expected loss; capital covers unexpected loss."** ECL is the mean of the loss distribution; capital is the gap between the 99.9th percentile and the mean.
- **"Why subtract PD×LGD inside K?"** Double-counting: the expected part is already provisioned, capital only needs the tail.
- **"Why does the correlation formula *decrease* with PD?"** High-PD retail borrowers default for personal reasons (idiosyncratic); low-PD borrowers mostly default when the whole economy turns (systematic) — so their defaults are more correlated.
- **"Why stage 2 if 30 days past due?"** IFRS 9's rebuttable backstop: SICR is presumed at 30 DPD even if your model disagrees.
- **"What's the output floor for?"** Post-2008 distrust of internal models — IRB RWA can't fall below 72.5% of the standardised number, fully phased by 2030.
- **"Why is the short loan unprofitable despite low risk?"** Origination cost is fixed per loan; interest accrues per month on a shrinking balance. Six months of interest can't amortize the same fixed cost that 24 months can. (Risk was never the problem — ECL is only SAR 116.) The fix is a flat per-loan **origination fee** (1%, SAR 5,000 cap per SAMA), which recovers the fixed cost without charging short tenures a higher rate.

*All formulas per BIS CRE31 (IRB risk weights), CRE20 (standardised), Basel III finalized (d424). LGD 55%, cost of equity 15%, and constant-hazard PD extrapolation are documented demo assumptions.*

---

# Deep-dive Q&A

*The questions you actually asked after the first read. These are the ones that separate "memorised the formula" from "understood it."*

## Q1. What does "hold shareholder money as capital" mean? Do you pledge stock? What happens if your share price crashes?

**The big correction first: capital is not a pot of cash you set aside, and it has nothing to do with pledging stock.** Provision = real cash earmarked for expected losses. Capital is a different animal entirely — it's a statement about *where the money you lent came from.*

Start with the balance-sheet identity: **Assets = Liabilities + Equity.** When a bank funds a SAR 1,000 loan, that 1,000 came from either:
- **Depositors / borrowed money (liabilities)** — money the bank *owes back* to others.
- **Shareholders (equity / capital)** — the owners' own money, owed to *nobody*.

"Holding capital" means **at least 8% of your risk-weighted assets must be funded by shareholders' money rather than depositors'.** It's a rule about the *funding mix*, not a locked box — the cash itself is out the door in the borrower's pocket.

**Why this absorbs losses (the whole point):** losses hit equity *first*. Lose 100 on a loan → it comes off the shareholders' stake. Depositors lose a riyal only if losses blow through *all* the equity. Equity is the shock absorber sitting between "loans go bad" and "depositors get hurt." More equity = thicker absorber.

**House analogy (use in interviews):** you buy a SAR 1,000 house, put SAR 100 of your own money down (equity/capital), borrow SAR 900 (deposits/debt). House drops to SAR 950 → *your* SAR 100 down payment eats the SAR 50 loss; the lender of the 900 is untouched. The regulator just says "put at least 8% down, risk-adjusted."

**Your exact scenario — market cap 1,000 → 80 after a crash:** the key distinction is that **regulatory capital is the *book value* of equity, not market cap.** Market cap (share price × shares) is what *traders* think your equity is worth today. Regulatory capital — mostly **CET1** (*Common Equity Tier 1: paid-in share capital + accumulated retained earnings; the highest-quality, most loss-absorbing layer*) — is an *accounting* number on the balance sheet. It does **not** move when the share price wiggles. So if your market cap craters 1,000 → 80 but your *book* equity (retained earnings + paid-in capital) is still 120, **you still meet the requirement. You pledge nothing.** A share-price fall is not, by itself, a capital event.

**The real link, though:** a stock usually crashes *because* the market expects real losses (bad loans, writedowns). Those *actual* losses reduce retained earnings → reduce book equity → *that's* what threatens the ratio. If book equity falls below the required level, the bank has four moves (pledging stock is not one):
1. **Raise fresh equity** — issue new shares. Painful when your stock is already crashed: you sell cheap and dilute owners. (Exactly the 2008 scramble.)
2. **Retain earnings / cut the dividend** — stop paying money out, let equity rebuild.
3. **Shrink risk-weighted assets** — sell loans, de-risk, lend less. Smaller denominator → ratio recovers without new equity.
4. **Regulator intervention** in the extreme — forced recapitalization or resolution.

This is exactly what the **2.5% capital conservation buffer** (the gap between 8% and 10.5% in the table) is for: as a bank eats into it, regulators *automatically* restrict dividends and bonuses, forcing capital to rebuild before owners get rewarded — a pre-wired version of move #2.

**One-liner:** *"Capital isn't cash set aside — it's the share of assets funded by owners instead of depositors, so owners absorb surprise losses first. The requirement is a ratio on book equity, not market cap, so a share-price crash doesn't directly breach it — but the real losses behind the crash do, and the bank responds by raising equity, cutting dividends, or shrinking its balance sheet."*

## Q2. Why not just p₁ + p₂ + … + p₁₂ = 3.4%? And is the constant-hazard method really used in industry?

**Your summation instinct is actually correct** — but only for the right quantity. There are *two* different "monthly probabilities" and Step 2 above blurred them:
- **Hazard `h` (conditional):** P(default in month t **given survival** to t−1). Assumed *constant* = 0.288%.
- **Marginal `mₜ` (unconditional):** P(default in *exactly* month t, from the start) = `(1−h)^(t−1) × h`. This one *declines* monthly.

Default is an **absorbing state** (you default once, then you're out of the pool), so "default in exactly month 1, 2, 3…" are **mutually exclusive** events, and their *marginal* probabilities legitimately sum to the 12-month PD:

```
Σ (1−h)^(t−1) · h  =  1 − (1−h)^12  =  PD₁₂ₘ   ✓   (a geometric series collapsing)
```

So **summing per-month default probabilities is right — as long as you sum the marginal `mₜ` (which shrink), not the flat hazard `h`.** What you must NOT do is add the hazard 12 times: `12 × 0.288% = 3.46%` **over-counts**, because to default in month 2 you must have survived month 1 — but `12h` keeps charging the full population every month, ignoring that defaulters already left. For small PD it's *approximately* right (3.46% ≈ 3.4%), which is why people get away with it, but it's biased high. So the issue isn't "independence" — it's **conditioning on survival**: the hazard stays flat, the marginal probability declines because fewer survivors remain each month. Inverting `PD₁₂ₘ = 1−(1−h)¹²` gives our `h = 1 − (1−PD₁₂ₘ)^(1/12)`.

**Is this how industry does it? (Double-checked against IFRS 9 modelling literature.)** Two parts:
- **The *mechanism* — yes, exactly.** Real banks build a *term structure* of marginal PDs and compute lifetime ECL as `Σ marginalPDₜ × LGDₜ × EADₜ`, discounted at the EIR. That's precisely our structure.
- **The *constant-hazard assumption* — no, that's the simplified part.** Real hazards aren't flat: there's a documented **seasoning curve** — defaults start low at origination, **hump up** around 12–36 months on book, then decline as survivors prove creditworthy. Industry captures this with **survival/hazard models** (discrete-time hazard GLMs, or **Cox proportional-hazards** with months-on-book and borrower covariates), **Markov rating-transition matrices** (model grade-to-grade migration each period, then chain the matrix for cumulative PDs), plus **macroeconomic overlays** (IFRS 9 requires forward-looking, point-in-time PDs — a probability-weighted blend of base/upside/downside scenarios). IFRS 9 guidance is explicit that a *constant* marginal PD isn't acceptable "unless an appropriate analysis would support it." So our constant hazard is a legitimate, transparent **demo-grade simplification — correct in structure, simplified in the hazard shape.** Volunteering this in an interview is a flex: it shows you know where the real models add nuance.

*Sources: [MDPI — Modeling the PD Term Structure under IFRS 9](https://www.mdpi.com/2227-7072/14/3/62); [Springer/arXiv — Term-structure of default risk under IFRS 9](https://arxiv.org/abs/2507.15441); [Oracle — Multi-State Markov IFRS 9 PD](https://www.oracle.com/a/ocom/docs/industries/financial-services/multi-state-markov-model-wp.pdf); [Zanders — ECL calculation methodology](https://zandersgroup.com/en/insights/blog/ecl-calculation-methodology).*

## Q3. So survival to (t−1) = (1−pd_monthly)^(t−1)?

**Yes — exactly.** With constant monthly hazard `h`, surviving the first (t−1) months = not defaulting in month 1 **and** month 2 … **and** month (t−1), each with probability (1−h):

```
survival(t−1) = (1−h)^(t−1)
```

and P(default in exactly month t) = `(1−h)^(t−1) × h`. (This clean power form holds *because* the hazard is constant. If the hazard varied by month — the realistic seasoning case from Q2 — survival would be the *product* `(1−h₁)(1−h₂)…(1−h_{t−1})` instead of a power.)

## Q4. The doc says 75% risk weight but the floor formula uses 72.5% — and what is RWA_SA? Plus, what's the intuition for K?

**75% and 72.5% are two different numbers that happen to sit next to each other:**
- **75% = the Standardised Approach risk weight** for retail. The **Standardised Approach** (*the simple, no-internal-model method where the regulator hands you a fixed risk weight per asset class*) says "treat 75% of a retail exposure as risk-weighted." So **RWA_SA = 75% × EAD** — that's where it's defined (`rwa_sa = SA_RISK_WEIGHT * ead` in the code). It's the "what a bank with no risk model would have to hold" benchmark.
- **72.5% = the output-floor multiplier** — a *separate* rule that your internal-model number can't undercut the simple benchmark by more than a set amount: `RWA_final = max(RWA_IRB, 72.5% × RWA_SA)`.

They stack: `72.5% × RWA_SA = 72.5% × 75% × EAD = 54.4% × EAD`. So for retail your IRB model can claim the loan is safe, but can **never** push RWA below ~54% of raw exposure. One number (75%) builds the benchmark; the other (72.5%) is how close to it you're allowed to get. The floor exists because regulators stopped trusting internal models after 2008.

**Intuition for K:**

> **K is "unexpected loss per riyal lent" — the cents of shareholder equity you must hold per riyal to survive a 1-in-1000 bad year, *over and above* the provision you already booked.**

The three pieces of `K = LGD × N(stressed PD) − PD × LGD`:
- `LGD × N(stressed PD)` = loss rate in the **catastrophe** scenario (99.9th-percentile bad year) — worst-case loss per unit.
- `PD × LGD` = the **expected** loss rate (the *average* year) — already set aside as your provision/ECL.
- **K = catastrophe − expected = the *surprise* slice.** Provisions cover the average; capital covers the gap between average-bad and catastrophically-bad. K is exactly that gap, per unit.

The "× 12.5 then × 8%" is a no-op that cancels: capital = 8% × RWA = 8% × (K × 12.5 × EAD) = **K × EAD**. So holding 8% against risk-weighted assets *is* holding K riyals of equity per riyal of exposure. The whole RWA machinery exists only so different risk types (mortgage, corporate bond, derivative) can be expressed in one common "risk-units" currency and summed. For our example, **K = 6.24%** = "hold ~6.24 cents of equity per riyal lent for the worst-case surprise, on top of ~1.9 cents of provision (PD×LGD) for the expected loss."

## Q5. Why does the 24-month loan still provision only the 12-month ECL? Is it "Stage 1 for the first 12 months, then Stage 2"?

**No — and this is the single most common misread of the table.** Stage has **nothing to do with elapsed time.** It's decided by whether the borrower's credit risk has **deteriorated significantly since origination** (SICR).

Two things that sound alike but aren't:
- **"12-month ECL"** is *not* "the loss during the first 12 calendar months, after which the reserve expires." It's a **measure** — the slice of the loan's *whole-life* expected loss coming from defaults that could occur **in the next 12 months from today**. It's simply a smaller number than lifetime ECL.
- **Stage** decides *which measure* you hold: **Stage 1 → 12-month ECL; Stage 2 → lifetime ECL.**

So a **Stage 1** borrower (no SICR) provisions the **12-month figure for *every* tenure — including the 24-month loan.** In the screenshot:
- 18-month: 12m ECL = 251, lifetime = 285, **provision = 251**
- 24-month: 12m ECL = 361, lifetime = 480, **provision = 361**

The provision tracks the **12-month** column because the borrower is Stage 1. The lifetime column is shown for reference — it's what the provision would **jump to the instant the borrower triggers Stage 2** (misses a payment → 30 DPD backstop, or PD crosses 20%). That trigger could fire in month 2, or never. It is **borrower-driven, not a 12-month clock.** A healthy 24-month loan stays on the 12-month number for its whole life; a deteriorated 6-month loan would already be on lifetime.

**Why IFRS 9 is built this way (interview gold):** a healthy loan carries only a light "running reserve" (next 12 months of expected loss). The moment its risk jumps materially, the bank must **immediately recognise the *entire remaining-life* expected loss** — a deliberate **cliff** that front-loads the bad news (here, the 24-month provision would leap 361 → 480 in one reporting period). This replaced the old "incurred loss" model (IAS 39), criticised after 2008 for booking losses "too little, too late."

**One-liner:** *"Stage 1 holds 12-month ECL, Stage 2 holds lifetime ECL; the switch is triggered by credit deterioration, not elapsed time — so a healthy 24-month loan stays on the 12-month number for its whole life."*

## Q6. What are "Pillar 1" and "CCB"?

**Pillar 1** — Basel is organised into **three pillars**:
- **Pillar 1 — minimum capital requirements.** The formula-driven floor (8% of RWA for credit/market/operational risk). **This is the number our table computes**; "Capital (8% Pillar 1)" is the baseline regulatory minimum.
- **Pillar 2 — supervisory review.** Bank-specific *add-ons* the regulator imposes for risks the Pillar 1 formula misses (concentration risk, interest-rate risk in the banking book, etc.).
- **Pillar 3 — market discipline.** Public *disclosure* requirements so investors and the market can judge a bank's risk and keep it honest.

**CCB — Capital Conservation Buffer** — an extra **2.5% of RWA** stacked on top of the 8% Pillar 1 minimum, held in good times as a *usable* cushion (total = **10.5%**, the "Capital (10.5% incl. CCB)" row). The mechanism: if a bank's capital slips into the buffer zone (between 8% and 10.5%), it faces **automatic restrictions on dividends, share buybacks, and bonuses** until it rebuilds — forcing it to *conserve* capital (retain earnings) rather than pay it out when running thin. It's the same buffer behind the dividend-restriction story in **Q1**.
