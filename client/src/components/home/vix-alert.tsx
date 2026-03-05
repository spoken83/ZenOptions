import { AlertCircle } from "lucide-react";
import { calculateVixAlertStatus, getVixColorClass } from "@/lib/vixCalculations";

interface VixAlertProps {
  vix: number;
  vixChange: number;
  vixChangePercent: number;
  vvix: number;
}

export function VixAlert({ vix, vixChange, vixChangePercent, vvix }: VixAlertProps) {
  const status = calculateVixAlertStatus(vix, vvix);
  const colorClass = getVixColorClass(status.color);

  return (
    <div className={`card-elevated p-8 rounded-lg border ${colorClass}`}>
      <div className="flex items-start gap-4">
        <AlertCircle className="h-7 w-7 flex-shrink-0 mt-1" />
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="card-heading mb-3">VIX ALERT STATUS: {status.level}</h3>
            <div className="flex items-baseline gap-4 mt-2">
              <span className="text-4xl font-bold data-value">
                {vix.toFixed(2)}
              </span>
              {vixChange !== null && vixChangePercent !== null && (
                <span className={`text-base data-value ${vixChange >= 0 ? 'text-destructive' : 'text-success'}`}>
                  ({vixChange >= 0 ? '+' : ''}{vixChange.toFixed(2)} / {vixChangePercent >= 0 ? '+' : ''}{vixChangePercent.toFixed(2)}%)
                </span>
              )}
              <span className="text-sm text-border">•</span>
              <span className="text-base data-value">
                VVIX: <span className="font-semibold">{vvix.toFixed(2)}</span>
                {vvix > 100 && <span className="ml-3 text-warning font-medium">(ELEVATED ⚠️)</span>}
              </span>
            </div>
          </div>

          <div className="space-y-2.5 text-base leading-relaxed">
            <p>
              <span className="font-semibold text-foreground">Interpretation:</span>{' '}
              <span className="text-muted-foreground">{status.interpretation}</span>
            </p>
            <p>
              <span className="font-semibold text-foreground">Strategy Impact:</span>{' '}
              <span className="text-muted-foreground">{status.strategyImpact}</span>
            </p>
          </div>

          {status.divergence && (
            <div className="bg-warning/10 border border-warning/40 rounded-lg p-4">
              <p className="font-semibold text-warning">⚠️ VIX/VVIX DIVERGENCE DETECTED</p>
              <p className="text-muted-foreground mt-2 leading-relaxed">
                Market appears calm but institutions are hedging. Expect potential volatility spike.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
