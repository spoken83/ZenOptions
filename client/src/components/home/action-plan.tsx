import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { useState } from "react";

interface ActionPlanProps {
  vix: number;
  regime: string;
  topSetup?: {
    symbol: string;
    strategyType: string;
  };
}

export function ActionPlan({ vix, regime, topSetup }: ActionPlanProps) {
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  const toggleComplete = (step: number) => {
    const newCompleted = new Set(completed);
    if (newCompleted.has(step)) {
      newCompleted.delete(step);
    } else {
      newCompleted.add(step);
    }
    setCompleted(newCompleted);
  };

  // Generate checklist based on VIX and regime
  const checklist = getChecklistSteps(vix, regime, topSetup);

  return (
    <Card className="card-elevated p-8">
      <h3 className="card-heading mb-8">📋 Today's Action Plan</h3>
      
      <div className="space-y-4 mb-8">
        {checklist.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-4 p-5 rounded-lg border cursor-pointer transition-all duration-200 ${
              completed.has(idx)
                ? 'bg-success/10 border-success/40'
                : 'bg-secondary/50 border-border/50 hover:border-primary/50'
            }`}
            onClick={() => toggleComplete(idx)}
            data-testid={`checklist-item-${idx}`}
          >
            {completed.has(idx) ? (
              <CheckCircle2 className="h-6 w-6 text-success mt-0.5 flex-shrink-0" />
            ) : (
              <Circle className="h-6 w-6 text-muted-foreground mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className={`font-semibold mb-2 ${completed.has(idx) ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                {item.title}
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed">{item.description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-4">
          <Button variant="outline" className="justify-between h-11" asChild data-testid="button-watchlist">
            <a href="/watchlist">
              Go to Watchlist
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="outline" className="justify-between h-11" asChild data-testid="button-scanner">
            <a href="/scanner">
              Run Scanner
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-8 pt-8 border-t border-border/50">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-muted-foreground uppercase tracking-wider">Progress</span>
          <span className="font-semibold data-value">
            {completed.size} / {checklist.length} completed
          </span>
        </div>
        <div className="mt-3 h-3 bg-secondary rounded-full overflow-hidden border border-border/50">
          <div
            className="h-full bg-gradient-to-r from-success to-primary transition-all duration-300"
            style={{ width: `${(completed.size / checklist.length) * 100}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

function getChecklistSteps(vix: number, regime: string, topSetup?: { symbol: string; strategyType: string }) {
  const steps = [];

  // Step 1: VIX Check
  if (vix < 15) {
    steps.push({
      title: `✅ VIX Check: ${vix.toFixed(2)} (Low)`,
      description: 'Market calm - all strategies viable, excellent for ICs and LEAPS',
    });
  } else if (vix < 20) {
    steps.push({
      title: `✅ VIX Check: ${vix.toFixed(2)} (Normal)`,
      description: 'Balanced environment - all strategies acceptable, monitor for regime changes',
    });
  } else if (vix < 25) {
    steps.push({
      title: `⚠️ VIX Check: ${vix.toFixed(2)} (Elevated)`,
      description: 'Close Iron Condors, reduce exposure 50%, focus on defensive spreads',
    });
  } else {
    steps.push({
      title: `🚨 VIX Check: ${vix.toFixed(2)} (High)`,
      description: 'Close all ICs immediately, reduce to 30% exposure, defensive positioning only',
    });
  }

  // Step 2: Regime Check
  if (regime === 'DEFENSIVE') {
    steps.push({
      title: 'Filter Watchlist: Focus on Defensive Sectors',
      description: 'Prioritize Healthcare (XLV) and Consumer Staples (XLP) tickers',
    });
  } else if (regime === 'RISK_ON') {
    steps.push({
      title: 'Filter Watchlist: Focus on Growth Sectors',
      description: 'Prioritize Technology (XLK) and Consumer Discretionary (XLY) tickers',
    });
  } else {
    steps.push({
      title: 'Filter Watchlist: Balanced Approach',
      description: 'Mixed signals - review all sectors, wait for clearer direction',
    });
  }

  // Step 3: Execute (if setup available)
  if (topSetup) {
    steps.push({
      title: `Execute: ${topSetup.symbol} ${topSetup.strategyType} Setup Available`,
      description: 'Review trade details and enter position if criteria met',
    });
  } else {
    steps.push({
      title: 'Review Scanner Results',
      description: 'Check for qualifying setups from latest scan',
    });
  }

  // Step 4: Set VIX Alert
  if (vix < 18) {
    steps.push({
      title: 'Monitor: Set VIX Alert at 20',
      description: 'Early warning for regime change - prepare to close ICs',
    });
  } else {
    steps.push({
      title: 'Monitor: Watch VIX closely',
      description: 'Volatility elevated - check positions 2x per day',
    });
  }

  return steps;
}
