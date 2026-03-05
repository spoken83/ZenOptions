import { Card } from "@/components/ui/card";
import { AlertTriangle, Shield, TrendingUp } from "lucide-react";

interface RiskDashboardProps {
  vix: number;
  vvix: number;
}

export function RiskDashboard({ vix, vvix }: RiskDashboardProps) {
  const getRiskLevel = (): {
    level: string;
    color: string;
    description: string;
  } => {
    if (vix < 15) {
      return {
        level: 'LOW',
        color: 'text-green-400',
        description: 'Market calm - favorable for all strategies',
      };
    } else if (vix < 20) {
      return {
        level: 'MEDIUM',
        color: 'text-amber-400',
        description: 'Normal volatility - all strategies viable',
      };
    } else if (vix < 25) {
      return {
        level: 'ELEVATED',
        color: 'text-orange-400',
        description: 'Uncertainty rising - reduce exposure',
      };
    } else if (vix < 30) {
      return {
        level: 'HIGH',
        color: 'text-red-400',
        description: 'Significant uncertainty - defensive positioning',
      };
    } else {
      return {
        level: 'CRISIS',
        color: 'text-red-500',
        description: 'Crisis mode - preserve capital',
      };
    }
  };

  const risk = getRiskLevel();

  const riskFactors = [];
  
  // VIX/VVIX Divergence
  if (vix < 20 && vvix > 100) {
    riskFactors.push({
      title: 'VIX/VVIX Divergence',
      description: 'Market calm but institutions nervous. Expect potential volatility spike.',
      impact: 'Reduce position sizes to 70% of normal',
      severity: 'MEDIUM',
    });
  }

  // VIX Level Warning
  if (vix >= 20) {
    riskFactors.push({
      title: 'Elevated VIX',
      description: `VIX at ${vix.toFixed(2)} indicates heightened market uncertainty.`,
      impact: vix >= 25 ? 'Close all Iron Condors, reduce exposure 50%+' : 'Close 50% of ICs, tighten stops',
      severity: vix >= 25 ? 'HIGH' : 'MEDIUM',
    });
  }

  // Low VIX Warning
  if (vix < 12) {
    riskFactors.push({
      title: 'Complacency Warning',
      description: 'Extremely low VIX suggests market complacency.',
      impact: 'Watch for sudden spike - best time for LEAPS',
      severity: 'LOW',
    });
  }

  return (
    <div className="space-y-6">
      {/* Risk Level Banner */}
      <Card className="p-6 bg-card border-border">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${risk.level === 'LOW' ? 'bg-green-500/20' : risk.level === 'CRISIS' ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
            <Shield className={`h-8 w-8 ${risk.color}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold mb-2">
              Risk Level: <span className={risk.color}>{risk.level}</span>
            </h3>
            <p className="text-muted-foreground">{risk.description}</p>
          </div>
        </div>
      </Card>

      {/* Risk Matrix */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold mb-4">Risk Matrix</h3>
        <div className="space-y-3">
          {[
            { range: 'VIX {'<'} 15', level: 'LOW', action: 'Full exposure - all strategies viable', current: vix < 15 },
            { range: 'VIX 15-20', level: 'MEDIUM', action: 'Normal positioning - monitor closely', current: vix >= 15 && vix < 20 },
            { range: 'VIX 20-25', level: 'ELEVATED', action: 'Close 50% ICs, reduce new positions', current: vix >= 20 && vix < 25 },
            { range: 'VIX 25-30', level: 'HIGH', action: 'Close all ICs, reduce exposure 70%', current: vix >= 25 && vix < 30 },
            { range: 'VIX {'>'} 30', level: 'CRISIS', action: 'Preserve capital - hedging only', current: vix >= 30 },
          ].map((row, idx) => (
            <div
              key={idx}
              className={`grid grid-cols-3 gap-4 p-3 rounded ${row.current ? 'bg-primary/10 border border-primary/30' : 'bg-muted/20'}`}
            >
              <div className="text-sm font-medium">{row.range}</div>
              <div className="text-sm text-muted-foreground">{row.level}</div>
              <div className="text-sm text-muted-foreground">{row.action}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Risk Factors */}
      {riskFactors.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Active Risk Factors</h3>
          <div className="grid gap-4">
            {riskFactors.map((factor, idx) => (
              <Card key={idx} className="p-5 bg-card border-border">
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${factor.severity === 'HIGH' ? 'text-red-400' : factor.severity === 'MEDIUM' ? 'text-amber-400' : 'text-yellow-400'}`} />
                  <div className="flex-1 space-y-2">
                    <h4 className="font-semibold">{factor.title}</h4>
                    <p className="text-sm text-muted-foreground">{factor.description}</p>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded p-2 text-sm">
                      <span className="font-medium">Action:</span> {factor.impact}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio Positioning Recommendations */}
      <Card className="p-6 bg-card border-border">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Portfolio Positioning
        </h3>
        <div className="space-y-3">
          {vix < 15 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">VIX {'<'} 15:</span> IC 25%, Spreads 35%, LEAPS 20%, Cash 20%
            </div>
          )}
          {vix >= 15 && vix < 20 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">VIX 15-20:</span> IC 20%, Spreads 30%, LEAPS 15%, Cash 35%
            </div>
          )}
          {vix >= 20 && vix < 25 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">VIX 20-25:</span> IC 0%, Spreads 20%, LEAPS 10%, Cash 50%+
            </div>
          )}
          {vix >= 25 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">VIX {'>'} 25:</span> IC 0%, Spreads 10% (defensive only), LEAPS 5%, Cash 70%+
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
