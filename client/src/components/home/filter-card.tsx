import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

interface FilterCardProps {
  priority: string;
  title: string;
  vixSupport: string;
  vixSupportColor: string;
  criteria: string[];
  sectorFocus?: string[];
  exampleTickers?: string[];
  vixTrigger?: string;
}

export function FilterCard({
  priority,
  title,
  vixSupport,
  vixSupportColor,
  criteria,
  sectorFocus,
  exampleTickers,
  vixTrigger,
}: FilterCardProps) {
  return (
    <Card className="border hover:shadow-lg transition-all hover:border-primary/40">
      <div className="p-6 space-y-5">
        {/* Header with priority and title */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl font-bold">{priority}</span>
            <h3 className="font-bold text-base tracking-wide uppercase text-foreground">{title}</h3>
          </div>
          <div>
            <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${vixSupportColor} border`}>
              {vixSupport}
            </span>
          </div>
        </div>

        {/* Criteria section */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Look for tickers with:</p>
          <div className="space-y-2">
            {criteria.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-sm text-muted-foreground leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sector Focus */}
        {sectorFocus && sectorFocus.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sector Focus:</p>
            <div className="flex flex-wrap gap-2">
              {sectorFocus.map((sector, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-md bg-accent/10 text-accent text-xs font-medium border border-accent/20"
                >
                  {sector}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Example Tickers */}
        {exampleTickers && exampleTickers.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Example Tickers:</p>
            <div className="flex flex-wrap gap-2">
              {exampleTickers.map((ticker, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-md bg-success/10 text-success text-xs font-mono font-bold border border-success/20"
                >
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* VIX Trigger Alert */}
        {vixTrigger && (
          <div className="bg-destructive/10 border-2 border-destructive/40 rounded-lg p-3.5">
            <span className="font-semibold text-destructive text-sm flex items-center gap-2">
              🔴 <span>{vixTrigger}</span>
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
