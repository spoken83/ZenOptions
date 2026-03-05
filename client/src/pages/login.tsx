import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, Mail } from "lucide-react";
import { SiGoogle, SiGithub } from "react-icons/si";
import { PageSEO } from "@/components/seo/PageSEO";

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/account");
    }
  }, [isAuthenticated, setLocation]);

  const handleLogin = () => {
    // Redirect to backend login endpoint, which will initiate auth flow
    // The auth provider supports email/password, Google, GitHub, Apple, and X
    window.location.href = "/api/login";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <PageSEO 
        title="Login" 
        description="Sign in to your ZenOptions account. Access your watchlist, positions, and trading tools."
      />
      <Card className="w-full max-w-md shadow-2xl border-border/50" data-testid="login-card">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">Zen Options</CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Professional options trading analytics
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pb-8">
          <div className="space-y-3">
            <Button
              onClick={handleLogin}
              className="w-full h-12 text-base font-medium bg-primary hover:bg-primary/90 text-white"
              size="lg"
              data-testid="button-login-email"
            >
              <Mail className="mr-2 h-5 w-5" />
              Continue with Email
            </Button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleLogin}
                variant="outline"
                className="h-12 font-medium border-border hover:bg-muted/50"
                data-testid="button-login-google"
              >
                <SiGoogle className="mr-2 h-5 w-5" />
                Google
              </Button>
              <Button
                onClick={handleLogin}
                variant="outline"
                className="h-12 font-medium border-border hover:bg-muted/50"
                data-testid="button-login-github"
              >
                <SiGithub className="mr-2 h-5 w-5" />
                GitHub
              </Button>
            </div>
          </div>
          
          <div className="pt-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              New to Zen Options?{" "}
              <span className="text-primary font-semibold">Sign up free</span> to track unlimited positions, receive real-time alerts, and access advanced analytics
            </p>
          </div>

          <div className="pt-2">
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-foreground">Free Tier Includes:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex items-center">
                  <span className="text-primary mr-2">✓</span>
                  5 watchlist tickers
                </li>
                <li className="flex items-center">
                  <span className="text-primary mr-2">✓</span>
                  10 active positions
                </li>
                <li className="flex items-center">
                  <span className="text-primary mr-2">✓</span>
                  Daily market scans
                </li>
                <li className="flex items-center">
                  <span className="text-primary mr-2">✓</span>
                  Email alerts
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
