import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Landmark, CheckCircle, XCircle, Loader2 } from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

interface LoanOption {
  tenure_months: number;
  approved_loan_amount: number;
}

interface EclBasel {
  pd_used: number;
  lgd_used: number;
  pd_floor_applied: boolean;
  lgd_floor_applied: boolean;
  correlation_R: number;
  capital_K: number;
  risk_weight_pct: number;
  rwa_irb: number;
  rwa_sa: number;
  rwa_final: number;
  output_floor_binding: boolean;
  capital_pillar1: number;
  capital_with_ccb: number;
  capital_pct_of_loan: number;
}

interface EclProfitability {
  interest_income: number;
  processing_fee: number;
  funding_cost: number;
  opex_cost: number;
  expected_loss: number;
  capital_cost: number;
  net_margin: number;
  viable: boolean;
}

interface EclResult {
  tenure_months: number;
  loan_amount: number;
  note?: string;
  ecl_12m?: number;
  ecl_lifetime?: number;
  provision?: number;
  provision_pct_of_loan?: number;
  basel?: EclBasel;
  profitability?: EclProfitability;
}

interface EclResponse {
  stage: 1 | 2 | 3;
  stage_reason: string;
  results: EclResult[];
  assumptions: Record<string, string | number>;
}

interface BaselEclAnalysisProps {
  pricing: { pd: number; apr_decimal: number };
  loanOptions: LoanOption[];
  features: Record<string, number | string>;
}

const stageBadgeClass: Record<number, string> = {
  1: "bg-success text-success-foreground hover:bg-success",
  2: "bg-warning text-warning-foreground hover:bg-warning",
  3: "bg-destructive text-destructive-foreground hover:bg-destructive",
};

