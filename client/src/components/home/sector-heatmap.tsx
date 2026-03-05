import { Card } from "@/components/ui/card";

interface SectorData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  mtdPerformance: number;
  wtdPerformance: number;
  weekPerformance: number;
  ivRank: number;
  trend: 'UP' | 'DOWN' | 'RANGE';
  strategies: string[];
  suitability: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR';
  watchlistTickers: string[];
}

interface SectorHeatmapProps {
  sectors: SectorData[];
}

export function SectorHeatmap({ sectors }: SectorHeatmapProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sectors.map((sector) => (
        <SectorCard key={sector.symbol} sector={sector} />
      ))}
    </div>
  );
}

function SectorCard({ sector }: { sector: SectorData }) {
  const getPerformanceColor = (perf: number) => {
    if (perf > 3) return 'bg-green-500/20 text-green-400 border-green-500/50';
    if (perf > -1) return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    return 'bg-red-500/20 text-red-400 border-red-500/50';
  };

  const getSuitabilityBadge = () => {
    const colors = {
      EXCELLENT: 'bg-emerald-500/20 text-emerald-400',
      GOOD: 'bg-green-500/20 text-green-400',
      MODERATE: 'bg-amber-500/20 text-amber-400',
      POOR: 'bg-red-500/20 text-red-400',
    };
    return colors[sector.suitability];
  };

  const getIVRankColor = (ivRank: number) => {
    if (ivRank < 30) return 'text-green-400';
    if (ivRank < 50) return 'text-amber-400';
    return 'text-orange-400';
  };

  const getTrendIcon = () => {
    if (sector.trend === 'UP') return '↗️';
    if (sector.trend === 'DOWN') return '↘️';
    return '→';
  };

  return (
    <Card className="p-5 bg-card border-border hover:border-primary/50 transition-colors">
      <div className="space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold">{sector.name}</h4>
            <span className="text-xs text-muted-foreground">{sector.symbol}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium">${sector.price.toFixed(2)}</span>
            <span className={`text-sm ${sector.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* MTD Performance Badge */}
        <div className={`p-3 rounded-lg border ${getPerformanceColor(sector.mtdPerformance)}`}>
          <div className="text-xs opacity-75 mb-1">MTD Performance</div>
          <div className="text-xl font-bold">
            {sector.mtdPerformance >= 0 ? '+' : ''}{sector.mtdPerformance.toFixed(2)}%
          </div>
        </div>

        {/* IV Rank, Trend & Badge with strategies */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/30 rounded p-2">
            <div className="text-xs text-muted-foreground mb-1">IV Rank</div>
            <div className={`text-sm font-medium ${getIVRankColor(sector.ivRank)}`}>
              {sector.ivRank}
            </div>
          </div>
          <div className="bg-muted/30 rounded p-2">
            <div className="text-xs text-muted-foreground mb-1">Trend</div>
            <div className="text-sm font-medium flex items-center gap-1">
              {getTrendIcon()} {sector.trend}
            </div>
          </div>
          <div className="space-y-2">
            <div className={`px-2 py-1 rounded text-xs font-medium text-center ${getSuitabilityBadge()}`}>
              {sector.suitability}
            </div>
            <div className="space-y-1">
              {sector.strategies.map((strategy, idx) => (
                <div key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="text-emerald-400">•</span>
                  <span>{strategy}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
