import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, LayoutGrid, List, TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Filter, ChartLine, Shield, Info, RefreshCw, Pin, Activity } from "lucide-react";
import { PageSEO } from "@/components/seo/PageSEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import AddTickerModal from "@/components/modals/add-ticker-modal";
import EditTickerModal from "@/components/modals/edit-ticker-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import type { Ticker, Watchlist } from "@shared/schema";

type ViewMode = "card" | "table";
type SortField = "symbol" | "price" | "change";
type SortDirection = "asc" | "desc";
type StochRSIStatus = "overbought" | "oversold" | "neutral";

interface SRLevel {
  value: number;
  confidence: number;
  method: string;
  touches?: number;
  context?: string;
}

interface MarketData {
  symbol: string;
  price: number | null;
  change: number | null;
  stochRSIStatus: string;
  rsiStatus: string;
  rsiValue: number | null;
  stochK: number | null;
  stochD: number | null;
  // New multi-level S/R
  supportLevels: SRLevel[];
  resistanceLevels: SRLevel[];
  srLastUpdated: string | null;
  srSource: string | null;
  // Backward compatibility
  support: number | null;
  resistance: number | null;
}

interface IVData {
  symbol: string;
  atmIv: number | null;
  expectedMove30d: number | null;
}

interface OptionsFlowItem {
  contract: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  volume: number;
  openInterest: number;
  volumeOiRatio: number;
  iv: number | null;
  bid: number;
  ask: number;
  unusualScore: number;
  unusualReason: string;
}

interface OptionsFlowResult {
  symbol: string;
  unusual: OptionsFlowItem[];
  scannedContracts: number;
  fetchedAt: string;
}

