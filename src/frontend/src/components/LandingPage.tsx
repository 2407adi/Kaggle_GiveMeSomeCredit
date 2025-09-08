import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 px-4">
        <div className="max-w-6xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
              Know Your
              <span className="text-primary"> Financial Risk</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              Get instant insights into your credit risk profile with our advanced AI-powered assessment tool
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button asChild size="lg" className="px-8 py-3 text-lg">
              <Link to="/assessment">
                Start Assessment
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              Takes only 2 minutes • Completely secure
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Why Choose Our Assessment?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our cutting-edge technology provides accurate, instant results to help you understand your financial standing
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Clock className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">Instant Results</h3>
                <p className="text-muted-foreground">
                  Get your risk assessment in under 30 seconds with our advanced AI algorithms
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">Bank-Grade Security</h3>
                <p className="text-muted-foreground">
                  Your financial data is protected with enterprise-level encryption and security protocols
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <TrendingUp className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">Actionable Insights</h3>
                <p className="text-muted-foreground">
                  Receive detailed probability scores and risk classifications to guide your financial decisions
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground">
              Simple, fast, and completely secure process
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                1
              </div>
              <h3 className="text-lg font-semibold text-foreground">Enter Your Information</h3>
              <p className="text-muted-foreground">
                Provide basic financial details including debt ratio, income, and credit history
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                2
              </div>
              <h3 className="text-lg font-semibold text-foreground">AI Analysis</h3>
              <p className="text-muted-foreground">
                Our advanced machine learning model analyzes your data against thousands of financial patterns
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                3
              </div>
              <h3 className="text-lg font-semibold text-foreground">Get Your Results</h3>
              <p className="text-muted-foreground">
                Receive your risk classification and probability score with detailed explanations
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 bg-primary/5">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Ready to Know Your Risk?
            </h2>
            <p className="text-lg text-muted-foreground">
              Join thousands of users who trust our platform for accurate financial assessments
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button asChild size="lg" className="px-8 py-3 text-lg">
              <Link to="/assessment">
                Start Your Assessment Now
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-muted-foreground mt-8">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <span>No credit check required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <span>100% secure & confidential</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <span>Instant results</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}