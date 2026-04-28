import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, RefreshCw, Trash2, X, TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Copy, Download, AlertTriangle, Bell, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { PageSEO } from "@/components/seo/PageSEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import AddTradeModal from "@/components/modals/add-trade-modal";
import AddIronCondorModal from "@/components/modals/add-iron-condor-modal";
import AddLeapsModal from "@/components/modals/add-leaps-modal";
import AddStockModal from "@/components/modals/add-stock-modal";
import EditPositionModal from "@/components/modals/edit-position-modal";
import EditIronCondorModal from "@/components/modals/edit-iron-condor-modal";
import EditLeapsModal from "@/components/modals/edit-leaps-modal";
import ClosePositionModal from "@/components/modals/close-position-modal";
import EditCloseModal from "@/components/modals/edit-close-modal";
import { EmptyState } from "@/components/empty-state";
import type { Position, Portfolio, Setting } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { queryClient, apiRequest, invalidateAfterPositionChange } from "@/lib/queryClient";
import PositionsSubnav from "@/components/layout/positions-subnav";

interface PositionPnL {
  positionId: string;
  symbol: string;
  entryCreditCents: number;
  currentCostCents: number | null;
  pnlCents: number | null;
  pnlPercent: number | null;
  error?: string;
  dataSource?: string;
}

interface PnLResponse {
  positions: PositionPnL[];
  lastUpdated: string;
}

interface TickerPricesResponse {
  prices: Record<string, number | null>;
  lastUpdated: string;
}

interface MarketData {
  symbol: string;
  price: number | null;
  change: number | null;
  stochRSIStatus: string;
  support: number | null;
  resistance: number | null;
}

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

