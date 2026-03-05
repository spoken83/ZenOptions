import { Card } from "@/components/ui/card";
import { Star, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface TradeSetup {
  id: string;
  symbol: string;
  strategyType: string;
  direction?: string;
  score: number;
  rating: number;
  vixSuitability: 'IDEAL' | 'GOOD' | 'MODERATE' | 'POOR';
  whyItWorks: string[];
  whyVixSupports: string[];
  vixRiskManagement: {
    entry: string;
    monitor: string;
    exit: string;
  };
  tradeDetails: {
    strikes: string;
    credit?: number;
    debit?: number;
    roi?: number;
    pop?: number;
    maxLoss?: number;
    maxProfit?: number;
    dte: number;
  };
  managementRules: string[];
  similarTickers: string[];
}

interface OpportunityScannerProps {
  setups: TradeSetup[];
}

export function OpportunityScanner({ setups }: OpportunityScannerProps) {
  if (setups.length === 0) {
    return (
      <Card className="card-elevated p-8 text-center border">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-lg font-medium mb-2">No Opportunities Found</p>
        <p className="text-sm text-muted-foreground">
          Run a scan or check back later for qualifying trade setups
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {setups.map((setup, idx) => (
        <SetupCard key={setup.id} setup={setup} rank={idx + 1} />
      ))}
    </div>
  );
}

function SetupCard({ setup, rank }: { setup: TradeSetup; rank: number }) {
  const [isOpen, setIsOpen] = useState(rank === 1); // Auto-expand first setup

  const getVixSuitabilityColor = () => {
    switch (setup.vixSuitability) {
      case 'IDEAL':
        return 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/50';
      case 'GOOD':
        return 'bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 dark:border-green-500/50';
      case 'MODERATE':
        return 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/50';
      case 'POOR':
        return 'bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30 dark:border-red-500/50';
    }
  };

  const getRatingStars = () => {
    return Array.from({ length: 3 }, (_, i) => (
      <Star
        key={i}
        className={`h-5 w-5 ${i < setup.rating ? 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}
      />
    ));
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="card-elevated overflow-hidden hover:border-primary/60 transition-all duration-200">
        <CollapsibleTrigger className="w-full">
          <div className="p-8 cursor-pointer">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-5">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-bold text-2xl">
                  #{rank}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-4">
                    <h3 className="text-3xl font-bold tracking-tight data-value">{setup.symbol}</h3>
                    <div className="flex gap-1">{getRatingStars()}</div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 uppercase tracking-wide">
                    {setup.direction} {setup.strategyType.replace('_', ' ')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-primary mb-1 data-value">{setup.score}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Score</div>
              </div>
            </div>

            {/* VIX Suitability Badge */}
            <div className={`status-chip ${getVixSuitabilityColor()}`}>
              VIX Suitability: {setup.vixSuitability}
            </div>

            {/* Trade Summary */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-secondary/80 dark:bg-secondary/50 rounded-lg p-4 border border-border">
                <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Strikes</div>
                <div className="font-semibold data-value">{setup.tradeDetails.strikes}</div>
              </div>
              {setup.tradeDetails.credit && (
                <div className="bg-secondary/80 dark:bg-secondary/50 rounded-lg p-4 border border-border">
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Credit</div>
                  <div className="font-medium text-success dark:text-green-400 data-value">${setup.tradeDetails.credit.toFixed(2)}</div>
                </div>
              )}
              {setup.tradeDetails.roi && (
                <div className="bg-secondary/80 dark:bg-secondary/50 rounded-lg p-4 border border-border">
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">ROI</div>
                  <div className="font-semibold text-success data-value">{setup.tradeDetails.roi.toFixed(0)}%</div>
                </div>
              )}
              {setup.tradeDetails.pop && (
                <div className="bg-secondary/80 dark:bg-secondary/50 rounded-lg p-4 border border-border">
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">PoP</div>
                  <div className="font-semibold data-value">{setup.tradeDetails.pop}%</div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-6 pb-6 space-y-6 border-t border-border pt-6">
            {/* Why It Works */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                Why This Setup Works
              </h4>
              <ul className="space-y-2">
                {setup.whyItWorks.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Why VIX Supports */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Star className="h-5 w-5 text-warning" />
                VIX Environment Analysis
              </h4>
              <ul className="space-y-2">
                {setup.whyVixSupports.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* VIX Risk Management */}
            <div className="bg-orange-500/10 dark:bg-orange-500/10 border border-orange-500/40 dark:border-orange-500/30 rounded-lg p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                VIX-Based Risk Management
              </h4>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-medium text-foreground">Entry: </span>
                  <span className="text-muted-foreground">{setup.vixRiskManagement.entry}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Monitor: </span>
                  <span className="text-muted-foreground">{setup.vixRiskManagement.monitor}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Exit: </span>
                  <span className="text-muted-foreground">{setup.vixRiskManagement.exit}</span>
                </div>
              </div>
            </div>

            {/* Management Rules */}
            <div>
              <h4 className="font-semibold mb-3">Position Management Rules</h4>
              <ul className="space-y-2">
                {setup.managementRules.map((rule, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Similar Tickers */}
            {setup.similarTickers.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3">Apply to Similar Watchlist Tickers</h4>
                <div className="flex flex-wrap gap-2">
                  {setup.similarTickers.map((ticker) => (
                    <span
                      key={ticker}
                      className="px-3 py-1 rounded bg-primary/10 text-primary text-sm font-mono"
                    >
                      {ticker}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
