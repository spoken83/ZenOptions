import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, DollarSign, Target, Calendar, BarChart, PieChart, LineChart, Trophy, XCircle, Flame, Wallet, Info } from "lucide-react";
import { PageSEO } from "@/components/seo/PageSEO";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import type { Stats } from "@/lib/types";
import type { ScanResult, Alert, Position, Portfolio } from "@shared/schema";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

interface TickerStats {
  symbol: string;
  wins: number;
  losses: number;
  totalTrades: number;
  totalPL: number;
  winRate: number;
}

export default function Dashboard() {
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [includeLeaps, setIncludeLeaps] = useState(true);
  const [strategyFilter, setStrategyFilter] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: scanResults, isLoading: scanLoading, refetch: refetchScan } = useQuery<ScanResult[]>({
    queryKey: ["/api/scan-results/latest"],
  });

  const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
  });

  const { data: allPositions, isLoading: positionsLoading, refetch: refetchPositions } = useQuery<Position[]>({
    queryKey: ["/api/positions"],
  });

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  interface PositionPnL {
    positionId: string;
    symbol: string;
    entryCreditCents: number;
    currentCostCents: number | null;
    pnlCents: number | null;
    pnlPercent: number | null;
    error?: string;
  }

  interface PnLResponse {
    positions: PositionPnL[];
    lastUpdated: string;
  }

  const { data: pnlData, refetch: refetchPnL } = useQuery<PnLResponse>({
    queryKey: ["/api/positions/pnl"],
    staleTime: 2 * 60 * 1000,
    enabled: !!(allPositions && allPositions.some(p => p.status === "open")),
  });

  const filterByAccount = (positionsList: Position[]) => {
    if (accountFilter === "all") return positionsList;
    return positionsList.filter(p => p.portfolioId === accountFilter);
  };

  const filterByMonth = (positionsList: Position[]) => {
    if (monthFilter === "all") return positionsList;
    return positionsList.filter(p => {
      if (!p.closedAt) return false;
      const closedDate = new Date(p.closedAt);
      const monthYear = format(closedDate, "yyyy-MM");
      return monthYear === monthFilter;
    });
  };

  const openPositions = filterByAccount(allPositions?.filter((p) => p.status === "open") || []);
  const allClosedByAccount = filterByAccount(allPositions?.filter((p) => p.status === "closed") || []);
  const closedPositions = filterByMonth(allClosedByAccount);

  const availableMonths = Array.from(
    new Set(
      allClosedByAccount
        .filter(p => p.closedAt)
        .map(p => format(new Date(p.closedAt!), "yyyy-MM"))
    )
  ).sort().reverse();

  const calculateDTE = (expiry: Date | string) => {
    const now = toZonedTime(new Date(), 'America/New_York');
    const expiryDate = toZonedTime(new Date(expiry), 'America/New_York');
    const diffTime = expiryDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const positionsNearExpiry = openPositions.filter(p => {
    const dte = calculateDTE(p.expiry);
    return dte <= 21 && dte > 0;
  });

  const calculatePositionPL = (p: Position) => {
    const isLeaps = p.strategyType === "LEAPS";
    // Non-LEAPS: NULL exit on a closed position means expired worthless (exit at $0)
    // LEAPS: NULL exit means unknown — can't calculate P/L
    if (p.exitCreditCents === null || p.exitCreditCents === undefined) {
      if (isLeaps) return null;
      if (p.status !== "closed") return null;
    }
    const contracts = p.contracts || 1;
    const entryCents = isLeaps ? (p.entryDebitCents || 0) : (p.entryCreditCents || 0);
    const exitCents = p.exitCreditCents || 0;
    // entryCreditCents/exitCreditCents store raw contract price in cents ($x.xx = xxx cents)
    // Multiply by 100 because 1 contract = 100 shares
    const plPerShareCents = isLeaps ? (exitCents - entryCents) : (entryCents - exitCents);
    return plPerShareCents * 100 * contracts;
  };

  const isWinner = (p: Position) => {
    const pl = calculatePositionPL(p);
    return pl !== null && pl > 0;
  };

  const isLoser = (p: Position) => {
    const pl = calculatePositionPL(p);
    return pl !== null && pl < 0;
  };

  const closedWithExit = closedPositions.filter(p => {
    // Non-LEAPS closed with NULL exit = expired worthless (full profit)
    if (p.strategyType !== "LEAPS" && p.status === "closed") return true;
    return p.exitCreditCents !== null && p.exitCreditCents !== undefined;
  });
  const winners = closedWithExit.filter(isWinner);
  const losers = closedWithExit.filter(isLoser);
  const breakeven = closedWithExit.filter(p => {
    const pl = calculatePositionPL(p);
    return pl === 0;
  });

  const winRate = closedWithExit.length > 0 ? (winners.length / closedWithExit.length) * 100 : 0;

  const calculateAvgWin = () => {
    if (winners.length === 0) return { avgPL: 0, avgPercent: 0 };
    const totalWinPL = winners.reduce((total, p) => total + (calculatePositionPL(p) || 0), 0);
    const totalWinPercent = winners.reduce((total, p) => {
      const isLeaps = p.strategyType === "LEAPS";
      const entryCents = isLeaps ? (p.entryDebitCents || 0) : (p.entryCreditCents || 0);
      if (entryCents === 0) return total;
      const pl = calculatePositionPL(p) || 0;
      // entryCents is per-share, multiply by 100 for per-contract value
      const entryValueCents = entryCents * 100 * (p.contracts || 1);
      return total + ((pl / entryValueCents) * 100);
    }, 0);
    return { avgPL: totalWinPL / winners.length, avgPercent: totalWinPercent / winners.length };
  };

  const calculateAvgLoss = () => {
    if (losers.length === 0) return { avgPL: 0, avgPercent: 0 };
    const totalLossPL = losers.reduce((total, p) => total + (calculatePositionPL(p) || 0), 0);
    const totalLossPercent = losers.reduce((total, p) => {
      const isLeaps = p.strategyType === "LEAPS";
      const entryCents = isLeaps ? (p.entryDebitCents || 0) : (p.entryCreditCents || 0);
      if (entryCents === 0) return total;
      const pl = calculatePositionPL(p) || 0;
      // entryCents is per-share, multiply by 100 for per-contract value
      const entryValueCents = entryCents * 100 * (p.contracts || 1);
      return total + ((pl / entryValueCents) * 100);
    }, 0);
    return { avgPL: totalLossPL / losers.length, avgPercent: totalLossPercent / losers.length };
  };

  const realizedPL = closedWithExit.reduce((total, p) => total + (calculatePositionPL(p) || 0), 0);

  const calculateUnrealizedPL = () => {
    if (!pnlData || openPositions.length === 0) return 0;
    const totalPL = openPositions.reduce((total, position) => {
      const pnl = pnlData.positions.find(p => p.positionId === position.id);
      if (pnl && pnl.pnlCents !== null) {
        const contracts = position.contracts || 1;
        const portfolio = portfolios?.find(p => p.id === position.portfolioId);
        const dataSource = portfolio?.isExternal ? 'tiger' : 'manual';
        const positionPL = dataSource === 'tiger' ? pnl.pnlCents : pnl.pnlCents * 100 * contracts;
        return total + positionPL;
      }
      return total;
    }, 0);
    return totalPL / 100;
  };

  const DEPOSITS = 50_000;
  const WITHDRAWALS = 0;
  const STOCK_HOLDINGS = 0;

  const calculateLeapsMarketValue = () => {
    if (!pnlData || openPositions.length === 0) return 0;
    const leapsPositions = openPositions.filter(p => p.strategyType === "LEAPS");
    const totalCents = leapsPositions.reduce((total, position) => {
      const pnl = pnlData.positions.find(p => p.positionId === position.id);
      if (pnl && pnl.currentCostCents !== null) {
        const contracts = position.contracts || 1;
        return total + pnl.currentCostCents * 100 * contracts;
      }
      return total;
    }, 0);
    return totalCents / 100;
  };

  const calculateUnrealizedOptionsPL = () => {
    if (!pnlData || openPositions.length === 0) return 0;
    const nonLeapsPositions = openPositions.filter(p => p.strategyType !== "LEAPS");
    const totalCents = nonLeapsPositions.reduce((total, position) => {
      const pnl = pnlData.positions.find(p => p.positionId === position.id);
      if (pnl && pnl.pnlCents !== null) {
        const contracts = position.contracts || 1;
        const portfolio = portfolios?.find(p => p.id === position.portfolioId);
        const dataSource = portfolio?.isExternal ? 'tiger' : 'manual';
        const positionPL = dataSource === 'tiger' ? pnl.pnlCents : pnl.pnlCents * 100 * contracts;
        return total + positionPL;
      }
      return total;
    }, 0);
    return totalCents / 100;
  };

  const leapsMarketValue = calculateLeapsMarketValue();
  const unrealizedOptionsPL = calculateUnrealizedOptionsPL();
  const netAccountValue = DEPOSITS - WITHDRAWALS + (realizedPL / 100)
    + (includeLeaps ? leapsMarketValue : 0) + unrealizedOptionsPL + STOCK_HOLDINGS;

  const tickerAnalytics = useMemo((): TickerStats[] => {
    const statsMap = new Map<string, TickerStats>();
    
    closedWithExit.forEach(p => {
      const existing = statsMap.get(p.symbol) || {
        symbol: p.symbol,
        wins: 0,
        losses: 0,
        totalTrades: 0,
        totalPL: 0,
        winRate: 0,
      };
      
      const pl = calculatePositionPL(p) || 0;
      existing.totalTrades += 1;
      existing.totalPL += pl;
      
      if (pl > 0) {
        existing.wins += 1;
      } else if (pl < 0) {
        existing.losses += 1;
      }
      // pl === 0 is breakeven, not counted as win or loss
      
      existing.winRate = existing.totalTrades > 0 
        ? (existing.wins / existing.totalTrades) * 100 
        : 0;
      
      statsMap.set(p.symbol, existing);
    });
    
    return Array.from(statsMap.values());
  }, [closedWithExit]);

  const getStrategyBucket = (p: Position): string | null => {
    const entry = new Date(p.entryDt);
    const expiry = new Date(p.expiry);
    const dte = Math.ceil((expiry.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));

    if (p.strategyType === "LEAPS") return "LEAPS";
    if (p.strategyType === "COVERED_CALL") return "Covered Calls";
    if (dte <= 1) return "0DTE";
    if (dte >= 38 && dte <= 55) return "45DTE";
    return null;
  };

  const strategyBreakdown = useMemo(() => {
    const buckets = {
      '0DTE': { trades: 0, pl: 0, wins: 0 },
      '45DTE': { trades: 0, pl: 0, wins: 0 },
      'Covered Calls': { trades: 0, pl: 0, wins: 0 },
      'LEAPS': { trades: 0, pl: 0, wins: 0 },
    };

    closedWithExit.forEach(p => {
      const pl = calculatePositionPL(p) || 0;
      const bucket = getStrategyBucket(p);
      if (bucket && bucket in buckets) {
        buckets[bucket as keyof typeof buckets].trades += 1;
        buckets[bucket as keyof typeof buckets].pl += pl;
        if (pl > 0) buckets[bucket as keyof typeof buckets].wins += 1;
      }
    });

    return buckets;
  }, [closedWithExit]);

  const filteredClosedWithExit = strategyFilter
    ? closedWithExit.filter(p => getStrategyBucket(p) === strategyFilter)
    : closedWithExit;

  const filteredWinners = filteredClosedWithExit.filter(isWinner);
  const filteredLosers = filteredClosedWithExit.filter(isLoser);
  const filteredWinRate = filteredClosedWithExit.length > 0 ? (filteredWinners.length / filteredClosedWithExit.length) * 100 : 0;
  const filteredRealizedPL = filteredClosedWithExit.reduce((total, p) => total + (calculatePositionPL(p) || 0), 0);

  const filteredAvgWin = (() => {
    if (filteredWinners.length === 0) return { avgPL: 0, avgPercent: 0 };
    const totalWinPL = filteredWinners.reduce((total, p) => total + (calculatePositionPL(p) || 0), 0);
    const totalWinPercent = filteredWinners.reduce((total, p) => {
      const isLeaps = p.strategyType === "LEAPS";
      const entryCents = isLeaps ? (p.entryDebitCents || 0) : (p.entryCreditCents || 0);
      if (entryCents === 0) return total;
      const pl = calculatePositionPL(p) || 0;
      const entryValueCents = entryCents * 100 * (p.contracts || 1);
      return total + ((pl / entryValueCents) * 100);
    }, 0);
    return { avgPL: totalWinPL / filteredWinners.length, avgPercent: totalWinPercent / filteredWinners.length };
  })();

  const filteredAvgLoss = (() => {
    if (filteredLosers.length === 0) return { avgPL: 0, avgPercent: 0 };
    const totalLossPL = filteredLosers.reduce((total, p) => total + (calculatePositionPL(p) || 0), 0);
    const totalLossPercent = filteredLosers.reduce((total, p) => {
      const isLeaps = p.strategyType === "LEAPS";
      const entryCents = isLeaps ? (p.entryDebitCents || 0) : (p.entryCreditCents || 0);
      if (entryCents === 0) return total;
      const pl = calculatePositionPL(p) || 0;
      const entryValueCents = entryCents * 100 * (p.contracts || 1);
      return total + ((pl / entryValueCents) * 100);
    }, 0);
    return { avgPL: totalLossPL / filteredLosers.length, avgPercent: totalLossPercent / filteredLosers.length };
  })();

  const topWinners = [...tickerAnalytics].sort((a, b) => b.wins - a.wins).slice(0, 5);
  const topLosers = [...tickerAnalytics].sort((a, b) => b.losses - a.losses).slice(0, 5);
  const mostProfitable = [...tickerAnalytics].sort((a, b) => b.totalPL - a.totalPL).slice(0, 5);
  const mostTraded = [...tickerAnalytics].sort((a, b) => b.totalTrades - a.totalTrades).slice(0, 5);

  const handleRefresh = () => {
    refetchStats();
    refetchScan();
    refetchAlerts();
    refetchPositions();
    refetchPnL();
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString('en-US', { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  };

  const formatCurrency = (cents: number, decimals: number = 2): string => {
    const dollars = cents / 100;
    const prefix = dollars > 0 ? '+' : dollars < 0 ? '-' : '';
    return `${prefix}$${formatNumber(Math.abs(dollars), decimals)}`;
  };

  const unrealizedPL = calculateUnrealizedPL();
  const avgWin = calculateAvgWin();
  const avgLoss = calculateAvgLoss();
  
  const filteredAlerts = alerts?.filter(alert => {
    if (accountFilter === "all") return true;
    const position = allPositions?.find(p => p.id === alert.positionId);
    return position?.portfolioId === accountFilter;
  }) || [];
  
  const activeAlerts = filteredAlerts.filter(a => !a.dismissed);

  const getPortfolioName = (portfolioId: string | null) => {
    if (!portfolioId) return "—";
    const portfolio = portfolios?.find(p => p.id === portfolioId);
    return portfolio?.name || "—";
  };

  return (
    <div className="p-4 sm:p-8">
      <PageSEO 
        title="Account Overview" 
        description="Monitor your trading performance with comprehensive metrics, P/L calculations, and position monitoring."
      />
      
      {/* Header with Filters */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Account Overview</h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Trading performance and analytics
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-[130px] sm:w-[160px] text-xs sm:text-sm" data-testid="select-account-filter">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {portfolios && portfolios.map((portfolio) => (
                  <SelectItem key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-[130px] sm:w-[160px] text-xs sm:text-sm" data-testid="select-month-filter">
                <SelectValue placeholder="All Months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {availableMonths.map((month) => (
                  <SelectItem key={month} value={month}>
                    {format(new Date(month + "-01"), "MMM yyyy")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleRefresh}
              data-testid="button-refresh"
            >
              <RefreshCw size={16} />
            </Button>
          </div>
        </div>

        {!isAuthenticated && (
          <Card className="mb-6 border-primary/30">
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-3">Account Overview - Monitor Your Performance</h3>
              <p className="text-muted-foreground mb-4">
                Track your trading performance with comprehensive metrics, P/L calculations, and position monitoring.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-3">
                  <BarChart className="text-primary mt-1" size={20} />
                  <div>
                    <p className="font-medium mb-1">Real-time Metrics</p>
                    <p className="text-sm text-muted-foreground">
                      Track unrealized and realized P/L across all positions
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <PieChart className="text-primary mt-1" size={20} />
                  <div>
                    <p className="font-medium mb-1">Performance Analytics</p>
                    <p className="text-sm text-muted-foreground">
                      Win rate, profit factors, and historical analysis
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <LineChart className="text-primary mt-1" size={20} />
                  <div>
                    <p className="font-medium mb-1">Position Health</p>
                    <p className="text-sm text-muted-foreground">
                      DTE tracking and automated risk alerts
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Account Value Card */}
      <Card className="mb-8">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Wallet className="text-primary" size={20} />
                <p className="text-sm sm:text-base font-medium text-muted-foreground">Account Value</p>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={includeLeaps}
                  onCheckedChange={(checked) => setIncludeLeaps(checked === true)}
                />
                <span className="text-xs text-muted-foreground">Include LEAPS</span>
              </label>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${netAccountValue >= 0 ? 'text-success' : 'text-destructive'}`} data-testid="text-net-account-value">
              {positionsLoading ? "-" : `${netAccountValue >= 0 ? '' : '-'}$${formatNumber(Math.abs(netAccountValue), 0)}`}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-4 border-t">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Deposits</p>
              <p className="text-sm sm:text-base font-semibold">${formatNumber(DEPOSITS, 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Withdrawals</p>
              <p className="text-sm sm:text-base font-semibold">${formatNumber(WITHDRAWALS, 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Realized P/L</p>
              <p className={`text-sm sm:text-base font-semibold ${realizedPL >= 0 ? 'text-success' : 'text-destructive'}`} data-testid="text-realized-pl">
                {positionsLoading ? "-" : formatCurrency(realizedPL, 0)}
              </p>
            </div>
            <div className={includeLeaps ? '' : 'opacity-40'}>
              <p className="text-xs text-muted-foreground mb-1">LEAPS Mkt Value</p>
              <p className="text-sm sm:text-base font-semibold" data-testid="text-leaps-value">
                {positionsLoading ? "-" : `$${formatNumber(leapsMarketValue, 0)}`}
              </p>
            </div>
            <div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1 cursor-help">
                      Options Unrealized P/L
                      <Info size={12} />
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Unrealized P/L from open Credit Spreads, Iron Condors, and Covered Calls</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <p className={`text-sm sm:text-base font-semibold ${unrealizedOptionsPL >= 0 ? 'text-success' : 'text-destructive'}`} data-testid="text-options-pl">
                {positionsLoading ? "-" : `${unrealizedOptionsPL >= 0 ? '+' : '-'}$${formatNumber(Math.abs(unrealizedOptionsPL), 0)}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Stock Holdings</p>
              <p className="text-sm sm:text-base font-semibold">${formatNumber(STOCK_HOLDINGS, 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Open Positions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card className="bg-card">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs sm:text-sm text-muted-foreground">Open Positions</p>
              <Target className="text-primary" size={18} />
            </div>
            <p className="text-xl sm:text-2xl font-bold" data-testid="text-active-positions">
              {positionsLoading ? "-" : openPositions.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {positionsNearExpiry.length > 0 ? (
                <span className="text-warning">{positionsNearExpiry.length} near expiry</span>
              ) : (
                <span className="text-success">All healthy</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs sm:text-sm text-muted-foreground">Unrealized P/L</p>
              <DollarSign className={unrealizedPL >= 0 ? "text-success" : "text-destructive"} size={18} />
            </div>
            <p className={`text-xl sm:text-2xl font-bold ${unrealizedPL >= 0 ? 'text-success' : 'text-destructive'}`} data-testid="text-unrealized-pl">
              {positionsLoading ? "-" : `${unrealizedPL >= 0 ? '+' : '-'}$${formatNumber(Math.abs(unrealizedPL), 0)}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {openPositions.length} open
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Summary with Closed Trades Table */}
      {!positionsLoading && closedWithExit.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg sm:text-xl font-semibold">Performance Summary</CardTitle>
              {strategyFilter && (
                <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setStrategyFilter(null)}>
                  <XCircle size={14} />
                  Clear {strategyFilter} filter
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Summary Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-6 pb-6 border-b">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Total Trades</p>
                <p className="text-lg sm:text-xl font-bold">{filteredClosedWithExit.length}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Wins / Losses</p>
                <p className="text-lg sm:text-xl font-bold">
                  <span className="text-success">{filteredWinners.length}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-destructive">{filteredLosers.length}</span>
                </p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Win Rate</p>
                <p className={`text-lg sm:text-xl font-bold ${filteredWinRate >= 50 ? 'text-success' : 'text-destructive'}`}>
                  {Math.round(filteredWinRate)}%
                </p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Avg Win</p>
                <p className="text-lg sm:text-xl font-bold text-success">
                  ${formatNumber(Math.abs(filteredAvgWin.avgPL) / 100, 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  +{Math.round(filteredAvgWin.avgPercent)}%
                </p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Avg Loss</p>
                <p className="text-lg sm:text-xl font-bold text-destructive">
                  ${formatNumber(Math.abs(filteredAvgLoss.avgPL) / 100, 0)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {Math.round(filteredAvgLoss.avgPercent)}%
                </p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Avg P/L / Trade</p>
                <p className={`text-lg sm:text-xl font-bold ${filteredRealizedPL >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {filteredClosedWithExit.length > 0 ? formatCurrency(filteredRealizedPL / filteredClosedWithExit.length, 0) : '$0'}
                </p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Total Realized</p>
                <p className={`text-lg sm:text-xl font-bold ${filteredRealizedPL >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(filteredRealizedPL, 0)}
                </p>
              </div>
            </div>

            {/* P/L by Strategy */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 pb-6 border-b">
              {(Object.entries(strategyBreakdown) as [string, { trades: number; pl: number; wins: number }][]).map(([name, data]) => (
                <div
                  key={name}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    strategyFilter === name
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'hover:border-muted-foreground/50'
                  }`}
                  onClick={() => setStrategyFilter(strategyFilter === name ? null : name)}
                >
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">{name}</p>
                  <p className={`text-lg sm:text-xl font-bold ${data.pl >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {data.trades > 0 ? formatCurrency(data.pl, 0) : '—'}
                  </p>
                  {data.trades > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.trades} trades · {Math.round((data.wins / data.trades) * 100)}% WR
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Closed Trades Table */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Closed Trades</h4>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Symbol</TableHead>
                      <TableHead className="text-xs">Strategy</TableHead>
                      <TableHead className="text-xs">Strikes</TableHead>
                      <TableHead className="text-xs">Entry</TableHead>
                      <TableHead className="text-xs">Exit</TableHead>
                      <TableHead className="text-xs">P/L ($)</TableHead>
                      <TableHead className="text-xs">P/L (%)</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">Closed</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClosedWithExit.slice(0, 10).map((position) => {
                      const pl = calculatePositionPL(position) || 0;
                      const isLeaps = position.strategyType === "LEAPS";
                      const entryCents = isLeaps ? (position.entryDebitCents || 0) : (position.entryCreditCents || 0);
                      const contracts = position.contracts || 1;
                      // entryCents is per-share, multiply by 100 for per-contract value
                      const entryValueCents = entryCents * 100 * contracts;
                      const plPercent = entryValueCents > 0 ? ((pl / entryValueCents) * 100) : 0;
                      
                      // Strategy display
                      const getStrategyLabel = () => {
                        if (position.strategyType === "LEAPS") return "LEAPS";
                        if (position.strategyType === "COVERED_CALL") return "CC";
                        const bucket = getStrategyBucket(position);
                        const dtePrefix = bucket === "0DTE" ? "0DTE " : bucket === "45DTE" ? "45DTE " : "";
                        if (position.strategyType === "IRON_CONDOR") return `${dtePrefix}IC`;
                        const typeLabel = position.type?.toUpperCase() === "PUT" ? "PCS" : "CCS";
                        return `${dtePrefix}${typeLabel}`;
                      };
                      
                      // Format strike price - round to whole number for cleaner display
                      const formatStrike = (strike: number | null | undefined) => {
                        if (strike === null || strike === undefined) return "—";
                        return Math.round(strike);
                      };
                      
                      // Get strikes display based on strategy type
                      const getStrikesDisplay = () => {
                        if (position.strategyType === "LEAPS") {
                          return formatStrike(position.shortStrike);
                        }
                        if (position.strategyType === "IRON_CONDOR") {
                          // IC has 4 strikes: Put side and Call side on separate lines
                          const putLong = formatStrike(position.longStrike);
                          const putShort = formatStrike(position.shortStrike);
                          const callShort = formatStrike(position.callShortStrike);
                          const callLong = formatStrike(position.callLongStrike);
                          return (
                            <div className="leading-tight">
                              <div>P: {putLong}/{putShort}</div>
                              <div>C: {callShort}/{callLong}</div>
                            </div>
                          );
                        }
                        // Credit spread: Short/Long
                        return `${formatStrike(position.shortStrike)}/${formatStrike(position.longStrike)}`;
                      };
                      
                      return (
                        <TableRow key={position.id} data-testid={`closed-trade-${position.id}`}>
                          <TableCell className="font-medium text-sm">{position.symbol}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {getStrategyLabel()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {getStrikesDisplay()}
                          </TableCell>
                          <TableCell className="text-xs">
                            ${(entryCents / 100).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs">
                            ${((position.exitCreditCents || 0) / 100).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${pl >= 0 ? 'text-success' : 'text-destructive'}`}>
                              {formatCurrency(pl, 0)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${plPercent >= 0 ? 'text-success' : 'text-destructive'}`}>
                              {plPercent >= 0 ? '+' : ''}{Math.round(plPercent)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                            {position.closedAt ? format(new Date(position.closedAt), "MMM dd") : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                            {getPortfolioName(position.portfolioId)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {filteredClosedWithExit.length > 10 && (
                <div className="mt-3 text-center">
                  <Link href="/positions/closed" className="text-sm text-primary hover:underline" data-testid="link-view-all-closed">
                    View all {filteredClosedWithExit.length} closed trades →
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ticker Insights Section */}
      {!positionsLoading && tickerAnalytics.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg sm:text-xl font-semibold mb-4">Ticker Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Most Wins */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Trophy className="text-success" size={16} />
                  Most Winning Tickers
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {topWinners.length > 0 ? (
                  <div className="space-y-2">
                    {topWinners.map((t, i) => (
                      <div key={t.symbol} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                          <span className="font-medium">{t.symbol}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-success">{t.wins} wins</span>
                          <span className="text-xs text-muted-foreground">{t.winRate.toFixed(0)}% WR</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Most Losses */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <XCircle className="text-destructive" size={16} />
                  Most Losing Tickers
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {topLosers.filter(t => t.losses > 0).length > 0 ? (
                  <div className="space-y-2">
                    {topLosers.filter(t => t.losses > 0).map((t, i) => (
                      <div key={t.symbol} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                          <span className="font-medium">{t.symbol}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-destructive">{t.losses} losses</span>
                          <span className="text-xs text-muted-foreground">{(100 - t.winRate).toFixed(0)}% LR</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No losses yet</p>
                )}
              </CardContent>
            </Card>

            {/* Most Profitable */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="text-success" size={16} />
                  Most Profitable Tickers
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {mostProfitable.length > 0 ? (
                  <div className="space-y-2">
                    {mostProfitable.map((t, i) => (
                      <div key={t.symbol} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                          <span className="font-medium">{t.symbol}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-sm font-medium ${t.totalPL >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatCurrency(t.totalPL)}
                          </span>
                          <span className="text-xs text-muted-foreground">{t.totalTrades} trades</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
              </CardContent>
            </Card>

            {/* Most Traded */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Flame className="text-primary" size={16} />
                  Most Traded Tickers
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {mostTraded.length > 0 ? (
                  <div className="space-y-2">
                    {mostTraded.map((t, i) => (
                      <div key={t.symbol} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                          <span className="font-medium">{t.symbol}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm">{t.totalTrades} trades</span>
                          <span className={`text-xs ${t.winRate >= 50 ? 'text-success' : 'text-destructive'}`}>
                            {t.winRate.toFixed(0)}% WR
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg sm:text-xl font-semibold">Alerts Requiring Action</h3>
            <Link href="/alerts" className="text-sm text-primary hover:underline" data-testid="link-view-all-alerts">
              View all {alerts?.length || 0} alerts →
            </Link>
          </div>

          <div className="space-y-3">
            {activeAlerts.slice(0, 3).map((alert) => {
              const position = allPositions?.find((p) => p.id === alert.positionId);
              if (!position) return null;

              const dte = calculateDTE(position.expiry);

              return (
                <Card
                  key={alert.id}
                  className={`${
                    alert.type === "tp50" 
                      ? "border-success/50" 
                      : alert.type === "dte21"
                        ? "border-warning/50"
                        : "border-destructive/50"
                  }`}
                  data-testid={`alert-${alert.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          alert.type === "tp50" 
                            ? "bg-success/20" 
                            : alert.type === "dte21"
                              ? "bg-warning/20"
                              : "bg-destructive/20"
                        }`}
                      >
                        {alert.type === "tp50" ? (
                          <CheckCircle className="text-success" size={20} />
                        ) : alert.type === "dte21" ? (
                          <Clock className="text-warning" size={20} />
                        ) : (
                          <AlertTriangle className="text-destructive" size={20} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-lg">{position.symbol}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-sm text-muted-foreground">
                            {position.type} {position.shortStrike}/{position.longStrike}
                          </span>
                          <Badge
                            variant={alert.type === "tp50" ? "default" : alert.type === "dte21" ? "secondary" : "destructive"}
                            className="text-xs"
                          >
                            {alert.type === "tp50" ? "Take Profit" : alert.type === "dte21" ? `${dte} DTE` : "Stop Loss"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Entry: <span className="font-medium">${((position.entryCreditCents || 0) / 100).toFixed(2)}</span>
                          {alert.currentMidCents && (
                            <>
                              {" • "}Current: <span className={`font-medium ${alert.type === "tp50" ? "text-success" : alert.type === "sl2x" ? "text-destructive" : ""}`}>
                                ${(alert.currentMidCents / 100).toFixed(2)}
                              </span>
                            </>
                          )}
                          {" • "}Expiry: <span className="font-medium">{format(new Date(position.expiry), 'MMM dd, yyyy')}</span>
                        </p>
                        <p className="text-sm">
                          {alert.type === "tp50" && "Consider closing position to lock in 50%+ profit"}
                          {alert.type === "dte21" && "Position approaching expiration - review management strategy"}
                          {alert.type === "sl2x" && "Position hit 2x stop loss - consider closing to limit losses"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!positionsLoading && closedWithExit.length === 0 && openPositions.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Target className="mx-auto text-muted-foreground mb-4" size={48} />
            <h3 className="text-lg font-semibold mb-2">No Trading Data Yet</h3>
            <p className="text-muted-foreground mb-4">
              Start tracking your trades to see performance analytics here.
            </p>
            <Link href="/positions/open">
              <Button data-testid="button-add-first-position">Add Your First Position</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
