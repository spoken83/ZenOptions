import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Edit, Trash2, TrendingUp, BarChart3, Calendar, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { PageSEO } from "@/components/seo/PageSEO";
import { apiRequest, queryClient, invalidateAfterPositionChange } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EditCloseModal from "@/components/modals/edit-close-modal";
import EditPositionModal from "@/components/modals/edit-position-modal";
import EditIronCondorModal from "@/components/modals/edit-iron-condor-modal";
import EditLeapsModal from "@/components/modals/edit-leaps-modal";
import { EmptyState } from "@/components/empty-state";
import type { Position, Portfolio } from "@shared/schema";
import { format, differenceInCalendarDays } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import PositionsSubnav from "@/components/layout/positions-subnav";

// Helper function to format currency with thousand separators (no decimals for P/L)
const formatCurrency = (cents: number): string => {
  const dollars = Math.round(cents / 100);
  const formatted = Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return dollars >= 0 ? `+$${formatted}` : `-$${formatted}`;
};

const formatCurrencySimple = (dollars: number): string => {
  const formatted = Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return dollars >= 0 ? `$${formatted}` : `-$${formatted}`;
};

export default function PositionsClosed() {
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [symbolSearch, setSymbolSearch] = useState("");
  const [closedMonthFilter, setClosedMonthFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [isEditCloseOpen, setIsEditCloseOpen] = useState(false);
  const [isEditPositionOpen, setIsEditPositionOpen] = useState(false);
  const [isEditIronCondorOpen, setIsEditIronCondorOpen] = useState(false);
  const [isEditLeapsOpen, setIsEditLeapsOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  const { data: positions, isLoading } = useQuery<Position[]>({
    queryKey: ["/api/positions?status=closed"],
  });

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const filterByAccount = (positionsList: Position[]) => {
    if (accountFilter === "all") return positionsList;
    return positionsList.filter(p => p.portfolioId === accountFilter);
  };

  const filterByClosedMonth = (positionsList: Position[]) => {
    if (closedMonthFilter === "all") return positionsList;
    return positionsList.filter(p => {
      if (!p.closedAt) return false;
      const closedDate = new Date(p.closedAt);
      const monthYear = format(closedDate, "yyyy-MM");
      return monthYear === closedMonthFilter;
    });
  };

  const filterBySymbol = (positionsList: Position[]) => {
    if (!symbolSearch) return positionsList;
    return positionsList.filter(p => p.symbol.toLowerCase().includes(symbolSearch.toLowerCase()));
  };

  // Filter bucket: 0DTE, 45DTE, LEAPS, CC
  const getFilterBucket = (p: Position): string => {
    if (p.strategyType === "LEAPS") return "LEAPS";
    if (p.strategyType === "COVERED_CALL") return "CC";
    if (p.strategyType === "STOCK") return "Stock";
    const entry = new Date(p.entryDt);
    const expiry = new Date(p.expiry);
    const dte = Math.ceil((expiry.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
    if (dte <= 7) return "0DTE";
    return "45DTE";
  };

  // Display label: e.g., "0DTE PCS", "45DTE IC", "LEAPS", "CC", "Stock"
  const getStrategyLabel = (p: Position): string => {
    if (p.strategyType === "LEAPS") return "LEAPS";
    if (p.strategyType === "COVERED_CALL") return "CC";
    if (p.strategyType === "STOCK") return "Stock";
    const bucket = getFilterBucket(p);
    if (p.strategyType === "IRON_CONDOR") return `${bucket} IC`;
    const typeLabel = p.type?.toUpperCase() === "PUT" ? "PCS" : "CCS";
    return `${bucket} ${typeLabel}`;
  };

  const filterByStrategy = (positionsList: Position[]) => {
    if (strategyFilter === "all") return positionsList;
    return positionsList.filter(p => getFilterBucket(p) === strategyFilter);
  };

  const allClosedPositions = filterByAccount(positions || []);
  const closedPositions = filterByStrategy(filterBySymbol(filterByClosedMonth(allClosedPositions)));

  const availableClosedMonths = Array.from(
    new Set(
      allClosedPositions
        .filter(p => p.closedAt)
        .map(p => format(new Date(p.closedAt!), "yyyy-MM"))
    )
  ).sort().reverse();

  const strategyOrder = ["0DTE", "45DTE", "CC", "LEAPS", "Stock"];
  const availableStrategies = strategyOrder.filter(s =>
    allClosedPositions.some(p => getFilterBucket(p) === s)
  );

  const getPortfolioName = (portfolioId: string | null) => {
    if (!portfolioId || !portfolios) return "—";
    const portfolio = portfolios.find(p => p.id === portfolioId);
    if (!portfolio) return "Unknown";
    
    if (portfolio.accountNumber) {
      return `${portfolio.name} (${portfolio.accountNumber})`;
    }
    return portfolio.name;
  };

  const getPortfolioDisplayName = (portfolio: Portfolio) => {
    if (portfolio.accountNumber) {
      return `${portfolio.name} (${portfolio.accountNumber})`;
    }
    return portfolio.name;
  };

  const calculateDTE = (expiry: Date | string, closedDate: Date | string) => {
    // Parse expiry as Eastern Time midnight (timezone-agnostic)
    let expiryMidnightET: Date;
    if (typeof expiry === 'string') {
      const parts = expiry.split('-').map((p: string) => parseInt(p, 10));
      const isoString = `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}T00:00:00`;
      expiryMidnightET = fromZonedTime(isoString, 'America/New_York');
    } else {
      // Convert Date to ET, extract date parts, rebuild as ET midnight
      const zonedExpiry = toZonedTime(new Date(expiry), 'America/New_York');
      const y = zonedExpiry.getFullYear();
      const m = String(zonedExpiry.getMonth() + 1).padStart(2, '0');
      const d = String(zonedExpiry.getDate()).padStart(2, '0');
      const isoString = `${y}-${m}-${d}T00:00:00`;
      expiryMidnightET = fromZonedTime(isoString, 'America/New_York');
    }
    
    // Parse closed date as Eastern Time midnight
    const zonedClosed = toZonedTime(new Date(closedDate), 'America/New_York');
    const cy = zonedClosed.getFullYear();
    const cm = String(zonedClosed.getMonth() + 1).padStart(2, '0');
    const cd = String(zonedClosed.getDate()).padStart(2, '0');
    const closedMidnightET = fromZonedTime(`${cy}-${cm}-${cd}T00:00:00`, 'America/New_York');
    
    // Both dates are now UTC timestamps representing ET midnights
    const dte = differenceInCalendarDays(expiryMidnightET, closedMidnightET);
    return dte;
  };

  const handleEditClosedPosition = (position: Position) => {
    setSelectedPosition(position);
    if (position.strategyType === "IRON_CONDOR") {
      setIsEditIronCondorOpen(true);
    } else if (position.strategyType === "LEAPS") {
      setIsEditLeapsOpen(true);
    } else {
      setIsEditPositionOpen(true);
    }
  };

  const handleEditClose = (position: Position) => {
    setSelectedPosition(position);
    setIsEditCloseOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/positions/${id}/delete`);
      return res.json();
    },
    onSuccess: () => {
      invalidateAfterPositionChange();
      toast({
        title: "Position Deleted",
        description: "The position has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete position",
        variant: "destructive",
      });
    },
  });

  const handleDeletePosition = (id: string, symbol: string) => {
    if (confirm(`Are you sure you want to delete ${symbol}? This action cannot be undone.`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <PageSEO 
        title="Closed Positions" 
        description="Track your trading history, analyze winning strategies, and learn from closed positions. P/L history records for all your options trades."
      />
      <PositionsSubnav />
      <div className="p-4 sm:p-8">
        {!isAuthenticated && (
          <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/30 mb-8">
            <CardContent className="p-4 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3">Closed Positions - Review Your Performance</h2>
              <p className="text-muted-foreground text-base mb-6">
                Track your trading history, analyze winning strategies, and learn from closed positions.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm text-foreground">P/L History</div>
                    <div className="text-xs text-muted-foreground">Complete profit/loss records for all trades</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm text-foreground">Performance Analytics</div>
                    <div className="text-xs text-muted-foreground">Win rate, average gains, and strategy stats</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm text-foreground">Time Filters</div>
                    <div className="text-xs text-muted-foreground">Review performance by month or date range</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">Closed Positions</h2>
              <p className="text-sm text-muted-foreground">Historical performance tracking</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading closed positions...</p>
          </div>
        ) : closedPositions.length > 0 ? (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 className="text-lg sm:text-xl font-semibold">Closed Positions ({closedPositions.length})</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Filter symbol..."
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  className="w-[110px] sm:w-[140px] text-xs sm:text-sm"
                />
                <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                  <SelectTrigger className="w-[140px] sm:w-[160px]">
                    <SelectValue placeholder="All strategies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Strategies</SelectItem>
                    {availableStrategies.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={closedMonthFilter} onValueChange={setClosedMonthFilter}>
                  <SelectTrigger className="w-[140px] sm:w-[180px]" data-testid="select-closed-month-filter">
                    <SelectValue placeholder="All months" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All months</SelectItem>
                    {availableClosedMonths.map((month) => (
                      <SelectItem key={month} value={month}>
                        {format(new Date(month + "-01"), "MMMM yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="w-[140px] sm:w-[180px]" data-testid="select-account-filter">
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {portfolios && portfolios.map((portfolio) => (
                      <SelectItem key={portfolio.id} value={portfolio.id}>
                        {getPortfolioDisplayName(portfolio)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Strikes</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Contracts</TableHead>
                    <TableHead>Closed DTE</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Exit</TableHead>
                    <TableHead>Realised P/L</TableHead>
                    <TableHead>Entered</TableHead>
                    <TableHead>Closed</TableHead>
                    <TableHead>Days Open</TableHead>
                    <TableHead>Portfolio</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedPositions.map((position) => {
                    const contracts = position.contracts || 1;
                    const isLeaps = position.strategyType === "LEAPS";
                    const isStock = position.strategyType === "STOCK";
                    const isDebit = isLeaps || isStock;
                    const isIC = position.strategyType === "IRON_CONDOR";

                    const entryCents = isDebit ? (position.entryDebitCents || 0) : (position.entryCreditCents || 0);
                    const exitCents = isDebit ? (position.exitDebitCents || 0) : (position.exitCreditCents || 0);

                    // Stock: no ×100 multiplier. LEAPS exit uses exitDebitCents directly.
                    const plPerContract = isDebit
                      ? (exitCents - entryCents)
                      : ((entryCents - exitCents) * 100);
                    // Stock P&L: plPerContract is per-share (no ×100), multiply by shares
                    const totalPL = isStock ? (plPerContract * contracts) : (plPerContract * contracts);
                    
                    const enteredDate = new Date(position.entryDt);
                    const closedDate = position.closedAt ? new Date(position.closedAt) : null;
                    
                    const daysOpen = closedDate 
                      ? Math.round((closedDate.getTime() - enteredDate.getTime()) / (1000 * 60 * 60 * 24))
                      : 0;
                    
                    const closedDTE = position.closedAt ? calculateDTE(position.expiry, position.closedAt) : null;
                    
                    const strategyDisplay = getStrategyLabel(position);
                    
                    let strikesDisplay = "";
                    if (isStock) {
                      strikesDisplay = `${contracts} shares`;
                    } else if (isLeaps) {
                      strikesDisplay = formatCurrencySimple(position.shortStrike || 0);
                    } else if (isIC) {
                      strikesDisplay = `P: ${formatCurrencySimple(position.shortStrike || 0)}/${formatCurrencySimple(position.longStrike || 0)} C: ${formatCurrencySimple(position.callShortStrike || 0)}/${formatCurrencySimple(position.callLongStrike || 0)}`;
                    } else {
                      strikesDisplay = `${formatCurrencySimple(position.shortStrike || 0)}/${formatCurrencySimple(position.longStrike || 0)}`;
                    }

                    return (
                      <TableRow key={position.id}>
                        <TableCell className="font-medium">{position.symbol}</TableCell>
                        <TableCell className="text-xs">{strategyDisplay}</TableCell>
                        <TableCell className="mono text-xs">{strikesDisplay}</TableCell>
                        <TableCell className="text-sm">{format(toZonedTime(new Date(position.expiry), "America/New_York"), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-right text-sm">{contracts}</TableCell>
                        <TableCell className="mono text-xs font-medium">{closedDTE !== null ? `${closedDTE}d` : "—"}</TableCell>
                        <TableCell style={{ verticalAlign: 'middle' }}>
                          <span className="text-sm font-semibold">{formatCurrencySimple(entryCents / 100)}</span>
                        </TableCell>
                        <TableCell style={{ verticalAlign: 'middle' }}>
                          <span className="text-sm font-semibold">{formatCurrencySimple(exitCents / 100)}</span>
                        </TableCell>
                        <TableCell style={{ verticalAlign: 'middle' }}>
                          <div className={totalPL >= 0 ? 'text-success' : 'text-destructive'}>
                            <p className="font-semibold" data-testid={`text-closed-pl-${position.symbol}`}>
                              {formatCurrency(totalPL)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(enteredDate, "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {closedDate ? format(closedDate, "dd/MM/yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {daysOpen}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{getPortfolioName(position.portfolioId)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleEditClosedPosition(position)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              data-testid={`button-edit-closed-${position.symbol}`}
                              title="Edit Position Details"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => handleEditClose(position)}
                              className="text-primary hover:text-primary/80" 
                              data-testid={`button-edit-exit-${position.symbol}`}
                              title="Edit Exit Credit"
                            >
                              <span className="text-lg">💰</span>
                            </button>
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              data-testid={`button-delete-closed-${position.symbol}`}
                              onClick={() => handleDeletePosition(position.id, position.symbol)}
                              title="Delete Position"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/30 font-semibold border-t-2 border-border">
                    <TableCell colSpan={8} className="text-right">
                      Total Realised P/L:
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const totalRealised = closedPositions.reduce((total, position) => {
                          const contracts = position.contracts || 1;
                          const isDebitP = position.strategyType === "LEAPS" || position.strategyType === "STOCK";
                          const entryCents = isDebitP ? (position.entryDebitCents || 0) : (position.entryCreditCents || 0);
                          const exitCents = isDebitP ? (position.exitDebitCents || 0) : (position.exitCreditCents || 0);

                          const plPerContract = isDebitP
                            ? (exitCents - entryCents)
                            : ((entryCents - exitCents) * 100);

                          return total + (plPerContract * contracts);
                        }, 0);
                        return (
                          <div>
                            <p className={`font-semibold ${totalRealised >= 0 ? 'text-success' : 'text-destructive'}`} data-testid="text-subtotal-realised">
                              {formatCurrency(totalRealised)}
                            </p>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell colSpan={5}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No closed positions in history"
            description="Once you close positions, they'll appear here for historical tracking and performance analysis."
          />
        )}

        <EditCloseModal open={isEditCloseOpen} onOpenChange={setIsEditCloseOpen} position={selectedPosition} />
        <EditPositionModal open={isEditPositionOpen} onOpenChange={setIsEditPositionOpen} position={selectedPosition} />
        <EditIronCondorModal open={isEditIronCondorOpen} onOpenChange={setIsEditIronCondorOpen} position={selectedPosition} />
        <EditLeapsModal open={isEditLeapsOpen} onOpenChange={setIsEditLeapsOpen} position={selectedPosition} />
      </div>
    </>
  );
}
