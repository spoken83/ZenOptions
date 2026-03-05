import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { PageSEO } from "@/components/seo/PageSEO";
import { AuthModal } from "@/components/auth/AuthModal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { 
  Check,
  ArrowRight,
  Target,
  Clock,
  Moon,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  Bell,
  Search,
  Shield,
  Play
} from "lucide-react";

const DEMO_VIDEO_ID = "dWN65UVLOwE";

export default function HomeV2() {
  const { isAuthenticated } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <PageSEO 
        title="Systematic Options Trading Made Simple" 
        description="Trade options with confidence using AI-powered market analysis, automated position monitoring, and systematic ZenStatus guidance. Credit spreads, iron condors, and LEAPS strategies made simple."
      />
      {/* Hero Section - ZenStatus Front and Center */}
      <section className="landing-hero" data-testid="hero-section">
        <div className="max-w-[1100px] mx-auto px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Messaging */}
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight" data-testid="hero-title">
                Trading with confidence.<br />
                <span className="text-primary">Sleep with peace of mind.</span>
              </h1>
              
              <p className="text-xl text-slate-300 mb-3" data-testid="hero-tagline">
                Options trading, <span className="text-white font-semibold">minus the guesswork</span>.
              </p>
              
              <p className="text-lg text-slate-400 mb-8" data-testid="hero-description">
                ZenStatus tells you exactly what to do with every position—hold, take profit, or act. No more second-guessing. No more watching charts all day.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4" data-testid="hero-cta">
                {!isAuthenticated ? (
                  <>
                    <Button 
                      size="lg" 
                      className="text-lg px-8 py-6"
                      onClick={() => setAuthModalOpen(true)}
                      data-testid="button-get-started"
                    >
                      Get Started Free
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="lg" 
                      className="text-lg px-8 py-6 border-2 border-slate-400 text-white bg-slate-800/50 hover:bg-slate-700 hover:border-slate-300"
                      onClick={() => setVideoModalOpen(true)}
                      data-testid="button-see-how"
                    >
                      <Play className="mr-2 w-5 h-5" />
                      Watch Demo
                    </Button>
                  </>
                ) : (
                  <Button asChild size="lg" className="text-lg px-8 py-6">
                    <Link href="/positions/open" data-testid="button-view-positions">
                      View My Positions
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
            
            {/* Right: ZenStatus Visual Preview */}
            <div className="space-y-4" data-testid="zenstatus-preview">
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-6 h-6 text-success" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-bold">ZEN</span>
                    <span className="text-xs text-success bg-success/20 px-2 py-0.5 rounded">On Track</span>
                  </div>
                  <p className="text-sm text-slate-400">Position profitable. Let theta work. No action needed.</p>
                </div>
              </div>
              
              <div className="bg-slate-800/60 border border-primary/30 rounded-xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-bold">PROFIT READY</span>
                    <span className="text-xs text-primary bg-primary/20 px-2 py-0.5 rounded">Take Profit</span>
                  </div>
                  <p className="text-sm text-slate-400">Hit 50% target. Close and lock in your gains now.</p>
                </div>
              </div>
              
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-bold">MONITOR</span>
                    <span className="text-xs text-accent bg-accent/20 px-2 py-0.5 rounded">Watch Closely</span>
                  </div>
                  <p className="text-sm text-slate-400">Price approaching levels. Stay alert for changes.</p>
                </div>
              </div>
              
              <div className="bg-slate-800/60 border border-warning/30 rounded-xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-bold">ACTION NEEDED</span>
                    <span className="text-xs text-warning bg-warning/20 px-2 py-0.5 rounded">Decide Now</span>
                  </div>
                  <p className="text-sm text-slate-400">Risk elevated. Roll, close, or defend immediately.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who It's For - Concise, Balanced */}
      <section className="py-16 px-6 bg-background" data-testid="audience-section">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-3" data-testid="audience-title">
              For Traders Who Can't Watch Markets All Day
            </h2>
            <p className="text-muted-foreground max-w-[600px] mx-auto">
              Whether you're in Singapore trading US markets at 3am, or in New York with a day job—ZenOptions watches your positions so you don't have to.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card border border-border rounded-xl p-6 text-center" data-testid="audience-asia">
              <Moon className="w-10 h-10 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-foreground mb-2">Asia-Pacific Traders</h3>
              <p className="text-sm text-muted-foreground">
                US markets open while you sleep. Get Telegram alerts when your positions need attention—no more 3am chart watching.
              </p>
            </div>
            
            <div className="bg-card border border-border rounded-xl p-6 text-center" data-testid="audience-professional">
              <Clock className="w-10 h-10 text-accent mx-auto mb-4" />
              <h3 className="font-bold text-foreground mb-2">Working Professionals</h3>
              <p className="text-sm text-muted-foreground">
                Full-time job during market hours? ZenStatus monitors and alerts you only when action is actually required.
              </p>
            </div>
            
            <div className="bg-card border border-border rounded-xl p-6 text-center" data-testid="audience-theta">
              <TrendingUp className="w-10 h-10 text-success mx-auto mb-4" />
              <h3 className="font-bold text-foreground mb-2">Premium Sellers</h3>
              <p className="text-sm text-muted-foreground">
                Credit spreads, iron condors, LEAPS. Our systematic rules align with proven theta strategies.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Methodology - Outcome Focused */}
      <section className="py-16 px-6 bg-slate-900 text-white" data-testid="methodology-section">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3" data-testid="methodology-title">
              Proven Rules. Peace of Mind.
            </h2>
            <p className="text-slate-400 max-w-[600px] mx-auto">
              ZenOptions enforces battle-tested premium-selling rules automatically—so you stay disciplined without the stress.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6" data-testid="rule-45dte">
              <div className="text-4xl font-bold text-primary mb-3">45 DTE</div>
              <h3 className="font-bold mb-2">Enter at the Sweet Spot</h3>
              <p className="text-sm text-slate-400">
                We scan for trades at 45 days to expiration—where theta decay is fastest and risk is manageable. No guessing on timing.
              </p>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6" data-testid="rule-21dte">
              <div className="text-4xl font-bold text-accent mb-3">21 DTE</div>
              <h3 className="font-bold mb-2">Exit Before Gamma Risk</h3>
              <p className="text-sm text-slate-400">
                ZenStatus alerts you at 21 DTE to close—before gamma risk accelerates. You'll never hold too long and give back profits.
              </p>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6" data-testid="rule-tp50">
              <div className="text-4xl font-bold text-success mb-3">50%</div>
              <h3 className="font-bold mb-2">Lock In Gains Early</h3>
              <p className="text-sm text-slate-400">
                Hit 50% of max profit? PROFIT READY status tells you to close. Don't let winners turn into losers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What ZenScan Finds - Example Setups */}
      <section className="py-16 px-6 bg-background" data-testid="setups-section">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-3" data-testid="setups-title">
              What ZenScan Finds
            </h2>
            <p className="text-muted-foreground max-w-[600px] mx-auto">
              Real opportunities identified by our systematic scanning—with clear explanations for every trade.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Credit Spread Example */}
            <div className="bg-card border border-border rounded-xl overflow-hidden" data-testid="setup-credit-spread">
              <div className="bg-primary/10 px-5 py-3 flex items-center justify-between">
                <span className="font-bold text-foreground">MSFT</span>
                <span className="text-xs font-medium text-muted-foreground">Put Credit Spread</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Strikes</span>
                    <p className="font-semibold text-foreground">485/480</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">DTE</span>
                    <p className="font-semibold text-foreground">41 days</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Credit</span>
                    <p className="font-semibold text-success">$1.50</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">R:R</span>
                    <p className="font-semibold text-foreground">2.33:1</p>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Why it qualifies:</p>
                  <p className="text-sm text-foreground">
                    41 DTE hits the theta sweet spot. Strong support at $480 protects the short strike.
                  </p>
                </div>
              </div>
            </div>

            {/* Iron Condor Example */}
            <div className="bg-card border border-border rounded-xl overflow-hidden" data-testid="setup-iron-condor">
              <div className="bg-accent/10 px-5 py-3 flex items-center justify-between">
                <span className="font-bold text-foreground">AAPL</span>
                <span className="text-xs font-medium text-muted-foreground">Iron Condor</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Strikes</span>
                    <p className="font-semibold text-foreground">195/190 | 210/215</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">DTE</span>
                    <p className="font-semibold text-foreground">45 days</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Credit</span>
                    <p className="font-semibold text-success">$2.10</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">R:R</span>
                    <p className="font-semibold text-foreground">2.56:1</p>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Why it qualifies:</p>
                  <p className="text-sm text-foreground">
                    Low VIX favors range-bound plays. Wide strikes give room for price movement.
                  </p>
                </div>
              </div>
            </div>

            {/* LEAPS Example */}
            <div className="bg-card border border-border rounded-xl overflow-hidden" data-testid="setup-leaps">
              <div className="bg-success/10 px-5 py-3 flex items-center justify-between">
                <span className="font-bold text-foreground">XLV</span>
                <span className="text-xs font-medium text-muted-foreground">LEAPS Call</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Strike</span>
                    <p className="font-semibold text-foreground">145</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">DTE</span>
                    <p className="font-semibold text-foreground">365 days</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Premium</span>
                    <p className="font-semibold text-foreground">$8.50</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Delta</span>
                    <p className="font-semibold text-foreground">0.68</p>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Why it qualifies:</p>
                  <p className="text-sm text-foreground">
                    Healthcare sector defensive strength. Strong fundamentals with fair IV pricing.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-center mt-8">
            <Button asChild variant="outline">
              <Link href="/scanner" data-testid="button-view-all-setups">
                View Live Scanner Results
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Two Pillars: ZenScan + ZenManage - Tightened */}
      <section id="features" className="py-16 px-6 bg-muted/50" data-testid="pillars-section">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-3" data-testid="pillars-title">
              Find Trades. Manage with Confidence.
            </h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* ZenScan */}
            <div className="bg-card border border-border rounded-2xl p-8" data-testid="pillar-zenscan">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Search className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground">ZenScan</h3>
              </div>
              
              <p className="text-muted-foreground mb-6">
                Scans your watchlist for high-probability setups—credit spreads, iron condors, and LEAPS—using support/resistance and technical signals.
              </p>
              
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="w-4 h-4 text-success" />
                  Optimal 45 DTE entries with risk:reward scoring
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="w-4 h-4 text-success" />
                  Strike selection based on S/R levels
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="w-4 h-4 text-success" />
                  Clear explanations for why each trade qualifies
                </li>
              </ul>
              
              <Button asChild variant="outline" className="w-full">
                <Link href="/scanner" data-testid="button-explore-scanner">
                  Explore Scanner
                </Link>
              </Button>
            </div>
            
            {/* ZenManage */}
            <div className="bg-card border border-border rounded-2xl p-8" data-testid="pillar-zenmanage">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-xl font-bold text-foreground">ZenManage</h3>
              </div>
              
              <p className="text-muted-foreground mb-6">
                Every position gets a ZenStatus. Every status has a clear action. You'll always know whether to hold, take profit, or defend.
              </p>
              
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="w-4 h-4 text-success" />
                  Real-time P/L with ZenStatus guidance
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="w-4 h-4 text-success" />
                  Telegram alerts for profit targets and warnings
                </li>
                <li className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="w-4 h-4 text-success" />
                  Tiger Brokers auto-sync (MooMoo coming soon)
                </li>
              </ul>
              
              <Button asChild className="w-full">
                <Link href="/positions/open" data-testid="button-manage-positions">
                  Manage Positions
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Markets Move. You Stay Zen. - Validation Section */}
      <section className="py-16 px-6 bg-slate-50 dark:bg-slate-900/50" data-testid="validation-section">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Messaging */}
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-4" data-testid="validation-title">
                Markets Move. You Stay Zen.
              </h2>
              <p className="text-lg text-foreground/80 mb-6">
                Whether you're trading US markets from Asia, juggling a day job in New York, or simply want to stop staring at charts—ZenStatus keeps watch so you can live your life.
              </p>
              
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-foreground">
                  <Check className="w-5 h-5 text-success flex-shrink-0" />
                  <span>Automated "Profit Ready" alerts sent to your phone</span>
                </li>
                <li className="flex items-center gap-3 text-foreground">
                  <Check className="w-5 h-5 text-success flex-shrink-0" />
                  <span>No more refreshing screens during work or sleep</span>
                </li>
                <li className="flex items-center gap-3 text-foreground">
                  <Check className="w-5 h-5 text-success flex-shrink-0" />
                  <span>Smart Earnings Shield prevents accidental risks</span>
                </li>
                <li className="flex items-center gap-3 text-foreground">
                  <Check className="w-5 h-5 text-success flex-shrink-0" />
                  <span>Portfolio health check every morning</span>
                </li>
              </ul>
            </div>
            
            {/* Right: Metric Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-6 text-center" data-testid="metric-screentime">
                <div className="text-4xl font-bold text-primary mb-1">3.5h</div>
                <p className="text-sm text-foreground/70">Avg. Screen Time Saved</p>
              </div>
              
              <div className="bg-card border border-border rounded-xl p-6 text-center" data-testid="metric-winrate">
                <div className="text-4xl font-bold text-success mb-1">78%</div>
                <p className="text-sm text-foreground/70">Win Rate (Credit Spreads)</p>
              </div>
              
              <div className="bg-card border border-border rounded-xl p-6 text-center" data-testid="metric-monitoring">
                <div className="text-4xl font-bold text-accent mb-1">24/7</div>
                <p className="text-sm text-foreground/70">AI Monitoring</p>
              </div>
              
              <div className="bg-card border border-border rounded-xl p-6 text-center" data-testid="metric-rating">
                <div className="flex justify-center gap-1 mb-1">
                  <span className="text-2xl text-warning">★</span>
                  <span className="text-2xl text-warning">★</span>
                  <span className="text-2xl text-warning">★</span>
                  <span className="text-2xl text-warning">★</span>
                  <span className="text-2xl text-warning">★</span>
                </div>
                <p className="text-sm text-foreground/70">User Rating</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA - Compact */}
      <section className="py-16 px-6 bg-primary/5" data-testid="cta-section">
        <div className="max-w-[700px] mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-3" data-testid="cta-title">
            Ready to Trade with Zen?
          </h2>
          <p className="text-muted-foreground mb-6">
            Free tier to get started. Pro for unlimited positions and scans.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            {!isAuthenticated ? (
              <>
                <Button 
                  size="lg" 
                  className="px-8"
                  onClick={() => setAuthModalOpen(true)}
                  data-testid="button-start-free"
                >
                  Start Free
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button asChild variant="outline" size="lg" className="px-8">
                  <Link href="/subscription" data-testid="button-view-pricing">
                    View Pricing
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild size="lg" className="px-8">
                <Link href="/scanner" data-testid="button-go-scanner">
                  Go to Scanner
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Link>
              </Button>
            )}
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-success" />
              Free tier available
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-success" />
              No credit card required
            </span>
            <span className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-success" />
              Telegram alerts included
            </span>
          </div>
        </div>
      </section>

      <AuthModal 
        open={authModalOpen} 
        onOpenChange={setAuthModalOpen}
        defaultTab="signup"
      />

      <Dialog open={videoModalOpen} onOpenChange={setVideoModalOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black">
          <DialogTitle className="sr-only">
            ZenOptions Product Demo
          </DialogTitle>
          <div className="aspect-video">
            <iframe
              src={videoModalOpen ? `https://www.youtube.com/embed/${DEMO_VIDEO_ID}?autoplay=1&rel=0` : ""}
              title="ZenOptions Product Demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
              data-testid="demo-video-player"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
