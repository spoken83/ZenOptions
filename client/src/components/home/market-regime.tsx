import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

interface RegimeData {
  regime: 'DEFENSIVE' | 'RISK_ON' | 'TRANSITIONING';
  confidence: number;
  score: number;
  signals: {
    xlpXlyRatio: { value: number; signal: string; weight: number };
    techVsBroad: { value: number; signal: string; weight: number };
    healthcare: { value: number; signal: string; weight: number };
    financials: { value: number; signal: string; weight: number };
  };
  leaders: Array<{ sector: string; performance: number }>;
  laggards: Array<{ sector: string; performance: number }>;
  duration: number;
  vixContext: string;
}

interface MarketRegimeProps {
  data: RegimeData;
}

export function MarketRegime({ data }: MarketRegimeProps) {
  const getRegimeColor = () => {
    switch (data.regime) {
      case 'DEFENSIVE':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'RISK_ON':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'TRANSITIONING':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    }
  };

  const getRegimeIcon = () => {
    switch (data.regime) {
      case 'DEFENSIVE':
        return <TrendingDown className="h-6 w-6" />;
      case 'RISK_ON':
        return <TrendingUp className="h-6 w-6" />;
      case 'TRANSITIONING':
        return <Activity className="h-6 w-6" />;
    }
  };

  const getRegimeDescription = () => {
    switch (data.regime) {
      case 'DEFENSIVE':
        return 'Market rotating to defensive sectors (Healthcare, Staples). Focus on quality, lower volatility names.';
      case 'RISK_ON':
        return 'Market in risk-on mode. Growth sectors (Tech, Discretionary) leading. Favorable for aggressive strategies.';
      case 'TRANSITIONING':
        return 'Mixed signals. Market between regimes. Exercise caution and wait for clearer direction.';
    }
  };

  return (
    <Card className="p-6 bg-card border-border">
      <div className="space-y-6">
        {/* Regime Header */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Market Regime Indicator</h3>
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${getRegimeColor()}`}>
            {getRegimeIcon()}
            <div className="flex-1">
              <div className="font-semibold text-lg">{data.regime}</div>
              <div className="text-sm opacity-90 mt-1">
                Confidence: {data.confidence}%
              </div>
            </div>
          </div>
          <Progress value={data.confidence} className="mt-2 h-2" />
        </div>

        {/* Description */}
        <div className="text-sm text-muted-foreground">
          {getRegimeDescription()}
        </div>

        {/* VIX Context */}
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm font-medium mb-1">VIX Context</p>
          <p className="text-sm text-muted-foreground">{data.vixContext}</p>
        </div>

        {/* Signals */}
        <div>
          <p className="text-sm font-medium mb-3">Key Signals</p>
          <div className="grid grid-cols-2 gap-3">
            <SignalCard
              label="XLP/XLY Ratio"
              value={data.signals.xlpXlyRatio.value}
              signal={data.signals.xlpXlyRatio.signal}
            />
            <SignalCard
              label="Tech vs Broad"
              value={data.signals.techVsBroad.value}
              signal={data.signals.techVsBroad.signal}
            />
            <SignalCard
              label="Healthcare"
              value={data.signals.healthcare.value}
              signal={data.signals.healthcare.signal}
            />
            <SignalCard
              label="Financials"
              value={data.signals.financials.value}
              signal={data.signals.financials.signal}
            />
          </div>
        </div>

        {/* Leaders & Laggards */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-2 text-green-400">Leaders (1W)</p>
            <div className="space-y-2">
              {data.leaders.map((leader, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{leader.sector}</span>
                  <span className="text-green-400 font-medium">
                    +{leader.performance.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2 text-red-400">Laggards (1W)</p>
            <div className="space-y-2">
              {data.laggards.map((laggard, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{laggard.sector}</span>
                  <span className="text-red-400 font-medium">
                    {laggard.performance.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="text-xs text-muted-foreground">
          Duration: {data.duration} days in current regime
        </div>
      </div>
    </Card>
  );
}

function SignalCard({ label, value, signal }: { label: string; value: number; signal: string }) {
  const getSignalColor = () => {
    if (signal === 'DEFENSIVE') return 'text-blue-400';
    if (signal === 'RISK_ON') return 'text-green-400';
    return 'text-gray-400';
  };

  return (
    <div className="bg-muted/30 rounded p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{value.toFixed(2)}%</span>
        <span className={`text-xs ${getSignalColor()}`}>{signal}</span>
      </div>
    </div>
  );
}
