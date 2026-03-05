import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp } from "lucide-react";
import { SiGoogle, SiGithub, SiApple } from "react-icons/si";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "login" | "signup";
}

export function AuthModal({ open, onOpenChange, defaultTab = "signup" }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  // Sync activeTab with defaultTab whenever modal opens or defaultTab changes
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  const handleAuth = () => {
    // Auth0 handles both signup and login automatically via Universal Login
    window.location.href = "/api/login";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 bg-background" data-testid="auth-modal">
        <div className="grid md:grid-cols-2">
          {/* Left side - Branding/Marketing */}
          <div className="hidden md:flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-background p-12 border-r border-border">
            <div className="space-y-6 text-center">
              <div className="mx-auto w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                <TrendingUp className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-foreground">
                  Options Trading Analytics
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Professional-grade position monitoring, automated alerts, and intelligent market scanning for options traders
                </p>
              </div>
              <div className="pt-6 space-y-3 text-left">
                <div className="flex items-start gap-3">
                  <div className="text-primary mt-0.5">✓</div>
                  <div>
                    <div className="font-medium text-sm text-foreground">Real-time Position Tracking</div>
                    <div className="text-xs text-muted-foreground">Monitor credit spreads, iron condors & LEAPS</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-primary mt-0.5">✓</div>
                  <div>
                    <div className="font-medium text-sm text-foreground">Smart Alerts</div>
                    <div className="text-xs text-muted-foreground">Take-profit, stop-loss & DTE notifications</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="text-primary mt-0.5">✓</div>
                  <div>
                    <div className="font-medium text-sm text-foreground">Automated Scanning</div>
                    <div className="text-xs text-muted-foreground">Daily market scans with technical indicators</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Auth Form */}
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="sr-only">
                {activeTab === "login" ? "Log In to Zen Options" : "Join Zen Options"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Choose your preferred authentication method to continue
              </DialogDescription>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8">
                  <TabsTrigger 
                    value="login" 
                    className="text-base font-medium"
                    data-testid="tab-login"
                  >
                    LOG IN
                  </TabsTrigger>
                  <TabsTrigger 
                    value="signup" 
                    className="text-base font-medium"
                    data-testid="tab-signup"
                  >
                    JOIN FOR FREE
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-6">
                  <div className="space-y-4">
                    <div className="text-center space-y-2">
                      <h3 className="text-xl font-semibold text-foreground">Welcome Back</h3>
                      <p className="text-sm text-muted-foreground">
                        Sign in with your account to continue
                      </p>
                    </div>

                    <Button
                      onClick={handleAuth}
                      className="w-full h-12 bg-primary hover:bg-primary/90"
                      data-testid="button-login-continue"
                    >
                      Continue to Sign In
                    </Button>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">or sign in with</span>
                      </div>
                    </div>

                    {/* Social Auth Buttons */}
                    <div className="grid grid-cols-3 gap-3">
                      <Button
                        onClick={handleAuth}
                        variant="outline"
                        className="h-12 border-2"
                        data-testid="button-auth-google"
                      >
                        <SiGoogle className="h-5 w-5 text-[#4285F4]" />
                      </Button>
                      <Button
                        onClick={handleAuth}
                        variant="outline"
                        className="h-12 border-2"
                        data-testid="button-auth-github"
                      >
                        <SiGithub className="h-5 w-5" />
                      </Button>
                      <Button
                        onClick={handleAuth}
                        variant="outline"
                        className="h-12 border-2"
                        data-testid="button-auth-apple"
                      >
                        <SiApple className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="pt-2 text-center">
                      <p className="text-xs text-muted-foreground">
                        Secure authentication powered by Auth0
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="signup" className="space-y-6">
                  <div className="space-y-4">
                    <div className="text-center space-y-2">
                      <h3 className="text-xl font-semibold text-foreground">Get Started Free</h3>
                      <p className="text-sm text-muted-foreground">
                        Create your account and start trading smarter
                      </p>
                    </div>

                    <Button
                      onClick={handleAuth}
                      className="w-full h-12 bg-primary hover:bg-primary/90"
                      data-testid="button-signup-continue"
                    >
                      Create Free Account
                    </Button>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">or sign up with</span>
                      </div>
                    </div>

                    {/* Social Auth Buttons */}
                    <div className="grid grid-cols-3 gap-3">
                      <Button
                        onClick={handleAuth}
                        variant="outline"
                        className="h-12 border-2"
                        data-testid="button-auth-google-signup"
                      >
                        <SiGoogle className="h-5 w-5 text-[#4285F4]" />
                      </Button>
                      <Button
                        onClick={handleAuth}
                        variant="outline"
                        className="h-12 border-2"
                        data-testid="button-auth-github-signup"
                      >
                        <SiGithub className="h-5 w-5" />
                      </Button>
                      <Button
                        onClick={handleAuth}
                        variant="outline"
                        className="h-12 border-2"
                        data-testid="button-auth-apple-signup"
                      >
                        <SiApple className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="pt-2 text-center">
                      <p className="text-xs text-muted-foreground">
                        By creating an account, you agree to our Terms of Service and Privacy Policy
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </DialogHeader>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
