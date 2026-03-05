import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Zap, Clock, TrendingUp, Bell, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { PageSEO } from "@/components/seo/PageSEO";
import { usePricing } from "@/lib/pricing";

const TIER_FEATURES = {
  free: {
    name: "Free",
    features: [
      { name: "3 watchlist tickers", included: true },
      { name: "3 positions", included: true },
      { name: "1 daily scan (market open)", included: true },
      { name: "2 manual scans per day", included: true },
      { name: "ZenStatus updates once daily", included: true },
      { name: "Telegram alerts", included: false },
      { name: "Tiger Brokers sync", included: false },
      { name: "MooMoo sync", included: false },
      { name: "Priority scanning", included: false },
    ]
  },
  pro: {
    name: "Pro",
    features: [
      { name: "Unlimited watchlist", included: true },
      { name: "Unlimited positions", included: true },
      { name: "4 automated scans daily", included: true },
      { name: "Real-time ZenStatus updates", included: true },
      { name: "Unlimited manual scans", included: true },
      { name: "Telegram alerts", included: true },
      { name: "Tiger Brokers auto-sync", included: true, comingSoon: true },
      { name: "MooMoo auto-sync", included: true, comingSoon: true },
      { name: "Priority scanning engine", included: true, comingSoon: true },
    ]
  }
};

export default function Subscription() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const pricing = usePricing();

  useEffect(() => {
    // Check for success/cancel query params
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast({
        title: "Subscription Activated!",
        description: "Welcome to Pro! All features are now unlocked.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      // Clean URL
      window.history.replaceState({}, '', '/subscription');
    } else if (params.get('canceled') === 'true') {
      toast({
        title: "Checkout Canceled",
        description: "No worries, you can upgrade anytime.",
        variant: "destructive",
      });
      // Clean URL
      window.history.replaceState({}, '', '/subscription');
    }
  }, [toast]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/create-checkout-session", {});
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Checkout Error",
        description: error.message || "Failed to start checkout process",
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/create-portal-session", {});
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Portal Error",
        description: error.message || "Failed to open billing portal",
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please log in to manage your subscription</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation('/')} data-testid="button-go-home">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentTier = user.subscriptionTier || 'free';
  const isPro = currentTier === 'pro';

  return (
    <div className="container mx-auto px-4 py-12">
      <PageSEO 
        title="Your Subscription" 
        description="Manage your ZenOptions subscription. Upgrade to Pro for unlimited access to all trading features."
      />
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Your subscription</h1>
          <p className="text-muted-foreground text-lg">
            Choose the plan that fits your trading strategy
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-stretch">
          <Card className={`flex flex-col ${currentTier === 'free' ? 'border-2 border-primary' : ''}`}>
            <CardHeader>
              <CardTitle className="text-3xl">{TIER_FEATURES.free.name}</CardTitle>
              <div className="mt-4">
                <span className="text-4xl font-bold">{pricing.free.price}</span>
                <span className="text-muted-foreground">{pricing.free.period}</span>
                <div className="mt-2 h-7"></div>
              </div>
              <CardDescription className="text-base mt-4">
                Perfect for trying out the platform
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <ul className="space-y-3 flex-grow">
                {TIER_FEATURES.free.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    {feature.included ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    )}
                    <span className={feature.included ? '' : 'text-muted-foreground'}>
                      {feature.name}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {currentTier === 'free' ? (
                  <Badge className="w-full justify-center py-2" data-testid="badge-current-plan-free">
                    Current Plan
                  </Badge>
                ) : (
                  <Button variant="outline" className="w-full" disabled data-testid="button-downgrade-disabled">
                    Current: Pro Plan
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={`flex flex-col ${currentTier === 'pro' ? 'border-2 border-primary' : 'border-2 border-primary/50'}`}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-3xl">{TIER_FEATURES.pro.name}</CardTitle>
                <Zap className="h-6 w-6 text-yellow-500" />
              </div>
              <div className="mt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl text-muted-foreground line-through">{pricing.pro.regularPrice}</span>
                  <span className="text-4xl font-bold">{pricing.pro.promoPrice}</span>
                  <span className="text-muted-foreground">{pricing.pro.period}</span>
                </div>
                <div className="mt-2">
                  <span className="inline-block bg-green-500/20 text-green-600 dark:text-green-400 text-sm font-medium px-3 py-1 rounded-full">
                    Launch Special - Save {pricing.pro.discountPercent}%
                  </span>
                </div>
              </div>
              <CardDescription className="text-base mt-4">
                Full automation for serious options traders
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <ul className="space-y-3 flex-grow">
                {TIER_FEATURES.pro.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="font-medium">
                      {feature.name}
                      {feature.comingSoon && (
                        <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                          Coming Soon
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 space-y-3">
                {currentTier === 'pro' ? (
                  <>
                    <Badge className="w-full justify-center py-2" data-testid="badge-current-plan-pro">
                      Current Plan
                    </Badge>
                    {user.stripeCustomerId && (
                      <Button
                        onClick={() => portalMutation.mutate()}
                        disabled={portalMutation.isPending}
                        variant="outline"
                        className="w-full"
                        data-testid="button-manage-subscription"
                      >
                        {portalMutation.isPending ? "Loading..." : "Manage Subscription"}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    className="w-full"
                    size="lg"
                    data-testid="button-upgrade-to-pro"
                  >
                    {checkoutMutation.isPending ? "Loading..." : "Upgrade to Pro"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Real-Time Scanning</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Pro plan includes automated scans at pre-opening, market open, and close times
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Instant Alerts</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Get Telegram notifications for take-profit, stop-loss, and DTE management
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Broker Integration</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Automatically sync positions from Tiger Brokers for seamless tracking
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
