import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, AlertTriangle, ArrowLeft, FileText, BarChart3, User, TrendingUp, Activity, Clock, Flag, MessageSquare, Shield, CreditCard, Building, Receipt, UserCircle, ImageIcon, Expand } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";


// Mock data based on the API responses provided
const mockPredictData = {
  score: 768.95,
  percentile: 85.2,
  explanations: [
    "Your credit score is positively impacted by Revolving Utilization, CreditUtilizationPerLine.",
    "Your credit score is negatively impacted by none."
  ],
  features: {
    RevolvingUtilizationOfUnsecuredLines: 0.01,
    age: 67.0,
    NumberOfTime30_59DaysPastDueNotWorse: 0.0,
    DebtRatio: 0.1,
    MonthlyIncome: 10500.0,
    NumberOfOpenCreditLinesAndLoans: 5.0,
    NumberOfTimes90DaysLate: 0.0,
    NumberRealEstateLoansOrLines: 1.0,
    NumberOfTime60_89DaysPastDueNotWorse: 0.0,
    NumberOfDependents: 0.0,
    TotalObligation: 1032.0,
    TotalUnsecuredLoans: 3.0,
    TotalSecuredLoans: 2.0,
    CreditCards: 1.0,
    PersonalLoans: 0.0,
    BNPLLoans: 0.0,
    OtherUnsecured: 2.0,
    RealEstateLoans: 1.0,
    GoldLoans: 0.0,
    VehicleLoans: 0.0,
    OtherSecured: 1.0,
    HasDelinquencyHistory: 0.0,
    DependentsFlag: 0.0,
    TotalLoanUtilization: 0.24,
    BureauVintage: 18.0,
    NumberOfEnquiriesInLast6Months: 18.0,
    probability: 0.97,
    log_odds: 3.38,
    credit_score: 768.95,
    CustomerID: 1.0,
    FullName: 'Rima Al-Saud',
    DateOfBirth: '28-Oct-76',
    Gender: 'Female',
    Employer: 'Al Rajhi Bank',
    EmploymentType: 'Salaried',
    TotalInflows: 82347.0,
    TotalOutflows: 65662.16,
    AverageMonthlyInflows: 6862.25,
    AverageMonthlyOutflows: 5471.85,
    NetPosition: 16684.84,
    MonthlySalaryDeducted: 29325.0,
    JudiciaryCaseCount: 0.0,
    JudiciaryCaseFlag: 0.0,
    JudiciaryCaseDetails: 'Not Applicable',
    TravelBan: 0.0,
    LegalRestrictions: 'Not Applicable'
  },
  force_plot: "string",
  hasFullData: true
};

const mockPredict1Data = {
  score: 607.66,
  percentile: 69.87,
  explanations: [
    "Your credit score is positively impacted by 30-59 Days Past Due, Debt Ratio.",
    "Your credit score is negatively impacted by SeriousDelinqRate, Revolving Utilization."
  ],
  features: {
    RevolvingUtilizationOfUnsecuredLines: 0.35,
    age: 45.0,
    NumberOfTime30_59DaysPastDueNotWorse: 1.0,
    DebtRatio: 0.65,
    MonthlyIncome: 5500.0,
    NumberOfOpenCreditLinesAndLoans: 8.0,
    NumberOfTimes90DaysLate: 0.0,
    NumberRealEstateLoansOrLines: 2.0,
    NumberOfTime60_89DaysPastDueNotWorse: 0.0,
    NumberOfDependents: 2.0,
    TotalObligation: 3575.0,
    TotalUnsecuredLoans: 4.0,
    TotalSecuredLoans: 4.0,
    CreditCards: 1.0,
    PersonalLoans: 1.0,
    BNPLLoans: 1.0,
    OtherUnsecured: 1.0,
    RealEstateLoans: 2.0,
    GoldLoans: 0.0,
    VehicleLoans: 1.0,
    OtherSecured: 1.0,
    HasDelinquencyHistory: 1.0,
    DependentsFlag: 1.0,
    TotalLoanUtilization: 0.52,
    BureauVintage: 12.0,
    NumberOfEnquiriesInLast6Months: 24.0
  },
  force_plot: "string",
  hasFullData: false
};

