import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Calendar, AlertCircle, X, Bell, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PageSEO } from "@/components/seo/PageSEO";
import type { Alert, Position } from "@shared/schema";
import { format } from "date-fns";

export default function Alerts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: alerts, isLoading: alertsLoading } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
  });

  const { data: positions } = useQuery<Position[]>({
    queryKey: ["/api/positions"],
  });

  // Latest scan results to enrich scanner alerts
  const { data: latestScan } = useQuery<any[]>({
    queryKey: ["/api/scan-results/latest"],
  });

  const dismissMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await apiRequest("POST", `/api/alerts/${alertId}/dismiss`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Alert Dismissed",
        description: "Alert has been dismissed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getAlertIcon = (type: string) => {
    // Position vs Scanner icon families
    if (type.startsWith("scan:")) {
      return <Radar className="text-primary" size={24} />;
    }
    // Position alerts use a unified bell with accent by severity
    if (type.startsWith("tp")) return <Bell className="text-warning" size={24} />;
    if (type.startsWith("dte")) return <Bell className="text-muted-foreground" size={24} />;
    if (type.startsWith("sl") || type === "stop2x") return <Bell className="text-destructive" size={24} />;
    return <Bell className="text-muted-foreground" size={24} />;
  };

  const getAlertBadge = (type: string) => {
    switch (type) {
      case "tp25":
        return (
          <span className="px-2 py-0.5 bg-warning/20 text-warning text-xs rounded-full font-medium">
            TP 25%
          </span>
        );
      case "tp50":
        return (
          <span className="px-2 py-0.5 bg-warning/20 text-warning text-xs rounded-full font-medium">
            TP 50%
          </span>
        );
      case "dte28":
        return (
          <span className="px-2 py-0.5 bg-destructive/20 text-destructive text-xs rounded-full font-medium">
            28 DTE
          </span>
        );
      case "dte25":
        return (
          <span className="px-2 py-0.5 bg-destructive/20 text-destructive text-xs rounded-full font-medium">
            25 DTE
          </span>
        );
      case "dte21":
        return (
          <span className="px-2 py-0.5 bg-destructive/20 text-destructive text-xs rounded-full font-medium">
            21 DTE
          </span>
        );
      case "sl1x":
        return (
          <span className="px-2 py-0.5 bg-destructive/20 text-destructive text-xs rounded-full font-medium">
            Stop 1x
          </span>
        );
      case "sl1_5x":
        return (
          <span className="px-2 py-0.5 bg-destructive/20 text-destructive text-xs rounded-full font-medium">
            Stop 1.5x
          </span>
        );
      case "stop2x":
        return (
          <span className="px-2 py-0.5 bg-destructive/20 text-destructive text-xs rounded-full font-medium">
            Stop 2x
          </span>
        );
      default:
        return null;
    }
  };

  const getAlertMessage = (type: string) => {
    switch (type) {
      case "tp25":
        return "Take Profit 25% reached - Consider closing position";
      case "tp50":
        return "Take Profit 50% reached - Consider closing position";
      case "dte28":
        return "28 DTE Management Rule - Review for exit or roll";
      case "dte25":
        return "25 DTE Management Rule - Review for exit or roll";
      case "dte21":
        return "21 DTE Management Rule - Review for exit or roll";
      case "sl1x":
        return "Stop Loss 1x reached - Consider closing position";
      case "sl1_5x":
        return "Stop Loss 1.5x reached - Consider closing position";
      case "stop2x":
        return "Stop Loss 2x reached - Consider closing position";
      default:
        return "Alert triggered";
    }
  };

  const getAlertBorderColor = (type: string) => {
    switch (type) {
      case "tp25":
      case "tp50":
        return "border-warning";
      case "dte28":
      case "dte25":
      case "dte21":
      case "sl1x":
      case "sl1_5x":
      case "stop2x":
        return "border-destructive";
      default:
        return "border-border";
    }
  };

  const calculateDTE = (expiry: string | Date) => {
    const now = new Date();
    const expiryDate = new Date(expiry);
    return Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const calculatePnL = (position: Position, alert: Alert) => {
    if (!alert.currentMidCents) return null;
    
    // P/L in full contract value (cents for 100 shares)
    const pnlCents = position.entryCreditCents - alert.currentMidCents;
    const pnlPercent = (pnlCents / position.entryCreditCents) * 100;
    
    return {
      absolute: pnlCents, // Full contract value in cents
      percent: pnlPercent
    };
  };

  const formatMoney = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return `$${value.toFixed(2)}`;
  };

  const thresholdsLine = (entryCreditCents: number) => {
    const entry = entryCreditCents / 100;
    const one = entry;
    const oneFive = entry * 1.5;
    const two = entry * 2;
    return `1×=${formatMoney(one)} • 1.5×=${formatMoney(oneFive)} • 2×=${formatMoney(two)}`;
  };

  const getHeaderEmoji = (type: string) => {
    // Use colored dots for scanner timing; use severity dots for position alerts.
    if (type.startsWith("scan:")) {
      const t = type.split(":")[1];
      if (t === "preopen") return "🟠";
      if (t === "open") return "🔵";
      if (t === "close") return "🟢";
      return "🟣";
    }
    return getMonitorSeverityEmoji(type); // 🟡 for monitor, 🔴 for action
  };

  const getHeaderLabel = (type: string) => {
    if (type.startsWith("scan:")) {
      const t = type.split(":")[1];
      if (t === "preopen") return "Pre-Open Scan";
      if (t === "open") return "Mkt-Open Scan";
      if (t === "close") return "Mkt-Close Scan";
      return "Scan Update";
    }
    switch (type) {
      case "tp25": return "TP25";
      case "tp50": return "TP50";
      case "dte28": return "28 DTE";
      case "dte25": return "25 DTE";
      case "dte21": return "21 DTE";
      case "sl1x": return "SL1×";
      case "sl1_5x": return "SL1.5×";
      case "stop2x": return "SL2×";
      default: return type.toUpperCase();
    }
  };

  const getMonitorSeverityEmoji = (type: string) => {
    // Monitoring (soft) vs Action (urgent)
    const monitorTypes = new Set(["dte28", "dte25"]);
    const actionTypes = new Set(["dte21", "sl1_5x", "stop2x"]);
    if (type.startsWith("scan:")) return "";
    if (type === "tp50") return "🟢"; // Green dot for profit target
    if (type === "tp25") return "ⓘ"; // Info icon for TP25
    if (type === "sl1x") return "⚠️"; // Warning for SL1x
    if (monitorTypes.has(type as any)) return "🟡";
    if (actionTypes.has(type as any)) return "🔴";
    return "";
  };

  const getSubtypeEmoji = (type: string) => {
    if (type.startsWith("tp")) return "🚀"; // Take Profit
    if (type.startsWith("dte")) return "🕒"; // DTE
    if (type.startsWith("sl") || type === "stop2x") return "📉"; // Stop Loss
    if (type.startsWith("scan:")) return ""; // handled by timing dot
    return "";
  };

  return (
    <div className="p-4 sm:p-8">
      <PageSEO 
        title="Alerts" 
        description="Position alerts and notifications for your options trades. Take profit, stop loss, and DTE management alerts."
      />
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Alerts</h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Position management alerts and notifications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={async () => {
                await apiRequest("GET", "/api/alerts/dismiss-all");
                queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
                toast({ title: "All alerts dismissed" });
              }}
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm"
            >
              Dismiss All
            </Button>
          </div>
        </div>
      </div>

      {alertsLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading alerts...</p>
        </div>
      ) : alerts && alerts.length > 0 ? (
        <div className="space-y-4">
          {alerts.map((alert) => {
            const position = positions?.find((p) => p.id === alert.positionId);
            // Render scanner alerts that have no position
            if (!position && alert.type.startsWith("scan:")) {
              const results = latestScan || [];
              const trades = results.filter((r: any) => r.status === 'qualified');
              const setups = results.filter((r: any) => r.status === 'no_qualified_spread');
              const noSignals = results.filter((r: any) => r.status === 'no_signal');
              const tradeTop = trades.slice(0, 3);
              return (
                <div
                  key={alert.id}
                  className={`bg-card border rounded-lg p-4 flex items-start gap-4 border-border`}
                  data-testid={`alert-${alert.id}`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-secondary/30">
                    {getAlertIcon(alert.type)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="text-sm font-semibold flex flex-wrap items-center gap-2">
                      <span>{getHeaderEmoji(alert.type)} {getHeaderLabel(alert.type)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Summary: Trade {trades.length} • Trigger 0 • Setup {setups.length} • No Signal {noSignals.length}
                    </div>
                    {tradeTop.length > 0 && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="font-medium text-foreground">TRADE CANDIDATES</div>
                        {tradeTop.map((t: any) => (
                          <div key={t.id}>
                            • {t.symbol} ({(t.signal||'').includes('PUT')? 'PUT' : 'CALL'}) Score {t.score ? Math.round(t.score) : '—'}/100 — Exp {t.expiry ? format(new Date(t.expiry), 'yyyy-MM-dd') : '—'} {t.dte ? `(${t.dte} DTE)` : ''}
                            <div className="pl-3">
                              {t.shortStrike && t.longStrike ? `${t.shortStrike}/${t.longStrike}` : ''}
                              {t.delta !== null && t.delta !== undefined ? ` Δ≈${Number(t.delta).toFixed(2)}` : ''}
                              {t.creditMidCents ? ` | Credit ${formatMoney((t.creditMidCents/100))}` : ''}
                              {t.rr ? ` | R:R ${Number(t.rr).toFixed(2)}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {setups.length > 0 && (
                      <div className="text-xs text-muted-foreground space-y-1 mt-2">
                        <div className="font-medium text-foreground">SETUP CANDIDATES</div>
                        {setups.slice(0, 6).map((s: any) => (
                          <div key={s.id}>• {s.symbol} {s.signal ? `— ${s.signal}` : ''}</div>
                        ))}
                      </div>
                    )}
                    {noSignals.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-2">No-signal tickers: {noSignals.length}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground">Fired at: {format(new Date(alert.firedAt), "MMM dd, yyyy HH:mm")}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => dismissMutation.mutate(alert.id)}
                    disabled={dismissMutation.isPending}
                    data-testid={`button-dismiss-${alert.id}`}
                  >
                    <X size={16} className="mr-1" />
                    Dismiss
                  </Button>
                </div>
              );
            }
            if (!position) return null;

            return (
              <div
                key={alert.id}
                className={`bg-card border rounded-lg p-4 flex items-start gap-4 ${getAlertBorderColor(alert.type)}`}
                data-testid={`alert-${alert.id}`}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-secondary/30">
                  {getAlertIcon(alert.type)}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Header line */}
                  <div className="text-sm font-semibold flex flex-wrap items-center gap-2">
                    <span>{getHeaderEmoji(alert.type)} {getSubtypeEmoji(alert.type)} {getHeaderLabel(alert.type)}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="mono font-semibold">{position.symbol}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{position.type} {position.shortStrike}/{position.longStrike}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="mono">{format(new Date(position.expiry), "yyyy-MM-dd")} ({calculateDTE(position.expiry)} DTE)</span>
                  </div>

                  {/* Metrics line */}
                  <div className="text-sm text-muted-foreground">
                    <span>Entry: <span className="mono">{formatMoney(position.entryCreditCents / 100)}</span></span>
                    {" | "}
                    <span>Mid: <span className={`mono ${alert.currentMidCents && alert.type.startsWith("tp") ? "text-success" : alert.currentMidCents ? "text-destructive" : ""}`}>
                      {alert.currentMidCents ? formatMoney(alert.currentMidCents / 100) : "—"}
                    </span></span>
                    {(() => {
                      const pnl = calculatePnL(position, alert);
                      if (!pnl) return null;
                      return (
                        <>
                          {" | "}
                          <span>PnL: <span className={`mono ${pnl.absolute >= 0 ? "text-success" : "text-destructive"}`}>
                            {`${pnl.absolute >= 0 ? "+" : ""}${pnl.absolute.toFixed(2)}`} ({pnl.percent.toFixed(1)}%)
                          </span></span>
                        </>
                      );
                    })()}
                  </div>

                  {/* Thresholds / rule line */}
                  <div className="text-xs text-muted-foreground">
                    {alert.type.startsWith("tp") && (
                      <span>Stops: {thresholdsLine(position.entryCreditCents)}</span>
                    )}
                    {(alert.type.startsWith("sl") || alert.type === "stop2x") && (
                      <span>Thresholds: {thresholdsLine(position.entryCreditCents)}</span>
                    )}
                    {(alert.type.startsWith("dte")) && (
                      <span>Mgmt rule: review/roll/exit at ≤21 DTE</span>
                    )}
                  </div>

                  <div className="text-[11px] text-muted-foreground">Fired at: {format(new Date(alert.firedAt), "MMM dd, yyyy HH:mm")}</div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dismissMutation.mutate(alert.id)}
                  disabled={dismissMutation.isPending}
                  data-testid={`button-dismiss-${alert.id}`}
                >
                  <X size={16} className="mr-1" />
                  Dismiss
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="text-muted-foreground" size={32} />
          </div>
          <p className="text-muted-foreground">No active alerts</p>
          <p className="text-sm text-muted-foreground mt-2">
            Alerts will appear here when position management rules are triggered
          </p>
        </div>
      )}
    </div>
  );
}
