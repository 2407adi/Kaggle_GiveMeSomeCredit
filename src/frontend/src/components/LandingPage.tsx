import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, TrendingUp, Clock, CheckCircle, LogOut, User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import FinancialDataForm from "@/components/FinancialDataForm";
import LoginModal from "@/components/LoginModal";

export default function LandingPage() {
  const [customerId, setCustomerId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();

  const checkAuthAndExecute = (action: () => void) => {
    if (isAuthenticated) {
      action();
    } else {
      setPendingAction(() => action);
      setShowLoginModal(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId.trim()) return;
    
    checkAuthAndExecute(() => {
      setIsLoading(true);
      try {
        navigate(`/results/${customerId}`);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setIsLoading(false);
      }
    });
  };

  const handleLoginSuccess = () => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleScrollToForm = () => {
    checkAuthAndExecute(() => {
      document.getElementById('customerId')?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header with Login */}
      <header className="absolute top-0 right-0 p-6 z-10">
        {isAuthenticated ? (
          <Button 
            onClick={logout}
            variant="outline"
            size="sm"
            className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        ) : (
          <Button 
            onClick={() => setShowLoginModal(true)}
            variant="outline"
            size="sm"
            className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            <User className="w-4 h-4" />
            Login
          </Button>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 px-4">
        <div className="max-w-6xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 leading-tight">
              <span className="text-blue-600">LendSure</span> - Your Trusted
              <span className="text-blue-600"> Credit Partner</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-600 max-w-3xl mx-auto">
              Advanced AI-powered credit assessment platform that provides instant, accurate risk evaluation for financial institutions and lenders
            </p>
          </div>
          
          <div className="max-w-md mx-auto space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customerId" className="text-lg font-medium text-slate-900">
                  Enter Your National ID
                </Label>
                <Input
                  id="customerId"
                  type="number"
                  placeholder="e.g. 12345"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="text-center text-lg h-12 border-slate-300 focus:border-blue-500"
                  required
                />
              </div>
              <Button 
                type="submit" 
                size="lg" 
                className="w-full px-8 py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isLoading || !customerId.trim()}
              >
                {isLoading ? "Loading..." : "Get My Credit Score"}
              </Button>
            </form>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-slate-50 px-4 text-slate-600">or</span>
              </div>
            </div>
            
            <FinancialDataForm checkAuth={checkAuthAndExecute} />
            
            <p className="text-sm text-slate-600 text-center">
              Instant results • Completely secure
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Why Choose Our Assessment?
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Our cutting-edge technology provides accurate, instant results to help you understand your financial standing
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                  <Clock className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">Instant Results</h3>
                <p className="text-slate-600">
                  Get your risk assessment in under 30 seconds with our advanced AI algorithms
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                  <Shield className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">Bank-Grade Security</h3>
                <p className="text-slate-600">
                  Your financial data is protected with enterprise-level encryption and security protocols
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                  <TrendingUp className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">Actionable Insights</h3>
                <p className="text-slate-600">
                  Receive detailed probability scores and risk classifications to guide your financial decisions
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              How It Works
            </h2>
            <p className="text-lg text-slate-600">
              Simple, fast, and completely secure process
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                1
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Enter Your Information</h3>
              <p className="text-slate-600">
                Provide basic financial details including debt ratio, income, and credit history
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                2
              </div>
              <h3 className="text-lg font-semibold text-slate-900">AI Analysis</h3>
              <p className="text-slate-600">
                Our advanced machine learning model analyzes your data against thousands of financial patterns
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                3
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Get Your Results</h3>
              <p className="text-slate-600">
                Receive your risk classification and probability score with detailed explanations
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Ready to Know Your Risk?
            </h2>
            <p className="text-lg text-slate-600">
              Join thousands of users who trust our platform for accurate financial assessments
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              onClick={handleScrollToForm}
              size="lg" 
              className="px-8 py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              Start Your Assessment Now
            </Button>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-slate-600 mt-8">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>No credit check required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>100% secure & confidential</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span>Instant results</span>
            </div>
          </div>
        </div>
      </section>

      <LoginModal 
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}