import { AlertCircle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { calculateVixAlertStatus, getVixColorClass } from "@/lib/vixCalculations";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface RegimeData {
  regime: 'DEFENSIVE' | 'RISK_ON' | 'TRANSITIONING';
  confidence: number;
  vixContext: string;
}

interface MarketSnapshotProps {
  vix: number;
  vixChange: number;
  vixChangePercent: number;
  vvix: number;
  regimeData?: RegimeData;
}

export function MarketSnapshot({ vix, vixChange, vixChangePercent, vvix, regimeData }: MarketSnapshotProps) {
  const status = calculateVixAlertStatus(vix, vvix);
  const shouldReduceSize = vvix > 100 && vix < 20;
  const vixPosition = Math.min(100, (vix / 35) * 100);

  const getRegimeColor = () => {
    if (!regimeData) return '';
    switch (regimeData.regime) {
      case 'DEFENSIVE':
        return 'bg-accent/10 text-accent border-accent/30';
      case 'RISK_ON':
        return 'bg-success/10 text-success border-success/30';
      case 'TRANSITIONING':
        return 'bg-warning/10 text-warning border-warning/30';
    }
  };

  const getRegimeIcon = () => {
    if (!regimeData) return null;
    switch (regimeData.regime) {
      case 'DEFENSIVE':
        return <TrendingDown className="h-5 w-5" />;
      case 'RISK_ON':
        return <TrendingUp className="h-5 w-5" />;
      case 'TRANSITIONING':
        return <Activity className="h-5 w-5" />;
    }
  };

  const getTradingImpact = () => {
    if (!regimeData) return null;
    switch (regimeData.regime) {
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
  };

  const tradingImpact = getTradingImpact();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT: Market Volatility Card - Matches mockup */}
      <div className="homepage-card" data-testid="market-volatility-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-foreground">Market Volatility</h3>
          <Badge 
            variant="outline" 
            className={`${
              vix < 15 ? 'bg-success/10 text-success border-success/30' :
              vix < 25 ? 'bg-accent/10 text-accent border-accent/30' :
              'bg-destructive/10 text-destructive border-destructive/30'
            }`}
          >
            {status.level}
          </Badge>
        </div>

        {/* VIX and VVIX side by side in gray box */}
        <div className="homepage-vix-display mb-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">VIX</div>
            <div className="text-[2.75rem] font-semibold leading-none mb-1 text-foreground">{vix.toFixed(2)}</div>
            <div className="text-sm text-success">Normal Range</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">VVIX</div>
            <div className="text-[2.75rem] font-semibold text-warning leading-none mb-1">{vvix.toFixed(2)}</div>
            <div className="text-sm text-warning flex items-center gap-1">
              {vvix > 100 ? <>Elevated <AlertCircle className="h-3 w-3" /></> : 'Normal'}
            </div>
          </div>
        </div>

        {/* Horizontal meter bar - matches mockup */}
        <div className="mb-4">
          <div className="relative h-2 bg-muted dark:bg-muted/50 rounded-full overflow-hidden">
            <div className="absolute inset-0 flex">
              <div className="flex-[15] bg-success/60" />
              <div className="flex-[10] bg-muted-foreground/40" />
              <div className="flex-[10] bg-warning/60" />
            </div>
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-foreground dark:bg-primary border border-card"
              style={{ left: `${vixPosition}%`, transform: `translate(-50%, -50%)` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>Low (&lt;15)</span>
            <span>Normal (15-25)</span>
            <span>High (&gt;25)</span>
          </div>
        </div>

        {/* What the data tells us */}
        <div className="mb-4">
          <p className="text-sm text-foreground leading-relaxed">
            <span className="font-medium">What the data tells us:</span> VIX at {vix.toFixed(2)} indicates {vix < 15 ? 'very calm' : vix < 20 ? 'calm' : vix < 25 ? 'elevated' : 'high'} market conditions
            {vvix > 100 && vix < 25 && `, but VVIX at ${vvix.toFixed(2)} shows institutions are buying extra protection.`}
          </p>
        </div>

        {/* Risk Alert - Yellow box like mockup */}
        {shouldReduceSize && (
          <div className="bg-warning/10 border border-warning/40 rounded-lg p-4" data-testid="risk-alert">
            <p className="text-sm font-semibold text-warning-foreground mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              ⚠️ Risk Alert
            </p>
            <p className="text-sm text-warning-foreground leading-relaxed">
              When VVIX is elevated while VIX is normal, volatility can spike quickly. <strong>Reduce position sizes to 70% of normal</strong> as a precaution.
            </p>
          </div>
        )}
      </div>

      {/* RIGHT: Trading Environment Card - Matches mockup */}
      <div className="homepage-card" data-testid="trading-environment-card">
        <h3 className="font-semibold text-foreground mb-4">Trading Environment</h3>
        
        {regimeData && (
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 ${
            regimeData.regime === 'DEFENSIVE' ? 'bg-accent/10 text-accent' :
            regimeData.regime === 'RISK_ON' ? 'bg-success/10 text-success' :
            'bg-warning/10 text-warning'
          }`}>
            {getRegimeIcon()}
            <span className="font-medium text-sm uppercase tracking-wide">
              {regimeData.regime === 'DEFENSIVE' ? 'CAUTIOUS MODE' : regimeData.regime}
            </span>
          </div>
        )}

        {tradingImpact && (
          <>
            <div className="mb-6">
              <p className="text-sm text-foreground leading-relaxed">
                <span className="font-medium">What's happening:</span> {tradingImpact.focus}
              </p>
            </div>

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
                  <>
                    <li className="flex items-start gap-2 text-sm text-foreground">
                      <span className="text-success flex-shrink-0">✅</span>
                      <span>{tradingImpact.strategies}</span>
                    </li>
                  </>
                )}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
