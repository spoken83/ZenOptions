import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSEO } from "@/components/seo/PageSEO";
import { FAQSchema } from "@/components/seo/FAQSchema";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { 
  Shield, 
  Search, 
  Target, 
  Bell, 
  TrendingUp, 
  BarChart3, 
  CheckCircle, 
  AlertTriangle,
  Clock,
  Zap,
  Database,
  Brain,
  ArrowRight,
  HelpCircle
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    question: "What is ZenOptions?",
    answer: "ZenOptions is an automated options monitoring system designed for traders who use Credit Spreads, Iron Condors, and LEAPS strategies. It provides real-time position tracking, actionable guidance through our ZenStatus system, and Telegram alerts to help you trade with confidence and peace of mind."
  },
  {
    question: "What do the ZenStatus levels mean?",
    answer: "ZEN means the position is healthy with comfortable margins and no action needed. PROFIT READY indicates the position has reached a profit target and is ready to close. MONITOR means the position needs watching due to changing market conditions. ACTION NEEDED means the position requires immediate attention due to being at risk."
  },
  {
    question: "What's the difference between Free and Pro?",
    answer: "Free tier includes 3 watchlist tickers, 3 positions, 1 automated scan daily, and 2 manual scans per day - great for getting started. Pro tier ($9/month) offers unlimited watchlist, unlimited positions, 4 automated scans daily, unlimited manual scans, plus Telegram alerts and broker integration for automatic position syncing."
  },
  {
    question: "How do Telegram alerts work?",
    answer: "Connect your Telegram account in Settings by adding your Chat ID. Once connected, you'll receive real-time notifications when your positions change status, reach profit targets, or require attention. Alerts are deduplicated to avoid spam."
  },
  {
    question: "Is ZenOptions providing investment advice?",
    answer: "No. ZenOptions is an educational analysis and monitoring tool. We provide systematic guidance based on your configured rules, but all trading decisions are yours. Options trading involves substantial risk of loss."
  },
  {
    question: "Where does your market data come from?",
    answer: "We use institutional-grade data providers including Polygon.io for real-time stock and options prices, FRED for VIX and economic indicators, and OpenAI GPT-4 for market context analysis."
  }
];

const BREADCRUMB_ITEMS = [
  { name: "Home", url: "https://zenoptions.app/" },
  { name: "How It Works", url: "https://zenoptions.app/how-it-works" }
];