export default function Watchlist() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<Ticker | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedStochRSIFilters, setSelectedStochRSIFilters] = useState<StochRSIStatus[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode, isAuthenticated } = useAuth();
  const [flowSymbol, setFlowSymbol] = useState<string | null>(null);

  const { data: watchlistData } = useQuery<Watchlist[]>({
    queryKey: ["/api/watchlist"],
  });

  const { data: tickers, isLoading: tickersLoading } = useQuery<Ticker[]>({
    queryKey: ["/api/tickers"],
  });

  const { data: marketData, isLoading: marketDataLoading } = useQuery<MarketData[]>({
    queryKey: ["/api/watchlist-market-data"],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch ATM IV and 30-day Expected Move data
  const { data: ivData } = useQuery<IVData[]>({
    queryKey: ["/api/watchlist-iv-data"],
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes (matches server cache)
    staleTime: 4 * 60 * 1000, // Consider stale after 4 minutes
  });

  // Options flow — fetched on demand when user clicks the Flow button
  const { data: flowData, isLoading: flowLoading } = useQuery<OptionsFlowResult>({
    queryKey: ["/api/options-flow", flowSymbol],
    queryFn: async () => {
      const res = await fetch(`/api/options-flow/${flowSymbol}`);
      if (!res.ok) throw new Error('Failed to fetch options flow');
      return res.json();
    },
    enabled: !!flowSymbol,
    staleTime: 10 * 60 * 1000,
  });

  const isLoading = tickersLoading || marketDataLoading;

  // Helper to get IV data for a symbol
  const getIVDataForSymbol = (symbol: string): IVData | undefined => {
    return ivData?.find(d => d.symbol === symbol);
  };

  // Separate stocks and indexes
  const stockSymbols = watchlistData?.filter(w => w.type === 'stock').map(w => w.symbol) || [];
  const indexSymbols = watchlistData?.filter(w => w.type === 'index').map(w => w.symbol) || [];
  
  const stockTickers = tickers?.filter(t => stockSymbols.includes(t.symbol)) || [];
  const indexTickers = tickers?.filter(t => indexSymbols.includes(t.symbol)) || [];

  const deleteMutation = useMutation({
    mutationFn: async (symbol: string) => {
      await apiRequest("DELETE", `/api/tickers/${symbol}`);
      await apiRequest("DELETE", `/api/watchlist/${symbol}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist-market-data"] });
      toast({
        title: "Ticker Removed",
        description: "Ticker has been removed from watchlist",
      });
    },
  });

  const refreshSRMutation = useMutation({
    mutationFn: async (tickerId: string) => {
      const response = await apiRequest("POST", `/api/tickers/${tickerId}/refresh-sr`, {});
      return response;
    },
    onSuccess: (data, tickerId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist-market-data"] });
      toast({
        title: "S/R Levels Refreshed",
        description: "Support/Resistance levels have been updated",
      });
    },
    onError: (error: any, tickerId) => {
      const errorData = error?.response?.data;
      if (errorData?.retryAfterSeconds) {
        toast({
          title: "Rate Limited",
          description: `Please wait ${errorData.retryAfterSeconds} seconds before refreshing again.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Refresh Failed",
          description: errorData?.error || "Failed to refresh S/R levels",
          variant: "destructive",
        });
      }
    },
  });

  const refreshAllSRMutation = useMutation({
    mutationFn: async () => {
      const allTickers = [...stockTickers, ...indexTickers];
      
      // Show starting toast
      toast({
        title: "Refreshing S/R Levels",
        description: `Starting bulk refresh for ${allTickers.length} tickers...`,
      });
      
      const results = [];
      for (const ticker of allTickers) {
        try {
          const response = await apiRequest("POST", `/api/tickers/${ticker.id}/refresh-sr`, {});
          results.push({ success: true, symbol: ticker.symbol });
        } catch (error: any) {
          results.push({ success: false, symbol: ticker.symbol, error });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist-market-data"] });
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.length - successCount;
      
      toast({
        title: "✅ Bulk Refresh Complete!",
        description: `Successfully refreshed ${successCount}/${results.length} tickers${failedCount > 0 ? ` (${failedCount} failed)` : ''}`,
        duration: 5000,
      });
    },
    onError: (error) => {
      toast({
        title: "Refresh Failed",
        description: "Failed to start bulk refresh operation",
        variant: "destructive",
      });
    },
  });

  const pinSRLevelMutation = useMutation({
    mutationFn: async ({ symbol, support, resistance }: { symbol: string, support?: number, resistance?: number }) => {
      return await apiRequest("PATCH", `/api/tickers/${symbol}`, { support, resistance });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist-market-data"] });
      toast({
        title: "S/R Level Pinned",
        description: "Selected level has been set as your primary value",
      });
    },
  });

  const handleEdit = (ticker: Ticker) => {
    setSelectedTicker(ticker);
    setIsEditOpen(true);
  };

  const handleDelete = async (symbol: string) => {
    if (confirm(`Are you sure you want to remove ${symbol} from watchlist?`)) {
      deleteMutation.mutate(symbol);
    }
  };

  const getMarketDataForSymbol = (symbol: string): MarketData | undefined => {
    return marketData?.find((data) => data.symbol === symbol);
  };

  const getIndicatorBadgeClass = (status: string) => {
    switch (status) {
      case 'overbought':
        return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
      case 'oversold':
        return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
      case 'neutral':
        return 'bg-muted text-muted-foreground border-border';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const renderIndicatorBadge = (
    status: string, 
    value: number | null, 
    type: 'momentum' | 'signal',
    symbol: string,
    stochD?: number | null
  ) => {
    const displayStatus = status || 'unknown';
    const hasValue = value !== null && value !== undefined;
    
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-help" data-testid={`${type}-indicator-${symbol}`}>
            <span className={`px-2 py-0.5 rounded border text-xs font-medium uppercase ${
              getIndicatorBadgeClass(displayStatus)
            }`}>
              {displayStatus}
            </span>
            {hasValue && <Info size={12} className="text-muted-foreground" />}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" data-testid={`tooltip-${type}-${symbol}`}>
          {type === 'momentum' ? (
            <div className="text-xs">
              <span className="font-semibold">RSI-14:</span> {hasValue ? value.toFixed(1) : '—'}
              <div className="text-muted-foreground mt-1">
                {displayStatus === 'overbought' && '>70: Potential reversal down'}
                {displayStatus === 'oversold' && '<30: Potential reversal up'}
                {displayStatus === 'neutral' && '30-70: Normal range'}
              </div>
            </div>
          ) : (
            <div className="text-xs">
              <span className="font-semibold">StochRSI K:</span> {hasValue ? value.toFixed(1) : '—'}
              {stochD !== null && stochD !== undefined && (
                <span className="ml-2"><span className="font-semibold">D:</span> {stochD.toFixed(1)}</span>
              )}
              <div className="text-muted-foreground mt-1">
                {displayStatus === 'overbought' && '>80: Strong sell signal'}
                {displayStatus === 'oversold' && '<20: Strong buy signal'}
                {displayStatus === 'neutral' && '20-80: Normal range'}
              </div>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  const formatChange = (change: number | null) => {
    if (change === null) return '—';
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  const handlePinSRLevel = (symbol: string, value: number, type: 'Support' | 'Resistance') => {
    if (type === 'Support') {
      pinSRLevelMutation.mutate({ symbol, support: value });
    } else {
      pinSRLevelMutation.mutate({ symbol, resistance: value });
    }
  };

  const renderSRLevels = (
    levels: SRLevel[] | undefined, 
    manualValue: number | null | undefined,
    srSource: string | null | undefined,
    type: 'Support' | 'Resistance', 
    symbol: string
  ) => {
    const levelType = type.toLowerCase();
    
    // TIMESTAMP-BASED PRIORITY: Show whichever was updated most recently (manual or AI)
    // srSource tracks which update happened last based on srLastUpdated
    if (srSource === 'manual' && manualValue !== null && manualValue !== undefined) {
      return (
        <div className="flex items-center gap-1" data-testid={`${levelType}-level-${symbol}`}>
          <span className="font-semibold" data-testid={`text-${levelType}-value-${symbol}`}>${manualValue.toFixed(2)}</span>
          <span className="text-xs text-emerald-600 dark:text-emerald-400" data-testid={`text-${levelType}-source-${symbol}`}>(manual)</span>
        </div>
      );
    }
    
    if (!levels || levels.length === 0) {
      return <span className="text-muted-foreground" data-testid={`status-${levelType}-empty-${symbol}`}>—</span>;
    }

    const topLevel = levels[0];
    
    if (levels.length === 1) {
      // Single level - no tooltip needed
      return (
        <div className="flex items-center gap-1" data-testid={`${levelType}-level-${symbol}`}>
          <span className="font-semibold" data-testid={`text-${levelType}-value-${symbol}`}>${topLevel.value.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground" data-testid={`text-${levelType}-confidence-${symbol}`}>({topLevel.confidence}%)</span>
        </div>
      );
    }

    // Multiple levels - show tooltip with all + pin icons
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-help" data-testid={`${levelType}-level-${symbol}`}>
            <span className="font-semibold" data-testid={`text-${levelType}-value-${symbol}`}>${topLevel.value.toFixed(2)}</span>
            <span className="text-xs text-muted-foreground" data-testid={`text-${levelType}-confidence-${symbol}`}>({topLevel.confidence}%)</span>
            <Info size={12} className="text-muted-foreground" data-testid={`icon-${levelType}-info-${symbol}`} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-sm" data-testid={`tooltip-${levelType}-levels-${symbol}`}>
          <div className="space-y-1">
            <div className="font-semibold text-xs mb-2">{type} Levels (click pin to select)</div>
            {levels.map((level, idx) => (
              <div 
                key={idx} 
                className="text-xs flex items-center justify-between gap-3 hover:bg-accent/50 rounded px-1 py-0.5 group" 
                data-testid={`${levelType}-level-item-${symbol}-${idx}`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePinSRLevel(symbol, level.value, type);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`button-pin-${levelType}-${symbol}-${idx}`}
                    title="Pin this level as your primary value"
                  >
                    <Pin size={12} className="text-emerald-600 dark:text-emerald-400" />
                  </button>
                  <span data-testid={`text-${levelType}-level-value-${symbol}-${idx}`}>${level.value.toFixed(2)}</span>
                </div>
                <span className="text-muted-foreground" data-testid={`text-${levelType}-level-detail-${symbol}-${idx}`}>{level.confidence}% ({level.method})</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={14} />;
    return sortDirection === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  const getFilteredAndSortedTickers = (tickerList: Ticker[]) => {
    if (!tickerList) return [];
    
    // First filter by StochRSI
    let filteredTickers = tickerList;
    if (selectedStochRSIFilters.length > 0) {
      filteredTickers = tickerList.filter(ticker => {
        const data = getMarketDataForSymbol(ticker.symbol);
        return data?.stochRSIStatus && selectedStochRSIFilters.includes(data.stochRSIStatus as StochRSIStatus);
      });
    }
    
    // Then sort if needed
    if (!sortField) return filteredTickers;
    
    return [...filteredTickers].sort((a, b) => {
      const dataA = getMarketDataForSymbol(a.symbol);
      const dataB = getMarketDataForSymbol(b.symbol);
      
      let comparison = 0;
      
      switch (sortField) {
        case "symbol":
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case "price":
          const priceA = dataA?.price ?? -Infinity;
          const priceB = dataB?.price ?? -Infinity;
          comparison = priceA - priceB;
          break;
        case "change":
          const changeA = dataA?.change ?? -Infinity;
          const changeB = dataB?.change ?? -Infinity;
          comparison = changeA - changeB;
          break;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });
  };

  const renderTickerTable = (tickerList: Ticker[], title: string) => {
    const filteredTickers = getFilteredAndSortedTickers(tickerList);
    
    if (tickerList.length === 0) return null;

    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">{title} ({filteredTickers.length})</h3>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] justify-start">
                <Filter className="mr-2 h-4 w-4" />
                {selectedStochRSIFilters.length === 0 
                  ? "StochRSI" 
                  : `${selectedStochRSIFilters.length} selected`
                }
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Filter by StochRSI</h4>
                  {selectedStochRSIFilters.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="h-6 px-2 text-xs"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="overbought"
                      checked={selectedStochRSIFilters.includes("overbought")}
                      onCheckedChange={(checked) => handleStochRSIFilterChange("overbought", checked as boolean)}
                    />
                    <label
                      htmlFor="overbought"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Overbought
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="oversold"
                      checked={selectedStochRSIFilters.includes("oversold")}
                      onCheckedChange={(checked) => handleStochRSIFilterChange("oversold", checked as boolean)}
                    />
                    <label
                      htmlFor="oversold"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Oversold
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="neutral"
                      checked={selectedStochRSIFilters.includes("neutral")}
                      onCheckedChange={(checked) => handleStochRSIFilterChange("neutral", checked as boolean)}
                    />
                    <label
                      htmlFor="neutral"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Neutral
                    </label>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {filteredTickers.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">No tickers match the current filter.</p>
            {selectedStochRSIFilters.length > 0 && (
              <Button
                variant="link"
                onClick={clearAllFilters}
                className="mt-2"
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden" data-onboarding="watchlist-table">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead className="text-sm">
                  <button
                    onClick={() => handleSort("symbol")}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    Symbol
                    {getSortIcon("symbol")}
                  </button>
                </TableHead>
                <TableHead className="text-sm">
                  <button
                    onClick={() => handleSort("price")}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    Price
                    {getSortIcon("price")}
                  </button>
                </TableHead>
                <TableHead className="text-sm">
                  <button
                    onClick={() => handleSort("change")}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    Change
                    {getSortIcon("change")}
                  </button>
                </TableHead>
                <TableHead className="text-sm">
                  <div className="flex items-center gap-1">
                    <span>Momentum</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={12} className="text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px] p-3 normal-case whitespace-normal">
                        <p className="text-xs text-muted-foreground mb-1">RSI (Relative Strength Index)</p>
                        <p className="text-xs leading-relaxed">Measures price momentum over 14 periods. A slower, more stable indicator for trend strength.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableHead>
                <TableHead className="text-sm">
                  <div className="flex items-center gap-1">
                    <span>Signal</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={12} className="text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px] p-3 normal-case whitespace-normal">
                        <p className="text-xs text-muted-foreground mb-1">StochRSI (Stochastic RSI)</p>
                        <p className="text-xs leading-relaxed">Faster, more reactive indicator for entry/exit timing. Shows RSI's position within its recent range.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableHead>
                <TableHead className="text-sm">Support</TableHead>
                <TableHead className="text-sm">Resistance</TableHead>
                <TableHead className="text-sm">
                  <div className="flex items-center gap-1">
                    <span>ATM IV</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={12} className="text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px] p-3 normal-case whitespace-normal">
                        <p className="text-xs text-muted-foreground mb-1">At-The-Money Implied Volatility</p>
                        <p className="text-xs leading-relaxed">Volatility priced into options near the current stock price. Higher IV = more expensive premiums but higher risk.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableHead>
                <TableHead className="text-sm">
                  <div className="flex items-center gap-1">
                    <span>30d EM</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={12} className="text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px] p-3 normal-case whitespace-normal">
                        <p className="text-xs text-muted-foreground mb-1">30-Day Expected Move</p>
                        <p className="text-xs leading-relaxed">Price range the market expects over 30 days based on IV. Useful for strike selection.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableHead>
                <TableHead className="text-sm text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickers.map((ticker) => {
                const data = getMarketDataForSymbol(ticker.symbol);
                return (
                  <TableRow key={ticker.id} className="table-row-hover" data-testid={`ticker-${ticker.symbol}`}>
                    <TableCell className="text-sm">
                      <span className="font-semibold">{ticker.symbol}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-semibold">
                        {data?.price ? `$${data.price.toFixed(2)}` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className={`font-semibold flex items-center gap-1 ${
                        data?.change && data.change > 0 ? 'text-success' : data?.change && data.change < 0 ? 'text-destructive' : ''
                      }`}>
                        {data?.change && data.change !== 0 ? (
                          <>
                            {data.change > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {formatChange(data.change)}
                          </>
                        ) : formatChange(data?.change || null)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {renderIndicatorBadge(data?.rsiStatus || 'unknown', data?.rsiValue ?? null, 'momentum', ticker.symbol)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {renderIndicatorBadge(data?.stochRSIStatus || 'unknown', data?.stochK ?? null, 'signal', ticker.symbol, data?.stochD)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {renderSRLevels(data?.supportLevels, data?.support, data?.srSource, 'Support', ticker.symbol)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {renderSRLevels(data?.resistanceLevels, data?.resistance, data?.srSource, 'Resistance', ticker.symbol)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const iv = getIVDataForSymbol(ticker.symbol);
                        if (iv?.atmIv !== null && iv?.atmIv !== undefined) {
                          const ivPercent = iv.atmIv * 100;
                          let ivColor = 'text-foreground';
                          if (ivPercent > 50) ivColor = 'text-destructive';
                          else if (ivPercent > 30) ivColor = 'text-warning';
                          else ivColor = 'text-success';
                          return <span className={`font-medium ${ivColor}`}>{ivPercent.toFixed(1)}%</span>;
                        }
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">—</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] p-3">
                              <p className="text-xs">Options data not available for this symbol.</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const iv = getIVDataForSymbol(ticker.symbol);
                        if (iv?.expectedMove30d !== null && iv?.expectedMove30d !== undefined && data?.price) {
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="font-medium cursor-help">
                                  ±${iv.expectedMove30d.toFixed(2)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[220px] p-3">
                                <p className="text-xs mb-1">30-day price range:</p>
                                <p className="text-sm font-medium">
                                  ${(data.price - iv.expectedMove30d).toFixed(2)} - ${(data.price + iv.expectedMove30d).toFixed(2)}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        }
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">—</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] p-3">
                              <p className="text-xs">Options data not available for this symbol.</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm text-right">
                      <div className="flex gap-2 justify-end">
                        {isAuthenticated && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setFlowSymbol(ticker.symbol)}
                                className="text-muted-foreground hover:text-primary"
                                data-testid={`button-flow-${ticker.symbol}`}
                              >
                                <Activity size={16} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Options Flow</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => refreshSRMutation.mutate(ticker.id)}
                              disabled={refreshSRMutation.isPending}
                              className="text-muted-foreground hover:text-primary disabled:opacity-50"
                              data-testid={`button-refresh-sr-${ticker.symbol}`}
                            >
                              <RefreshCw size={16} className={refreshSRMutation.isPending ? 'animate-spin' : ''} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Refresh S/R Levels</TooltipContent>
                        </Tooltip>
                        <button
                          onClick={() => handleEdit(ticker)}
                          className="text-primary hover:text-primary/80"
                          data-testid={`button-edit-${ticker.symbol}`}
                        >
                          <Edit size={16} />
                        </button>
                        {!isPreLoginMode && (
                          <button
                            onClick={() => handleDelete(ticker.symbol)}
                            className="text-muted-foreground hover:text-destructive"
                            data-testid={`button-delete-${ticker.symbol}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        )}
      </div>
    );
  };

  const handleStochRSIFilterChange = (status: StochRSIStatus, checked: boolean) => {
    if (checked) {
      setSelectedStochRSIFilters(prev => [...prev, status]);
    } else {
      setSelectedStochRSIFilters(prev => prev.filter(s => s !== status));
    }
  };

  const clearAllFilters = () => {
    setSelectedStochRSIFilters([]);
  };

  return (
    <TooltipProvider>
      <PageSEO 
        title="Watchlist" 
        description="Manage your monitored tickers with AI-powered support and resistance detection. Track market movements and trading opportunities."
      />
      <div className="p-4 sm:p-8">
      {!isAuthenticated && (
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/30 mb-8">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold text-foreground mb-3">Watchlist - Track Your Favorites</h2>
            <p className="text-muted-foreground text-base mb-6">Monitor stocks and indexes with technical indicators to identify optimal entry points for credit spreads and iron condors.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <ChartLine className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Technical Indicators</div>
                  <div className="text-xs text-muted-foreground">StochRSI signals for overbought/oversold conditions</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Support & Resistance</div>
                  <div className="text-xs text-muted-foreground">Automated price levels for better trade entries</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Delta Ranges</div>
                  <div className="text-xs text-muted-foreground">Configure delta ranges for spread strike selection</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Watchlist</h2>
            <p className="text-muted-foreground text-sm sm:text-base">Manage your monitored tickers and their configurations</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode("card")}
                className={`p-2 rounded transition-colors ${
                  viewMode === "card"
                    ? "bg-background text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="button-view-card"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-2 rounded transition-colors ${
                  viewMode === "table"
                    ? "bg-background text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="button-view-table"
              >
                <List size={16} />
              </button>
            </div>
            <Button 
              onClick={() => refreshAllSRMutation.mutate()}
              disabled={isPreLoginMode && !isAuthenticated || refreshAllSRMutation.isPending || (tickers?.length || 0) === 0}
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm"
              data-testid="button-refresh-all-sr"
              data-onboarding="refresh-sr-button"
            >
              <RefreshCw className={`mr-1 sm:mr-2 ${refreshAllSRMutation.isPending ? 'animate-spin' : ''}`} size={14} />
              <span className="hidden sm:inline">Refresh All S/R</span>
              <span className="sm:hidden">S/R</span>
            </Button>
            <Button onClick={() => setIsAddOpen(true)} size="sm" className="text-xs sm:text-sm" data-testid="button-add-ticker" data-onboarding="add-ticker-button">
              <Plus className="mr-1 sm:mr-2" size={14} />
              <span className="hidden sm:inline">Ticker</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading watchlist...</p>
        </div>
      ) : tickers && tickers.length > 0 ? (
        <>
          {viewMode === "table" ? (
            <>
              {renderTickerTable(stockTickers, "Stocks")}
              {renderTickerTable(indexTickers, "Indexes")}
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {tickers.map((ticker) => {
                const data = getMarketDataForSymbol(ticker.symbol);
                return (
                  <div
                    key={ticker.id}
                    className="bg-card border border-border rounded-lg p-4 table-row-hover"
                    data-testid={`ticker-${ticker.symbol}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-sm">{ticker.symbol}</span>
                      <div className="flex gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => refreshSRMutation.mutate(ticker.id)}
                              disabled={refreshSRMutation.isPending}
                              className="text-muted-foreground hover:text-primary disabled:opacity-50"
                              data-testid={`button-refresh-sr-${ticker.symbol}`}
                            >
                              <RefreshCw size={16} className={refreshSRMutation.isPending ? 'animate-spin' : ''} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Refresh S/R Levels</TooltipContent>
                        </Tooltip>
                        <button
                          onClick={() => handleEdit(ticker)}
                          className="text-primary hover:text-primary/80"
                          data-testid={`button-edit-${ticker.symbol}`}
                        >
                          <Edit size={16} />
                        </button>
                        {!isPreLoginMode && (
                          <button
                            onClick={() => handleDelete(ticker.symbol)}
                            className="text-muted-foreground hover:text-destructive"
                            data-testid={`button-delete-${ticker.symbol}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Price</span>
                        <span className="font-semibold">
                          {data?.price ? `$${data.price.toFixed(2)}` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Change</span>
                        <span className={`font-semibold flex items-center gap-1 ${
                          data?.change && data.change > 0 ? 'text-success' : data?.change && data.change < 0 ? 'text-destructive' : ''
                        }`}>
                          {data?.change && data.change !== 0 ? (
                            <>
                              {data.change > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                              {formatChange(data.change)}
                            </>
                          ) : formatChange(data?.change || null)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Momentum</span>
                        {renderIndicatorBadge(data?.rsiStatus || 'unknown', data?.rsiValue ?? null, 'momentum', ticker.symbol)}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Signal</span>
                        {renderIndicatorBadge(data?.stochRSIStatus || 'unknown', data?.stochK ?? null, 'signal', ticker.symbol, data?.stochD)}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Support</span>
                        {renderSRLevels(data?.supportLevels, data?.support, data?.srSource, 'Support', ticker.symbol)}
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Resistance</span>
                        {renderSRLevels(data?.resistanceLevels, data?.resistance, data?.srSource, 'Resistance', ticker.symbol)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No tickers in watchlist</p>
          <Button onClick={() => setIsAddOpen(true)} data-testid="button-add-first-ticker">
            <Plus className="mr-2" size={16} />
            Add Your First Ticker
          </Button>
        </div>
      )}

      <AddTickerModal open={isAddOpen} onOpenChange={setIsAddOpen} />
      <EditTickerModal open={isEditOpen} onOpenChange={setIsEditOpen} ticker={selectedTicker} />

      {/* Options Flow Dialog */}
      <Dialog open={!!flowSymbol} onOpenChange={(open) => !open && setFlowSymbol(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity size={18} className="text-primary" />
              Options Flow — {flowSymbol}
            </DialogTitle>
          </DialogHeader>
          {flowLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading unusual activity...</div>
          ) : !flowData || flowData.unusual.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No unusual options activity found for {flowSymbol}.
              <div className="text-xs mt-1">Scanned {flowData?.scannedContracts ?? 0} contracts.</div>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-3">
                {flowData.unusual.length} unusual contracts from {flowData.scannedContracts} scanned
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Strike</TableHead>
                    <TableHead className="text-xs">Expiry</TableHead>
                    <TableHead className="text-xs">DTE</TableHead>
                    <TableHead className="text-xs text-right">Volume</TableHead>
                    <TableHead className="text-xs text-right">OI</TableHead>
                    <TableHead className="text-xs text-right">Vol/OI</TableHead>
                    <TableHead className="text-xs text-right">IV</TableHead>
                    <TableHead className="text-xs">Signal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flowData.unusual.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">
                        <span className={`font-semibold ${item.type === 'call' ? 'text-success' : 'text-destructive'}`}>
                          {item.type.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono">${item.strike}</TableCell>
                      <TableCell className="text-xs">{item.expiry}</TableCell>
                      <TableCell className="text-xs">{item.dte}d</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{item.volume.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{item.openInterest.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">
                        <span className={item.volumeOiRatio >= 1 ? 'text-warning font-semibold' : ''}>
                          {item.volumeOiRatio}x
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {item.iv ? `${(item.iv * 100).toFixed(0)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.unusualReason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
}