export default function PositionsPending() {
  const [isAddTradeOpen, setIsAddTradeOpen] = useState(false);
  const [isAddIronCondorOpen, setIsAddIronCondorOpen] = useState(false);
  const [isAddLeapsOpen, setIsAddLeapsOpen] = useState(false);
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [isEditPositionOpen, setIsEditPositionOpen] = useState(false);
  const [isEditIronCondorOpen, setIsEditIronCondorOpen] = useState(false);
  const [isEditLeapsOpen, setIsEditLeapsOpen] = useState(false);
  const [isClosePositionOpen, setIsClosePositionOpen] = useState(false);
  const [isEditCloseOpen, setIsEditCloseOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [sortByDTE, setSortByDTE] = useState<"asc" | "desc" | null>(null);
  const [sortBySymbol, setSortBySymbol] = useState<"asc" | "desc" | null>(null);
  const [duplicateInitialValues, setDuplicateInitialValues] = useState<any>(null);
  const [executingOrderId, setExecutingOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  // Tiger Brokers sync mutation
  const syncTigerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/positions/sync-tiger');
      return await res.json();
    },
    onSuccess: (data: any) => {
      invalidateAfterPositionChange();

      const parts = [];
      if (data.imported > 0) parts.push(`${data.imported} new`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.errors > 0) parts.push(`${data.errors} error(s)`);
      
      toast({
        title: "Tiger Brokers Sync Complete",
        description: parts.length > 0 ? parts.join(', ') : 'No changes',
      });
    },
    onError: (error: any) => {
      const message = error.message || 'Failed to sync positions from Tiger Brokers';
      toast({
        title: "Sync Failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleEditPosition = (position: Position) => {
    setSelectedPosition(position);
    if (position.strategyType === "IRON_CONDOR") {
      setIsEditIronCondorOpen(true);
    } else if (position.strategyType === "LEAPS") {
      setIsEditLeapsOpen(true);
    } else if (position.strategyType === "STOCK") {
      // Stock uses generic edit modal
      setIsEditPositionOpen(true);
    } else {
      setIsEditPositionOpen(true);
    }
  };

  const handleClosePosition = (position: Position) => {
    setSelectedPosition(position);
    setIsClosePositionOpen(true);
  };

  const handleEditClose = (position: Position) => {
    setSelectedPosition(position);
    setIsEditCloseOpen(true);
  };

  const handleDuplicatePosition = (position: Position) => {
    if (position.strategyType === 'LEAPS') {
      setDuplicateInitialValues({
        symbol: position.symbol,
        strike: position.shortStrike,
        expiry: new Date(position.expiry),
        entryDebit: (position.entryDebitCents || 0) / 100,
        entryDelta: position.entryDelta,
        contracts: position.contracts,
        notes: position.notes,
      });
      setIsAddLeapsOpen(true);
    } else if (position.strategyType === 'IRON_CONDOR') {
      setDuplicateInitialValues({
        symbol: position.symbol,
        putShortStrike: position.shortStrike,
        putLongStrike: position.longStrike,
        callShortStrike: position.callShortStrike,
        callLongStrike: position.callLongStrike,
        expiry: new Date(position.expiry),
        entryCredit: (position.entryCreditCents || 0) / 100,
        contracts: position.contracts,
        notes: position.notes,
      });
      setIsAddIronCondorOpen(true);
    } else {
      setDuplicateInitialValues({
        symbol: position.symbol,
        type: position.type,
        shortStrike: position.shortStrike,
        longStrike: position.longStrike,
        expiry: new Date(position.expiry),
        entryCredit: (position.entryCreditCents || 0) / 100,
        contracts: position.contracts,
        notes: position.notes,
      });
      setIsAddTradeOpen(true);
    }
  };

  const { data: positions, isLoading } = useQuery<Position[]>({
    queryKey: ["/api/positions?status=order"],
  });

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const { data: settings } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });
  
  const tigerAccountNumber = settings?.find(s => s.key === "tiger_account_number")?.value || "";

  const { data: tickerPrices, isLoading: isPricesLoading } = useQuery<TickerPricesResponse>({
    queryKey: ["/api/positions/ticker-prices?status=order"],
    staleTime: 55 * 1000, // 55 seconds (align with 60s cache refresh)
    refetchInterval: 60000, // Refresh every 60 seconds
    enabled: !!positions && positions.length > 0,
  });

  const { data: marketData } = useQuery<MarketData[]>({
    queryKey: ["/api/watchlist-market-data"],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: pnlData, isLoading: isPnLLoading, refetch: refetchPnL } = useQuery<PnLResponse>({
    queryKey: ["/api/positions/pnl?status=order"],
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!positions && positions.length > 0,
  });

  // Track updated values for flash effect
  const [flashingPositions, setFlashingPositions] = useState<Set<string>>(new Set());
  const previousPnLData = useRef<Map<string, { currentCostCents: number | null; pnlCents: number | null }>>(new Map());

  // Detect changes in PnL data and trigger flash effect
  useEffect(() => {
    if (!pnlData?.positions) return;

    const newFlashing = new Set<string>();

    pnlData.positions.forEach((position) => {
      const prev = previousPnLData.current.get(position.positionId);
      
      if (prev) {
        // Check if current cost or PnL has changed
        if (
          prev.currentCostCents !== position.currentCostCents ||
          prev.pnlCents !== position.pnlCents
        ) {
          newFlashing.add(position.positionId);
        }
      }

      // Update the reference
      previousPnLData.current.set(position.positionId, {
        currentCostCents: position.currentCostCents,
        pnlCents: position.pnlCents,
      });
    });

    if (newFlashing.size > 0) {
      setFlashingPositions(newFlashing);
      
      // Remove flash effect after 5 seconds
      setTimeout(() => {
        setFlashingPositions(new Set());
      }, 5000);
    }
  }, [pnlData]);

  const filterByAccount = (positionsList: Position[]) => {
    if (accountFilter === "all") return positionsList;
    return positionsList.filter(p => p.portfolioId === accountFilter);
  };

  const calculateDTE = (expiry: Date) => {
    // Use US Eastern time for DTE calculation - set to start of day for accurate day count
    const nowUS = toZonedTime(new Date(), 'America/New_York');
    nowUS.setHours(0, 0, 0, 0);
    
    const expiryDate = new Date(expiry);
    expiryDate.setHours(0, 0, 0, 0);
    
    const dte = Math.round((expiryDate.getTime() - nowUS.getTime()) / (1000 * 60 * 60 * 24));
    return dte;
  };

  const sortByDTEIfNeeded = (positionsList: Position[]) => {
    if (sortByDTE === null) return positionsList;
    
    return [...positionsList].sort((a, b) => {
      const dteA = calculateDTE(a.expiry);
      const dteB = calculateDTE(b.expiry);
      const comparison = dteA - dteB;
      return sortByDTE === "asc" ? comparison : -comparison;
    });
  };

  const sortBySymbolIfNeeded = (positionsList: Position[]) => {
    if (sortBySymbol === null) return positionsList;
    
    return [...positionsList].sort((a, b) => {
      const comparison = a.symbol.localeCompare(b.symbol);
      return sortBySymbol === "asc" ? comparison : -comparison;
    });
  };

  const filterByStrategy = (positionsList: Position[]) => {
    if (strategyFilter === "all") return positionsList;
    if (strategyFilter === "iron_condor") return positionsList.filter(p => p.strategyType === "IRON_CONDOR");
    if (strategyFilter === "call_spread") return positionsList.filter(p => p.type === "CALL" && p.strategyType !== "IRON_CONDOR" && p.strategyType !== "LEAPS" && p.strategyType !== "STOCK");
    if (strategyFilter === "put_spread") return positionsList.filter(p => p.type === "PUT" && p.strategyType !== "IRON_CONDOR" && p.strategyType !== "LEAPS" && p.strategyType !== "STOCK");
    if (strategyFilter === "stock") return positionsList.filter(p => p.strategyType === "STOCK");
    return positionsList;
  };

  // Separate LEAPS and STOCK positions from credit spreads and iron condors FIRST, then apply filters separately
  const filteredByAccountPositions = filterByAccount(positions || []);

  // LEAPS positions - NOT affected by strategy filter, only by account filter and sorting
  const openLeapsPositions = sortBySymbolIfNeeded(sortByDTEIfNeeded(
    filteredByAccountPositions.filter(p => p.strategyType === "LEAPS")
  ));

  // STOCK positions - NOT affected by strategy filter, only by account filter and sorting
  const openStockPositions = sortBySymbolIfNeeded(
    filteredByAccountPositions.filter(p => p.strategyType === "STOCK")
  );
  
  // CS & IC positions - affected by strategy filter, account filter, and sorting
  const openPositions = sortBySymbolIfNeeded(sortByDTEIfNeeded(filterByStrategy(
    filteredByAccountPositions.filter(p => p.strategyType !== "LEAPS" && p.strategyType !== "STOCK")
  )))

  const getPortfolioName = (portfolioId: string | null) => {
    if (!portfolioId || !portfolios) return "—";
    const portfolio = portfolios.find(p => p.id === portfolioId);
    if (!portfolio) return "Unknown";
    
    // Show account number if available
    if (portfolio.accountNumber) {
      return `${portfolio.name} (${portfolio.accountNumber})`;
    }
    return portfolio.name;
  };

  const getPortfolioDisplayName = (portfolio: Portfolio) => {
    // Use the account number from the portfolio if available
    if (portfolio.accountNumber) {
      return `${portfolio.name} (${portfolio.accountNumber})`;
    }
    return portfolio.name;
  };

  const getMarketDataForSymbol = (symbol: string) => {
    return marketData?.find(data => data.symbol === symbol);
  };

  const getPnL = (positionId: string) => {
    const pnl = pnlData?.positions.find(p => p.positionId === positionId);
    
    // Still loading initial data
    if (!pnlData) {
      return { pl: null, plPercent: null, currentPrice: null, isLoading: true, error: null, dataSource: null };
    }
    
    // Position not found in PnL data or has error
    if (!pnl || pnl.error) {
      return {
        pl: null,
        plPercent: null,
        currentPrice: null,
        isLoading: false,
        error: pnl?.error || 'Price data unavailable',
        dataSource: null
      };
    }
    
    // Valid PnL data
    if (pnl.pnlCents !== null && pnl.pnlPercent !== null) {
      return {
        pl: pnl.pnlCents, // Already in cents for full contract (100 shares)
        plPercent: pnl.pnlPercent.toFixed(1),
        currentPrice: pnl.currentCostCents !== null ? pnl.currentCostCents / 100 : null,
        isLoading: false,
        error: null,
        dataSource: pnl.dataSource || null
      };
    }
    
    // Fallback
    return { pl: null, plPercent: null, currentPrice: null, isLoading: false, error: 'Unknown error', dataSource: null };
  };

  const handleRefreshPrices = async () => {
    try {
      const [pnlRes, pricesRes] = await Promise.all([
        apiRequest("GET", "/api/positions/pnl?status=order&force=true"),
        apiRequest("GET", "/api/positions/ticker-prices?status=order&force=true"),
      ]);
      const [pnl, prices] = await Promise.all([pnlRes.json(), pricesRes.json()]);
      queryClient.setQueryData(["/api/positions/pnl?status=order"], pnl);
      queryClient.setQueryData(["/api/positions/ticker-prices?status=order"], prices);
    } catch (err) {
      console.error("Failed to refresh prices:", err);
      invalidateAfterPositionChange();
    }
  };

  const handleDTESort = () => {
    if (sortByDTE === null) {
      setSortByDTE("asc");
    } else if (sortByDTE === "asc") {
      setSortByDTE("desc");
    } else {
      setSortByDTE(null);
    }
  };

  const getDTESortIcon = () => {
    if (sortByDTE === null) return <ArrowUpDown size={14} />;
    return sortByDTE === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  const handleSymbolSort = () => {
    if (sortBySymbol === null) {
      setSortBySymbol("asc");
    } else if (sortBySymbol === "asc") {
      setSortBySymbol("desc");
    } else {
      setSortBySymbol(null);
    }
  };

  const getSymbolSortIcon = () => {
    if (sortBySymbol === null) return <ArrowUpDown size={14} />;
    return sortBySymbol === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };


  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/positions/${id}/delete`);
      return res.json();
    },
    onSuccess: () => {
      invalidateAfterPositionChange();
      toast({
        title: "Order Deleted",
        description: "The pending order has been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleExecuteOrder = (position: Position) => {
    setExecutingOrderId(position.id);
    
    if (position.strategyType === 'STOCK') {
      setDuplicateInitialValues({
        symbol: position.symbol,
        entryPrice: (position.entryDebitCents || 0) / 100,
        shares: position.contracts,
        portfolioId: position.portfolioId,
        notes: position.notes,
      });
      setIsAddStockOpen(true);
    } else if (position.strategyType === 'LEAPS') {
      setDuplicateInitialValues({
        symbol: position.symbol,
        strike: position.shortStrike,
        expiry: new Date(position.expiry),
        entryDebit: (position.entryDebitCents || 0) / 100,
        entryDelta: position.entryDelta,
        contracts: position.contracts,
        portfolioId: position.portfolioId,
        notes: position.notes,
      });
      setIsAddLeapsOpen(true);
    } else if (position.strategyType === 'IRON_CONDOR') {
      setDuplicateInitialValues({
        symbol: position.symbol,
        putShortStrike: position.shortStrike,
        putLongStrike: position.longStrike,
        callShortStrike: position.callShortStrike,
        callLongStrike: position.callLongStrike,
        expiry: new Date(position.expiry),
        entryCredit: (position.entryCreditCents || 0) / 100,
        contracts: position.contracts,
        portfolioId: position.portfolioId,
        notes: position.notes,
      });
      setIsAddIronCondorOpen(true);
    } else {
      setDuplicateInitialValues({
        symbol: position.symbol,
        type: position.type,
        shortStrike: position.shortStrike,
        longStrike: position.longStrike,
        expiry: new Date(position.expiry),
        entryCredit: (position.entryCreditCents || 0) / 100,
        contracts: position.contracts,
        portfolioId: position.portfolioId,
        notes: position.notes,
      });
      setIsAddTradeOpen(true);
    }
  };

  const handleDeletePosition = (id: string, symbol: string) => {
    if (confirm(`Delete position ${symbol}?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <PageSEO 
        title="Pending Positions" 
        description="Manage your pending options trades waiting for execution. Track orders and entry signals for credit spreads, iron condors, and LEAPS."
      />
      <PositionsSubnav />
      <div className="p-4 sm:p-8">
      {!isAuthenticated && (
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/30 mb-8">
          <CardContent className="p-4 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3">Pending Orders - Automate Your Entries</h2>
            <p className="text-muted-foreground text-base mb-6">
              Set limit orders to automatically enter positions when optimal price conditions are met.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Scheduled Entries</div>
                  <div className="text-xs text-muted-foreground">Execute trades when target prices are reached</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Price Alerts</div>
                  <div className="text-xs text-muted-foreground">Get notified when order conditions are met</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Risk Management</div>
                  <div className="text-xs text-muted-foreground">Pre-define entry criteria and max loss limits</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Pending Orders</h2>
            <p className="text-sm text-muted-foreground">Orders awaiting execution</p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="button-add-order">
                  <Plus className="mr-2" size={16} />
                  Order
                  <ChevronDown className="ml-2" size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsAddTradeOpen(true)} data-testid="menu-add-credit-spread">
                  <span className="font-medium">Credit Spread</span>
                  <span className="text-xs text-muted-foreground ml-2">PUT or CALL spread</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsAddIronCondorOpen(true)} data-testid="menu-add-iron-condor">
                  <span className="font-medium">Iron Condor</span>
                  <span className="text-xs text-muted-foreground ml-2">4-leg strategy</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsAddLeapsOpen(true)} data-testid="menu-add-leaps">
                  <span className="font-medium">LEAPS</span>
                  <span className="text-xs text-muted-foreground ml-2">Long CALL option</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsAddStockOpen(true)} data-testid="menu-add-stock">
                  <span className="font-medium">Stock</span>
                  <span className="text-xs text-muted-foreground ml-2">Long equity</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading positions...</p>
        </div>
      ) : openPositions.length > 0 || openLeapsPositions.length > 0 ? (
        <>
          {/* Open Positions */}
          {openPositions.length > 0 && (
            <div className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-lg sm:text-xl font-semibold">Open CS & IC Positions ({openPositions.length})</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                    <SelectTrigger className="w-[140px] sm:w-[180px]" data-testid="select-strategy-filter">
                      <SelectValue placeholder="All strategies" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Strategies</SelectItem>
                      <SelectItem value="iron_condor">Iron Condor</SelectItem>
                      <SelectItem value="call_spread">Call Spread</SelectItem>
                      <SelectItem value="put_spread">Put Spread</SelectItem>
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
                      <TableHead>
                        <button
                          onClick={handleSymbolSort}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Symbol
                          {getSymbolSortIcon()}
                        </button>
                      </TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Strategy</TableHead>
                      <TableHead>Strikes</TableHead>
                      <TableHead>B/E</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>
                        <button
                          onClick={handleDTESort}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          DTE
                          {getDTESortIcon()}
                        </button>
                      </TableHead>
                      <TableHead>Entry</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Max Loss</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openPositions.map((position) => {
                      const { pl, plPercent, currentPrice, isLoading: isPnLItemLoading, error: pnlError, dataSource } = getPnL(position.id);
                      const contracts = position.contracts || 1;
                      // Tiger: pl is already total P/L in cents for all contracts
                      // Manual: pl is per-share cents, need to multiply by 100 (shares/contract) and contracts
                      const totalPL = pl !== null ? (dataSource === 'tiger' ? pl : pl * 100 * contracts) : null;
                      const dte = calculateDTE(position.expiry);
                      const tickerPrice = tickerPrices?.prices[position.symbol];

                      return (
                        <TableRow key={position.id} className="table-row-hover" data-testid={`position-${position.symbol}`}>
                          <TableCell>
                            <div>
                              <span className="font-semibold mono text-base">{position.symbol}</span>
                              <div className="text-xs text-muted-foreground">
                                ({contracts} contract{contracts > 1 ? 's' : ''})
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {isPricesLoading ? (
                              <div className="text-xs text-muted-foreground">Loading...</div>
                            ) : tickerPrice ? (
                              <div>
                                <div className="text-sm font-medium">
                                  {formatCurrencySimple(tickerPrice)}
                                </div>
                                {(() => {
                                  const symbolMarketData = getMarketDataForSymbol(position.symbol);
                                  if (symbolMarketData?.change !== null && symbolMarketData?.change !== undefined) {
                                    const change = symbolMarketData.change;
                                    return (
                                      <div className={`text-xs flex items-center gap-0.5 ${change >= 0 ? 'text-success' : 'text-destructive'}`}>
                                        {change > 0 ? <TrendingUp size={10} /> : change < 0 ? <TrendingDown size={10} /> : null}
                                        <span>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">—</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {position.strategyType === "IRON_CONDOR" ? (
                              <span className="px-2 py-1 text-xs rounded font-medium bg-primary/20 text-primary">
                                Iron Condor
                              </span>
                            ) : (
                              <span
                                className={`px-2 py-1 text-xs rounded font-medium ${
                                  position.type === "PUT"
                                    ? "bg-success/20 text-success"
                                    : "bg-destructive/20 text-destructive"
                                }`}
                              >
                                {position.type} Spread
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {position.strategyType === "IRON_CONDOR" ? (
                              <div className="space-y-1">
                                <div className="mono text-[11px]">
                                  <span className="text-blue-600 dark:text-blue-400">C: {position.callShortStrike}/{position.callLongStrike}</span>
                                </div>
                                <div className="mono text-[11px]">
                                  <span className="text-purple-600 dark:text-purple-400">P: {position.shortStrike}/{position.longStrike}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="mono text-xs">
                                {position.shortStrike}/{position.longStrike}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              if (!position.entryCreditCents) return <span className="text-xs text-muted-foreground">—</span>;
                              const entryCredit = position.entryCreditCents / 100;
                              if (position.strategyType === "IRON_CONDOR") {
                                const lowerBE = (position.shortStrike || 0) - entryCredit;
                                const upperBE = (position.callShortStrike || 0) + entryCredit;
                                const currentTickerPrice = tickerPrices?.prices[position.symbol];
                                const showWarning = currentTickerPrice !== null && currentTickerPrice !== undefined && (
                                  Math.abs(currentTickerPrice - upperBE) <= 5 || 
                                  Math.abs(currentTickerPrice - lowerBE) <= 5
                                );
                                return (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm">{formatCurrencySimple(upperBE)}</span>
                                      {showWarning && (
                                        <span title="Price within 5 points of break-even">
                                          <AlertTriangle size={12} className="text-orange-600 dark:text-orange-500" />
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm">{formatCurrencySimple(lowerBE)}</div>
                                  </div>
                                );
                              } else {
                                const be = position.type === "PUT"
                                  ? (position.shortStrike || 0) - entryCredit
                                  : (position.shortStrike || 0) + entryCredit;
                                return <span className="text-sm">{formatCurrencySimple(be)}</span>;
                              }
                            })()}
                          </TableCell>
                          <TableCell>
                            <span className="mono text-xs">
                              {format(new Date(position.expiry), "dd/MM/yyyy")}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="mono text-xs font-medium">
                                {dte}
                              </span>
                              {dte < 28 && (
                                <span title="DTE < 28 days">
                                  <AlertTriangle size={14} className="text-orange-600 dark:text-orange-500" />
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            {position.entryCreditCents ? (
                              <span className="text-sm font-semibold">
                                {formatCurrencySimple(position.entryCreditCents / 100)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isPnLItemLoading ? (
                              <div className="text-xs text-muted-foreground">Loading...</div>
                            ) : pnlError ? (
                              <div className="text-xs text-muted-foreground" title={pnlError}>—</div>
                            ) : currentPrice !== null ? (
                              <span className={`text-sm ${flashingPositions.has(position.id) ? 'flash-update' : ''}`}>
                                {formatCurrencySimple(currentPrice)}
                              </span>
                            ) : (
                              <div className="text-xs text-muted-foreground">—</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              if (!position.entryCreditCents) return <span className="text-xs text-muted-foreground">—</span>;
                              const maxProfit = position.entryCreditCents / 100;
                              if (position.strategyType === "IRON_CONDOR") {
                                if (!position.longStrike) return <span className="text-xs text-muted-foreground">—</span>;
                                const putSpreadWidth = Math.abs(position.longStrike - (position.shortStrike || 0));
                                const callSpreadWidth = Math.abs((position.callLongStrike || 0) - (position.callShortStrike || 0));
                                const maxSpreadWidth = Math.max(putSpreadWidth, callSpreadWidth);
                                const maxLossPerContractCents = (maxSpreadWidth * 100) - position.entryCreditCents;
                                const maxLoss = maxLossPerContractCents / 100;
                                const rr = maxProfit > 0 ? (maxLoss / maxProfit).toFixed(2) : "0.00";
                                return (
                                  <div>
                                    <p className="text-sm text-destructive font-semibold">
                                      {formatCurrencySimple(maxLoss)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      (1 : {rr})
                                    </p>
                                  </div>
                                );
                              } else {
                                if (!position.longStrike) return <span className="text-xs text-muted-foreground">—</span>;
                                const spreadWidth = Math.abs(position.longStrike - (position.shortStrike || 0));
                                const maxLossPerContractCents = (spreadWidth * 100) - position.entryCreditCents;
                                const maxLoss = maxLossPerContractCents / 100;
                                const rr = maxProfit > 0 ? (maxLoss / maxProfit).toFixed(2) : "0.00";
                                return (
                                  <div>
                                    <p className="text-sm text-destructive font-semibold">
                                      {formatCurrencySimple(maxLoss)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      (1 : {rr})
                                    </p>
                                  </div>
                                );
                              }
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">{getPortfolioName(position.portfolioId)}</span>
                              {dataSource === 'tiger' && (
                                <span 
                                  className="text-[9px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-700 dark:text-orange-400"
                                  title="Data from Tiger Brokers"
                                >
                                  🐯
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="grid grid-cols-2 gap-1.5 w-fit">
                              <button 
                                onClick={() => handleEditPosition(position)}
                                className="text-primary hover:text-primary/80" 
                                data-testid={`button-edit-${position.symbol}`}
                                title="Edit Position"
                              >
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={() => handleDuplicatePosition(position)}
                                className="text-muted-foreground hover:text-primary" 
                                data-testid={`button-duplicate-${position.symbol}`}
                                title="Duplicate Position"
                              >
                                <Copy size={16} />
                              </button>
                              <button 
                                onClick={() => handleExecuteOrder(position)}
                                className="text-success hover:text-success/80" 
                                data-testid={`button-execute-${position.symbol}`}
                                title="Execute Order"
                              >
                                <span className="text-lg">▶</span>
                              </button>
                              <button
                                className="text-muted-foreground hover:text-destructive"
                                data-testid={`button-delete-${position.symbol}`}
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
                    {/* Subtotal Row for Open Positions */}
                    <TableRow className="bg-muted/30 font-semibold border-t-2 border-border">
                      <TableCell colSpan={8} className="text-right">
                        Total Orders:
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold text-foreground">{openPositions.length}</p>
                      </TableCell>
                      <TableCell colSpan={1}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* LEAPS Positions */}
          {openLeapsPositions.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4">Open LEAPS Positions ({openLeapsPositions.length})</h3>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button
                          onClick={handleSymbolSort}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Symbol
                          {getSymbolSortIcon()}
                        </button>
                      </TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Strike</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>DTE</TableHead>
                      <TableHead>Entry</TableHead>
                      <TableHead>Entry Δ</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Current Δ</TableHead>
                      <TableHead>Extrinsic</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openLeapsPositions.map((position) => {
                      const { pl, plPercent, currentPrice, isLoading: isPnLItemLoading, error: pnlError, dataSource } = getPnL(position.id);
                      const contracts = position.contracts || 1;
                      // Tiger: pl is already total P/L in cents for all contracts
                      // Manual: pl is per-share cents, need to multiply by 100 (shares/contract) and contracts
                      const totalPL = pl !== null ? (dataSource === 'tiger' ? pl : pl * 100 * contracts) : null;
                      const dte = calculateDTE(position.expiry);
                      const tickerPrice = tickerPrices?.prices[position.symbol];
                      
                      return (
                        <TableRow key={position.id} className="table-row-hover" data-testid={`leaps-position-${position.symbol}`}>
                          <TableCell>
                            <div>
                              <span className="font-semibold mono text-base">{position.symbol}</span>
                              <div className="text-xs text-muted-foreground">
                                ({contracts} contract{contracts > 1 ? 's' : ''})
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {isPricesLoading ? (
                              <div className="text-xs text-muted-foreground">Loading...</div>
                            ) : tickerPrice ? (
                              <div>
                                <div className="text-sm font-medium">
                                  {formatCurrencySimple(tickerPrice)}
                                </div>
                                {(() => {
                                  const symbolMarketData = getMarketDataForSymbol(position.symbol);
                                  if (symbolMarketData?.change !== null && symbolMarketData?.change !== undefined) {
                                    const change = symbolMarketData.change;
                                    return (
                                      <div className={`text-xs flex items-center gap-0.5 ${change >= 0 ? 'text-success' : 'text-destructive'}`}>
                                        {change > 0 ? <TrendingUp size={10} /> : change < 0 ? <TrendingDown size={10} /> : null}
                                        <span>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">—</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{formatCurrencySimple(position.shortStrike || 0)}</span>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{format(new Date(position.expiry), "dd/MM/yyyy")}</div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium mono ${
                              dte <= 21 ? 'bg-destructive/20 text-destructive' : 
                              dte <= 45 ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400' : 
                              'bg-muted text-muted-foreground'
                            }`} data-testid={`leaps-dte-${position.symbol}`}>
                              {dte}
                            </span>
                          </TableCell>
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            {position.entryDebitCents ? (
                              <div className="text-sm font-semibold text-destructive">
                                {formatCurrencySimple(position.entryDebitCents / 100)}
                              </div>
                            ) : (
                              <div className="text-muted-foreground">—</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {position.entryDelta ? (
                              <div className="mono text-xs">{position.entryDelta.toFixed(2)}</div>
                            ) : (
                              <div className="text-xs text-muted-foreground">—</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {isPnLItemLoading ? (
                              <div className="text-xs text-muted-foreground">Loading...</div>
                            ) : pnlError ? (
                              <div className="text-xs text-muted-foreground" title={pnlError}>—</div>
                            ) : currentPrice !== null ? (
                              <span className="text-sm">
                                {formatCurrencySimple(currentPrice)}
                              </span>
                            ) : (
                              <div className="text-muted-foreground">—</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-muted-foreground">—</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-muted-foreground">—</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs">{getPortfolioName(position.portfolioId)}</span>
                              {dataSource === 'tiger' && (
                                <span 
                                  className="text-[9px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-700 dark:text-orange-400"
                                  title="Data from Tiger Brokers"
                                >
                                  🐯
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="grid grid-cols-2 gap-1.5 w-fit">
                              <button 
                                onClick={() => handleEditPosition(position)}
                                className="text-primary hover:text-primary/80" 
                                data-testid={`button-edit-leaps-${position.symbol}`}
                                title="Edit Position"
                              >
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={() => handleDuplicatePosition(position)}
                                className="text-muted-foreground hover:text-primary" 
                                data-testid={`button-duplicate-leaps-${position.symbol}`}
                                title="Duplicate Position"
                              >
                                <Copy size={16} />
                              </button>
                              <button 
                                onClick={() => handleExecuteOrder(position)}
                                className="text-success hover:text-success/80" 
                                data-testid={`button-execute-leaps-${position.symbol}`}
                                title="Execute Order"
                              >
                                <span className="text-lg">▶</span>
                              </button>
                              <button
                                className="text-muted-foreground hover:text-destructive"
                                data-testid={`button-delete-leaps-${position.symbol}`}
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
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

        </>
      ) : (
        <EmptyState
          title="No pending orders"
          description="Create pending orders to automatically enter positions at specific price points."
          cta={{
            label: "Add Position",
            onClick: () => setIsAddTradeOpen(true),
          }}
        />
      )}

      <AddTradeModal 
        open={isAddTradeOpen} 
        onOpenChange={(open) => {
          setIsAddTradeOpen(open);
          if (!open) {
            setDuplicateInitialValues(null);
            setExecutingOrderId(null);
          }
        }} 
        status="order"
        initialValues={duplicateInitialValues}
        executingOrderId={executingOrderId}
      />
      <AddIronCondorModal 
        open={isAddIronCondorOpen} 
        onOpenChange={(open) => {
          setIsAddIronCondorOpen(open);
          if (!open) {
            setDuplicateInitialValues(null);
            setExecutingOrderId(null);
          }
        }} 
        status="order"
        initialValues={duplicateInitialValues}
        executingOrderId={executingOrderId}
      />
      <AddLeapsModal 
        open={isAddLeapsOpen} 
        onOpenChange={(open) => {
          setIsAddLeapsOpen(open);
          if (!open) {
            setDuplicateInitialValues(null);
            setExecutingOrderId(null);
          }
        }} 
        status="order"
        initialValues={duplicateInitialValues}
        executingOrderId={executingOrderId}
      />
      <AddStockModal
        open={isAddStockOpen}
        onOpenChange={(open) => {
          setIsAddStockOpen(open);
          if (!open) {
            setDuplicateInitialValues(null);
            setExecutingOrderId(null);
          }
        }}
        status="order"
        initialValues={duplicateInitialValues}
        executingOrderId={executingOrderId}
      />
      <EditPositionModal open={isEditPositionOpen} onOpenChange={setIsEditPositionOpen} position={selectedPosition} />
      <EditIronCondorModal open={isEditIronCondorOpen} onOpenChange={setIsEditIronCondorOpen} position={selectedPosition} />
      <EditLeapsModal open={isEditLeapsOpen} onOpenChange={setIsEditLeapsOpen} position={selectedPosition} />
      <ClosePositionModal open={isClosePositionOpen} onOpenChange={setIsClosePositionOpen} position={selectedPosition} />
      <EditCloseModal open={isEditCloseOpen} onOpenChange={setIsEditCloseOpen} position={selectedPosition} />
      </div>
    </>
  );
}
