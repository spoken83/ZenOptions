import { useQuery } from "@tanstack/react-query";
import { StrategyCard } from "@/components/home/strategy-card";
import { calculateStrategySuitability, calculateVixAlertStatus, getVixColorClass } from "@/lib/vixCalculations";
import { TrendingUp, TrendingDown, Activity, Shield, Bell, AlertCircle, Brain, BarChart3, Bot, BellRing, Check, Search, Scale, BarChart4, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { PageSEO } from "@/components/seo/PageSEO";

interface VixData {
  vix: number;
  vixChange: number;
  vixChangePercent: number;
  vvix: number;
  vvixChange: number;
  vvixChangePercent: number;
}

interface TradingImpact {
  title: string;
  focus: string;
  strategies: string;
}

function getTradingImpact(regime: 'DEFENSIVE' | 'RISK_ON' | 'TRANSITIONING'): TradingImpact {
  switch (regime) {
    case 'DEFENSIVE':
      return {
        title: 'Defensive Rotation',
        focus: 'Focus on: Healthcare, Staples, quality names with lower volatility',
        strategies: 'Favor: Bearish CALL spreads, protective positions. Avoid: Aggressive bullish plays.',
      };
    case 'RISK_ON':
      return {
        title: 'Growth Mode',
        focus: 'Focus on: Tech, Discretionary, Financials - growth sectors leading',
        strategies: 'Favor: LEAPS Calls, Bullish PUT spreads, Iron Condors. Aggressive strategies favorable.',
      };
    case 'TRANSITIONING':
      return {
        title: 'Mixed Signals',
        focus: 'Focus on: Wait for clearer direction before committing capital',
        strategies: 'Favor: Smaller position sizes, tight stops. Avoid: Large directional bets.',
      };
  }
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  
  const { data: vixData, isLoading: vixLoading, refetch } = useQuery<VixData>({
    queryKey: ["/api/vix-data"],
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  const { data: regimeData, isLoading: regimeLoading } = useQuery<any>({
    queryKey: ["/api/market-regime", vixData?.vix],
    enabled: !!vixData,
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const { data: sectorData, isLoading: sectorLoading } = useQuery<any[]>({
    queryKey: ["/api/sector-rotation", vixData?.vix],
    enabled: !!vixData,
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (vixLoading || !vixData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Options Trading Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Loading market data...</p>
          </div>
        </div>
        <div className="grid gap-6">
          <div className="h-48 rounded-lg border border-border bg-card animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-64 rounded-lg border border-border bg-card animate-pulse" />
            <div className="h-64 rounded-lg border border-border bg-card animate-pulse" />
            <div className="h-64 rounded-lg border border-border bg-card animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const suitability = calculateStrategySuitability(vixData.vix, vixData.vvix);
  const vixStatus = calculateVixAlertStatus(vixData.vix, vixData.vvix);
  const shouldReduceSize = vixData.vvix > 100 && vixData.vix < 20;

  return (
    <div className={isAuthenticated ? "space-y-12 px-8 pb-12 pt-6" : ""}>
      <PageSEO 
        title="Market Dashboard" 
        description="Real-time market conditions, VIX analysis, and strategy suitability for options trading. Credit spreads, iron condors, and LEAPS insights."
      />
      {/* Welcome hero banner for unauthenticated users - Matches mockup design */}
      {!isAuthenticated && (
        <div className="homepage-hero px-8" data-testid="welcome-banner">
          <div className="text-center max-w-[900px] mx-auto">
            <h1>
              Clear options trading, minus the guesswork
            </h1>
            <p className="homepage-hero-subtitle">
              One-click scans find high-probability setups with clear explanations. Systematic rules manage positions without confusion. Trade with zen-like discipline.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="homepage-feature-card flex items-start gap-4 text-left" data-testid="feature-position-tracking">
                <Shield className="flex-shrink-0 mt-1 w-8 h-8 text-primary" />
                <div>
                  <h3 className="text-white font-medium mb-1 text-lg">Active Position Management</h3>
                  <p className="leading-relaxed mb-0 text-sm text-slate-300">
                    Track, monitor and get actionable alerts to manage your risk
                  </p>
                </div>
              </div>
              
              <div className="homepage-feature-card flex items-start gap-4 text-left" data-testid="feature-smart-alerts">
                <Bell className="flex-shrink-0 mt-1 w-8 h-8 text-primary" />
                <div>
                  <h3 className="text-white font-medium mb-1 text-lg">Smart Alerts</h3>
                  <p className="leading-relaxed mb-0 text-sm text-slate-300">
                    Take-profit, stop-loss & DTE notifications
                  </p>
                </div>
              </div>
              
              <div className="homepage-feature-card flex items-start gap-4 text-left" data-testid="feature-custom-scans">
                <TrendingUp className="flex-shrink-0 mt-1 w-8 h-8 text-primary" />
                <div>
                  <h3 className="text-white font-medium mb-1 text-lg">Custom Scans</h3>
                  <p className="leading-relaxed mb-0 text-sm text-slate-300">
                    Automated daily scans with technical indicators
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TODAY'S MARKET CONDITIONS - Matches mockup with 2-column grid */}
      <section className="homepage-section px-8">
        <div className="max-w-[1280px] mx-auto">
          <h2 className="homepage-section-header">TODAY'S MARKET CONDITIONS</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Market Volatility Card - Left side */}
            <div className="homepage-card">
              <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-border">
                <h3 className="text-lg font-semibold">Market Volatility</h3>
                <div className={`px-4 py-2 rounded-full text-sm font-bold uppercase ${getVixColorClass(vixStatus.color)}`}>
                  {vixStatus.level}
                </div>
              </div>
              
              {/* VIX/VVIX Display */}
              <div className="homepage-vix-display grid grid-cols-2 gap-6 mb-6">
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">VIX</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[2.5rem] font-bold leading-none text-foreground">{vixData.vix.toFixed(2)}</span>
                    {vixData.vixChange !== null && (
                      vixData.vixChange >= 0 ? 
                        <TrendingUp className="h-5 w-5 text-destructive" /> :
                        <TrendingDown className="h-5 w-5 text-success" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-success">
                    Normal Range
                  </span>
                  {vixData.vixChange !== null && (
                    <span className={`text-xs ${vixData.vixChange >= 0 ? 'text-destructive' : 'text-success'}`}>
                      {vixData.vixChange >= 0 ? '+' : ''}{vixData.vixChange.toFixed(2)} ({vixData.vixChangePercent >= 0 ? '+' : ''}{vixData.vixChangePercent.toFixed(2)}%)
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">VVIX</span>
                  <span className="text-[2.5rem] font-bold leading-none text-warning">{vixData.vvix.toFixed(2)}</span>
                  <span className="text-sm font-medium text-warning">
                    Elevated ⚠️
                  </span>
                </div>
              </div>
              
              {/* Volatility Meter */}
              <div className="mb-6">
                <div className="h-3 bg-muted dark:bg-muted/50 rounded-full overflow-hidden relative mb-2">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      vixData.vix < 15 ? 'meter-gradient-low' :
                      vixData.vix < 25 ? 'meter-gradient-normal' :
                      'meter-gradient-high'
                    }`}
                    style={{
                      width: `${Math.min(100, (vixData.vix / 35) * 100)}%`
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Low (&lt;15)</span>
                  <span>Normal (15-25)</span>
                  <span>High (&gt;25)</span>
                </div>
              </div>
              
              {/* Market Summary */}
              <div className="mb-4">
                <p className="text-base text-muted-foreground leading-relaxed">
                  <strong>What the data tells us:</strong> {vixStatus.interpretation}. {vixStatus.strategyImpact}.
                </p>
              </div>
              
              {/* Risk Alert - Shows when VIX/VVIX divergence detected */}
              {vixStatus.divergence && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-warning rounded p-4 flex items-start gap-3" data-testid="risk-alert">
                  <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[0.9375rem] font-semibold mb-1 text-foreground">⚠️ Risk Alert</h4>
                    <p className="text-sm text-muted-foreground m-0">
                      When VVIX is elevated while VIX is normal, volatility can spike quickly. <strong>Reduce position sizes to 70% of normal</strong> as a precaution.
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Trading Environment Card - Right side */}
            <div className="homepage-card">
              <h3 className="text-lg font-semibold mb-4">Trading Environment</h3>
              
              {regimeData && (() => {
                const tradingImpact = getTradingImpact(regimeData.regime);
                
                return (
                  <>
                    {/* Environment Badge with Icon */}
                    <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold mb-4 ${
                      regimeData.regime === 'DEFENSIVE' ? 'bg-accent/10 text-accent border-accent/30' :
                      regimeData.regime === 'RISK_ON' ? 'bg-success/10 text-success border-success/30' :
                      'bg-warning/10 text-warning border-warning/30'
                    }`}>
                      {regimeData.regime === 'DEFENSIVE' ? <TrendingDown className="w-5 h-5" /> :
                       regimeData.regime === 'RISK_ON' ? <TrendingUp className="w-5 h-5" /> :
                       <Activity className="w-5 h-5" />}
                      <span className="uppercase tracking-wide">{
                        regimeData.regime === 'DEFENSIVE' ? 'CAUTIOUS MODE' :
                        regimeData.regime === 'RISK_ON' ? 'RISK ON' :
                        'TRANSITIONING'
                      }</span>
                    </div>
                    
                    {/* Regime Confidence */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Confidence</span>
                        <span className="text-xs font-semibold text-foreground">{regimeData.confidence}%</span>
                      </div>
                      <Progress value={regimeData.confidence} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-2">
                        {regimeData.confidence}% confidence that we are in {regimeData.regime.replace('_', ' ')} conditions—size positions accordingly.
                      </p>
                    </div>
                    
                    {/* Trading Impact */}
                    <div className="mb-6">
                      <p className="text-sm text-foreground leading-relaxed">
                        <span className="font-medium">What's happening:</span> {tradingImpact.focus}
                      </p>
                    </div>
                    
                    {/* Trading Guidance */}
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        💡 What This Means For You:
                      </p>
                      <ul className="space-y-2">
                        {shouldReduceSize ? (
                          <>
                            <li className="flex items-start gap-2 text-sm text-foreground">
                              <span className="text-success flex-shrink-0">✅</span>
                              <span>Credit spreads: Good conditions, but size at 70% of normal</span>
                            </li>
                            <li className="flex items-start gap-2 text-sm text-foreground">
                              <span className="text-success flex-shrink-0">✅</span>
                              <span>Iron condors: VIX &lt;20 favors range-bound strategies</span>
                            </li>
                            <li className="flex items-start gap-2 text-sm text-foreground">
                              <span className="text-success flex-shrink-0">✅</span>
                              <span>Focus on defensive tickers: XLV, XLP, quality names</span>
                            </li>
                            <li className="flex items-start gap-2 text-sm text-foreground">
                              <span className="text-warning flex-shrink-0">⚠️</span>
                              <span>Position sizing: Use 70% of your typical size</span>
                            </li>
                            <li className="flex items-start gap-2 text-sm text-foreground">
                              <span className="text-destructive flex-shrink-0">❌</span>
                              <span>Avoid aggressive bullish plays in growth sectors</span>
                            </li>
                          </>
                        ) : (
                          <li className="flex items-start gap-2 text-sm text-foreground">
                            <span className="text-success flex-shrink-0">✅</span>
                            <span>{tradingImpact.strategies}</span>
                          </li>
                        )}
                      </ul>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
          
          {/* Systematic Scenario Planning - Part of Market Conditions */}
          {(() => {
            // Determine current VIX scenario
            const currentVix = vixData.vix;
            const isNormal = currentVix >= 15 && currentVix < 20;
            const isElevated = currentVix >= 20 && currentVix < 25;
            const isHigh = currentVix >= 25;
            const isLow = currentVix < 15;
            
            return (
              <div className="mt-12 homepage-card border-2 border-primary/20" data-testid="systematic-scenario-planning">
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="h-6 w-6 text-primary" />
                  <h3 className="text-xl font-bold text-foreground">Systematic Scenario Planning</h3>
                </div>
                <p className="text-muted-foreground mb-8">
                  Our platform adjusts recommendations based on VIX movements. Here's your action plan:
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Normal Volatility Scenario (VIX 15-20) */}
                  <div className={`p-6 rounded-lg border-2 ${
                    isNormal || isLow ? 'border-success bg-success/10' : 'border-success/30 bg-success/5 opacity-60'
                  }`} data-testid="scenario-normal">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className={`h-5 w-5 ${isNormal || isLow ? 'text-success' : 'text-success/60'}`} />
                      <span className={`text-sm font-semibold uppercase ${
                        isNormal || isLow ? 'text-success' : 'text-muted-foreground'
                      }`}>
                        {isNormal || isLow ? `CURRENT (VIX ${currentVix.toFixed(2)})` : 'IF VIX 15-20'}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-foreground mb-4">Normal Volatility Mode</h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-success flex-shrink-0">✅</span>
                        <span>Continue systematic approach</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-success flex-shrink-0">✅</span>
                        <span>All strategies acceptable</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-success flex-shrink-0">✅</span>
                        <span>Standard position sizing (with 70% adjustment for VVIX)</span>
                      </li>
                    </ul>
                  </div>
                  
                  {/* Elevated Volatility Scenario (VIX 20-25) */}
                  <div className={`p-6 rounded-lg border-2 ${
                    isElevated ? 'border-warning bg-warning/10' : 'border-warning/30 bg-warning/5 opacity-60'
                  }`} data-testid="scenario-elevated">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertTriangle className={`h-5 w-5 ${isElevated ? 'text-warning' : 'text-warning/60'}`} />
                      <span className={`text-sm font-semibold uppercase ${
                        isElevated ? 'text-warning' : 'text-muted-foreground'
                      }`}>
                        {isElevated ? `CURRENT (VIX ${currentVix.toFixed(2)})` : 'IF VIX BREAKS > 20'}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-foreground mb-4">Elevated Volatility Mode</h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-warning flex-shrink-0">⚠️</span>
                        <span>Close 50% of iron condor positions</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-warning flex-shrink-0">⚠️</span>
                        <span>Tighten stop-loss management</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-warning flex-shrink-0">⚠️</span>
                        <span>Reduce new position sizes to 50%</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-warning flex-shrink-0">⚠️</span>
                        <span>Focus on credit spreads over ICs</span>
                      </li>
                    </ul>
                  </div>
                  
                  {/* High Volatility Scenario (VIX > 25) */}
                  <div className={`p-6 rounded-lg border-2 ${
                    isHigh ? 'border-destructive bg-destructive/10' : 'border-destructive/30 bg-destructive/5 opacity-60'
                  }`} data-testid="scenario-high">
                    <div className="flex items-center gap-2 mb-4">
                      <ShieldAlert className={`h-5 w-5 ${isHigh ? 'text-destructive' : 'text-destructive/60'}`} />
                      <span className={`text-sm font-semibold uppercase ${
                        isHigh ? 'text-destructive' : 'text-muted-foreground'
                      }`}>
                        {isHigh ? `CURRENT (VIX ${currentVix.toFixed(2)})` : 'IF VIX SPIKES > 25'}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-foreground mb-4">High Volatility - Defensive Mode</h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-destructive flex-shrink-0">🛑</span>
                        <span>Close all iron condor positions</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-destructive flex-shrink-0">🛑</span>
                        <span>Halt new entries temporarily</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-success flex-shrink-0">✅</span>
                        <span>Focus on protective strategies only</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-success flex-shrink-0">✅</span>
                        <span>Wait for VIX to stabilize below 20</span>
                      </li>
                    </ul>
                  </div>
                </div>
                
                <div className="mt-6 text-center">
                  <p className="text-sm text-muted-foreground italic">
                    These rules are built into our alert system - you'll be notified when action is needed.
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* PREMIUMS Section - Separate full-width section */}
      <section className="homepage-section px-8">
        <div className="max-w-[1280px] mx-auto">
          <h2 className="homepage-section-header">PREMIUMS</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StrategyCard
              title="CREDIT SPREADS"
              suitability={suitability.creditSpreads}
            />
            <StrategyCard
              title="IRON CONDORS"
              suitability={suitability.ironCondor}
            />
            <StrategyCard
              title="LEAPS CALLS"
              suitability={suitability.leaps}
            />
          </div>
        </div>
      </section>

      {/* The ZenOptions Platform Section */}
      <section className="homepage-section-shell homepage-section--gradient" data-testid="platform-system-section">
        <div className="homepage-section-inner">
          <h2 className="homepage-section-title">The ZenOptions Platform</h2>
          <p className="section-subtitle">Everything you need for systematic options trading</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            {/* ZenScan Pillar */}
            <div className="homepage-card hover:transform hover:-translate-y-1 transition-all" data-testid="pillar-zenscan">
              <div className="text-5xl mb-4" data-testid="icon-zenscan">🔍</div>
              <h3 className="text-2xl font-bold text-primary mb-2" data-testid="text-zenscan-title">ZenScan</h3>
              <h4 className="text-lg font-medium text-muted-foreground mb-6" data-testid="text-zenscan-subtitle">Intelligent Trade Discovery</h4>
              <div className="flex flex-col gap-3 mb-6">
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-watchlist-scan">
                  <Check className="h-4 w-4 text-success" />
                  Scans your watchlist with support/resistance analysis
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-identify-setups">
                  <Check className="h-4 w-4 text-success" />
                  Identifies high-probability credit spreads and iron condors
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-customizable-params">
                  <Check className="h-4 w-4 text-success" />
                  Systematic, customizable parameters
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-no-digging">
                  <Check className="h-4 w-4 text-success" />
                  No more digging through endless options data
                </span>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/scanner" data-testid="link-explore-scanner">
                  Explore Scanner
                </Link>
              </Button>
            </div>

            {/* ZenManage Pillar */}
            <div className="homepage-card hover:transform hover:-translate-y-1 transition-all" data-testid="pillar-zenmanage">
              <div className="text-5xl mb-4" data-testid="icon-zenmanage">⚖️</div>
              <h3 className="text-2xl font-bold text-primary mb-2" data-testid="text-zenmanage-title">ZenManage</h3>
              <h4 className="text-lg font-medium text-muted-foreground mb-6" data-testid="text-zenmanage-subtitle">Semi-Active Risk Management</h4>
              <div className="flex flex-col gap-3 mb-6">
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-track-positions">
                  <Check className="h-4 w-4 text-success" />
                  Tracks and monitors all your positions
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-systematic-guidance">
                  <Check className="h-4 w-4 text-success" />
                  Systematic guidance for every phase
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-profit-loss-alerts">
                  <Check className="h-4 w-4 text-success" />
                  Clear alerts for profit-taking and loss management
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-telegram-integration">
                  <Check className="h-4 w-4 text-success" />
                  Telegram integration for real-time notifications
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-stay-disciplined">
                  <Check className="h-4 w-4 text-success" />
                  Stay disciplined without constant monitoring
                </span>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/positions/open" data-testid="link-management-rules">
                  See Management Rules
                </Link>
              </Button>
            </div>

            {/* ZenInsights Pillar */}
            <div className="homepage-card hover:transform hover:-translate-y-1 transition-all" data-testid="pillar-zeninsights">
              <div className="text-5xl mb-4" data-testid="icon-zeninsights">📊</div>
              <h3 className="text-2xl font-bold text-primary mb-2" data-testid="text-zeninsights-title">ZenInsights</h3>
              <h4 className="text-lg font-medium text-muted-foreground mb-6" data-testid="text-zeninsights-subtitle">Market Analysis Made Simple</h4>
              <div className="flex flex-col gap-3 mb-6">
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-daily-vix-analysis">
                  <Check className="h-4 w-4 text-success" />
                  Daily VIX/VVIX analysis and risk alerts
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-sector-rotation">
                  <Check className="h-4 w-4 text-success" />
                  Sector rotation tracking and opportunity mapping
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-market-conditions">
                  <Check className="h-4 w-4 text-success" />
                  Market condition updates (defensive/bullish/bearish)
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="feature-strategy-timing">
                  <Check className="h-4 w-4 text-success" />
                  Know which strategies work best right now
                </span>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/" data-testid="link-view-analysis">
                  View Today's Analysis
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* High-Probability Setups Section */}
      <section className="homepage-section-shell homepage-section--primary" data-testid="opportunities-section">
        <div className="homepage-section-inner">
          <h2 className="homepage-section-title">High-Probability Setups Identified</h2>
          <p className="section-subtitle">Current opportunities from our systematic scanning</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            {/* MSFT Opportunity */}
            <div className="homepage-card bg-muted dark:bg-muted/50 hover:transform hover:-translate-y-1 transition-all" data-testid="opportunity-msft">
              <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-border flex-wrap gap-2">
                <span className="text-2xl font-bold text-primary" data-testid="ticker-msft">MSFT</span>
                <span className="text-sm font-semibold text-muted-foreground" data-testid="strategy-type-msft">Put Credit Spread</span>
                <span className="text-sm font-semibold text-success bg-success/10 px-3 py-1 rounded-full" data-testid="score-msft">Score: 68.9</span>
              </div>
              <div className="mb-6">
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-strikes-msft">
                  <span className="text-muted-foreground font-medium">Strikes:</span>
                  <span className="text-foreground font-semibold">485/480</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-dte-msft">
                  <span className="text-muted-foreground font-medium">DTE:</span>
                  <span className="text-foreground font-semibold">41 days</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-credit-msft">
                  <span className="text-muted-foreground font-medium">Credit:</span>
                  <span className="text-foreground font-semibold">$1.50</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-rr-msft">
                  <span className="text-muted-foreground font-medium">R:R Ratio:</span>
                  <span className="text-foreground font-semibold">2.33:1</span>
                </div>
              </div>
              <div className="mb-6">
                <p className="font-semibold mb-3 text-foreground" data-testid="qualification-heading-msft"><strong>Why this qualifies:</strong></p>
                <ul className="list-none pl-0 space-y-2" data-testid="qualification-reasons-msft">
                  <li className="text-sm text-muted-foreground leading-relaxed">Perfect timing - 41 days lets you profit from time decay</li>
                  <li className="text-sm text-muted-foreground leading-relaxed">Options are fairly priced for collecting premium</li>
                  <li className="text-sm text-muted-foreground leading-relaxed">Strong price support at $480 protects this trade</li>
                </ul>
              </div>
              <Button asChild className="w-full">
                <Link href="/scanner" data-testid="link-view-msft-analysis">
                  View Full Analysis
                </Link>
              </Button>
            </div>

            {/* AAPL Opportunity */}
            <div className="homepage-card bg-muted dark:bg-muted/50 hover:transform hover:-translate-y-1 transition-all" data-testid="opportunity-aapl">
              <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-border flex-wrap gap-2">
                <span className="text-2xl font-bold text-primary" data-testid="ticker-aapl">AAPL</span>
                <span className="text-sm font-semibold text-muted-foreground" data-testid="strategy-type-aapl">Iron Condor</span>
                <span className="text-sm font-semibold text-success bg-success/10 px-3 py-1 rounded-full" data-testid="score-aapl">Score: 72.4</span>
              </div>
              <div className="mb-6">
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-strikes-aapl">
                  <span className="text-muted-foreground font-medium">Strikes:</span>
                  <span className="text-foreground font-semibold">195/190 / 210/215</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-dte-aapl">
                  <span className="text-muted-foreground font-medium">DTE:</span>
                  <span className="text-foreground font-semibold">45 days</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-credit-aapl">
                  <span className="text-muted-foreground font-medium">Credit:</span>
                  <span className="text-foreground font-semibold">$2.10</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-rr-aapl">
                  <span className="text-muted-foreground font-medium">R:R Ratio:</span>
                  <span className="text-foreground font-semibold">2.56:1</span>
                </div>
              </div>
              <div className="mb-6">
                <p className="font-semibold mb-3 text-foreground" data-testid="qualification-heading-aapl"><strong>Why this qualifies:</strong></p>
                <ul className="list-none pl-0 space-y-2" data-testid="qualification-reasons-aapl">
                  <li className="text-sm text-muted-foreground leading-relaxed">45 days is the sweet spot for time decay profits</li>
                  <li className="text-sm text-muted-foreground leading-relaxed">Market is calm, perfect for iron condors</li>
                  <li className="text-sm text-muted-foreground leading-relaxed">Wide safety range with solid premium collection</li>
                </ul>
              </div>
              <Button asChild className="w-full">
                <Link href="/scanner" data-testid="link-view-aapl-analysis">
                  View Full Analysis
                </Link>
              </Button>
            </div>

            {/* XLV Opportunity */}
            <div className="homepage-card bg-muted dark:bg-muted/50 hover:transform hover:-translate-y-1 transition-all" data-testid="opportunity-xlv">
              <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-border flex-wrap gap-2">
                <span className="text-2xl font-bold text-primary" data-testid="ticker-xlv">XLV</span>
                <span className="text-sm font-semibold text-muted-foreground" data-testid="strategy-type-xlv">LEAPS Call</span>
                <span className="text-sm font-semibold text-success bg-success/10 px-3 py-1 rounded-full" data-testid="score-xlv">Score: 65.7</span>
              </div>
              <div className="mb-6">
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-strike-xlv">
                  <span className="text-muted-foreground font-medium">Strike:</span>
                  <span className="text-foreground font-semibold">145</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-dte-xlv">
                  <span className="text-muted-foreground font-medium">DTE:</span>
                  <span className="text-foreground font-semibold">365 days</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-premium-xlv">
                  <span className="text-muted-foreground font-medium">Premium:</span>
                  <span className="text-foreground font-semibold">$8.50</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border text-sm" data-testid="detail-delta-xlv">
                  <span className="text-muted-foreground font-medium">Delta:</span>
                  <span className="text-foreground font-semibold">0.68</span>
                </div>
              </div>
              <div className="mb-6">
                <p className="font-semibold mb-3 text-foreground" data-testid="qualification-heading-xlv"><strong>Why this qualifies:</strong></p>
                <ul className="list-none pl-0 space-y-2" data-testid="qualification-reasons-xlv">
                  <li className="text-sm text-muted-foreground leading-relaxed">Healthcare sector showing strength (defensive)</li>
                  <li className="text-sm text-muted-foreground leading-relaxed">Good time to buy long-term call options</li>
                  <li className="text-sm text-muted-foreground leading-relaxed">Stock has strong support at current levels</li>
                </ul>
              </div>
              <Button asChild className="w-full">
                <Link href="/scanner" data-testid="link-view-xlv-analysis">
                  View Full Analysis
                </Link>
              </Button>
            </div>
          </div>
          
          {!isAuthenticated && (
            <div className="text-center mt-12">
              <p className="text-lg text-muted-foreground mb-6">This represents a sample of today's systematic opportunities</p>
              <Button asChild size="lg">
                <Link href="/auth/login" data-testid="link-access-scanner">
                  Access Full Scanner Results
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Today's Sector Intelligence - 3 Sector Preview */}
      {sectorData && !sectorLoading && sectorData.length >= 3 && (() => {
        // Sort sectors by MTD return (descending) to show top performers
        const sortedSectors = [...sectorData].sort((a, b) => b.mtdReturn - a.mtdReturn).slice(0, 3);
        
        return (
          <section className="homepage-section-shell homepage-section--surface" data-testid="sector-intelligence-section">
            <div className="homepage-section-inner">
              <h2 className="homepage-section-title">Today's Sector Intelligence</h2>
              <p className="section-subtitle">Live sector analysis identifying optimal opportunities for systematic strategies</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                {/* Sector 1 - Top performing (Excellent) */}
                {sortedSectors[0] && (
                  <div className="bg-card rounded-lg border-l-4 border-l-success p-6 shadow-sm" data-testid="sector-preview-1">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-base font-semibold text-foreground" data-testid="sector-name-1">
                        {sortedSectors[0].name || sortedSectors[0].sector}
                      </h3>
                      <span className="px-2.5 py-1 rounded-md bg-success/10 text-success text-xs font-semibold uppercase" data-testid="sector-rating-1">
                        EXCELLENT
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-4" data-testid="sector-metrics-1">
                      MTD: {sortedSectors[0].mtdReturn > 0 ? '+' : ''}{sortedSectors[0].mtdReturn}% | IV Rank: {sortedSectors[0].ivRank} | Trend: {sortedSectors[0].trend}
                    </div>
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-foreground mb-1">Strategy Focus:</p>
                      <p className="text-sm text-muted-foreground leading-relaxed" data-testid="sector-strategy-1">
                        {sortedSectors[0].ivRank < 30 ? 'Iron Condors - Low volatility, stable range-bound movement ideal for systematic premium collection' : 'Credit Spreads - Moderate volatility supports systematic premium strategies'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">Action:</p>
                      <p className="text-sm text-muted-foreground leading-relaxed" data-testid="sector-action-1">
                        Target 45 DTE, 5-7% wing spreads, avoid earnings within 14 days
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Sector 2 - Second choice (Good) */}
                {sortedSectors[1] && (
                  <div className="bg-card rounded-lg border-l-4 border-l-primary p-6 shadow-sm" data-testid="sector-preview-2">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-base font-semibold text-foreground" data-testid="sector-name-2">
                        {sortedSectors[1].name || sortedSectors[1].sector}
                      </h3>
                      <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-semibold uppercase" data-testid="sector-rating-2">
                        GOOD
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-4" data-testid="sector-metrics-2">
                      MTD: {sortedSectors[1].mtdReturn > 0 ? '+' : ''}{sortedSectors[1].mtdReturn}% | IV Rank: {sortedSectors[1].ivRank} | Trend: {sortedSectors[1].trend}
                    </div>
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-foreground mb-1">Strategy Focus:</p>
                      <p className="text-sm text-muted-foreground leading-relaxed" data-testid="sector-strategy-2">
                        Credit Spreads - Moderate volatility supports systematic premium strategies
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">Action:</p>
                      <p className="text-sm text-muted-foreground leading-relaxed" data-testid="sector-action-2">
                        Bearish call spreads on strength, bullish put spreads on weakness
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Sector 3 - Third choice (Monitor/Avoid) */}
                {sortedSectors[2] && (
                  <div className="bg-card rounded-lg border-l-4 border-l-muted p-6 shadow-sm" data-testid="sector-preview-3">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-base font-semibold text-foreground" data-testid="sector-name-3">
                        {sortedSectors[2].name || sortedSectors[2].sector}
                      </h3>
                      <span className="px-2.5 py-1 rounded-md bg-muted text-muted-foreground text-xs font-semibold uppercase" data-testid="sector-rating-3">
                        MONITOR
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-4" data-testid="sector-metrics-3">
                      MTD: {sortedSectors[2].mtdReturn > 0 ? '+' : ''}{sortedSectors[2].mtdReturn}% | IV Rank: {sortedSectors[2].ivRank} | Trend: {sortedSectors[2].trend}
                    </div>
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-foreground mb-1">Current Status:</p>
                      <p className="text-sm text-muted-foreground leading-relaxed" data-testid="sector-strategy-3">
                        Watch for trend development and entry opportunities
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">Action:</p>
                      <p className="text-sm text-muted-foreground leading-relaxed" data-testid="sector-action-3">
                        Monitor for trend clarification before new systematic entries
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="text-center mt-8">
                <Button asChild data-testid="button-view-complete-heatmap">
                  <Link href="/insights">
                    View Complete Sector Heatmap
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Featured Strategies for Current Conditions */}
      <section className="homepage-section-shell homepage-section--primary" data-testid="featured-strategies-section">
        <div className="homepage-section-inner">
          <h2 className="homepage-section-title">Featured Strategies for Current Conditions</h2>
          <p className="section-subtitle">Based on today's market environment, here are the top systematic strategies with their criteria</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
            {/* Strategy 1: Bullish Put Spreads */}
            <div className="bg-card rounded-lg border-l-4 border-l-cyan-500 p-6 shadow-sm" data-testid="featured-strategy-1">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center">
                    <span className="text-sm font-bold text-white">1</span>
                  </div>
                  <h3 className="text-base font-bold text-foreground">Bullish Put Spreads</h3>
                </div>
                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase ${
                  vixData.vix >= 15 && vixData.vix <= 25 ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}>
                  {vixData.vix >= 15 && vixData.vix <= 25 ? 'GOOD' : 'WAIT'}
                </span>
              </div>
              
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground mb-3">Current Systematic Criteria:</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><span className="text-cyan-500">•</span><span>IV Rank: 30-50 (adequate premium collection)</span></li>
                  <li className="flex items-start gap-2"><span className="text-cyan-500">•</span><span>Uptrend or range-bound confirmation</span></li>
                  <li className="flex items-start gap-2"><span className="text-cyan-500">•</span><span>Defensive sectors (current regime favors)</span></li>
                  <li className="flex items-start gap-2"><span className="text-cyan-500">•</span><span>3%+ above key support levels</span></li>
                </ul>
              </div>
              
              <div className="p-4 bg-cyan-50 dark:bg-cyan-950/20 border-l-4 border-l-cyan-500 rounded">
                <p className="text-sm text-foreground">
                  <strong className="text-cyan-600 dark:text-cyan-400">Why This Works:</strong> Current market conditions provide adequate premium collection opportunities while maintaining manageable risk profiles for systematic execution.
                </p>
              </div>
            </div>

            {/* Strategy 2: Neutral Iron Condors */}
            <div className="bg-card rounded-lg border-l-4 border-l-emerald-500 p-6 shadow-sm" data-testid="featured-strategy-2">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                    <span className="text-sm font-bold text-white">3</span>
                  </div>
                  <h3 className="text-base font-bold text-foreground">Neutral Iron Condors</h3>
                </div>
                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase ${
                  vixData.vix < 20 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}>
                  {vixData.vix < 20 ? 'IDEAL ENVIRONMENT' : 'CAUTION'}
                </span>
              </div>
              
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-foreground mb-3">Current Systematic Criteria:</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>IV Rank: 15-40 (low to fair premium optimal)</span></li>
                  <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>Range-bound, no strong trend</span></li>
                  <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>Support/Resistance 5%+ apart</span></li>
                  <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span><strong className="text-foreground">Rule:</strong> Close if VIX &gt; 20</span></li>
                </ul>
              </div>
              
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border-l-4 border-l-emerald-500 rounded">
                <p className="text-sm text-foreground">
                  <strong className="text-emerald-600 dark:text-emerald-400">Why This Works:</strong> Range-bound market environment allows theta decay to work optimally. Close positions if market breaks out of range or volatility spikes above threshold.
                </p>
              </div>
            </div>
          </div>
          
          <div className="text-center mt-8">
            <p className="text-muted-foreground mb-4">These criteria are applied automatically in our scanner to find qualifying setups</p>
            <Button asChild size="lg">
              <Link href="/insights" data-testid="link-all-strategy-criteria">
                View All Strategy Criteria
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Why Choose ZenOptions Section */}
      <section className="platform-advantages px-8" data-testid="why-choose-section">
        <div className="max-w-[1280px] mx-auto">
          <h2>Why Choose ZenOptions?</h2>
          
          <div className="advantages-grid">
            <div className="advantage-item" data-testid="advantage-proven-rules">
              <div className="advantage-icon">
                <Brain />
              </div>
              <h3>Follow Proven Rules</h3>
              <p>Stop guessing. Our system follows time-tested rules for when to enter and exit trades, removing emotion from your decisions.</p>
            </div>
            
            <div className="advantage-item" data-testid="advantage-market-understanding">
              <div className="advantage-icon">
                <BarChart3 />
              </div>
              <h3>Understand The Market</h3>
              <p>Get daily plain-English analysis of market conditions. We tell you when it's safe to trade aggressively and when to be cautious.</p>
            </div>
            
            <div className="advantage-item" data-testid="advantage-find-trades">
              <div className="advantage-icon">
                <Bot />
              </div>
              <h3>Find Trades Faster</h3>
              <p>Stop spending hours analyzing options chains. Our scanner finds high-quality trade setups for you in seconds.</p>
            </div>
            
            <div className="advantage-item" data-testid="advantage-alerts">
              <div className="advantage-icon">
                <BellRing />
              </div>
              <h3>Never Miss an Alert</h3>
              <p>Get instant Telegram notifications when it's time to take profits, cut losses, or adjust your positions. Stay informed without watching the market all day.</p>
            </div>
          </div>
          
          <div className="cta-section" data-testid="cta-start-trading">
            <h3>Start Trading with Confidence</h3>
            <p>Join traders who've stopped guessing and started following a proven system</p>
            <Link 
              href="/auth/login" 
              className="inline-block bg-primary hover:bg-primary/90 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
              data-testid="button-start-free-trial"
            >
              Start Your Free Trial
            </Link>
            <p className="cta-note">No credit card required • Full access to ZenScan • 3 scans per week</p>
          </div>
        </div>
      </section>
    </div>
  );
}
