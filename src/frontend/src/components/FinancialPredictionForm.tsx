import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FormData {
  RevolvingUtilizationOfUnsecuredLines: number | '';
  age: number | '';
  NumberOfTime30_59DaysPastDueNotWorse: number | '';
  DebtRatio: number | '';
  MonthlyIncome: number | '';
  NumberOfOpenCreditLinesAndLoans: number | '';
  NumberOfTimes90DaysLate: number | '';
  NumberRealEstateLoansOrLines: number | '';
  NumberOfTime60_89DaysPastDueNotWorse: number | '';
  NumberOfDependents: number | '';
}

interface PredictionResult {
  prediction?: number;
  probability?: number;
  score?: number;
  percentile?: number;
  explanations?: string[];
  features?: Record<string, number>;
  force_plot?: string;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

const fieldLabels = {
  RevolvingUtilizationOfUnsecuredLines: "Revolving Utilization of Unsecured Lines",
  age: "Age",
  NumberOfTime30_59DaysPastDueNotWorse: "Number of 30-59 Days Past Due (Not Worse)",
  DebtRatio: "Debt Ratio",
  MonthlyIncome: "Monthly Income (SAR)",
  NumberOfOpenCreditLinesAndLoans: "Number of Open Credit Lines and Loans",
  NumberOfTimes90DaysLate: "Number of Times 90+ Days Late",
  NumberRealEstateLoansOrLines: "Number of Real Estate Loans or Lines",
  NumberOfTime60_89DaysPastDueNotWorse: "Number of 60-89 Days Past Due (Not Worse)",
  NumberOfDependents: "Number of Dependents"
};

export default function FinancialPredictionForm() {
  const [formData, setFormData] = useState<FormData>({
    RevolvingUtilizationOfUnsecuredLines: '',
    age: '',
    NumberOfTime30_59DaysPastDueNotWorse: '',
    DebtRatio: '',
    MonthlyIncome: '',
    NumberOfOpenCreditLinesAndLoans: '',
    NumberOfTimes90DaysLate: '',
    NumberRealEstateLoansOrLines: '',
    NumberOfTime60_89DaysPastDueNotWorse: '',
    NumberOfDependents: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const { toast } = useToast();

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value === '' ? '' : Number(value)
    }));
  };

  const validateForm = (): boolean => {
    const requiredFields = Object.keys(formData) as (keyof FormData)[];
    const emptyFields = requiredFields.filter(field => formData[field] === '');
    
    if (emptyFields.length > 0) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields.",
        variant: "destructive"
      });
      return false;
    }
    return true;
  };

  const checkIfAllFieldsEmpty = (): boolean => {
    const requiredFields = Object.keys(formData) as (keyof FormData)[];
    return requiredFields.every(field => formData[field] === '');
  };

  const getMockData = () => {
    return {
      score: 607.66,
      percentile: 69.87,
      explanations: [
        'Your credit score is positively impacted by 30-59 Days Past Due, Debt Ratio.',
        'Your credit score is negatively impacted by SeriousDelinqRate, Revolving Utilization.'
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
      force_plot: "force_plot_b64 string"
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if all fields are empty and use mock data
    if (checkIfAllFieldsEmpty()) {
      setIsLoading(true);
      setResult(null);
      
      // Simulate loading time
      setTimeout(() => {
        setResult(getMockData());
        setIsLoading(false);
        toast({
          title: "Mock Prediction Complete",
          description: "Sample financial risk assessment displayed (no data entered).",
        });
      }, 1500);
      return;
    }

    if (!validateForm()) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${BACKEND_URL}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      
      toast({
        title: "Prediction Complete",
        description: "Your financial risk assessment has been processed.",
      });
    } catch (error) {
      console.error('Error submitting form:', error);
      toast({
        title: "Error",
        description: "Failed to get prediction. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-foreground">Financial Risk Assessment</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Provide your financial information below to get a risk prediction and probability analysis.
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Financial Information</CardTitle>
            <CardDescription>
              Enter your financial details accurately for the most reliable prediction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(fieldLabels).map(([field, label]) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={field} className="text-sm font-medium">
                      {label}
                    </Label>
                    <Input
                      id={field}
                      type="number"
                      step="any"
                      value={formData[field as keyof FormData]}
                      onChange={(e) => handleInputChange(field as keyof FormData, e.target.value)}
                      placeholder={`Enter ${label.toLowerCase()}`}
                      className="w-full"
                      disabled={isLoading}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-center pt-4">
                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full md:w-auto px-8 py-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Get Prediction'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {result && (
          <Card className="shadow-lg border-t-4 border-t-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.prediction === 1 ? (
                  <TrendingDown className="h-5 w-5 text-destructive" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-success" />
                )}
                Prediction Result
              </CardTitle>
              <CardDescription>
                Based on the financial information provided
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    {result.score ? 'Credit Score' : 'Risk Classification'}
                  </Label>
                  <div className={`text-2xl font-bold ${
                    result.score ? 'text-foreground' : 
                    result.prediction === 1 ? 'text-destructive' : 'text-success'
                  }`}>
                    {result.score ? Math.round(result.score) : 
                     result.prediction === 1 ? 'High Risk' : 'Low Risk'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    {result.percentile !== undefined ? 'Percentile' : 'Probability Score'}
                  </Label>
                  <div className="text-2xl font-bold text-foreground">
                    {result.percentile !== undefined ? 
                     `${result.percentile.toFixed(1)}%` : 
                     `${((result.probability || 0) * 100).toFixed(1)}%`}
                  </div>
                </div>
              </div>
              
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  This prediction is based on the financial data you provided. 
                  The probability score indicates the confidence level of the assessment.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}