interface CreditResultsProps {
  apiData?: any;
}

const CreditResults = ({ apiData: passedData }: CreditResultsProps) => {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const fetchCreditData = async () => {
      // ✅ Case 1: manual entry → data was passed directly
      if (passedData) {
        setData(passedData);
        setIsLoading(false);
        return;
      }

      // ✅ Case 2: fetch by customerId or use mock data for preview
      if (!customerId) {
        // If no customerId and no passed data, show mock data for manual route
        if (window.location.pathname.includes('/manual')) {
          setData(mockPredictData);
          setIsLoading(false);
        }
        return;
      }

      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
        const response = await fetch(`${backendUrl}/predict`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ customer_id: parseInt(customerId) }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch credit data");
        }

        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error("Error fetching credit data:", error);
        // Fallback to mock data for preview
        setData(mockPredictData);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCreditData();
  }, [customerId, passedData]);

  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => {
        setAnimatedScore(data.score);
      }, 300); // Start speedometer animation after 300ms
      
      return () => clearTimeout(timer);
    }
  }, [data]);

  const getRiskLevel = (score: number) => {
    if (score >= 750) return "LOW RISK";
    if (score >= 650) return "MEDIUM RISK";
    return "HIGH RISK";
  };

  const getRiskColor = (score: number) => {
    if (score >= 750) return "text-success";
    if (score >= 650) return "text-warning";
    return "text-destructive";
  };

  const getRiskCircleColor = (score: number) => {
    if (score >= 750) return "green";
    if (score >= 650) return "orange";
    return "red";
  };

  const getApprovalStatus = (score: number) => {
    if (score >= 750) return "APPROVE";
    if (score >= 650) return "CONDITIONAL";
    return "DECLINE";
  };

  // Small utility component for bar charts with animation
  const BarChart = ({ value, max = 100, color = "bg-primary" }: { value: number; max?: number; color?: string }) => {
    const [animatedValue, setAnimatedValue] = useState(0);
    
    useEffect(() => {
      const timer = setTimeout(() => {
        setAnimatedValue(value);
      }, 800); // Start animation after 800ms
      
      return () => clearTimeout(timer);
    }, [value]);

    return (
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-1000 ease-out`}
          style={{ width: `${Math.min((animatedValue / max) * 100, 100)}%` }}
        />
      </div>
    );
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading credit assessment...</p>
        </div>
      </div>
    );
  }

  // Show error state if no data
  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No data available</p>
          <button onClick={() => navigate('/')} className="text-primary hover:underline">
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Check if we have full data (from predict endpoint) or limited data (from predict_1 endpoint)
  const hasFullData = !!(data.features?.FullName && data.features?.DateOfBirth);

  const exportToPDF = async () => {
    try {
      const element = document.querySelector('.max-w-7xl') as HTMLElement;
      if (!element) return;

      // Create canvas from the element
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      
      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 295; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if content is longer than one page
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download the PDF
      const fileName = data.features?.FullName 
        ? `${data.features.FullName.replace(/\s+/g, '_')}_Credit_Report.pdf`
        : 'Credit_Assessment_Report.pdf';
      
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="grid grid-cols-3 items-center">
          {/* Left: Back button */}
          <div className="flex justify-start">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/')}
              className="border-border"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Assessment
            </Button>
          </div>

          {/* Center: Title */}
          <div className="flex justify-center">
            <h1 className="text-3xl font-bold text-foreground">Credit Assessment Dashboard</h1>
          </div>

          {/* Right: Export button */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="border-border" onClick={exportToPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Top Section: Customer Profile, Risk Assessment, Key Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Customer Profile - Always render, but conditionally show content */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-4 bg-muted/30">
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Customer Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {hasFullData ? (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                      <UserCircle className="h-10 w-10 text-muted-foreground" />
                    </div>
                  <div>
                      <h3 className="font-semibold text-foreground text-lg">{data.features?.FullName}</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Age</p>
                      <p className="font-medium text-foreground">{data.features?.age} years</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="font-medium text-foreground">{data.features?.Gender}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Employment</p>
                      <p className="font-medium text-foreground">{data.features?.EmploymentType}</p>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <p className="text-xs text-muted-foreground">Employer</p>
                      <p className="font-medium text-foreground">{data.features?.Employer}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <UserCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Limited customer data available</p>
                  <p className="text-xs text-muted-foreground mt-1">Age: {data.features?.age} years</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Risk Assessment */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-4 bg-muted/30">
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-8">
              {/* Credit Score Speedometer */}
              <div className="relative w-32 h-32 mb-4">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted"
                  />
                  {/* Animated progress circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke={getRiskCircleColor(data.score)}
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={2 * Math.PI * 40}   // circumference = 2πr
                    strokeDashoffset={2 * Math.PI * 40 - (2 * Math.PI * 40 * animatedScore / 850)}
                    strokeLinecap="round"
                    style={{
                      transition: "stroke-dashoffset 1s ease-out"
                    }}
                  />
                </svg>

                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-foreground">{Math.round(data.score)}</div>
                  </div>
                </div>
              </div>
              <Badge className={`${data.score >= 750 ? 'bg-green-500' : data.score >= 650 ? 'bg-yellow-500' : 'bg-red-500'} text-white text-lg px-4 py-2`}>
                {getRiskLevel(data.score)}
              </Badge>
              <div className="mt-4 text-center">
                <div className="text-2xl font-bold text-foreground">{Math.round(data.percentile)}%</div>
                <div className="text-xs text-muted-foreground">Worse than {Math.round(data.percentile)}% in the bureau</div>
              </div>
            </CardContent>
          </Card>


          {/* Key Metrics */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-4 bg-muted/30">
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Key Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Obligation</span>
                <span className="font-semibold text-foreground">SAR {data.features?.TotalObligation?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Payment History</span>
                <span className={`font-semibold ${data.features?.HasDelinquencyHistory === 1 ? 'text-warning' : 'text-success'}`}>
                  {data.features?.HasDelinquencyHistory === 1 ? 'Previous Delinquency' : 'On Time'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Monthly Income</span>
                  <span className="font-semibold text-foreground">SAR {data.features?.MonthlyIncome?.toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Debt-to-Income</span>
                  <span className="font-semibold text-foreground">{Math.round((data.features?.DebtRatio || 0) * 100)}%</span>
                </div>
                <BarChart 
                  value={Math.round((data.features?.DebtRatio || 0) * 100)} 
                  color={Math.round((data.features?.DebtRatio || 0) * 100) > 40 ? "bg-warning" : "bg-success"}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Credit Utilization</span>
                  <span className="font-semibold text-foreground">
                    {Math.round((data.features?.RevolvingUtilizationOfUnsecuredLines || 0) * 100)}%
                  </span>
                </div>
                <BarChart 
                  value={Math.round((data.features?.RevolvingUtilizationOfUnsecuredLines || 0) * 100)} 
                  color={Math.round((data.features?.RevolvingUtilizationOfUnsecuredLines || 0) * 100) > 30 ? "bg-warning" : "bg-success"}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Risk-Based Pricing + Offers Card */}
        <Card className="border-border shadow-sm mb-6">
          <CardHeader className="pb-4 bg-muted/30">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Pricing & Approved Offers
            </CardTitle>
          </CardHeader>

          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

              {/* Left: Risk-Based Pricing (1/4) */}
              <div className="col-span-1">
                <div className="p-4 bg-muted/50 rounded-lg space-y-3 h-full flex flex-col">
                  <h4 className="font-semibold text-foreground mb-2">Risk-Based Pricing</h4>

                  <div className="text-3xl font-bold text-foreground">
                    {data.pricing.apr_percent
                      ? `${data.pricing.apr_percent.toFixed(2)}%`
                      : "—"}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Derived by layering a personalized risk premium of{" "}
                    <span className="font-medium text-foreground">
                      {((data.pricing?.pd ?? 0) * 100).toFixed(2)}%
                    </span>{" "}
                    above the base rate of <span className="font-medium text-foreground">11%</span>.
                  </p>

                  {data.risk_tier && (
                    <p className="text-sm mt-2">
                      Risk Tier:{" "}
                      <span className="font-semibold text-foreground">
                        {data.risk_tier}
                      </span>
                    </p>
                  )}

                  {data.base_rate && data.risk_premium && (
                    <div className="text-sm text-muted-foreground mt-2 space-y-1">
                      <p>Base Rate: {data.base_rate}%</p>
                      <p>Risk Premium: {data.risk_premium}%</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Loan Offers (3/4) */}
              <div className="col-span-1 md:col-span-3">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-3">
                    Approved Loan Offers
                  </h4>

                  {data.loan_options && data.loan_options.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {data.loan_options.slice(0, 4).map((offer, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border bg-background p-3 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-muted-foreground">
                              Option {idx + 1}
                            </span>
                          </div>

                          <div className="text-lg font-semibold text-foreground">
                            SAR {offer.approved_loan_amount?.toLocaleString("en-IN") || "—"}
                          </div>

                          <div className="mt-1 text-sm text-muted-foreground flex justify-between">
                            <span>Tenure:</span>
                            <span>{offer.tenure_months} mo</span>
                          </div>

                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No approved offers available.
                    </p>
                  )}
                </div>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* AI Analysis Summary Card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-4 bg-muted/30">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              AI Analysis Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="p-4 bg-muted/50 rounded-lg space-y-4">
              
              {/* Final Recommendation */}
              {data.Final_Recommendation && (
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Final Recommendation</h4>
                  <p className="text-sm text-black">
                    {data.Final_Recommendation}
                  </p>
                </div>
              )}

              {/* AI Summary */}
              {data.analyst_summary && (
                <div>
                  <h4 className="font-semibold text-foreground mb-1">AI Summary</h4>
                  <p className="text-sm text-foreground">
                    {data.analyst_summary}
                  </p>
                </div>
              )}

              {/* Fallback if nothing is available */}
              {!data.Final_Recommendation && !data.analyst_summary && (
                <p className="text-sm text-muted-foreground">No analysis available.</p>
              )}

            </div>
          </CardContent>
        </Card>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Document Sources */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-4 bg-muted/30">
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Document Sources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {hasFullData ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg border border-success/20">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <span className="text-sm font-medium text-success">Identity Verification (Wathq) - Complete</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg border border-success/20">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <span className="text-sm font-medium text-success">Banking Data (Lean) - Complete</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg border border-success/20">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <span className="text-sm font-medium text-success">Credit Bureau (SIMAH) - Complete</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    <span className="text-sm font-medium text-warning">Limited Data Available</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg border border-success/20">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <span className="text-sm font-medium text-success">Credit Bureau (SIMAH) - Complete</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Deep Dive */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-4 bg-muted/30">
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Analysis Deep Dive
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <Tabs defaultValue="explanations" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="explanations">Summary</TabsTrigger>
                  <TabsTrigger value="payment-history">Payment History</TabsTrigger>
                  <TabsTrigger value="financial-position">Financial Position</TabsTrigger>
                  <TabsTrigger value="loan-portfolio">Loan Portfolio</TabsTrigger> 
                </TabsList>
                
                <TabsContent value="explanations" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="bg-success/10 p-4 rounded-lg border border-success/20">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-5 w-5 text-success" />
                        <span className="font-semibold text-success">Positive Impact</span>
                      </div>
                      <p className="text-sm text-success">{data.explanations?.[0]}</p>
                    </div>
                    
                    <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20">
                      <div className="flex items-center gap-2 mb-3">
                        <XCircle className="h-5 w-5 text-destructive" />
                        <span className="font-semibold text-destructive">Negative Impact</span>
                      </div>
                      <p className="text-sm text-destructive">{data.explanations?.[1]}</p>
                    </div>

                    {hasFullData && (
                      <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20">
                        <div className="flex items-center gap-2 mb-3">
                          <Flag className="h-5 w-5 text-destructive" />
                          <span className="font-semibold text-destructive">Red Flags</span>
                        </div>
                        <div className="space-y-2 text-sm text-destructive">
                          <p>• Judiciary Cases: {data.features?.JudiciaryCaseCount === 0 ? 'None' : data.features?.JudiciaryCaseCount}</p>
                          <p>• Travel Ban: {data.features?.TravelBan === 0 ? 'None' : 'Active'}</p>
                          <p>• Legal Restrictions: {data.features?.LegalRestrictions}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="payment-history" className="space-y-4 mt-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Payment History Score</span>
                      <span className="font-semibold text-foreground">
                        {data.features?.HasDelinquencyHistory === 0 ? '100%' : '94%'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">30-59 Days Late</span>
                      <span className="font-semibold text-foreground">{data.features?.NumberOfTime30_59DaysPastDueNotWorse || 0}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">60-89 Days Late</span>
                      <span className="font-semibold text-foreground">{data.features?.NumberOfTime60_89DaysPastDueNotWorse || 0}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">90+ Days Late</span>
                      <span className="font-semibold text-foreground">{data.features?.NumberOfTimes90DaysLate || 0}</span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="financial-position" className="space-y-4 mt-4">
                  {hasFullData ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm text-muted-foreground">Total Inflows</span>
                        <span className="font-semibold text-foreground">SAR {data.features?.TotalInflows?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm text-muted-foreground">Total Outflows</span>
                        <span className="font-semibold text-foreground">SAR {data.features?.TotalOutflows?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm text-muted-foreground">Net Position</span>
                        <span className="font-semibold text-foreground">SAR {data.features?.NetPosition?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm text-muted-foreground">Average Monthly Inflows</span>
                        <span className="font-semibold text-foreground">SAR {data.features?.AverageMonthlyInflows?.toLocaleString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Building className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Detailed financial data not available</p>
                      <p className="text-xs text-muted-foreground mt-1">Basic credit metrics only</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="loan-portfolio" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Loan Portfolio
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Credit Cards</span>
                          <span className="font-medium text-foreground">{data.features?.CreditCards || 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Personal Loans</span>
                          <span className="font-medium text-foreground">{data.features?.PersonalLoans || 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">BNPL Loans</span>
                          <span className="font-medium text-foreground">{data.features?.BNPLLoans || 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Other Unsecured</span>
                          <span className="font-medium text-foreground">{data.features?.OtherUnsecured || 0}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Real Estate</span>
                          <span className="font-medium text-foreground">{data.features?.RealEstateLoans || 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Gold Loans</span>
                          <span className="font-medium text-foreground">{data.features?.GoldLoans || 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Vehicle Loans</span>
                          <span className="font-medium text-foreground">
                            {data.features?.VehicleLoans || data.features?.NumberRealEstateLoansOrLines || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
              </TabsContent>

              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* SHAP Feature Importance - Full width */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-4 bg-muted/30">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              SHAP Feature Importance
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              SHAP (SHapley Additive exPlanations) analysis shows how each feature contributes to the final credit score prediction. 
              Red bars indicate negative impact on the score, while blue bars show positive contributions.
            </p>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-6">
            <div className="w-full relative">
              <Dialog>
                <DialogTrigger asChild>
                  <div className="relative cursor-pointer group">
                    <img 
                      src={`data:image/png;base64,${data.force_plot}`}
                      alt="SHAP Force Plot showing detailed feature contributions to credit score"
                      className="w-full h-auto rounded-lg object-contain transition-opacity group-hover:opacity-80"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
                      <div className="bg-white/90 p-2 rounded-full">
                        <Expand className="h-6 w-6 text-gray-700" />
                      </div>
                    </div>
                  </div>
                </DialogTrigger>
                <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-4">
                  <div className="w-full h-full flex items-center justify-center">
                    <img 
                      src={`data:image/png;base64,${data.force_plot}`}
                      alt="SHAP Force Plot showing detailed feature contributions to credit score"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreditResults;