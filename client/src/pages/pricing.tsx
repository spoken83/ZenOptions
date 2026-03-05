import { useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, XCircle, Zap, Star, Info, Shield, Clock, TrendingUp } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAuth } from "@/hooks/useAuth";
import { PageSEO } from "@/components/seo/PageSEO";
import { usePricing } from "@/lib/pricing";

const TIER_FEATURES = {
  free: {
    name: "Free",
    description: "Perfect for trying out the platform",
    features: [
      { name: "20 watchlist", included: true, strikethrough: "3 watchlist tickers", limitedTime: true },
      { name: "20 positions", included: true, strikethrough: "3 positions", limitedTime: true },
      { name: "4 auto scans", included: true, strikethrough: "1 auto scan", limitedTime: true, tooltip: "Automated scans at pre-market, market open, intraday, and market close" },
      { name: "20 manual scans", included: true, strikethrough: "2 scans", limitedTime: true, tooltip: "Run up to 20 on-demand scans each day" },
      { name: "ZenStatus updates once daily", included: true },
      { name: "Telegram alerts", included: false },
      { name: "Tiger Brokers sync", included: false },
      { name: "MooMoo sync", included: false },
      { name: "Priority scanning", included: false },
    ]
  },
  pro: {
    name: "Pro",
    description: "For serious options traders",
    features: [
      { name: "Unlimited watchlist", included: true },
      { name: "Unlimited positions", included: true },
      { name: "4 automated scans daily", included: true, tooltip: "Pre-market, market open, intraday, and market close scans" },
      { name: "Unlimited manual scans", included: true },
      { name: "Real-time ZenStatus updates", included: true, tooltip: "Position status updated every minute during market hours" },
      { name: "Telegram alerts", included: true },
      { name: "Tiger Brokers auto-sync", included: true, comingSoon: true },
      { name: "MooMoo auto-sync", included: true, comingSoon: true },
      { name: "Priority scanning engine", included: true, comingSoon: true },
    ]
  }
};

interface FeatureItemProps {
  feature: {
    name: string;
    included: boolean;
    tooltip?: string;
    comingSoon?: boolean;
    strikethrough?: string;
    limitedTime?: boolean;
  };
  variant: "free" | "pro";
}

function FeatureItem({ feature, variant }: FeatureItemProps) {
  return (
    <li className="flex items-start gap-3">
      {feature.included ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle className="h-5 w-5 text-slate-300 mt-0.5 flex-shrink-0" />
      )}
      <span className={feature.included ? 'text-slate-700' : 'text-slate-400'}>
        {feature.strikethrough && (
          <>
            <span className="line-through text-slate-400 mr-2">{feature.strikethrough}</span>
            <span className="font-semibold text-emerald-600">{feature.name}</span>
            {feature.limitedTime && (
              <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                Limited Time
              </span>
            )}
          </>
        )}
        {!feature.strikethrough && (
          <>
            {feature.name}
            {feature.comingSoon && (
              <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                Coming Soon
              </span>
            )}
          </>
        )}
      </span>
      {feature.tooltip && feature.included && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-slate-400 cursor-help flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p>{feature.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </li>
  );
}

export default function Pricing() {
  const { openAuthModal } = useAuthModal();
  const { user, isAuthenticated } = useAuth();
  const pricing = usePricing();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <PageSEO 
        title="Pricing" 
        description="Simple, transparent pricing for options trading tools. Start free or upgrade to Pro for unlimited access and advanced features."
      />
      <section className="py-16 sm:py-24 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block bg-emerald-100 text-emerald-700 text-sm font-medium px-4 py-1.5 rounded-full mb-4">
              Simple Pricing
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4" data-testid="pricing-title">
              Choose your plan
            </h1>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Start free, upgrade when you're ready for unlimited power.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
            <Card className="bg-white border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col" data-testid="pricing-free">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-semibold text-slate-900">{TIER_FEATURES.free.name}</CardTitle>
                <div className="mt-6">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-5xl font-bold text-slate-900">{pricing.free.price}</span>
                    <span className="text-slate-500 text-lg">{pricing.free.period}</span>
                  </div>
                  <p className="text-slate-500 text-sm mt-2 h-5"></p>
                </div>
                <CardDescription className="text-base mt-4 text-slate-600">
                  {TIER_FEATURES.free.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-grow pt-4 border-t border-slate-100">
                <ul className="space-y-4 flex-grow">
                  {TIER_FEATURES.free.features.map((feature, idx) => (
                    <FeatureItem key={idx} feature={feature} variant="free" />
                  ))}
                </ul>
                <div className="mt-8">
                  {isAuthenticated ? (
                    <Button asChild variant="outline" className="w-full h-12 text-base border-slate-300 hover:bg-slate-50" data-testid="button-go-dashboard">
                      <Link href="/account">Go to Dashboard</Link>
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full h-12 text-base border-slate-300 hover:bg-slate-50" 
                      onClick={() => openAuthModal("signup")}
                      data-testid="button-get-started-free"
                    >
                      Get Started Free
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-2 border-emerald-500 shadow-lg shadow-emerald-500/10 relative flex flex-col" data-testid="pricing-pro">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="bg-emerald-500 text-white px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 shadow-md">
                  <Star className="w-4 h-4" /> Most Popular
                </span>
              </div>
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
                  {TIER_FEATURES.pro.name}
                  <Zap className="w-5 h-5 text-amber-500" />
                </CardTitle>
                <div className="mt-6">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-2xl text-slate-400 line-through">{pricing.pro.regularPrice}</span>
                    <span className="text-5xl font-bold text-slate-900">{pricing.pro.promoPrice}</span>
                    <span className="text-slate-500 text-lg">{pricing.pro.period}</span>
                    <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-1 rounded-full">
                      Save {pricing.pro.discountPercent}%
                    </span>
                  </div>
                  <p className="text-slate-500 text-sm mt-2">Cancel anytime. No commitment.</p>
                </div>
                <CardDescription className="text-base mt-4 text-slate-600">
                  {TIER_FEATURES.pro.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-grow pt-4 border-t border-slate-100">
                <ul className="space-y-4 flex-grow">
                  {TIER_FEATURES.pro.features.map((feature, idx) => (
                    <FeatureItem key={idx} feature={feature} variant="pro" />
                  ))}
                </ul>
                <div className="mt-8">
                  {isAuthenticated ? (
                    <Button asChild className="w-full h-12 text-base bg-emerald-500 hover:bg-emerald-600 shadow-md" data-testid="button-manage-subscription">
                      <Link href="/subscription">
                        {user?.subscriptionTier === 'pro' ? 'Manage Subscription' : 'Upgrade to Pro'}
                      </Link>
                    </Button>
                  ) : (
                    <Button 
                      className="w-full h-12 text-base bg-emerald-500 hover:bg-emerald-600 shadow-md" 
                      onClick={() => openAuthModal("signup")}
                      data-testid="button-start-pro-trial"
                    >
                      Start with Pro
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-20 max-w-4xl mx-auto">
            <div className="grid sm:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Secure & Private</h3>
                <p className="text-slate-600 text-sm">Your data is encrypted.<br />ZenOptions is read-only — we never access your funds or place trades.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Cancel Anytime</h3>
                <p className="text-slate-600 text-sm">No long-term contracts.<br />Cancel your subscription anytime — no questions asked.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">Proven Framework</h3>
                <p className="text-slate-600 text-sm">Rules-based guidance trusted by premium sellers worldwide.</p>
              </div>
            </div>
          </div>

          <div className="mt-16 text-center">
            <p className="text-slate-500 text-sm">
              Questions? <Link href="/contact" className="text-emerald-600 hover:underline font-medium">Contact us</Link> or check our <Link href="/how-it-works#faq" className="text-emerald-600 hover:underline font-medium">FAQ</Link>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