export default function HowItWorks() {
  const [location] = useLocation();
  
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === '#faq') {
      setTimeout(() => {
        const element = document.getElementById('faq');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  return (
    <div className="min-h-screen">
      <PageSEO 
        title="How It Works" 
        description="Learn how ZenOptions works with a systematic approach to options trading. Removes emotion and guesswork with ZenStatus guidance."
      />
      <FAQSchema items={FAQ_ITEMS} />
      <BreadcrumbSchema items={BREADCRUMB_ITEMS} />
      {/* Hero Section */}
      <section className="py-12 sm:py-16 px-4 sm:px-8 text-center border-b border-slate-700/50 bg-gradient-to-br from-slate-900 to-slate-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-radial-green-glow pointer-events-none"></div>
        <div className="max-w-[900px] mx-auto relative z-10">
          <h1 className="text-3xl sm:text-5xl font-bold text-white mb-6" data-testid="how-it-works-title">
            How ZenOptions Works
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">
            A systematic approach to options trading that removes emotion and guesswork. 
            Monitor your positions with confidence and sleep peacefully.
          </p>
        </div>
      </section>

      {/* ZenStatus Section - LIGHT */}
      <section className="py-12 sm:py-16 px-4 sm:px-8 border-b border-border bg-background">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 mb-4">
              <Shield className="w-5 h-5" />
              <span className="font-semibold">Core Feature</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-4">
              ZenStatus: Your Position Health Monitor
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Every open position gets a clear status that tells you exactly what to do. No interpretation needed.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-emerald-50 border-emerald-200 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <CardTitle className="text-emerald-600 text-lg">ZEN</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 text-sm">
                  Position is healthy. Price is far from your strikes. No action needed—keep holding.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-blue-50 border-blue-200 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <CardTitle className="text-blue-600 text-lg">PROFIT READY</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 text-sm">
                  Hit your profit target. Consider closing to lock in gains, especially near expiry.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-amber-50 border-amber-200 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <CardTitle className="text-amber-600 text-lg">MONITOR</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 text-sm">
                  Price is approaching your strike. Watch closely for potential defensive action.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-red-50 border-red-200 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <CardTitle className="text-red-600 text-lg">ACTION NEEDED</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 text-sm">
                  Strike breached or high risk. Immediate defensive action recommended.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 p-6 rounded-lg bg-card border border-border shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              How ZenStatus Calculates
            </h3>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span><strong className="text-foreground">Profit/Loss:</strong> Compares current spread value to entry credit to determine P/L percentage</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span><strong className="text-foreground">Days to Expiry (DTE):</strong> Factors in time remaining—urgency increases as expiry approaches</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span><strong className="text-foreground">Strike Proximity:</strong> Monitors how close the underlying price is to your short strike</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span><strong className="text-foreground">Strategy Type:</strong> Applies appropriate rules for Credit Spreads, Iron Condors, or LEAPS</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ZenScan Section - DARK */}
      <section className="py-12 sm:py-16 px-4 sm:px-8 border-b border-slate-700/50 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 text-blue-400 mb-4">
              <Search className="w-5 h-5" />
              <span className="font-semibold">Entry Scanner</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4">
              ZenScan: Find High-Quality Setups
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Scans your watchlist for options setups that meet strict risk/reward criteria. No more endless screening.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <Target className="w-8 h-8 text-primary mb-2" />
                <CardTitle className="text-white">Risk/Reward Filter</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-300 text-sm">
                Only surfaces setups with favorable risk/reward ratios (configurable from 1.8x to 2.5x). Filters out trades where the risk doesn't justify the potential reward.
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <BarChart3 className="w-8 h-8 text-primary mb-2" />
                <CardTitle className="text-white">Technical Alignment</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-300 text-sm">
                Checks support/resistance levels (auto-detected weekly) and RSI indicators to ensure entries align with technical context rather than random timing.
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <TrendingUp className="w-8 h-8 text-primary mb-2" />
                <CardTitle className="text-white">Market Context</CardTitle>
              </CardHeader>
              <CardContent className="text-slate-300 text-sm">
                AI-powered analysis runs 4x daily to assess VIX levels, market regime, and ticker-specific sentiment. Scans are adjusted based on current conditions.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Risk Methodology Section - LIGHT */}
      <section className="py-12 sm:py-16 px-4 sm:px-8 border-b border-border bg-background">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-600 border border-amber-200 mb-4">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold">Risk Framework</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-4">
              Our Risk Management Philosophy
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              ZenOptions is built on proven risk management principles that prioritize capital preservation over aggressive returns.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-lg bg-card border border-border shadow-sm">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Time-Based Rules
              </h3>
              <ul className="space-y-3 text-muted-foreground text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Target 45-60 DTE entries for optimal theta decay</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Close at 50% profit or 21 DTE, whichever comes first</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Never hold through expiration week</span>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-lg bg-card border border-border shadow-sm">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Position Sizing
              </h3>
              <ul className="space-y-3 text-muted-foreground text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Max loss per trade: Configurable (default $500)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Buffer zone: 25% extra margin before short strike</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Diversification: Multiple tickers, not concentrated</span>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-lg bg-card border border-border shadow-sm">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                VIX-Aware Trading
              </h3>
              <ul className="space-y-3 text-muted-foreground text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>VIX {"<"} 15: Normal credit spread strategies</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>VIX 15-20: Tighten strikes, reduce position size</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>VIX {">"} 25: Defensive mode, consider closing positions</span>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-lg bg-card border border-border shadow-sm">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Alert System
              </h3>
              <ul className="space-y-3 text-muted-foreground text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Real-time Telegram alerts for status changes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Profit target notifications at 50%+ gains</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>Breach warnings when price nears short strike</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Data Sources Section - DARK */}
      <section className="py-12 sm:py-16 px-4 sm:px-8 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-700/50 text-slate-300 border border-slate-600 mb-4">
              <Database className="w-5 h-5" />
              <span className="font-semibold">Data & Transparency</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4">
              Where Our Data Comes From
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              We use institutional-grade data providers to ensure accuracy and reliability.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-slate-800/50 border-slate-700 text-center">
              <CardContent className="pt-6">
                <div className="font-bold text-white text-lg mb-1">Polygon.io</div>
                <p className="text-slate-400 text-sm">Real-time stock & options prices</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700 text-center">
              <CardContent className="pt-6">
                <div className="font-bold text-white text-lg mb-1">FRED</div>
                <p className="text-slate-400 text-sm">VIX & economic indicators</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700 text-center">
              <CardContent className="pt-6">
                <div className="font-bold text-white text-lg mb-1">OpenAI GPT-4</div>
                <p className="text-slate-400 text-sm">Market context analysis</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700 text-center">
              <CardContent className="pt-6">
                <div className="font-bold text-white text-lg mb-1">Technical Analysis</div>
                <p className="text-slate-400 text-sm">RSI, Stoch RSI, ATR, S/R levels</p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-10 text-center">
            <Button asChild size="lg">
              <Link href="/scanner" data-testid="button-try-scanner">
                Try the Scanner
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ Section - LIGHT */}
      <section id="faq" className="py-12 sm:py-16 px-4 sm:px-8 border-t border-border bg-background">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-600 border border-blue-200 mb-4">
              <HelpCircle className="w-5 h-5" />
              <span className="font-semibold">Frequently Asked Questions</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-4">
              Common Questions
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Quick answers to help you get started with ZenOptions.
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1" className="border border-border rounded-lg bg-card shadow-sm px-6">
              <AccordionTrigger className="text-foreground hover:text-primary text-left" data-testid="faq-what-is-zenoptions">
                What is ZenOptions?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                ZenOptions is an automated options monitoring system designed for traders who use Credit Spreads, Iron Condors, and LEAPS strategies. It provides real-time position tracking, actionable guidance through our ZenStatus system, and Telegram alerts to help you trade with confidence and peace of mind.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="border border-border rounded-lg bg-card shadow-sm px-6">
              <AccordionTrigger className="text-foreground hover:text-primary text-left" data-testid="faq-what-is-zenstatus">
                What do the ZenStatus levels mean?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <ul className="space-y-2 mt-2">
                  <li><strong className="text-emerald-600">ZEN:</strong> Position is healthy with comfortable margins. No action needed.</li>
                  <li><strong className="text-blue-600">PROFIT READY:</strong> Position has reached 50%+ profit target. Consider closing to lock in gains.</li>
                  <li><strong className="text-amber-600">MONITOR:</strong> Position requires attention due to approaching DTE or price movement. Stay alert.</li>
                  <li><strong className="text-red-600">ACTION NEEDED:</strong> Position is at risk with breached strikes or significant losses. Immediate review recommended.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="border border-border rounded-lg bg-card shadow-sm px-6">
              <AccordionTrigger className="text-foreground hover:text-primary text-left" data-testid="faq-free-vs-pro">
                What's the difference between Free and Pro?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <p className="mb-2"><strong className="text-foreground">Free tier:</strong> 3 watchlist tickers, 3 positions, 1 automated scan daily, and 2 manual scans per day. Great for getting started.</p>
                <p><strong className="text-foreground">Pro tier ($9/month):</strong> Unlimited watchlist, unlimited positions, 4 automated scans daily, unlimited manual scans, plus Telegram alerts and broker integrations.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="border border-border rounded-lg bg-card shadow-sm px-6">
              <AccordionTrigger className="text-foreground hover:text-primary text-left" data-testid="faq-telegram-alerts">
                How do Telegram alerts work?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Connect your Telegram account in Settings by adding your Chat ID. Once connected, you'll receive real-time notifications when your positions change status, reach profit targets, or require attention. Alerts are deduplicated to avoid spam.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="border border-border rounded-lg bg-card shadow-sm px-6">
              <AccordionTrigger className="text-foreground hover:text-primary text-left" data-testid="faq-is-this-advice">
                Is ZenOptions providing investment advice?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                No. ZenOptions is an educational analysis and monitoring tool. We provide systematic guidance based on your configured rules, but all trading decisions are yours. Options trading involves substantial risk of loss. Please read our full <Link href="/legal" className="text-primary hover:underline">risk disclaimer</Link>.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6" className="border border-border rounded-lg bg-card shadow-sm px-6">
              <AccordionTrigger className="text-foreground hover:text-primary text-left" data-testid="faq-data-sources">
                Where does your market data come from?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                We use institutional-grade data providers including Polygon.io for real-time stock and options prices, FRED for VIX and economic indicators, and OpenAI GPT-4 for market context analysis. See our <Link href="/legal?tab=data" className="text-primary hover:underline">Data Sources</Link> page for full attribution.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="mt-10 text-center">
            <p className="text-muted-foreground mb-4">Still have questions?</p>
            <Button asChild variant="outline" size="lg">
              <Link href="/contact" data-testid="button-contact-us">
                Contact Us
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
