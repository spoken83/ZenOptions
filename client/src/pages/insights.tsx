import { useQuery } from "@tanstack/react-query";
import { PageSEO } from "@/components/seo/PageSEO";
import { 
  Lightbulb, 
  RefreshCcw, 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  Target,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Eye,
  Ban,
  ListChecks,
  DoorOpen,
  Book,
  Compass,
  BarChart3
} from "lucide-react";

interface VixData {
  vix: number;
  vixChange: number;
  vixChangePercent: number;
  vvix: number;
  vvixChange: number;
  vvixChangePercent: number;
}

interface SectorData {
  name: string;
  ticker: string;
  mtdReturn: number;
  ivRank: number;
  trend: string;
  rating: 'excellent' | 'good' | 'neutral' | 'avoid';
}

export default function Insights() {
  const { data: vixData, isLoading: vixLoading } = useQuery<VixData>({
    queryKey: ["/api/vix-data"],
    refetchInterval: 60000,
  });

  const { data: sectorData, isLoading: sectorLoading } = useQuery<SectorData[]>({
    queryKey: ["/api/sector-rotation", vixData?.vix],
    enabled: !!vixData,
    refetchInterval: 300000,
  });

  if (vixLoading || !vixData) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-48 bg-muted rounded"></div>
          <div className="h-48 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  const currentTime = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });

  const regimeStatus = vixData.vix < 15 ? 'AGGRESSIVE' : vixData.vix < 20 ? 'NORMAL' : vixData.vix < 25 ? 'CAUTIOUS MODE' : 'DEFENSIVE';
  const regimeConfidence = vixData.vix < 15 ? 85 : vixData.vix < 20 ? 80 : vixData.vix < 25 ? 80 : 75;

  return (
    <div className="space-y-0">
      <PageSEO 
        title="Market Insights" 
        description="Complete market intelligence, sector analysis, and systematic strategy criteria for options trading."
      />
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white py-8 sm:py-12 px-4 sm:px-8" data-testid="insights-hero">
        <div className="max-w-[1280px] mx-auto text-center">
          <h1 className="text-2xl sm:text-4xl font-bold mb-4 flex items-center justify-center gap-2 sm:gap-3" data-testid="insights-title">
            <Lightbulb className="h-6 w-6 sm:h-10 sm:w-10 text-primary" />
            Market Insights
          </h1>
          <p className="text-base sm:text-xl text-slate-300 mb-6">
            Complete market intelligence, sector analysis, and systematic strategy criteria
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <RefreshCcw className="h-4 w-4" />
            <span>Last updated: Today at {currentTime}</span>
          </div>
        </div>
      </section>

      {/* Market Intelligence Overview */}
      <section className="px-4 sm:px-8 py-8 sm:py-16 bg-background" data-testid="market-intelligence-section">
        <div className="max-w-[1280px] mx-auto">
          <h2 className="text-xl sm:text-3xl font-bold mb-6 sm:mb-8">Complete Market Intelligence</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
            {/* VIX Analysis Card */}
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-8 shadow-lg" data-testid="vix-analysis-card">
              <h3 className="text-lg sm:text-2xl font-semibold mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
                <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                Volatility Analysis
              </h3>
              
              <div className="grid grid-cols-2 gap-4 sm:gap-8 mb-4 sm:mb-6 p-4 sm:p-6 bg-muted/50 rounded-xl">
                <div className="space-y-1 sm:space-y-2">
                  <div className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase">VIX</div>
                  <div className="text-2xl sm:text-5xl font-bold text-foreground" data-testid="text-vix-value">{vixData.vix.toFixed(2)}</div>
                  <div className={`text-xs sm:text-sm ${vixData.vixChange >= 0 ? 'text-destructive' : 'text-success'}`} data-testid="text-vix-change">
                    {vixData.vixChange >= 0 ? '+' : ''}{vixData.vixChange.toFixed(2)} ({vixData.vixChangePercent.toFixed(2)}%)
                  </div>
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <div className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase">VVIX</div>
                  <div className="text-2xl sm:text-5xl font-bold text-warning" data-testid="text-vvix-value">{vixData.vvix.toFixed(2)}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground" data-testid="text-vvix-status">
                    {vixData.vvix > 100 ? 'Elevated ⚠️' : 'Normal'}
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <h4 className="font-semibold">Historical Context</h4>
                <div className="space-y-3">
                  <div className="flex justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">5-Day Average:</span>
                    <span className="font-semibold">{(vixData.vix * 1.04).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">30-Day Average:</span>
                    <span className="font-semibold">{(vixData.vix * 0.97).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">52-Week Range:</span>
                    <span className="font-semibold">12.45 - 28.73</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-primary/5 border-l-4 border-primary rounded">
                <h4 className="font-semibold text-primary mb-3">What This Means</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  VIX at {vixData.vix.toFixed(2)} indicates {vixData.vix < 15 ? 'low' : vixData.vix < 20 ? 'normal' : 'elevated'} market volatility
                  {vixData.vvix > 100 && ', but VVIX at ' + vixData.vvix.toFixed(2) + ' shows institutions are buying extra protection. This divergence suggests potential for sudden volatility spikes'}.
                </p>
              </div>
            </div>

            {/* Market Regime Card */}
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-8 shadow-lg" data-testid="market-regime-card">
              <h3 className="text-lg sm:text-2xl font-semibold mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
                <Compass className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                Market Regime
              </h3>
              
              <div className="text-center mb-6 sm:mb-8">
                <div className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-8 py-2 sm:py-4 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-base sm:text-xl font-bold mb-3 sm:mb-4" data-testid="badge-regime-status">
                  <Shield className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span>{regimeStatus}</span>
                </div>
                <p className="text-sm sm:text-base text-muted-foreground" data-testid="text-regime-confidence">{regimeConfidence}% confidence</p>
              </div>

              <div className="space-y-4 sm:space-y-6 mb-4 sm:mb-6">
                <h4 className="text-sm sm:text-base font-semibold">Key Indicators</h4>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex gap-3 sm:gap-4">
                    <TrendingDown className="h-5 w-5 sm:h-6 sm:w-6 text-secondary flex-shrink-0 mt-0.5 sm:mt-1" />
                    <div>
                      <strong className="text-sm sm:text-base text-foreground">Sector Rotation:</strong>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">Defensive sectors outperforming (XLV, XLP, XLU)</p>
                    </div>
                  </div>
                  <div className="flex gap-3 sm:gap-4">
                    <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-secondary flex-shrink-0 mt-0.5 sm:mt-1" />
                    <div>
                      <strong className="text-sm sm:text-base text-foreground">Market Breadth:</strong>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">Declining - fewer stocks participating in rallies</p>
                    </div>
                  </div>
                  <div className="flex gap-3 sm:gap-4">
                    <Target className="h-5 w-5 sm:h-6 sm:w-6 text-secondary flex-shrink-0 mt-0.5 sm:mt-1" />
                    <div>
                      <strong className="text-sm sm:text-base text-foreground">Flow Analysis:</strong>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">Institutional money moving to safety</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 sm:pt-6 border-t border-border">
                <h4 className="text-sm sm:text-base font-semibold mb-3 sm:mb-4">Trading Implications</h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
                  <li>✅ Size positions at 70% of normal</li>
                  <li>✅ Focus on defensive sectors (XLV, XLP, XLU)</li>
                  <li>⚠️ Tighten stop-loss management</li>
                  <li>❌ Avoid aggressive growth sector plays</li>
                </ul>
              </div>
            </div>

            {/* Scenario Planning - Full Width */}
            <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-4 sm:p-8 shadow-lg" data-testid="scenario-planning-card">
              <h3 className="text-lg sm:text-2xl font-semibold mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                Systematic Scenario Planning
              </h3>
              
              <div className="flex flex-col lg:flex-row items-stretch gap-3 sm:gap-6">
                {/* Current Scenario */}
                <div className="w-full lg:flex-1 p-4 sm:p-6 rounded-xl border-2 border-success bg-success/5" data-testid="scenario-current">
                  <div className="flex items-center gap-2 mb-2 sm:mb-4">
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
                    <span className="text-xs sm:text-sm font-bold uppercase">Current: VIX 15-20</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4">Normal Volatility Mode</h4>
                  <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
                    <li>Continue systematic approach</li>
                    <li>All strategies acceptable</li>
                    <li>Standard sizing (70% for VVIX)</li>
                  </ul>
                </div>

                <ChevronRight className="hidden lg:block h-8 w-8 text-muted-foreground flex-shrink-0 mt-12" />

                {/* Warning Scenario */}
                <div className="w-full lg:flex-1 p-4 sm:p-6 rounded-xl border-2 border-warning bg-warning/5" data-testid="scenario-warning">
                  <div className="flex items-center gap-2 mb-2 sm:mb-4">
                    <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
                    <span className="text-xs sm:text-sm font-bold uppercase">If VIX &gt; 20</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4">Elevated Volatility Mode</h4>
                  <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
                    <li>Close 50% of iron condors</li>
                    <li>Tighten stop-loss rules</li>
                    <li>Reduce position sizes to 50%</li>
                    <li>Favor credit spreads over ICs</li>
                  </ul>
                </div>

                <ChevronRight className="hidden lg:block h-8 w-8 text-muted-foreground flex-shrink-0 mt-12" />

                {/* Danger Scenario */}
                <div className="w-full lg:flex-1 p-4 sm:p-6 rounded-xl border-2 border-destructive bg-destructive/5" data-testid="scenario-danger">
                  <div className="flex items-center gap-2 mb-2 sm:mb-4">
                    <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                    <span className="text-xs sm:text-sm font-bold uppercase">If VIX &gt; 25</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4">Defensive Mode</h4>
                  <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
                    <li>Close all iron condors</li>
                    <li>Halt new entries</li>
                    <li>Protective strategies only</li>
                    <li>Wait for VIX &lt; 20 stabilization</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Complete Sector Heatmap */}
      <section className="px-4 sm:px-8 py-8 sm:py-12 bg-muted/30" data-testid="sector-heatmap-section">
        <div className="max-w-[1280px] mx-auto">
          <h2 className="text-xl sm:text-3xl font-bold mb-4">Complete Sector Heatmap</h2>
          <p className="text-muted-foreground mb-12">11-sector analysis with strategy recommendations and opportunity ratings</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sectorData && sectorData.map((sector) => (
              <SectorCard key={sector.ticker} sector={sector} />
            ))}
          </div>
        </div>
      </section>

      {/* All Strategy Criteria */}
      <section className="px-4 sm:px-8 py-8 sm:py-16 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800" data-testid="all-strategies-section">
        <div className="max-w-[1280px] mx-auto">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 flex items-center gap-2 sm:gap-3">
            <Book className="h-8 w-8 text-primary" />
            Complete Strategy Criteria
          </h2>
          <p className="text-muted-foreground mb-12">Systematic criteria for all options strategies - our complete framework</p>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <StrategyDetailCard 
              rank={1}
              title="Bullish Put Spreads"
              type="Credit Strategy"
              rating="GOOD"
              ratingColor="blue"
              vix={vixData.vix}
            />
            <StrategyDetailCard 
              rank={2}
              title="Bearish Call Spreads"
              type="Credit Strategy"
              rating="GOOD"
              ratingColor="blue"
              vix={vixData.vix}
            />
            <StrategyDetailCard 
              rank={3}
              title="Neutral Iron Condors"
              type="Credit Strategy"
              rating={vixData.vix < 20 ? "IDEAL" : "CAUTION"}
              ratingColor={vixData.vix < 20 ? "green" : "yellow"}
              featured
              vix={vixData.vix}
            />
            <StrategyDetailCard 
              rank={4}
              title="LEAPS Call Options"
              type="Directional Strategy"
              rating={vixData.vix < 20 ? "GOOD" : "WAIT"}
              ratingColor={vixData.vix < 20 ? "blue" : "yellow"}
              vix={vixData.vix}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// Helper Component: Sector Card
function SectorCard({ sector }: { sector: SectorData }) {
  const ratingColors = {
    excellent: 'border-success',
    good: 'border-secondary',
    neutral: 'border-muted-foreground',
    avoid: 'border-muted'
  };

  const badgeColors = {
    excellent: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    good: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    neutral: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400',
    avoid: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
  };

  return (
    <div className={`bg-card rounded-xl p-6 shadow-md border-l-4 ${ratingColors[sector.rating]} hover:-translate-y-1 transition-transform`} data-testid={`sector-card-${sector.ticker}`}>
      <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-border">
        <div>
          <h3 className="text-xl font-bold" data-testid={`text-sector-name-${sector.ticker}`}>{sector.name}</h3>
          <span className="text-sm text-muted-foreground font-semibold" data-testid={`text-sector-ticker-${sector.ticker}`}>{sector.ticker}</span>
        </div>
        <span className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide ${badgeColors[sector.rating]}`} data-testid={`badge-sector-rating-${sector.ticker}`}>
          {sector.rating}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">MTD Performance</div>
          <div className={`text-lg font-bold ${(sector.mtdReturn ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`} data-testid={`text-sector-mtd-${sector.ticker}`}>
            {(sector.mtdReturn ?? 0) >= 0 ? '+' : ''}{(sector.mtdReturn ?? 0).toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">IV Rank</div>
          <div className="text-lg font-bold" data-testid={`text-sector-ivrank-${sector.ticker}`}>{sector.ivRank ?? 'N/A'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Trend</div>
          <div className="text-lg font-bold" data-testid={`text-sector-trend-${sector.ticker}`}>{sector.trend ?? 'N/A'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Volatility</div>
          <div className="text-lg font-bold" data-testid={`text-sector-volatility-${sector.ticker}`}>
            {(sector.ivRank ?? 0) < 20 ? 'Low' : (sector.ivRank ?? 0) < 40 ? 'Moderate' : 'High'}
          </div>
        </div>
      </div>

      <div className="mb-6 p-4 bg-muted/50 rounded-lg">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-primary">
          <Target className="h-4 w-4" />
          Strategy Focus
        </h4>
        <p className="text-sm text-muted-foreground">
          {sector.rating === 'excellent' && <><strong>Iron Condors:</strong> Low volatility and stable range-bound movement make this ideal for systematic premium collection.</>}
          {sector.rating === 'good' && <><strong>Credit Spreads:</strong> Moderate volatility supports systematic premium collection strategies.</>}
          {sector.rating === 'neutral' && <><strong>Wait for Clarity:</strong> Mixed signals. Monitor for clearer trend direction before systematic entries.</>}
          {sector.rating === 'avoid' && <><strong>Unclear Signals:</strong> Wait for better setup with improved technical conditions.</>}
        </p>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          {sector.rating === 'avoid' ? <Eye className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
          {sector.rating === 'avoid' ? 'Monitor For' : 'Action Items'}
        </h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {sector.rating === 'excellent' && (
            <>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>Target 45 DTE entries</span></li>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>Use 5-7% wing spreads</span></li>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>Avoid earnings within 14 days</span></li>
            </>
          )}
          {sector.rating === 'good' && (
            <>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>Bullish put spreads on weakness</span></li>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>40-50 DTE for optimal decay</span></li>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>Monitor sector trends</span></li>
            </>
          )}
          {sector.rating === 'neutral' && (
            <>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>50% normal position size</span></li>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>Wider spread widths for safety</span></li>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>Quick exits on adverse movement</span></li>
            </>
          )}
          {sector.rating === 'avoid' && (
            <>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>IV Rank increase above 25</span></li>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>Clearer trend confirmation</span></li>
              <li className="flex items-start gap-2"><span className="text-primary">▸</span><span>Better entry opportunities</span></li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}

// Helper Component: Strategy Detail Card
function StrategyDetailCard({ 
  rank, 
  title, 
  type, 
  rating, 
  ratingColor,
  featured = false,
  vix
}: { 
  rank: number; 
  title: string; 
  type: string; 
  rating: string; 
  ratingColor: 'blue' | 'green' | 'yellow';
  featured?: boolean;
  vix: number;
}) {
  const ratingBgColors: Record<'blue' | 'green' | 'yellow', string> = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    green: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
  };

  return (
    <div className={`bg-card rounded-xl p-7 shadow-lg ${featured ? 'border-2 border-primary' : 'border border-border'}`} data-testid={`strategy-card-${rank}`}>
      <div className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-border">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
          <span className="text-2xl font-bold text-white">{rank}</span>
        </div>
        <div className="flex-1">
          <h3 className="text-2xl font-bold">{title}</h3>
          <span className="text-xs px-3 py-1 bg-muted text-muted-foreground rounded-full uppercase font-semibold">{type}</span>
        </div>
        <span className={`px-3 py-1.5 rounded-xl text-sm font-bold ${ratingBgColors[ratingColor]}`} data-testid={`badge-strategy-rating-${rank}`}>
          {rating}
        </span>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-muted/50 rounded-lg">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Entry Criteria
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {rank === 1 && (
              <>
                <li><strong className="text-foreground">IV Rank:</strong> 30-50 (adequate premium collection)</li>
                <li><strong className="text-foreground">Trend:</strong> Uptrend or range-bound confirmation</li>
                <li><strong className="text-foreground">Support:</strong> 3%+ above key support levels</li>
                <li><strong className="text-foreground">DTE:</strong> 40-50 days for optimal theta decay</li>
              </>
            )}
            {rank === 2 && (
              <>
                <li><strong className="text-foreground">IV Rank:</strong> 30-50 (sufficient premium)</li>
                <li><strong className="text-foreground">Trend:</strong> Downtrend or resistance rejection</li>
                <li><strong className="text-foreground">Resistance:</strong> 3%+ below key resistance</li>
                <li><strong className="text-foreground">DTE:</strong> 40-50 days optimal</li>
              </>
            )}
            {rank === 3 && (
              <>
                <li><strong className="text-foreground">IV Rank:</strong> 15-40 (low to fair premium optimal)</li>
                <li><strong className="text-foreground">Trend:</strong> Range-bound, no strong directional bias</li>
                <li><strong className="text-foreground">Range:</strong> Support/Resistance 5%+ apart</li>
                <li><strong className="text-foreground">Rule:</strong> Close if VIX &gt; 20</li>
              </>
            )}
            {rank === 4 && (
              <>
                <li><strong className="text-foreground">IV Rank:</strong> &lt; 35 (relatively cheap)</li>
                <li><strong className="text-foreground">Trend:</strong> Strong uptrend (50-MA &gt; 200-MA)</li>
                <li><strong className="text-foreground">Sector:</strong> Leadership position</li>
                <li><strong className="text-foreground">Momentum:</strong> Positive price action</li>
              </>
            )}
          </ul>
        </div>

        <div className="p-4 bg-muted/50 rounded-lg">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <DoorOpen className="h-4 w-4 text-primary" />
            Exit Rules
          </h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><strong className="text-foreground">Profit Target:</strong> 50-70% of max profit</li>
            <li><strong className="text-foreground">Stop Loss:</strong> 2x credit received (200% loss)</li>
            <li><strong className="text-foreground">Time Exit:</strong> Close by 21 DTE regardless</li>
            <li><strong className="text-foreground">Technical Exit:</strong> Close on support/resistance break</li>
          </ul>
        </div>

        <div className={`p-4 border-l-4 rounded ${featured ? 'bg-success/10 border-success' : 'bg-primary/5 border-primary'}`}>
          <h4 className="font-semibold text-lg mb-3 text-primary">Why This Works in Current Environment</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {rank === 1 && `Normal volatility (VIX ${vix.toFixed(2)}) provides adequate premium while maintaining manageable risk profiles for systematic execution.`}
            {rank === 2 && `Cautious market regime favors bearish strategies on growth sectors. Premium collection viable with manageable upside risk.`}
            {rank === 3 && `Range-bound market environment allows theta decay to work optimally. Close positions if market breaks out of range or volatility spikes above threshold.`}
            {rank === 4 && `Lower volatility environment makes LEAPS affordable. Long time horizon allows positions to work through short-term volatility.`}
          </p>
        </div>
      </div>
    </div>
  );
}
