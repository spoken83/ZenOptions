import { useState, useEffect, useRef, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, RefreshCw, Trash2, X, TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Copy, Download, AlertTriangle, Bell, Shield, Info, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { PageSEO } from "@/components/seo/PageSEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import AddCoveredCallModal from "@/components/modals/add-covered-call-modal";
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
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  zenStatus?: string;
  guidanceText?: string;
  guidanceDetails?: {
    currentSituation: string;
    systematicRule: string;
    decisionPoints: string[];
  };
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

export default function PositionsOpen() {
  const [isAddTradeOpen, setIsAddTradeOpen] = useState(false);
  const [isAddIronCondorOpen, setIsAddIronCondorOpen] = useState(false);
  const [isAddLeapsOpen, setIsAddLeapsOpen] = useState(false);
  const [isAddCoveredCallOpen, setIsAddCoveredCallOpen] = useState(false);
  const [isEditPositionOpen, setIsEditPositionOpen] = useState(false);
  const [isEditIronCondorOpen, setIsEditIronCondorOpen] = useState(false);
  const [isEditLeapsOpen, setIsEditLeapsOpen] = useState(false);
  const [isClosePositionOpen, setIsClosePositionOpen] = useState(false);
  const [isEditCloseOpen, setIsEditCloseOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [zenStatusFilter, setZenStatusFilter] = useState<string>("all");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [sortByDTE, setSortByDTE] = useState<"asc" | "desc" | null>("asc");
  const [sortBySymbol, setSortBySymbol] = useState<"asc" | "desc" | null>(null);
  const [duplicateInitialValues, setDuplicateInitialValues] = useState<any>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isPreLoginMode, isAuthenticated } = useAuth();

  // Tiger Brokers sync mutation
  const syncTigerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/positions/sync-tiger');
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/positions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/positions/pnl'] });
      
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

  // PMCC: Link short call to LEAPS mutation
  const linkPositionMutation = useMutation({
    mutationFn: async ({ positionId, parentLeapsId }: { positionId: string; parentLeapsId: string }) => {
      const res = await apiRequest('POST', `/api/positions/${positionId}/link`, { parentLeapsId });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/positions'] });
      toast({
        title: "Position Linked",
        description: "Short call linked to LEAPS for PMCC tracking",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Link Failed",
        description: error.message || "Failed to link position",
        variant: "destructive",
      });
    },
  });

  // PMCC: Unlink short call from LEAPS mutation
  const unlinkPositionMutation = useMutation({
    mutationFn: async (positionId: string) => {
      const res = await apiRequest('POST', `/api/positions/${positionId}/unlink`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/positions'] });
      toast({
        title: "Position Unlinked",
        description: "Short call unlinked from LEAPS",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unlink Failed",
        description: error.message || "Failed to unlink position",
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
    queryKey: ["/api/positions?status=open"],
  });

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const { data: settings } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });
  
  const tigerAccountNumber = settings?.find(s => s.key === "tiger_account_number")?.value || "";

  const { data: tickerPrices, isLoading: isPricesLoading } = useQuery<TickerPricesResponse>({
    queryKey: ["/api/positions/ticker-prices?status=open"],
    staleTime: 55 * 1000, // 55 seconds (align with 60s cache refresh)
    refetchInterval: 60000, // Refresh every 60 seconds
    enabled: !!positions && positions.length > 0,
  });

  const { data: marketData } = useQuery<MarketData[]>({
    queryKey: ["/api/watchlist-market-data"],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: pnlData, isLoading: isPnLLoading, refetch: refetchPnL } = useQuery<PnLResponse>({
    queryKey: ["/api/positions/pnl"],
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
    if (strategyFilter === "covered_call") return positionsList.filter(p => p.strategyType === "COVERED_CALL");
    if (strategyFilter === "call_spread") return positionsList.filter(p => p.type === "CALL" && p.strategyType !== "IRON_CONDOR" && p.strategyType !== "LEAPS" && p.strategyType !== "COVERED_CALL");
    if (strategyFilter === "put_spread") return positionsList.filter(p => p.type === "PUT" && p.strategyType !== "IRON_CONDOR" && p.strategyType !== "LEAPS");
    return positionsList;
  };

  const filterBySymbol = (positionsList: Position[]) => {
    if (!symbolFilter) return positionsList;
    return positionsList.filter(p => p.symbol.toLowerCase().includes(symbolFilter.toLowerCase()));
  };

  const filterByZenStatus = (positionsList: Position[]) => {
    if (zenStatusFilter === "all") return positionsList;
    
    // Don't filter if PnL data is still loading
    if (!pnlData) return positionsList;
    
    return positionsList.filter(p => {
      const pnl = pnlData.positions.find(item => item.positionId === p.id);
      if (!pnl || !pnl.zenStatus) return false;
      const zenStatus = pnl.zenStatus.toLowerCase();
      return zenStatus === zenStatusFilter.toLowerCase();
    });
  };

  // Track if user has ANY positions (before filtering) to differentiate empty states
  const hasAnyPositions = (positions || []).length > 0;
  const hasActiveFilters = strategyFilter !== "all" || zenStatusFilter !== "all" || accountFilter !== "all" || symbolFilter !== "";
  
  // Separate LEAPS positions from credit spreads and iron condors FIRST, then apply filters separately
  const filteredByAccountPositions = filterByAccount(positions || []);
  
  // LEAPS positions - affected by zenStatus filter, symbol filter, account filter and sorting
  const openLeapsPositions = sortBySymbolIfNeeded(sortByDTEIfNeeded(filterBySymbol(filterByZenStatus(
    filteredByAccountPositions.filter(p => p.strategyType === "LEAPS")
  ))));
  
  // Get all positions that are linked to a LEAPS (for PMCC display)
  const linkedPositionIds = new Set(
    filteredByAccountPositions
      .filter(p => p.linkedPositionId)
      .map(p => p.id)
  );
  
  // Helper to get linked short calls for a LEAPS position
  const getLinkedPositions = (leapsId: string) => {
    return filteredByAccountPositions.filter(p => p.linkedPositionId === leapsId);
  };
  
  // CS & IC positions - exclude linked positions (they show under their parent LEAPS)
  const openPositions = sortBySymbolIfNeeded(sortByDTEIfNeeded(filterBySymbol(filterByZenStatus(filterByStrategy(
    filteredByAccountPositions.filter(p => p.strategyType !== "LEAPS" && !p.linkedPositionId)
  )))))
  
  // Check if filters resulted in no matches (has positions but filtered out)
  const filtersResultedInNoMatches = hasAnyPositions && hasActiveFilters && openPositions.length === 0 && openLeapsPositions.length === 0;

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
      return { 
        pl: null, 
        plPercent: null, 
        currentPrice: null, 
        isLoading: true, 
        error: null, 
        dataSource: null,
        zenStatus: null,
        guidanceText: null,
        guidanceDetails: null
      };
    }
    
    // Position not found in PnL data or has error
    if (!pnl || pnl.error) {
      return {
        pl: null,
        plPercent: null,
        currentPrice: null,
        isLoading: false,
        error: pnl?.error || 'Price data unavailable',
        dataSource: null,
        zenStatus: null,
        guidanceText: null,
        guidanceDetails: null
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
        dataSource: pnl.dataSource || null,
        zenStatus: pnl.zenStatus || null,
        guidanceText: pnl.guidanceText || null,
        guidanceDetails: pnl.guidanceDetails || null
      };
    }
    
    // Fallback
    return { pl: null, plPercent: null, currentPrice: null, isLoading: false, error: 'Unknown error', dataSource: null };
  };

  const handleRefreshPrices = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/positions/pnl"] });
    queryClient.invalidateQueries({ queryKey: ["/api/positions/ticker-prices"] });
    refetchPnL();
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
    onSuccess: (_data, deletedId) => {
      // Optimistically update the cache by removing the deleted position
      queryClient.setQueryData<Position[]>(["/api/positions"], (old) => {
        return old ? old.filter(p => p.id !== deletedId) : [];
      });
      
      // Also invalidate to ensure fresh data on next fetch
      queryClient.invalidateQueries({ queryKey: ["/api/positions/pnl"] });
    }
  });

  const handleDeletePosition = (id: string, symbol: string) => {
    if (confirm(`Delete position ${symbol}?`)) {
      deleteMutation.mutate(id);
    }
  };

  // Portfolio ZenStatus Dashboard Component
  const PortfolioZenStatusDashboard = () => {
    // Count positions by zenStatus
    const statusCounts = {
      zen: 0,
      monitor: 0,
      profit: 0,
      action: 0
    };

    if (pnlData?.positions) {
      pnlData.positions.forEach(pnl => {
        const status = pnl.zenStatus?.toLowerCase();
        if (status === 'zen') statusCounts.zen++;
        else if (status === 'monitor') statusCounts.monitor++;
        else if (status === 'profit') statusCounts.profit++;
        else if (status === 'action') statusCounts.action++;
      });
    }

    return (
      <div className="bg-white dark:bg-card border border-border rounded-xl p-4 sm:p-5 mb-8 shadow-sm" data-onboarding="zenstatus">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-8">
          <div className="flex-shrink-0">
            <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-1">
              Portfolio Status
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">Systematic guidance for every position</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div 
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{
                background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                color: '#166534',
                border: '1px solid #86efac'
              }}
              data-testid="status-pill-zen"
            >
              <span className="text-sm sm:text-lg font-bold">{statusCounts.zen}</span>
              <span className="text-xs sm:text-sm font-semibold">On Track</span>
            </div>
            <div 
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                color: '#92400e',
                border: '1px solid #fcd34d'
              }}
              data-testid="status-pill-monitor"
            >
              <span className="text-sm sm:text-lg font-bold">{statusCounts.monitor}</span>
              <span className="text-xs sm:text-sm font-semibold">Monitor</span>
            </div>
            <div 
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                color: '#1e40af',
                border: '1px solid #93c5fd'
              }}
              data-testid="status-pill-profit"
            >
              <span className="text-sm sm:text-lg font-bold">{statusCounts.profit}</span>
              <span className="text-xs sm:text-sm font-semibold">Profit Ready</span>
            </div>
            <div 
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{
                background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                color: '#991b1b',
                border: '1px solid #fca5a5'
              }}
              data-testid="status-pill-action"
            >
              <span className="text-sm sm:text-lg font-bold">{statusCounts.action}</span>
              <span className="text-xs sm:text-sm font-semibold">Action</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <PageSEO 
        title="Open Positions" 
        description="Track your credit spreads, iron condors, and LEAPS positions with real-time P/L and automated alerts."
      />
      <PositionsSubnav />
      <div className="p-4 sm:p-8">
      {!isAuthenticated && (
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/30 mb-8">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold text-foreground mb-3">Position Tracking - Monitor Your Trades</h2>
            <p className="text-muted-foreground text-base mb-6">Track your credit spreads, iron condors, and LEAPS positions with real-time P/L and automated alerts.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Real-Time P/L</div>
                  <div className="text-xs text-muted-foreground">Live profit/loss tracking for all open positions</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Smart Alerts</div>
                  <div className="text-xs text-muted-foreground">50% take-profit, 2x stop-loss, 21 DTE management</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Risk Management</div>
                  <div className="text-xs text-muted-foreground">Max loss tracking and position sizing</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Option Positions Management</h2>
            {pnlData?.lastUpdated && openPositions.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Prices updated: {format(toZonedTime(new Date(pnlData.lastUpdated), "America/New_York"), "MMM dd, yyyy h:mm a")} ET
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {openPositions.length > 0 && (
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleRefreshPrices}
                disabled={isPnLLoading}
                data-testid="button-refresh-prices"
                title="Refresh Prices"
              >
                <RefreshCw className={isPnLLoading ? 'animate-spin' : ''} size={16} />
              </Button>
            )}
            {!isPreLoginMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncTigerMutation.mutate()}
                disabled={syncTigerMutation.isPending}
                data-testid="button-sync-tiger"
                title="Sync positions from Tiger Brokers"
                className="text-xs sm:text-sm"
              >
                <Download className={syncTigerMutation.isPending ? 'animate-pulse mr-1 sm:mr-2' : 'mr-1 sm:mr-2'} size={14} />
                <span className="hidden sm:inline">{syncTigerMutation.isPending ? 'Syncing...' : 'Sync from Tiger'}</span>
                <span className="sm:hidden">{syncTigerMutation.isPending ? '...' : 'Sync'}</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="text-xs sm:text-sm" data-testid="button-add-position" data-onboarding="add-position-button">
                  <Plus className="mr-1 sm:mr-2" size={14} />
                  <span className="hidden sm:inline">Position</span>
                  <span className="sm:hidden">Add</span>
                  <ChevronDown className="ml-1 sm:ml-2" size={14} />
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
                <DropdownMenuItem onClick={() => setIsAddCoveredCallOpen(true)} data-testid="menu-add-covered-call">
                  <span className="font-medium">Covered Call</span>
                  <span className="text-xs text-muted-foreground ml-2">for PMCC</span>
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
      ) : hasAnyPositions ? (
        <>
          {/* Portfolio ZenStatus Dashboard - always show when user has any positions */}
          <PortfolioZenStatusDashboard />

          <Tabs defaultValue={openPositions.length > 0 ? "credit" : "debit"} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="credit">Credit Strategies ({openPositions.length})</TabsTrigger>
              <TabsTrigger value="debit">Debit Strategies ({openLeapsPositions.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="credit">
          {/* Credit Strategies - Always show filters when user has any positions */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 className="text-lg sm:text-xl font-semibold">Credit Strategies ({openPositions.length})</h3>
              <div className="flex gap-2 flex-wrap">
                <Input
                  placeholder="Filter symbol..."
                  value={symbolFilter}
                  onChange={(e) => setSymbolFilter(e.target.value)}
                  className="w-[110px] sm:w-[140px] text-xs sm:text-sm"
                />
                <Select value={strategyFilter} onValueChange={setStrategyFilter}>
                  <SelectTrigger className="w-[130px] sm:w-[160px] text-xs sm:text-sm" data-testid="select-strategy-filter">
                    <SelectValue placeholder="Strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Strategies</SelectItem>
                    <SelectItem value="iron_condor">Iron Condor</SelectItem>
                    <SelectItem value="call_spread">Call Spread</SelectItem>
                    <SelectItem value="put_spread">Put Spread</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={zenStatusFilter} onValueChange={setZenStatusFilter}>
                  <SelectTrigger className="w-[110px] sm:w-[140px] text-xs sm:text-sm" data-testid="select-zenstatus-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="zen">✅ ZEN</SelectItem>
                    <SelectItem value="profit">🎯 PROFIT</SelectItem>
                    <SelectItem value="monitor">👁️ MONITOR</SelectItem>
                    <SelectItem value="action">⚠️ ACTION</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="w-[130px] sm:w-[160px] text-xs sm:text-sm" data-testid="select-account-filter">
                    <SelectValue placeholder="Account" />
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
            
            {/* Show message when filters result in no matches */}
            {filtersResultedInNoMatches && (
              <div className="bg-muted/50 border border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground mb-2">No positions match your current filters.</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSymbolFilter("");
                    setStrategyFilter("all");
                    setZenStatusFilter("all");
                    setAccountFilter("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              </div>
            )}
            
            {openPositions.length > 0 && (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
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
                      <TableHead>
                        <button
                          onClick={handleDTESort}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          DTE
                          {getDTESortIcon()}
                        </button>
                      </TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Strikes</TableHead>
                      <TableHead>BE</TableHead>
                      <TableHead>
                        <div>Credit /</div>
                        <div>Max Loss</div>
                      </TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Unrealized P/L</TableHead>
                      <TableHead>Portfolio</TableHead>
                      <TableHead>ZenStatus</TableHead>
                      <TableHead>Systematic Guidance</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openPositions.map((position) => {
                      const { pl, plPercent, currentPrice, isLoading: isPnLItemLoading, error: pnlError, dataSource, zenStatus, guidanceText, guidanceDetails } = getPnL(position.id);
                      const contracts = position.contracts || 1;
                      const tickerPrice = tickerPrices?.prices[position.symbol];
                      // Tiger: pl is already total P/L in cents for all contracts
                      // Manual: pl is per-share cents, need to multiply by 100 (shares/contract) and contracts
                      const totalPL = pl !== null ? (dataSource === 'tiger' ? pl : pl * 100 * contracts) : null;
                      const dte = calculateDTE(position.expiry);
                      
                      // Calculate break even
                      const entryCredit = (position.entryCreditCents || 0) / 100;
                      let breakEven: number | null = null;
                      if (position.strategyType === "IRON_CONDOR") {
                        // Iron Condor has two BE points - show the PUT side BE (lower)
                        breakEven = position.shortStrike - entryCredit;
                      } else if (position.type === "PUT") {
                        breakEven = position.shortStrike - entryCredit;
                      } else if (position.type === "CALL") {
                        breakEven = position.shortStrike + entryCredit;
                      }

                      // Determine row status class based on ZenStatus
                      const statusClass = zenStatus?.toLowerCase() === 'zen' ? 'zen-status'
                        : zenStatus?.toLowerCase() === 'monitor' ? 'monitor-status'
                        : zenStatus?.toLowerCase() === 'profit' ? 'profit-status'
                        : zenStatus?.toLowerCase() === 'action' ? 'action-status'
                        : '';

                      // Calculate max loss and risk:reward
                      const spreadWidth = position.strategyType === "IRON_CONDOR" 
                        ? ((position.longStrike || 0) - (position.shortStrike || 0)) * 100 * contracts  // PUT spread width
                        : ((position.longStrike || 0) - (position.shortStrike || 0)) * 100 * contracts;
                      const maxLossCents = (position.entryCreditCents || 0) - Math.abs(spreadWidth);
                      const riskReward = (position.entryCreditCents || 0) !== 0 
                        ? (Math.abs(maxLossCents) / (position.entryCreditCents || 1)).toFixed(2)
                        : '0.00';

                      // Get portfolio name
                      const portfolio = portfolios?.find(p => p.id === position.portfolioId);

                      return (
                        <Fragment key={position.id}>
                        <TableRow className={`position-row ${statusClass}`} data-symbol={`${position.symbol}-${position.strategyType}`} data-testid={`position-${position.symbol}`}>
                          {/* 1. Symbol with qty badge */}
                          <TableCell className="symbol-cell" style={{ verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <strong>{position.symbol}</strong>
                              <span className="qty-badge">{contracts}x</span>
                            </div>
                          </TableCell>
                          {/* 2. Price */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
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
                          {/* 3. Strategy */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            {position.strategyType === "IRON_CONDOR" ? "Iron Condor" : `${position.type} Spread`}
                          </TableCell>
                          {/* 4. DTE */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <span className="font-medium">{dte}</span>
                          </TableCell>
                          {/* 5. Expiry */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <span className="text-sm">
                              {format(new Date(position.expiry), "dd/MM/yyyy")}
                            </span>
                          </TableCell>
                          {/* 6. Strikes */}
                          <TableCell className="strikes-cell" style={{ verticalAlign: 'middle' }}>
                            {position.strategyType === "IRON_CONDOR" ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                <div style={{ fontSize: '0.75rem' }}>
                                  <span className="strike-short">{position.shortStrike}</span> / <span className="strike-long">{position.longStrike}</span>
                                </div>
                                <div style={{ fontSize: '0.75rem' }}>
                                  <span className="strike-short">{position.callShortStrike}</span> / <span className="strike-long">{position.callLongStrike}</span>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="strike-short">{position.shortStrike}</span> / <span className="strike-long">{position.longStrike}</span>
                              </div>
                            )}
                          </TableCell>
                          {/* 7. BE (Break Even) */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <span className="text-sm">
                              {breakEven !== null ? 
                                formatCurrencySimple(breakEven) : 
                                '—'
                              }
                            </span>
                          </TableCell>
                          {/* 8. Entry Credit with Max Loss and RR below */}
                          <TableCell className="credit-cell" style={{ verticalAlign: 'middle' }}>
                            <div>
                              <div className="font-semibold">
                                {formatCurrencySimple((position.entryCreditCents || 0) / 100)}
                              </div>
                              <div className="text-xs text-destructive mt-0.5">
                                ML: {formatCurrencySimple(Math.abs(maxLossCents) / 100)}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                RR: 1:{riskReward}
                              </div>
                            </div>
                          </TableCell>
                          {/* 9. Current */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            {isPnLItemLoading ? (
                              <span className="text-muted-foreground">Loading...</span>
                            ) : pnlError ? (
                              <span className="text-muted-foreground">—</span>
                            ) : currentPrice !== null ? (
                              <span className={flashingPositions.has(position.id) ? 'flash-update' : ''}>
                                {formatCurrencySimple(currentPrice)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {/* 10. Unrealized P/L with P/L % below */}
                          <TableCell className={`profit-cell ${totalPL !== null && totalPL >= 0 ? 'positive' : 'negative'}`} style={{ verticalAlign: 'middle' }}>
                            {isPnLItemLoading ? (
                              <span className="text-muted-foreground">Loading...</span>
                            ) : pnlError ? (
                              <span className="text-muted-foreground">—</span>
                            ) : totalPL !== null ? (
                              <div>
                                <strong className={flashingPositions.has(position.id) ? 'flash-update' : ''}>
                                  {formatCurrency(totalPL)}
                                </strong>
                                {plPercent !== null && (
                                  <span className={`pct-cell ${parseFloat(plPercent) >= 0 ? 'positive' : 'negative'}`}>
                                    {parseFloat(plPercent) >= 0 ? '+' : ''}{plPercent}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {/* 11. Portfolio */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <span className="text-sm">{portfolio?.name || '—'}</span>
                          </TableCell>
                          {/* 12. ZenStatus */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            {zenStatus ? (
                              <div className={`status-badge-compact ${zenStatus.toLowerCase()}`}>
                                {zenStatus.toLowerCase() === 'zen' && '✅ ZEN'}
                                {zenStatus.toLowerCase() === 'monitor' && '👁️ MONITOR'}
                                {zenStatus.toLowerCase() === 'profit' && '🎯 PROFIT'}
                                {zenStatus.toLowerCase() === 'action' && '⚠️ ACTION'}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          {/* 13. Systematic Guidance */}
                          <TableCell className="guidance-cell" style={{ verticalAlign: 'middle' }}>
                            {guidanceText ? (
                              <div className="guidance-text">
                                {guidanceText}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          {/* 14. Actions */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
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
                                onClick={() => handleClosePosition(position)}
                                className="text-success hover:text-success/80" 
                                data-testid={`button-close-${position.symbol}`}
                                title="Close Position"
                              >
                                <span className="text-lg">🅲</span>
                              </button>
                              <button
                                className="text-muted-foreground hover:text-destructive"
                                data-testid={`button-delete-${position.symbol}`}
                                onClick={() => handleDeletePosition(position.id, position.symbol)}
                                title="Delete Position"
                                disabled={isPreLoginMode}
                              >
                                <Trash2 size={16} />
                              </button>
                              {/* Link to LEAPS button - only for CALL spreads with matching LEAPS */}
                              {position.type === 'CALL' && position.strategyType === 'CREDIT_SPREAD' && (() => {
                                const matchingLeaps = openLeapsPositions.filter(
                                  l => l.symbol === position.symbol && l.strategyType === 'LEAPS'
                                );
                                if (matchingLeaps.length === 0) return null;
                                
                                return matchingLeaps.length === 1 ? (
                                  <button
                                    onClick={() => linkPositionMutation.mutate({ 
                                      positionId: position.id, 
                                      parentLeapsId: matchingLeaps[0].id 
                                    })}
                                    className="text-muted-foreground hover:text-primary"
                                    title="Link to LEAPS (PMCC)"
                                    disabled={linkPositionMutation.isPending}
                                    data-testid={`button-link-${position.symbol}`}
                                  >
                                    <span className="text-xs">🔗</span>
                                  </button>
                                ) : (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        className="text-muted-foreground hover:text-primary"
                                        title="Link to LEAPS (PMCC)"
                                        disabled={linkPositionMutation.isPending}
                                      >
                                        <span className="text-xs">🔗</span>
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                      {matchingLeaps.map(leaps => (
                                        <DropdownMenuItem 
                                          key={leaps.id}
                                          onClick={() => linkPositionMutation.mutate({ 
                                            positionId: position.id, 
                                            parentLeapsId: leaps.id 
                                          })}
                                        >
                                          {leaps.symbol} ${leaps.shortStrike} exp {format(new Date(leaps.expiry), "MM/dd/yy")}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                );
                              })()}
                            </div>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                      );
                    })}
                    {/* Subtotal Row for Credit Strategies */}
                    <TableRow className="bg-muted/30 font-semibold border-t-2 border-border">
                      <TableCell colSpan={9} className="text-right">
                        Total Unrealised P/L:
                      </TableCell>
                      <TableCell className="font-semibold">
                        {(() => {
                          const totalUnrealised = openPositions.reduce((total, position) => {
                            const { pl, dataSource } = getPnL(position.id);
                            const contracts = position.contracts || 1;
                            const positionPL = pl !== null ? (dataSource === 'tiger' ? pl : pl * 100 * contracts) : 0;
                            return total + positionPL;
                          }, 0);
                          return (
                            <span className={totalUnrealised >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} data-testid="text-subtotal-unrealised">
                              {formatCurrency(totalUnrealised)}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell colSpan={4}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
            </TabsContent>

            <TabsContent value="debit">
          {/* Debit Strategies */}
          <div className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="text-lg sm:text-xl font-semibold">Debit Strategies ({openLeapsPositions.length})</h3>
                <div className="flex gap-2 flex-wrap">
                  <Select value={zenStatusFilter} onValueChange={setZenStatusFilter}>
                    <SelectTrigger className="w-[110px] sm:w-[140px] text-xs sm:text-sm" data-testid="select-leaps-zenstatus-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="zen">✅ ZEN</SelectItem>
                      <SelectItem value="profit">🎯 PROFIT</SelectItem>
                      <SelectItem value="monitor">👁️ MONITOR</SelectItem>
                      <SelectItem value="action">⚠️ ACTION</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={accountFilter} onValueChange={setAccountFilter}>
                    <SelectTrigger className="w-[130px] sm:w-[160px] text-xs sm:text-sm" data-testid="select-leaps-account-filter">
                      <SelectValue placeholder="Account" />
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
                    <TableRow className="bg-secondary/50">
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
                      <TableHead>
                        <button
                          onClick={handleDTESort}
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          DTE
                          {getDTESortIcon()}
                        </button>
                      </TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Strike</TableHead>
                      <TableHead>BE</TableHead>
                      <TableHead>
                        <div>Entry Debit /</div>
                        <div>Max Loss</div>
                      </TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Unrealized P/L</TableHead>
                      <TableHead>Portfolio</TableHead>
                      <TableHead>ZenStatus</TableHead>
                      <TableHead>Systematic Guidance</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openLeapsPositions.map((position) => {
                      const { pl, plPercent, currentPrice, isLoading: isPnLItemLoading, error: pnlError, dataSource, zenStatus, guidanceText, guidanceDetails } = getPnL(position.id);
                      const contracts = position.contracts || 1;
                      const tickerPrice = tickerPrices?.prices[position.symbol];
                      const totalPL = pl !== null ? (dataSource === 'tiger' ? pl : pl * 100 * contracts) : null;
                      const dte = calculateDTE(position.expiry);
                      
                      // Calculate break even for LEAPS (CALL option)
                      const entryDebit = (position.entryDebitCents || 0) / 100;
                      const breakEven = position.shortStrike + entryDebit;
                      
                      // Max loss for LEAPS is the entry debit paid
                      const maxLossCents = Math.abs(position.entryDebitCents || 0);
                      
                      // PMCC Metrics: Calculate total premium collected from linked short calls
                      const linkedPositions = getLinkedPositions(position.id);
                      // PMCC Metrics: entryCreditCents is per-share in cents, multiply by 100 (shares/contract) * contracts
                      const totalPremiumCollectedCents = linkedPositions.reduce((sum, lp) => {
                        return sum + ((lp.entryCreditCents || 0) * 100 * (lp.contracts || 1));
                      }, 0);
                      // Effective cost basis = LEAPS debit (per-share * 100 * contracts) - total premium collected
                      const leapsCostCents = (position.entryDebitCents || 0) * 100 * contracts;
                      const effectiveCostBasisCents = leapsCostCents - totalPremiumCollectedCents;

                      // Determine row status class based on ZenStatus
                      const statusClass = zenStatus?.toLowerCase() === 'zen' ? 'zen-status'
                        : zenStatus?.toLowerCase() === 'monitor' ? 'monitor-status'
                        : zenStatus?.toLowerCase() === 'action' ? 'action-status'
                        : zenStatus?.toLowerCase() === 'profit' ? 'profit-status'
                        : '';

                      // Get portfolio name
                      const portfolio = portfolios?.find(p => p.id === position.portfolioId);

                      return (
                        <Fragment key={position.id}>
                        <TableRow className={`position-row ${statusClass}`} data-symbol={`${position.symbol}-LEAPS`} data-testid={`position-${position.symbol}`}>
                          {/* 1. Symbol with qty badge */}
                          <TableCell className="symbol-cell" style={{ verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <strong>{position.symbol}</strong>
                              <span className="qty-badge">{contracts}x</span>
                            </div>
                          </TableCell>
                          {/* 2. Price */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
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
                          {/* 3. Strategy */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            LEAPS
                          </TableCell>
                          {/* 4. DTE */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <span className="font-medium">{dte}</span>
                          </TableCell>
                          {/* 5. Expiry */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <span className="text-sm">
                              {format(new Date(position.expiry), "dd/MM/yyyy")}
                            </span>
                          </TableCell>
                          {/* 6. Strike */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <span className="text-sm font-medium">
                              {formatCurrencySimple(position.shortStrike)}
                            </span>
                          </TableCell>
                          {/* 7. BE (Break Even) */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <span className="text-sm">
                              {formatCurrencySimple(breakEven)}
                            </span>
                          </TableCell>
                          {/* 8. Entry Debit with Max Loss below + PMCC metrics */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <div>
                              <div className="font-semibold text-destructive">
                                {formatCurrencySimple(entryDebit)}
                              </div>
                              <div className="text-xs text-destructive mt-0.5">
                                ML: {formatCurrencySimple(maxLossCents / 100)}
                              </div>
                              {linkedPositions.length > 0 && (
                                <div className="mt-1 pt-1 border-t border-border/50">
                                  <div className="text-xs text-success">
                                    +{formatCurrencySimple(totalPremiumCollectedCents / 100)} collected
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    ECB: {formatCurrencySimple(effectiveCostBasisCents / 100)}
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          {/* 9. Current */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            {isPnLItemLoading ? (
                              <span className="text-muted-foreground">Loading...</span>
                            ) : pnlError ? (
                              <span className="text-muted-foreground">—</span>
                            ) : currentPrice !== null ? (
                              <span className={flashingPositions.has(position.id) ? 'flash-update' : ''}>
                                {formatCurrencySimple(currentPrice)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {/* 10. Unrealized P/L with P/L % below */}
                          <TableCell className={`profit-cell ${totalPL !== null && totalPL >= 0 ? 'positive' : 'negative'}`} style={{ verticalAlign: 'middle' }}>
                            {isPnLItemLoading ? (
                              <span className="text-muted-foreground">Loading...</span>
                            ) : pnlError ? (
                              <span className="text-muted-foreground">—</span>
                            ) : totalPL !== null ? (
                              <div>
                                <strong className={flashingPositions.has(position.id) ? 'flash-update' : ''}>
                                  {formatCurrency(totalPL)}
                                </strong>
                                {plPercent !== null && (
                                  <span className={`pct-cell ${parseFloat(plPercent) >= 0 ? 'positive' : 'negative'}`}>
                                    {parseFloat(plPercent) >= 0 ? '+' : ''}{plPercent}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {/* 11. Portfolio */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            <span className="text-sm">{portfolio?.name || '—'}</span>
                          </TableCell>
                          {/* 12. ZenStatus */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
                            {zenStatus ? (
                              <div className={`status-badge-compact ${zenStatus.toLowerCase()}`}>
                                {zenStatus.toLowerCase() === 'zen' && '✅ ZEN'}
                                {zenStatus.toLowerCase() === 'monitor' && '👁️ MONITOR'}
                                {zenStatus.toLowerCase() === 'profit' && '🎯 PROFIT'}
                                {zenStatus.toLowerCase() === 'action' && '⚠️ ACTION'}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          {/* 13. Systematic Guidance */}
                          <TableCell className="guidance-cell" style={{ verticalAlign: 'middle' }}>
                            {guidanceText ? (
                              <div className="guidance-text">
                                {guidanceText}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          {/* 14. Actions */}
                          <TableCell style={{ verticalAlign: 'middle' }}>
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
                                onClick={() => handleClosePosition(position)}
                                className="text-success hover:text-success/80" 
                                data-testid={`button-close-${position.symbol}`}
                                title="Close Position"
                              >
                                <span className="text-lg">🅲</span>
                              </button>
                              <button
                                className="text-muted-foreground hover:text-destructive"
                                data-testid={`button-delete-${position.symbol}`}
                                onClick={() => handleDeletePosition(position.id, position.symbol)}
                                title="Delete Position"
                                disabled={isPreLoginMode}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* Linked Short Calls (PMCC) */}
                        {getLinkedPositions(position.id).map((linkedPos) => {
                          const linkedPnL = getPnL(linkedPos.id);
                          const linkedContracts = linkedPos.contracts || 1;
                          const linkedTotalPL = linkedPnL.pl !== null 
                            ? (linkedPnL.dataSource === 'tiger' ? linkedPnL.pl : linkedPnL.pl * 100 * linkedContracts) 
                            : null;
                          const linkedDte = calculateDTE(linkedPos.expiry);
                          
                          return (
                            <TableRow key={linkedPos.id} className="bg-muted/20 border-l-4 border-l-primary/50" data-testid={`linked-position-${linkedPos.symbol}`}>
                              {/* 1. Symbol - indented to show hierarchy */}
                              <TableCell className="pl-8" style={{ verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span className="text-xs text-muted-foreground">↳</span>
                                  <span className="text-sm">{linkedPos.symbol}</span>
                                  <span className="qty-badge text-xs">{linkedContracts}x</span>
                                </div>
                              </TableCell>
                              {/* 2. Price - empty for linked */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <span className="text-xs text-muted-foreground">—</span>
                              </TableCell>
                              {/* 3. Strategy */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <span className="text-xs bg-primary/10 px-2 py-0.5 rounded">Short Call</span>
                              </TableCell>
                              {/* 4. DTE */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <span className="text-sm font-medium">{linkedDte}</span>
                              </TableCell>
                              {/* 5. Expiry */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <span className="text-xs">
                                  {format(new Date(linkedPos.expiry), "dd/MM/yyyy")}
                                </span>
                              </TableCell>
                              {/* 6. Strike */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <span className="text-sm">
                                  {formatCurrencySimple(linkedPos.shortStrike)}/{formatCurrencySimple(linkedPos.longStrike || 0)}
                                </span>
                              </TableCell>
                              {/* 7. BE - N/A for short calls */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <span className="text-xs text-muted-foreground">—</span>
                              </TableCell>
                              {/* 8. Credit received */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <div className="text-sm text-success">
                                  +{formatCurrencySimple((linkedPos.entryCreditCents || 0) / 100)}
                                </div>
                              </TableCell>
                              {/* 9. Current */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                {linkedPnL.currentPrice !== null ? (
                                  <span className="text-sm">{formatCurrencySimple(linkedPnL.currentPrice)}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              {/* 10. Unrealized P/L */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                {linkedTotalPL !== null ? (
                                  <span className={`text-sm font-medium ${linkedTotalPL >= 0 ? 'text-success' : 'text-destructive'}`}>
                                    {formatCurrency(linkedTotalPL)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              {/* 11. Portfolio */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <span className="text-xs text-muted-foreground">—</span>
                              </TableCell>
                              {/* 12. ZenStatus */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <span className="text-xs text-muted-foreground">—</span>
                              </TableCell>
                              {/* 13. Guidance */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <span className="text-xs text-muted-foreground">—</span>
                              </TableCell>
                              {/* 14. Actions */}
                              <TableCell style={{ verticalAlign: 'middle' }}>
                                <div className="flex gap-1.5">
                                  <button 
                                    onClick={() => handleEditPosition(linkedPos)}
                                    className="text-primary hover:text-primary/80" 
                                    title="Edit Position"
                                  >
                                    <Edit size={14} />
                                  </button>
                                  <button 
                                    onClick={() => handleClosePosition(linkedPos)}
                                    className="text-success hover:text-success/80" 
                                    title="Close Position"
                                  >
                                    <span className="text-sm">🅲</span>
                                  </button>
                                  <button
                                    onClick={() => unlinkPositionMutation.mutate(linkedPos.id)}
                                    className="text-muted-foreground hover:text-warning"
                                    title="Unlink from LEAPS"
                                    disabled={unlinkPositionMutation.isPending}
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                      );
                    })}
                    {/* Subtotal Row for Debit Strategies */}
                    <TableRow className="bg-muted/30 font-semibold border-t-2 border-border">
                      <TableCell colSpan={9} className="text-right">
                        Total Unrealised P/L:
                      </TableCell>
                      <TableCell className="font-semibold">
                        {(() => {
                          const totalUnrealised = openLeapsPositions.reduce((total, position) => {
                            const { pl, dataSource } = getPnL(position.id);
                            const contracts = position.contracts || 1;
                            const positionPL = pl !== null ? (dataSource === 'tiger' ? pl : pl * 100 * contracts) : 0;
                            return total + positionPL;
                          }, 0);
                          return (
                            <span className={totalUnrealised >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} data-testid="text-subtotal-leaps-unrealised">
                              {formatCurrency(totalUnrealised)}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell colSpan={4}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
          </Tabs>
        </>
      ) : (
        <>
          {/* Show Portfolio ZenStatus Dashboard even with no positions for onboarding */}
          <PortfolioZenStatusDashboard />
          
          <EmptyState
            title="No open positions yet"
            description="Start tracking your options trades by adding your first position."
            cta={{
              label: "Add Position",
              onClick: () => setIsAddTradeOpen(true),
            }}
          />
        </>
      )}

      {/* Modals */}
      <AddTradeModal
        open={isAddTradeOpen}
        onOpenChange={(open) => {
          setIsAddTradeOpen(open);
          if (!open) setDuplicateInitialValues(null);
        }}
        initialValues={duplicateInitialValues}
      />
      <AddIronCondorModal
        open={isAddIronCondorOpen}
        onOpenChange={(open) => {
          setIsAddIronCondorOpen(open);
          if (!open) setDuplicateInitialValues(null);
        }}
        initialValues={duplicateInitialValues}
      />
      <AddLeapsModal
        open={isAddLeapsOpen}
        onOpenChange={(open) => {
          setIsAddLeapsOpen(open);
          if (!open) setDuplicateInitialValues(null);
        }}
        initialValues={duplicateInitialValues}
      />
      <AddCoveredCallModal
        open={isAddCoveredCallOpen}
        onOpenChange={setIsAddCoveredCallOpen}
      />
      {selectedPosition && (
        <>
          {selectedPosition.strategyType === "IRON_CONDOR" ? (
            <EditIronCondorModal
              open={isEditIronCondorOpen}
              onOpenChange={(open) => {
                setIsEditIronCondorOpen(open);
                if (!open) setSelectedPosition(null);
              }}
              position={selectedPosition}
            />
          ) : selectedPosition.strategyType === "LEAPS" ? (
            <EditLeapsModal
              open={isEditLeapsOpen}
              onOpenChange={(open) => {
                setIsEditLeapsOpen(open);
                if (!open) setSelectedPosition(null);
              }}
              position={selectedPosition}
            />
          ) : (
            <EditPositionModal
              open={isEditPositionOpen}
              onOpenChange={(open) => {
                setIsEditPositionOpen(open);
                if (!open) setSelectedPosition(null);
              }}
              position={selectedPosition}
            />
          )}
          <ClosePositionModal
            open={isClosePositionOpen}
            onOpenChange={(open) => {
              setIsClosePositionOpen(open);
              if (!open) setSelectedPosition(null);
            }}
            position={selectedPosition}
            currentPrice={
              selectedPosition && pnlData?.positions
                ? (() => {
                    const positionPnl = pnlData.positions.find(p => p.positionId === selectedPosition.id);
                    if (positionPnl?.currentCostCents !== null && positionPnl?.currentCostCents !== undefined) {
                      // currentCostCents is per-contract, convert to per-share price
                      return (positionPnl.currentCostCents / (selectedPosition.contracts || 1)) / 100;
                    }
                    return undefined;
                  })()
                : undefined
            }
          />
          {selectedPosition.closedAt && (
            <EditCloseModal
              open={isEditCloseOpen}
              onOpenChange={(open) => {
                setIsEditCloseOpen(open);
                if (!open) setSelectedPosition(null);
              }}
              position={selectedPosition}
            />
          )}
        </>
      )}
    </div>
    </>
  );
}
