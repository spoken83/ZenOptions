import { Card } from "@/components/ui/card";
import type { StrategySuitability } from "@/lib/vixCalculations";

interface StrategyCardProps {
  title: string;
  suitability: StrategySuitability;
  exitTrigger?: string;
  positionSizing?: string;
}

export function StrategyCard({ title, suitability }: StrategyCardProps) {
  // Render check marks based on rating (matches mockup exactly)
  const renderCheckMarks = () => {
    const checks = {
      EXCELLENT: 3,
      GOOD: 2,
      FAIR: 1,
      POOR: 0
    }[suitability.rating];
    
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: checks }).map((_, i) => (
          <span key={i} className="text-success text-base">✅</span>
        ))}
        <span className="ml-2 text-xs font-bold text-success">{suitability.rating}</span>
      </div>
    );
  };

  return (
    <div className="homepage-card">
      <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-border">
        <h3 className="text-base font-bold tracking-[0.025em]">{title}</h3>
        {renderCheckMarks()}
      </div>
      
      <ul className="space-y-3">
        {suitability.reasons.map((reason, idx) => (
          <li key={idx} className="flex items-start gap-3 text-[0.9375rem] text-muted-foreground">
            <span className="text-success flex-shrink-0 mt-0.5 text-sm">✓</span>
            <span className="leading-relaxed">{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