const sar = (v: number | undefined) =>
  v === undefined ? "—" : `SAR ${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const BaselEclAnalysis = ({ pricing, loanOptions, features }: BaselEclAnalysisProps) => {
  const [eclData, setEclData] = useState<EclResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/ecl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pd: pricing.pd,
          apr_decimal: pricing.apr_decimal,
          loan_options: loanOptions.map((o) => ({
            tenure_months: o.tenure_months,
            approved_loan_amount: o.approved_loan_amount,
          })),
          delinquency: {
            n_30_59: Number(features.NumberOfTime30_59DaysPastDueNotWorse) || 0,
            n_60_89: Number(features.NumberOfTime60_89DaysPastDueNotWorse) || 0,
            n_90_plus: Number(features.NumberOfTimes90DaysLate) || 0,
          },
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || `Request failed (${response.status})`);
      }
      setEclData(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ECL analysis failed");
    } finally {
      setIsLoading(false);
    }
  };

  const option1 = eclData?.results?.[0];

  return (
    <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-4 bg-muted/30">
        <CardTitle className="text-lg font-semibold text-foreground flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Basel ECL & Capital Analysis
          </span>
          {eclData && (
            <Badge className={stageBadgeClass[eclData.stage]}>
              IFRS 9 Stage {eclData.stage}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {!eclData && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Bank-side view of these offers: IFRS 9 loss provisioning and Basel III
              regulatory capital the lender must hold against each loan.
            </p>
            <Button onClick={runAnalysis} disabled={isLoading} className="shrink-0">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Computing…
                </>
              ) : (
                "Run Basel ECL Analysis"
              )}
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">
            {error} — is the backend running?
          </p>
        )}

        {eclData && (
          <>
            <p className="text-sm text-muted-foreground">{eclData.stage_reason}</p>

            {/* Loan option 1 highlight */}
            {option1 && option1.basel && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-foreground">
                    Loan Option 1 — {option1.tenure_months} months,{" "}
                    {sar(option1.loan_amount)}
                  </h4>
                  {option1.profitability?.viable ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-success">
                      <CheckCircle className="h-4 w-4" /> Economically viable
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-sm font-medium text-destructive">
                      <XCircle className="h-4 w-4" /> Not viable at this price
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">ECL Provision</p>
                    <p className="text-lg font-bold text-foreground">
                      {sar(option1.provision)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {option1.provision_pct_of_loan}% of loan
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Risk Weight</p>
                    <p className="text-lg font-bold text-foreground">
                      {option1.basel.risk_weight_pct}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {option1.basel.output_floor_binding ? "output floor" : "A-IRB"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Capital Required</p>
                    <p className="text-lg font-bold text-foreground">
                      {sar(option1.basel.capital_with_ccb)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      10.5% of RWA incl. buffer
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net Margin</p>
                    <p
                      className={`text-lg font-bold ${
                        (option1.profitability?.net_margin ?? 0) >= 0
                          ? "text-success"
                          : "text-destructive"
                      }`}
                    >
                      {sar(option1.profitability?.net_margin)}
                    </p>
                    <p className="text-xs text-muted-foreground">over loan life</p>
                  </div>
                </div>
              </div>
            )}

            {/* All tenures table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    {eclData.results.map((r, idx) => (
                      <TableHead
                        key={r.tenure_months}
                        className={`text-right ${idx === 0 ? "bg-primary/5 font-semibold" : ""}`}
                      >
                        {r.tenure_months} mo{idx === 0 ? " ★" : ""}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {([
                    ["Loan amount", (r: EclResult) => sar(r.loan_amount)],
                    ["ECL (12-month)", (r: EclResult) => sar(r.ecl_12m)],
                    ["ECL (lifetime)", (r: EclResult) => sar(r.ecl_lifetime)],
                    ["Provision (stage-based)", (r: EclResult) => sar(r.provision)],
                    ["Risk weight", (r: EclResult) => (r.basel ? `${r.basel.risk_weight_pct}%` : "—")],
                    ["RWA (IRB)", (r: EclResult) => sar(r.basel?.rwa_irb)],
                    ["RWA (final, floored)", (r: EclResult) =>
                      r.basel
                        ? `${sar(r.basel.rwa_final)}${r.basel.output_floor_binding ? " ⚑" : ""}`
                        : "—"],
                    ["Capital (8% Pillar 1)", (r: EclResult) => sar(r.basel?.capital_pillar1)],
                    ["Capital (10.5% incl. CCB)", (r: EclResult) => sar(r.basel?.capital_with_ccb)],
                    ["Capital % of loan", (r: EclResult) =>
                      r.basel ? `${r.basel.capital_pct_of_loan}%` : "—"],
                  ] as [string, (r: EclResult) => string][]).map(([label, fmt]) => (
                    <TableRow key={label}>
                      <TableCell className="font-medium text-muted-foreground">
                        {label}
                      </TableCell>
                      {eclData.results.map((r, idx) => (
                        <TableCell
                          key={r.tenure_months}
                          className={`text-right ${idx === 0 ? "bg-primary/5" : ""}`}
                        >
                          {r.note ? "—" : fmt(r)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">
                      Net margin / viable
                    </TableCell>
                    {eclData.results.map((r, idx) => (
                      <TableCell
                        key={r.tenure_months}
                        className={`text-right ${idx === 0 ? "bg-primary/5" : ""}`}
                      >
                        {r.profitability ? (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              r.profitability.viable ? "text-success" : "text-destructive"
                            }`}
                          >
                            {sar(r.profitability.net_margin)}
                            {r.profitability.viable ? (
                              <CheckCircle className="h-3.5 w-3.5" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Assumptions */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              Assumptions: LGD {Number(eclData.assumptions.lgd) * 100}% (unsecured retail,
              floor {Number(eclData.assumptions.lgd_floor) * 100}%) · PD floor{" "}
              {Number(eclData.assumptions.pd_floor) * 100}% · {eclData.assumptions.hazard_model} ·
              discounting at {eclData.assumptions.eir} · standardised RW{" "}
              {Number(eclData.assumptions.sa_risk_weight) * 100}% with{" "}
              {Number(eclData.assumptions.output_floor) * 100}% output floor ·{" "}
              {eclData.assumptions.asset_class}. Net margin includes a{" "}
              {Number(eclData.assumptions.processing_fee_rate) * 100}% upfront origination fee
              (capped at SAR {Number(eclData.assumptions.processing_fee_cap).toLocaleString("en-IN")},
              per SAMA). ⚑ = output floor binding. Demo calculation — not regulatory advice.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BaselEclAnalysis;
