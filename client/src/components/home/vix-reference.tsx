import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VixReferenceProps {
  currentVix: number;
  vvix?: number;
}

export function VixReference({ currentVix, vvix }: VixReferenceProps) {
  const vixZones = [
    {
      range: 'VIX < 12',
      level: 'COMPLACENT',
      color: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/50',
      strategies: 'Best time for LEAPS (cheap options). ICs viable but watch for mean reversion.',
      action: 'Full exposure acceptable. Prepare for potential spike.',
      positioning: '100% - Full exposure',
      current: currentVix < 12,
    },
    {
      range: 'VIX 12-15',
      level: 'LOW',
      color: 'bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 dark:border-green-500/50',
      strategies: 'All strategies viable. ICs and spreads collect premium. LEAPS entries good.',
      action: 'Normal position sizing. Set alerts at VIX 18.',
      positioning: '100% - Full exposure',
      current: currentVix >= 12 && currentVix < 15,
    },
    {
      range: 'VIX 15-20',
      level: 'NORMAL',
      color: 'bg-yellow-500/10 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30 dark:border-yellow-500/50',
      strategies: 'Balanced environment. All strategies acceptable. Monitor regime changes.',
      action: 'Full allocation OK. Watch for VIX > 20 break.',
      positioning: '100% - Normal positioning',
      current: currentVix >= 15 && currentVix < 20,
    },
    {
      range: 'VIX 20-25',
      level: 'ELEVATED',
      color: 'bg-orange-500/10 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30 dark:border-orange-500/50',
      strategies: 'Close 50% of ICs. Spreads only. No new ICs. LEAPS wait.',
      action: 'Reduce exposure 50%. Tighten stops. Set VIX 25 alert.',
      positioning: '50% - Reduce exposure',
      current: currentVix >= 20 && currentVix < 25,
    },
    {
      range: 'VIX 25-30',
      level: 'HIGH',
      color: 'bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30 dark:border-red-500/50',
      strategies: 'Close ALL ICs immediately. Defensive spreads only. No LEAPS.',
      action: 'Reduce to 30% exposure. Hedge portfolio. Daily monitoring.',
      positioning: '30% - Defensive only',
      current: currentVix >= 25 && currentVix < 30,
    },
    {
      range: 'VIX > 30',
      level: 'CRISIS',
      color: 'bg-red-600/10 dark:bg-red-600/20 text-red-800 dark:text-red-500 border-red-600/30 dark:border-red-600/50',
      strategies: 'Preserve capital. Close everything. Hedges and cash only.',
      action: 'Exit all positions. Wait for VIX < 20 to re-enter.',
      positioning: '0% - Cash/Hedges only',
      current: currentVix >= 30,
    },
  ];

  const currentZone = vixZones.find(zone => zone.current) || vixZones[2];

  return (
    <Card className="card-elevated sticky top-4">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">Current VIX</span>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="link" size="sm" className="text-xs" data-testid="button-vix-details">
                More details
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Complete VIX Reference Guide</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {vixZones.map((zone, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${zone.current ? zone.color : 'bg-secondary/50 dark:bg-secondary/30 border-border text-muted-foreground'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={zone.current ? 'font-semibold' : 'font-medium text-sm'}>{zone.range}</span>
                      <span className={`text-xs px-2 py-1 rounded ${zone.current ? '' : 'bg-secondary/50 dark:bg-secondary/30'}`}>
                        {zone.level}
                      </span>
                    </div>
                    <div className="text-sm space-y-2">
                      <div>
                        <span className="font-medium">Portfolio:</span>{' '}
                        <span className="text-muted-foreground font-semibold">{zone.positioning}</span>
                      </div>
                      <div>
                        <span className="font-medium">Strategies:</span>{' '}
                        <span className="text-muted-foreground">{zone.strategies}</span>
                      </div>
                      <div>
                        <span className="font-medium">Action:</span>{' '}
                        <span className="text-muted-foreground">{zone.action}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Additional Guidance */}
                <div className="p-4 bg-muted/30 border rounded-lg">
                  <h4 className="font-semibold mb-2 text-sm">Key Triggers</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• VIX crosses 18: Start watching closely</li>
                    <li>• VIX crosses 20: Close 50% of ICs, no new ICs</li>
                    <li>• VIX crosses 25: Close ALL ICs, reduce 70%</li>
                    <li>• VIX crosses 30: Exit everything, preserve capital</li>
                    <li>• VIX drops below 20: Safe to re-enter gradually</li>
                  </ul>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Current VIX Zone */}
        <div className={`p-3 rounded-lg border ${currentZone.color}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">{currentZone.range}</span>
            <span className="text-xs px-2 py-1 rounded">
              {currentZone.level}
            </span>
          </div>
          <div className="text-sm space-y-2">
            <div>
              <span className="font-medium">Portfolio:</span>{' '}
              <span className="text-muted-foreground font-semibold">{currentZone.positioning}</span>
            </div>
            <div>
              <span className="font-medium">Strategies:</span>{' '}
              <span className="text-muted-foreground">{currentZone.strategies}</span>
            </div>
            <div>
              <span className="font-medium">Action:</span>{' '}
              <span className="text-muted-foreground">{currentZone.action}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
