import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

interface VixAnalysisProps {
  analysis: {
    current: number;
    weekHigh: number;
    weekLow: number;
    monthHigh: number;
    monthLow: number;
    yearHigh: number;
    yearLow: number;
    percentile52Week: number;
    daysAbove20: number;
    daysAbove25: number;
    daysAbove30: number;
    totalDays: number;
    spikeHistory: Array<{
      date: string;
      level: number;
      change: number;
      trigger: string;
    }>;
    averageLevel: number;
    interpretation: string;
  };
}

export function AdvancedVixAnalysis({ analysis }: VixAnalysisProps) {
  const getPercentileColor = (percentile: number) => {
    if (percentile < 25) return 'text-green-400';
    if (percentile < 50) return 'text-yellow-400';
    if (percentile < 75) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <div className="grid gap-8">
      {/* Historical Context */}
      <Card className="card-elevated p-8">
        <h3 className="card-heading mb-6">52-Week Historical Context</h3>
        
        {/* Percentile Visualization */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground uppercase tracking-wider">VIX Percentile</span>
            <span className={`text-3xl font-bold data-value ${getPercentileColor(analysis.percentile52Week)}`}>
              {analysis.percentile52Week}th
            </span>
          </div>
          <div className="h-4 bg-secondary rounded-full overflow-hidden border border-border/50">
            <div
              className="h-full bg-gradient-to-r from-success via-warning via-destructive to-destructive transition-all duration-500"
              style={{ width: `${analysis.percentile52Week}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        {/* Interpretation */}
        <div className="bg-secondary/50 border border-border/50 rounded-lg p-5 mb-8">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {analysis.interpretation}
          </p>
        </div>

        {/* VIX Ranges */}
        <div className="grid grid-cols-3 gap-5">
          <div className="bg-secondary/50 border border-border/50 rounded-lg p-4">
            <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">1-Week Range</div>
            <div className="font-semibold data-value text-lg">
              {analysis.weekLow.toFixed(2)} - {analysis.weekHigh.toFixed(2)}
            </div>
          </div>
          <div className="bg-secondary/50 border border-border/50 rounded-lg p-4">
            <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">1-Month Range</div>
            <div className="font-semibold data-value text-lg">
              {analysis.monthLow.toFixed(2)} - {analysis.monthHigh.toFixed(2)}
            </div>
          </div>
          <div className="bg-secondary/50 border border-border/50 rounded-lg p-4">
            <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">52-Week Range</div>
            <div className="font-semibold data-value text-lg">
              {analysis.yearLow.toFixed(2)} - {analysis.yearHigh.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Days Above Thresholds */}
        <div className="mt-6">
          <h4 className="text-sm font-medium mb-3">Time Spent in VIX Zones (Last 252 Days)</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">VIX {'>'} 20 (Elevated)</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-500"
                    style={{ width: `${(analysis.daysAbove20 / analysis.totalDays) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {Math.round((analysis.daysAbove20 / analysis.totalDays) * 100)}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">VIX {'>'} 25 (High)</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${(analysis.daysAbove25 / analysis.totalDays) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {Math.round((analysis.daysAbove25 / analysis.totalDays) * 100)}%
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">VIX {'>'} 30 (Crisis)</span>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600"
                    style={{ width: `${(analysis.daysAbove30 / analysis.totalDays) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {Math.round((analysis.daysAbove30 / analysis.totalDays) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Average Level */}
        <div className="mt-6 flex items-center justify-between p-3 bg-muted/30 rounded">
          <span className="text-sm font-medium">52-Week Average VIX</span>
          <span className="text-lg font-bold">{analysis.averageLevel.toFixed(2)}</span>
        </div>
      </Card>

      {/* Spike History */}
      {analysis.spikeHistory.length > 0 && (
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold mb-4">Recent VIX Spikes</h3>
          <div className="space-y-3">
            {analysis.spikeHistory.map((spike, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 rounded">
                <div>
                  <div className="font-medium">{new Date(spike.date).toLocaleDateString()}</div>
                  <div className="text-sm text-muted-foreground">{spike.trigger}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-400">{spike.level.toFixed(2)}</div>
                  <div className="text-sm text-red-400">+{spike.change.toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
