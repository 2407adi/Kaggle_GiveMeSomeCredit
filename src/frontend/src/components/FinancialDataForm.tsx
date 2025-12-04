import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calculator } from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

interface FinancialData {
  RevolvingUtilizationOfUnsecuredLines: number;
  age: number;
  NumberOfTime30_59DaysPastDueNotWorse: number;
  DebtRatio: number;
  MonthlyIncome: number;
  NumberOfOpenCreditLinesAndLoans: number;
  NumberOfTimes90DaysLate: number;
  NumberRealEstateLoansOrLines: number;
  NumberOfTime60_89DaysPastDueNotWorse: number;
  NumberOfDependents: number;
}

interface FinancialDataFormProps {
  checkAuth: (action: () => void) => void;
}

export default function FinancialDataForm({ checkAuth }: FinancialDataFormProps) {
  const [formData, setFormData] = useState<FinancialData>({
    RevolvingUtilizationOfUnsecuredLines: 0,
    age: 0,
    NumberOfTime30_59DaysPastDueNotWorse: 0,
    DebtRatio: 0,
    MonthlyIncome: 0,
    NumberOfOpenCreditLinesAndLoans: 0,
    NumberOfTimes90DaysLate: 0,
    NumberRealEstateLoansOrLines: 0,
    NumberOfTime60_89DaysPastDueNotWorse: 0,
    NumberOfDependents: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const handleInputChange = (field: keyof FinancialData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value === "" ? 0 : parseFloat(value) || 0
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    checkAuth(async () => {
      setIsLoading(true);

      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

        const response = await fetch(`${backendUrl}/predict_1`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch credit assessment");
        }

        const result = await response.json();

        // ✅ Pass result into ResultsPage via state
        navigate(`/results/manual`, { state: result });
      } catch (error) {
        console.error("Error submitting manual data:", error);
      } finally {
        setIsLoading(false);
      }
    });
  };


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="lg" 
          className="w-full px-8 py-3 text-lg border-2"
        >
          <Calculator className="w-5 h-5 mr-2" />
          Enter Financial Data Manually
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Enter Your Financial Information</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                value={formData.age || ""}
                onChange={(e) => handleInputChange("age", e.target.value)}
                placeholder="Enter age"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthlyIncome">Monthly Income (SAR)</Label>
              <Input
                id="monthlyIncome"
                type="number"
                step="100"
                value={formData.MonthlyIncome || ""}
                onChange={(e) => handleInputChange("MonthlyIncome", e.target.value)}
                placeholder="Enter monthly income"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="debtRatio">Debt Ratio (0-1)</Label>
              <Input
                id="debtRatio"
                type="number"
                step="0.01"
                value={formData.DebtRatio || ""}
                onChange={(e) => handleInputChange("DebtRatio", e.target.value)}
                placeholder="e.g., 0.35"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="revolvingUtilization">Revolving Credit Utilization (0-1)</Label>
              <Input
                id="revolvingUtilization"
                type="number"
                step="0.01"
                value={formData.RevolvingUtilizationOfUnsecuredLines || ""}
                onChange={(e) => handleInputChange("RevolvingUtilizationOfUnsecuredLines", e.target.value)}
                placeholder="e.g., 0.35"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="openLoans">Number of Open Credit Lines & Loans</Label>
              <Input
                id="openLoans"
                type="number"
                value={formData.NumberOfOpenCreditLinesAndLoans || ""}
                onChange={(e) => handleInputChange("NumberOfOpenCreditLinesAndLoans", e.target.value)}
                placeholder="Enter number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="realEstateLoans">Number of Real Estate Loans</Label>
              <Input
                id="realEstateLoans"
                type="number"
                value={formData.NumberRealEstateLoansOrLines || ""}
                onChange={(e) => handleInputChange("NumberRealEstateLoansOrLines", e.target.value)}
                placeholder="Enter number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dependents">Number of Dependents</Label>
              <Input
                id="dependents"
                type="number"
                value={formData.NumberOfDependents || ""}
                onChange={(e) => handleInputChange("NumberOfDependents", e.target.value)}
                placeholder="Enter number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="late30to59">Times 30-59 Days Past Due</Label>
              <Input
                id="late30to59"
                type="number"
                value={formData.NumberOfTime30_59DaysPastDueNotWorse || ""}
                onChange={(e) => handleInputChange("NumberOfTime30_59DaysPastDueNotWorse", e.target.value)}
                placeholder="Enter past due instances"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="late60to89">Times 60-89 Days Past Due</Label>
              <Input
                id="late60to89"
                type="number"
                value={formData.NumberOfTime60_89DaysPastDueNotWorse || ""}
                onChange={(e) => handleInputChange("NumberOfTime60_89DaysPastDueNotWorse", e.target.value)}
                placeholder="Enter past due instances"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="late90plus">Times 90+ Days Late</Label>
              <Input
                id="late90plus"
                type="number"
                value={formData.NumberOfTimes90DaysLate || ""}
                onChange={(e) => handleInputChange("NumberOfTimes90DaysLate", e.target.value)}
                placeholder="Enter late payment instances"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? "Processing..." : "Get Credit Assessment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
