import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { RefreshCw, CheckCircle, AlertTriangle, Info, ChartLine, Calendar, ChevronDown, ChevronRight, Settings, Plus, Crown, BarChart3, Eye, Clock, AlertCircle, TrendingUp } from "lucide-react";
import { differenceInDays, differenceInHours } from "date-fns";
import { PageSEO } from "@/components/seo/PageSEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "@/components/auth/AuthModal";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AddTradeModal from "@/components/modals/add-trade-modal";
import AddIronCondorModal from "@/components/modals/add-iron-condor-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ScanResult, Setting, MarketContextResult } from "@shared/schema";
import { format } from "date-fns";
import { formatDateTimeInET, formatTimestampInET } from "@/lib/timezone";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import ScannerSubnav from "@/components/layout/scanner-subnav";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";

interface GroupedScanResults {
  qualified: ScanResult[];
  setupNoSpread: ScanResult[];
  others: ScanResult[];
  summary: {
    totalSymbols: number;
    qualified: number;
    setupNoSpread: number;
    others: number;
  };
}

const scanParametersSchema = z.object({
  // Credit Spread delta range
  scanDeltaMin: z.number().min(0).max(1),
  scanDeltaMax: z.number().min(0).max(1),
  scanMinCredit: z.number().min(0),
  scanRrMin: z.number().min(0),
  scanRrMax: z.number().min(0),
  scanMaxLoss: z.number().min(0),
  scanMaxLossBuffer: z.number().min(0).max(1),
  // DTE settings
  scanDteTarget: z.number().min(20).max(90),
  scanDteBuffer: z.number().min(1).max(15),
  // Iron Condor specific settings
  scanIcDeltaMin: z.number().min(0).max(1),
  scanIcDeltaMax: z.number().min(0).max(1),
  scanIcWidth: z.number().min(5).max(20),
  // Global settings
  scanMinOi: z.number().min(0),
});

type ScanParametersForm = z.infer<typeof scanParametersSchema>;

const leapsParametersSchema = z.object({
  leapsDeltaMin: z.number().min(0).max(1),
  leapsDeltaMax: z.number().min(0).max(1),
  leapsDteMin: z.number().min(0),
  leapsDteMax: z.number().min(0),
  leapsItmMin: z.number().min(0).max(100),
  leapsItmMax: z.number().min(0).max(100),
  leapsMinZlvi: z.number().min(0).max(100),
});

type LeapsParametersForm = z.infer<typeof leapsParametersSchema>;

// Helper function to calculate rating based on score
function getRating(score: number | null): { rating: 'EXCELLENT' | 'GOOD' | 'FAIR', colorClass: string } {
  if (!score) return { rating: 'FAIR', colorClass: 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 text-gray-700 dark:text-gray-300 border-2 border-gray-400' };
  if (score >= 90) return { rating: 'EXCELLENT', colorClass: 'bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-800 text-green-800 dark:text-green-200 border-2 border-green-600' };
  if (score >= 70) return { rating: 'GOOD', colorClass: 'bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 text-blue-800 dark:text-blue-200 border-2 border-blue-600' };
  return { rating: 'FAIR', colorClass: 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 text-gray-700 dark:text-gray-300 border-2 border-gray-400' };
}

// Helper to format large numbers
function formatNumber(value: number | null): string {
  if (value === null) return 'N/A';
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
}

// Fundamentals Tab component for LEAPS cards
function FundamentalsTab({ result }: { result: ScanResult }) {
  const [showMethodology, setShowMethodology] = useState(false);
  const uqsScore = result.uqsScore as number | null;
  const uqsRating = result.uqsRating as string | null;
  const uqsInsight = result.uqsInsight as string | null;
  const uqsComponents = result.uqsComponents as { trendStrength?: number; cashFlowHealth?: number; stability?: number; earnings?: number } | null;
  const uqsRawData = result.uqsRawData as { 
    marketCap?: number | null; 
    freeCashFlow?: number | null; 
    netMargin?: number | null;
    beta?: number | null;
    epsGrowth5Y?: number | null;
    roe?: number | null;
    peRatio?: number | null;
    priceVs52WeekHigh?: number | null;
    dataSource?: string;
    fetchedAt?: string;
  } | null;

  // Helper to format a value - treats null/undefined as N/A, but 0 as valid
  const fmt = (val: number | null | undefined, suffix: string = '') => 
    val !== null && val !== undefined ? `${val.toFixed(1)}${suffix}` : 'N/A';

  if (!uqsScore) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground">No fundamental data available.</p>
        <p className="text-xs text-muted-foreground mt-1">Run a new scan to fetch fundamentals.</p>
      </div>
    );
  }

  const isETF = uqsRawData?.dataSource === 'Index ETF';

  return (
    <div className="space-y-3">
      {/* Quality Score Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Quality Score</span>
        <span className={`text-sm font-bold ${
          uqsRating === 'STRONG' ? 'text-green-600 dark:text-green-400' :
          uqsRating === 'FAIR' ? 'text-blue-600 dark:text-blue-400' :
          'text-amber-600 dark:text-amber-400'
        }`}>{uqsScore.toFixed(0)}/100 ({uqsRating})</span>
      </div>

      {/* ETF Notice */}
      {isETF && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-2.5">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-blue-600 dark:text-blue-400">Index ETF</p>
              <p className="text-muted-foreground mt-1">
                Traditional fundamentals (FCF, ROE, P/E) don't apply. Index ETFs are inherently diversified, providing built-in stability and reduced single-stock risk.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Raw Data Source Values - Only show for stocks, not ETFs */}
      {uqsRawData && !isETF && (
        <div className="bg-muted/30 rounded-md p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Source Data</span>
            <span className="text-[10px] text-muted-foreground">
              {uqsRawData.dataSource || 'Finnhub'} 
              {uqsRawData.fetchedAt && ` • ${new Date(uqsRawData.fetchedAt).toLocaleDateString()}`}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Market Cap</span>
              <span className="font-mono font-medium">{uqsRawData.marketCap !== null && uqsRawData.marketCap !== undefined ? formatNumber(uqsRawData.marketCap * 1e6) : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">FCF (TTM)</span>
              <span className="font-mono font-medium">{uqsRawData.freeCashFlow !== null && uqsRawData.freeCashFlow !== undefined ? formatNumber(uqsRawData.freeCashFlow * 1e6) : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Net Margin</span>
              <span className="font-mono font-medium">{fmt(uqsRawData.netMargin, '%')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Beta</span>
              <span className="font-mono font-medium">{uqsRawData.beta !== null && uqsRawData.beta !== undefined ? uqsRawData.beta.toFixed(2) : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">EPS Growth (5Y)</span>
              <span className="font-mono font-medium">{fmt(uqsRawData.epsGrowth5Y, '%')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ROE</span>
              <span className="font-mono font-medium">{fmt(uqsRawData.roe, '%')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">P/E Ratio</span>
              <span className="font-mono font-medium">{fmt(uqsRawData.peRatio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">vs 52W High</span>
              <span className="font-mono font-medium">{uqsRawData.priceVs52WeekHigh !== null && uqsRawData.priceVs52WeekHigh !== undefined ? `-${uqsRawData.priceVs52WeekHigh.toFixed(1)}%` : 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ETF Source Data - Just show trend data */}
      {uqsRawData && isETF && (
        <div className="bg-muted/30 rounded-md p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">ETF Data</span>
            <span className="text-[10px] text-muted-foreground">
              {uqsRawData.fetchedAt && new Date(uqsRawData.fetchedAt).toLocaleDateString()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">vs 52W High</span>
              <span className="font-mono font-medium">{uqsRawData.priceVs52WeekHigh !== null && uqsRawData.priceVs52WeekHigh !== undefined ? `-${uqsRawData.priceVs52WeekHigh.toFixed(1)}%` : 'N/A'}</span>
            </div>
            {uqsRawData.beta !== null && uqsRawData.beta !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Beta</span>
                <span className="font-mono font-medium">{uqsRawData.beta.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Component Scores */}
      {uqsComponents && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Score Breakdown (25 pts each)</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trend Strength</span>
              <span className="font-medium">{uqsComponents.trendStrength?.toFixed(0) ?? 'N/A'}/25</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash Flow</span>
              <span className="font-medium">{uqsComponents.cashFlowHealth?.toFixed(0) ?? 'N/A'}/25</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stability</span>
              <span className="font-medium">{uqsComponents.stability?.toFixed(0) ?? 'N/A'}/25</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Earnings</span>
              <span className="font-medium">{uqsComponents.earnings?.toFixed(0) ?? 'N/A'}/25</span>
            </div>
          </div>
        </div>
      )}

      {/* Insight */}
      {uqsInsight && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
          {uqsInsight}
        </p>
      )}

      {/* How UQS is Calculated */}
      <Collapsible open={showMethodology} onOpenChange={setShowMethodology}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer w-full">
          <Info className="h-3 w-3" />
          <span>{isETF ? 'How ETF Quality is Determined' : 'How UQS is Calculated'}</span>
          <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showMethodology ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {isETF ? (
            <div className="bg-muted/20 rounded-md p-2.5 text-xs space-y-2">
              <p className="font-medium">Index ETF Quality Assessment</p>
              <div className="space-y-1.5 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Trend Strength (0-25):</span> Based on position in 52-week range, same as stocks.
                </div>
                <div>
                  <span className="font-medium text-foreground">Cash Flow (20 pts):</span> ETFs represent diversified holdings with pooled cash flows.
                </div>
                <div>
                  <span className="font-medium text-foreground">Stability (25 pts):</span> Maximum score - index ETFs are inherently diversified by design.
                </div>
                <div>
                  <span className="font-medium text-foreground">Earnings (15 pts):</span> Represents basket of underlying company earnings.
                </div>
              </div>
              <div className="pt-1 border-t border-muted">
                <p className="text-muted-foreground">
                  Index ETFs receive inherent quality bonuses due to built-in diversification and reduced single-stock risk.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-muted/20 rounded-md p-2.5 text-xs space-y-2">
              <p className="font-medium">Underlying Quality Score (UQS) = 4 components × 25 pts max each</p>
              <div className="space-y-1.5 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Trend Strength (0-25):</span> Position in 52-week range. Top 20% = 25 pts, upper-mid = 20 pts, mid-range = 15 pts, lower = 8 pts, bottom 20% = 3 pts.
                </div>
                <div>
                  <span className="font-medium text-foreground">Cash Flow (0-25):</span> Positive FCF + margin &gt;15% = 25 pts, margin &gt;8% = 20 pts, positive FCF = 15 pts, negative FCF = 5 pts. No FCF data fallback: margin &gt;15% = 18 pts, &gt;5% = 12 pts, else 5 pts.
                </div>
                <div>
                  <span className="font-medium text-foreground">Stability (0-25):</span> Mega-cap ($200B+) = 20 pts, Large-cap ($10B+) = 18 pts, Mid-cap ($2B+) = 12 pts, Small-cap = 6 pts. Beta ≤0.8 adds +5 pts, beta ≥1.5 deducts -5 pts.
                </div>
                <div>
                  <span className="font-medium text-foreground">Earnings (0-25):</span> EPS growth 5Y ≥15% = 12 pts, ≥5% = 8 pts, ≥0% = 4 pts. ROE ≥20% = 8 pts, ≥10% = 5 pts, ≥0% = 2 pts. P/E ≤25 = 5 pts, ≤40 = 2 pts.
                </div>
              </div>
              <div className="pt-1 border-t border-muted">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Rating:</span> STRONG (≥65), FAIR (40-64), WEAK (&lt;40)
                </p>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function Scanner() {
  const { toast } = useToast();
  const { isPreLoginMode, isAuthenticated } = useAuth();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leapsSettingsOpen, setLeapsSettingsOpen] = useState(false);
  const [isAddTradeOpen, setIsAddTradeOpen] = useState(false);
  const [isAddIronCondorOpen, setIsAddIronCondorOpen] = useState(false);
  const [selectedScanResult, setSelectedScanResult] = useState<ScanResult | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisModalResult, setAnalysisModalResult] = useState<ScanResult | null>(null);
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false);
  const [showEmptyWatchlistDialog, setShowEmptyWatchlistDialog] = useState(false);
  const [location, setLocation] = useLocation();
  const { startTutorial: startQuickStart } = useOnboarding();
  const scannerTab = location === "/scanner/leaps" ? "leaps" : location === "/scanner/market-context" ? "market-context" : "cs-ic";

  // Market Context data
  const { data: marketContext, isLoading: isLoadingMarketContext, error: marketContextError, refetch: refetchMarketContext } = useQuery<MarketContextResult>({
    queryKey: ["/api/market-context/latest"],
    retry: false,
    refetchInterval: 300000, // Refetch every 5 minutes
    staleTime: 240000, // 4 minutes
  });

  const refreshMarketContextMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/market-context/refresh", {});
    },
    onSuccess: () => {
      toast({ title: "Market context refreshed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/market-context/latest"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to refresh market context", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  const handleAddOrder = (result: ScanResult) => {
    setSelectedScanResult(result);
    if (result.strategyType === 'IRON_CONDOR') {
      setIsAddIronCondorOpen(true);
    } else {
      setIsAddTradeOpen(true);
    }
  };

  const { data: allGroupedResults, isLoading } = useQuery<GroupedScanResults>({
    queryKey: ["/api/scan-results/grouped-by-symbol"],
  });

  const { data: batches } = useQuery<{ batchId: string; startedAt: number; items: ScanResult[] }[]>({
    queryKey: ["/api/scan-results/batches"],
  });

  // Poll scan status when authenticated
  // staleTime: 0 ensures this always refetches on mount (overrides global staleTime: Infinity)
  // refetchOnMount: 'always' forces refetch even if data exists in cache
  const { data: scanStatus } = useQuery<{ isScanning: boolean; startedAt: number | null }>({
    queryKey: ["/api/scan/status"],
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      // Poll every 2 seconds while scanning, otherwise every 30 seconds
      return query.state.data?.isScanning ? 2000 : 30000;
    },
  });

  // Fetch watchlist to check for empty state
  const { data: watchlistData } = useQuery<{ id: string; symbol: string }[]>({
    queryKey: ["/api/watchlist"],
    enabled: isAuthenticated,
  });

  const hasTickersInWatchlist = (watchlistData?.length ?? 0) > 0;

  // LEAPS Scanner queries - enabled when LEAPS tab is active
  const { data: leapsResults, isLoading: isLoadingLeaps, refetch: refetchLeaps } = useQuery<ScanResult[]>({
    queryKey: ["/api/scan/leaps/results"],
    enabled: scannerTab === "leaps",
  });

  const { data: leapsScanStatus } = useQuery<{ isScanning: boolean; startedAt: number | null }>({
    queryKey: ["/api/scan/leaps/status"],
    enabled: isAuthenticated && scannerTab === "leaps",
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      return query.state.data?.isScanning ? 2000 : 30000;
    },
  });

  const isLeapsScanning = leapsScanStatus?.isScanning ?? false;

  // LEAPS filters state
  const [leapsFilters, setLeapsFilters] = useState({
    minDTE: 365,
    maxDTE: 900,
    minDelta: 0.70,
    maxDelta: 0.90,
    minITM: 10,
    maxITM: 20,
    minZlvi: 50,
  });
  const [leapsSortBy, setLeapsSortBy] = useState<string>("score");

  // LEAPS scan mutation
  const runLeapsScanMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/scan/leaps", leapsFilters);
    },
    onSuccess: () => {
      toast({ title: "LEAPS scan completed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/scan/leaps/results"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scan/leaps/status"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "LEAPS scan failed", 
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Sort LEAPS results - separate qualified and non-qualified
  const sortedLeapsResults = useMemo(() => {
    if (!leapsResults) return [];
    const qualifiedLeaps = leapsResults.filter(r => r.status === 'qualified');
    
    return [...qualifiedLeaps].sort((a, b) => {
      switch (leapsSortBy) {
        case "score":
          return (b.zlviScore ?? 0) - (a.zlviScore ?? 0);
        case "extrinsic":
          return (a.extrinsicPercent ?? 100) - (b.extrinsicPercent ?? 100);
        case "delta":
          return (b.delta ?? 0) - (a.delta ?? 0);
        case "iv":
          return (a.ivPercentile ?? 100) - (b.ivPercentile ?? 100);
        default:
          return 0;
      }
    });
  }, [leapsResults, leapsSortBy]);

  // Get non-qualified LEAPS results for showing failures
  const nonQualifiedLeapsResults = useMemo(() => {
    if (!leapsResults) return [];
    return leapsResults.filter(r => r.status !== 'qualified');
  }, [leapsResults]);

  // Helper to get extrinsic rating color
  const getExtrinsicColor = (percent: number | null) => {
    if (!percent) return "text-gray-500";
    if (percent < 15) return "text-green-600 dark:text-green-400";
    if (percent < 30) return "text-blue-600 dark:text-blue-400";
    if (percent < 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  // Helper to get IV percentile color
  const getIvPercentileColor = (percentile: number | null) => {
    if (!percentile) return "bg-gray-200 dark:bg-gray-700";
    if (percentile < 25) return "bg-green-500";
    if (percentile < 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  // Filter batches to only show last 5 days
  const filteredBatches = useMemo(() => {
    if (!batches) return [];
    const fiveDaysAgo = Date.now() - (5 * 24 * 60 * 60 * 1000);
    return batches.filter(b => b.startedAt >= fiveDaysAgo);
  }, [batches]);

  // Helper to check if a batch is older than 1 day
  const isBatchOld = (startedAt: number): boolean => {
    return differenceInHours(new Date(), new Date(startedAt)) >= 24;
  };

  // Get grouped results from selected batch
  // When a batch is selected, use the batch data directly (contains all results)
  // This fixes the issue where old batch results weren't showing
  const groupedResults = useMemo(() => {
    // If no batch is selected or batches not loaded, use the default grouped results
    if (!selectedBatchId || !batches) return allGroupedResults;
    
    // Find the selected batch
    const selectedBatch = batches.find(b => b.batchId === selectedBatchId);
    
    if (!selectedBatch) return allGroupedResults;
    
    // Categorize the batch items by status
    const qualified: ScanResult[] = [];
    const setupNoSpread: ScanResult[] = [];
    const others: ScanResult[] = [];
    
    for (const result of selectedBatch.items) {
      if (result.status === 'qualified') {
        qualified.push(result);
      } else if (result.status === 'no_qualified_spread') {
        setupNoSpread.push(result);
      } else {
        others.push(result);
      }
    }
    
    return {
      qualified,
      setupNoSpread,
      others,
      summary: {
        totalSymbols: qualified.length + setupNoSpread.length + others.length,
        qualified: qualified.length,
        setupNoSpread: setupNoSpread.length,
        others: others.length,
      }
    };
  }, [allGroupedResults, selectedBatchId, batches]);

  // Apply strategy and rating filters to qualified and setup candidates
  const filteredQualified = useMemo(() => {
    if (!groupedResults) return [];
    return groupedResults.qualified.filter((result) => {
      // Strategy filter
      if (strategyFilter !== "all") {
        const isIronCondor = result.strategyType === 'IRON_CONDOR';
        const isCreditSpread = result.strategyType === 'CREDIT_SPREAD' || !result.strategyType;
        const isPut = result.signal?.includes("PUT");
        const isCall = result.signal?.includes("CALL");
        
        if (strategyFilter === "iron-condor" && !isIronCondor) return false;
        if (strategyFilter === "credit-spread" && !isCreditSpread) return false;
        if (strategyFilter === "put-spread" && (!isCreditSpread || !isPut)) return false;
        if (strategyFilter === "call-spread" && (!isCreditSpread || !isCall)) return false;
      }
      
      // Rating filter
      if (ratingFilter !== "all") {
        const rating = getRating(result.score);
        if (ratingFilter === "excellent" && rating.rating !== "EXCELLENT") return false;
        if (ratingFilter === "good" && rating.rating === "FAIR") return false;
      }
      
      return true;
    });
  }, [groupedResults, strategyFilter, ratingFilter]);

  const filteredSetupOnly = useMemo(() => {
    if (!groupedResults) return [];
    return groupedResults.setupNoSpread.filter((result) => {
      // Strategy filter
      if (strategyFilter !== "all") {
        const isIronCondor = result.strategyType === 'IRON_CONDOR';
        const isCreditSpread = result.strategyType === 'CREDIT_SPREAD' || !result.strategyType;
        const isPut = result.signal?.includes("PUT");
        const isCall = result.signal?.includes("CALL");
        
        if (strategyFilter === "iron-condor" && !isIronCondor) return false;
        if (strategyFilter === "credit-spread" && !isCreditSpread) return false;
        if (strategyFilter === "put-spread" && (!isCreditSpread || !isPut)) return false;
        if (strategyFilter === "call-spread" && (!isCreditSpread || !isCall)) return false;
      }
      
      return true;
    });
  }, [groupedResults, strategyFilter]);

  const { data: settings, isLoading: isLoadingSettings } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const form = useForm<ScanParametersForm>({
    resolver: zodResolver(scanParametersSchema),
    defaultValues: {
      // Credit Spread defaults
      scanDeltaMin: 0.25,
      scanDeltaMax: 0.30,
      scanMinCredit: 1.20,
      scanRrMin: 1.5,
      scanRrMax: 3.5,
      scanMaxLoss: 500,
      scanMaxLossBuffer: 0.25,
      // DTE defaults
      scanDteTarget: 45,
      scanDteBuffer: 5,
      // Iron Condor defaults
      scanIcDeltaMin: 0.15,
      scanIcDeltaMax: 0.20,
      scanIcWidth: 10,
      // Global defaults
      scanMinOi: 50,
    },
  });

  // Update form when settings load, but only if form hasn't been touched and sheet is not open
  useEffect(() => {
    if (settings && (!form.formState.isDirty || !settingsOpen)) {
      // Credit Spread settings
      const scanDeltaMin = settings.find((s) => s.key === "scan_delta_min");
      const scanDeltaMax = settings.find((s) => s.key === "scan_delta_max");
      const scanMinCredit = settings.find((s) => s.key === "scan_min_credit");
      const scanRrMin = settings.find((s) => s.key === "scan_rr_min");
      const scanRrMax = settings.find((s) => s.key === "scan_rr_max");
      const scanMaxLoss = settings.find((s) => s.key === "scan_max_loss");
      const scanMaxLossBuffer = settings.find((s) => s.key === "scan_max_loss_buffer");
      // DTE settings
      const scanDteTarget = settings.find((s) => s.key === "scan_dte_target");
      const scanDteBuffer = settings.find((s) => s.key === "scan_dte_buffer");
      // Iron Condor settings
      const scanIcDeltaMin = settings.find((s) => s.key === "scan_ic_delta_min");
      const scanIcDeltaMax = settings.find((s) => s.key === "scan_ic_delta_max");
      const scanIcWidth = settings.find((s) => s.key === "scan_ic_width");
      // Global settings
      const scanMinOi = settings.find((s) => s.key === "scan_min_oi");

      const newValues = {
        // Credit Spread values
        scanDeltaMin: scanDeltaMin ? parseFloat(scanDeltaMin.value) : 0.25,
        scanDeltaMax: scanDeltaMax ? parseFloat(scanDeltaMax.value) : 0.30,
        scanMinCredit: scanMinCredit ? parseFloat(scanMinCredit.value) : 1.20,
        scanRrMin: scanRrMin ? parseFloat(scanRrMin.value) : 1.5,
        scanRrMax: scanRrMax ? parseFloat(scanRrMax.value) : 3.5,
        scanMaxLoss: scanMaxLoss ? parseInt(scanMaxLoss.value) : 500,
        scanMaxLossBuffer: scanMaxLossBuffer ? parseFloat(scanMaxLossBuffer.value) : 0.25,
        // DTE values
        scanDteTarget: scanDteTarget ? parseInt(scanDteTarget.value) : 45,
        scanDteBuffer: scanDteBuffer ? parseInt(scanDteBuffer.value) : 5,
        // Iron Condor values
        scanIcDeltaMin: scanIcDeltaMin ? parseFloat(scanIcDeltaMin.value) : 0.15,
        scanIcDeltaMax: scanIcDeltaMax ? parseFloat(scanIcDeltaMax.value) : 0.20,
        scanIcWidth: scanIcWidth ? parseInt(scanIcWidth.value) : 10,
        // Global values
        scanMinOi: scanMinOi ? parseInt(scanMinOi.value) : 50,
      };

      form.reset(newValues);
    }
  }, [settings, form, settingsOpen]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: ScanParametersForm) => {
      const promises = [
        // Credit Spread settings
        apiRequest("POST", "/api/settings", { key: "scan_delta_min", value: data.scanDeltaMin.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_delta_max", value: data.scanDeltaMax.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_min_credit", value: data.scanMinCredit.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_rr_min", value: data.scanRrMin.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_rr_max", value: data.scanRrMax.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_max_loss", value: data.scanMaxLoss.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_max_loss_buffer", value: data.scanMaxLossBuffer.toString() }),
        // DTE settings
        apiRequest("POST", "/api/settings", { key: "scan_dte_target", value: data.scanDteTarget.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_dte_buffer", value: data.scanDteBuffer.toString() }),
        // Iron Condor settings
        apiRequest("POST", "/api/settings", { key: "scan_ic_delta_min", value: data.scanIcDeltaMin.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_ic_delta_max", value: data.scanIcDeltaMax.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_ic_width", value: data.scanIcWidth.toString() }),
        // Global settings
        apiRequest("POST", "/api/settings", { key: "scan_min_oi", value: data.scanMinOi.toString() }),
      ];
      await Promise.all(promises);
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      form.reset(data);
      setSettingsOpen(false);
      toast({
        title: "Settings Saved",
        description: "Scan parameters have been updated successfully",
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

  const leapsForm = useForm<LeapsParametersForm>({
    resolver: zodResolver(leapsParametersSchema),
    defaultValues: {
      leapsDeltaMin: 0.70,
      leapsDeltaMax: 0.90,
      leapsDteMin: 365,
      leapsDteMax: 900,
      leapsItmMin: 10,
      leapsItmMax: 20,
      leapsMinZlvi: 50,
    },
  });

  useEffect(() => {
    if (settings && (!leapsForm.formState.isDirty || !leapsSettingsOpen)) {
      const leapsDeltaMin = settings.find((s) => s.key === "leaps_delta_min");
      const leapsDeltaMax = settings.find((s) => s.key === "leaps_delta_max");
      const leapsDteMin = settings.find((s) => s.key === "leaps_dte_min");
      const leapsDteMax = settings.find((s) => s.key === "leaps_dte_max");
      const leapsItmMin = settings.find((s) => s.key === "leaps_itm_min");
      const leapsItmMax = settings.find((s) => s.key === "leaps_itm_max");
      const leapsMinZlvi = settings.find((s) => s.key === "leaps_min_zlvi");

      const newValues = {
        leapsDeltaMin: leapsDeltaMin ? parseFloat(leapsDeltaMin.value) : 0.70,
        leapsDeltaMax: leapsDeltaMax ? parseFloat(leapsDeltaMax.value) : 0.90,
        leapsDteMin: leapsDteMin ? parseInt(leapsDteMin.value) : 365,
        leapsDteMax: leapsDteMax ? parseInt(leapsDteMax.value) : 900,
        leapsItmMin: leapsItmMin ? parseInt(leapsItmMin.value) : 10,
        leapsItmMax: leapsItmMax ? parseInt(leapsItmMax.value) : 20,
        leapsMinZlvi: leapsMinZlvi ? parseInt(leapsMinZlvi.value) : 50,
      };

      leapsForm.reset(newValues);
      
      // Also sync to leapsFilters for the scan mutation
      setLeapsFilters({
        minDTE: newValues.leapsDteMin,
        maxDTE: newValues.leapsDteMax,
        minDelta: newValues.leapsDeltaMin,
        maxDelta: newValues.leapsDeltaMax,
        minITM: newValues.leapsItmMin,
        maxITM: newValues.leapsItmMax,
        minZlvi: newValues.leapsMinZlvi,
      });
    }
  }, [settings, leapsForm, leapsSettingsOpen]);

  const saveLeapsSettingsMutation = useMutation({
    mutationFn: async (data: LeapsParametersForm) => {
      const promises = [
        apiRequest("POST", "/api/settings", { key: "leaps_delta_min", value: data.leapsDeltaMin.toString() }),
        apiRequest("POST", "/api/settings", { key: "leaps_delta_max", value: data.leapsDeltaMax.toString() }),
        apiRequest("POST", "/api/settings", { key: "leaps_dte_min", value: data.leapsDteMin.toString() }),
        apiRequest("POST", "/api/settings", { key: "leaps_dte_max", value: data.leapsDteMax.toString() }),
        apiRequest("POST", "/api/settings", { key: "leaps_itm_min", value: data.leapsItmMin.toString() }),
        apiRequest("POST", "/api/settings", { key: "leaps_itm_max", value: data.leapsItmMax.toString() }),
        apiRequest("POST", "/api/settings", { key: "leaps_min_zlvi", value: data.leapsMinZlvi.toString() }),
      ];
      await Promise.all(promises);
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      leapsForm.reset(data);
      setLeapsSettingsOpen(false);
      
      // Sync leapsFilters with the new saved values
      setLeapsFilters({
        minDTE: data.leapsDteMin,
        maxDTE: data.leapsDteMax,
        minDelta: data.leapsDeltaMin,
        maxDelta: data.leapsDeltaMax,
        minITM: data.leapsItmMin,
        maxITM: data.leapsItmMax,
        minZlvi: data.leapsMinZlvi,
      });
      
      toast({
        title: "Settings Saved",
        description: "LEAPS scan parameters have been updated successfully",
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

  const runScanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/scan/run");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Scan failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-results/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scan-results/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scan-results/grouped-by-symbol"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scan/status"] });
      toast({
        title: "Scan Completed",
        description: "Daily scan has been completed successfully",
      });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan/status"] });
      // Show upgrade dialog instead of toast for limit errors
      if (error.message.includes("limit") || error.message.includes("daily")) {
        setShowUpgradeDialog(true);
      } else {
        toast({
          title: "Scan Failed",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  // Determine if scanning (from status endpoint or local mutation)
  const isScanning = scanStatus?.isScanning || runScanMutation.isPending;

  const toggleExpand = (id?: string) => {
    if (!id) return;
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getScanSummary = () => {
    if (!groupedResults) return "No scan results available";
    
    const parts = [];
    if (groupedResults.summary.qualified > 0) 
      parts.push(`${groupedResults.summary.qualified} Qualified`);
    if (groupedResults.summary.setupNoSpread > 0) 
      parts.push(`${groupedResults.summary.setupNoSpread} Setup Only`);
    
    // Count no_signal and error separately
    const noSignalCount = groupedResults.others.filter(r => r.status === 'no_signal').length;
    const errorCount = groupedResults.others.filter(r => r.status === 'error').length;
    
    if (noSignalCount > 0) 
      parts.push(`${noSignalCount} No Signal`);
    
    // Always show error count
    parts.push(`${errorCount} Error${errorCount !== 1 ? 's' : ''}`);
    
    return parts.length > 0 ? parts.join(" • ") : "No scan results available";
  };

  const latestBatch = useMemo(() => (batches && batches.length > 0 ? batches[0] : undefined), [batches]);

  // Auto-select latest batch when batches change (new scan completes)
  useEffect(() => {
    if (latestBatch) {
      // Always select the latest batch when it changes
      if (!selectedBatchId || selectedBatchId !== latestBatch.batchId) {
        // Check if this is a new batch (not just initial load)
        const currentBatchIndex = batches?.findIndex(b => b.batchId === selectedBatchId) ?? -1;
        const latestBatchIndex = batches?.findIndex(b => b.batchId === latestBatch.batchId) ?? 0;
        
        // Only auto-switch if we're not manually viewing an older batch,
        // or if selectedBatchId is null (initial load)
        if (!selectedBatchId || latestBatchIndex < currentBatchIndex || currentBatchIndex === -1) {
          setSelectedBatchId(latestBatch.batchId);
        }
      }
    }
  }, [latestBatch?.batchId, batches]);

  const allResults = useMemo(() => {
    if (!groupedResults) return [];
    return [
      ...groupedResults.qualified,
      ...groupedResults.setupNoSpread,
      ...groupedResults.others
    ];
  }, [groupedResults]);

  return (
    <>
      <PageSEO 
        title="Options Scanner" 
        description="AI-powered options scanner for credit spreads, iron condors, and LEAPS. Find high-probability trading opportunities with systematic analysis."
      />
      <ScannerSubnav />
      <div className="p-4 sm:p-8">
      {!isAuthenticated && (
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/30 mb-8">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold text-foreground mb-3">Options Scanner - Find Opportunities</h2>
            <p className="text-muted-foreground text-base mb-6">Automated technical analysis to discover high-probability credit spread candidates across your watchlist.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <RefreshCw className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Automated Scans</div>
                  <div className="text-xs text-muted-foreground">Daily scans with RSI and StochRSI filters</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <ChartLine className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Delta-Based Selection</div>
                  <div className="text-xs text-muted-foreground">Finds spreads within your delta range (0.20-0.35)</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-foreground">Risk/Reward Filtering</div>
                  <div className="text-xs text-muted-foreground">Only shows trades meeting your R:R criteria</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Market Context Tab Content */}
      {scannerTab === "market-context" && (
        <>
          {/* Page Header for Market Context */}
          <div className="mb-6">
            <h2 className="text-3xl font-bold mb-2">Market Context</h2>
            <p className="text-muted-foreground">
              AI-powered market regime analysis and per-ticker sentiment for informed trading decisions
            </p>
          </div>

          {/* Market Context Controls Bar */}
          <div className="mb-6">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              {/* Left: Status */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="text-primary" size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Market Intelligence</p>
                  <p className="text-sm text-muted-foreground">
                    {marketContext ? `Updated ${formatDateTimeInET(marketContext.timestamp)}` : 'No data yet'}
                  </p>
                </div>
              </div>

              {/* Right: Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => {
                    if (!isAuthenticated) {
                      setShowAuthModal(true);
                      return;
                    }
                    refreshMarketContextMutation.mutate();
                  }}
                  disabled={refreshMarketContextMutation.isPending}
                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground"
                  data-testid="button-refresh-market-context"
                >
                  <RefreshCw size={16} className={`mr-2 ${refreshMarketContextMutation.isPending ? 'animate-spin' : ''}`} />
                  {refreshMarketContextMutation.isPending ? "Refreshing..." : "Refresh Analysis"}
                </Button>
              </div>
            </div>
          </div>

          {/* Market Context Card */}
          {marketContext && (
            <Card className="mb-6 bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {/* Market Regime */}
                  <div className="bg-muted/50 rounded-lg p-4 border border-border">
                    <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Market Regime</p>
                    <p className={`text-xl font-bold ${
                      marketContext.marketRegime === 'bullish' ? 'text-green-600 dark:text-green-400' :
                      marketContext.marketRegime === 'bearish' ? 'text-red-600 dark:text-red-400' :
                      'text-yellow-600 dark:text-yellow-400'
                    }`}>
                      {marketContext.marketRegime.toUpperCase()}
                    </p>
                  </div>

                  {/* VIX Level */}
                  <div className="bg-muted/50 rounded-lg p-4 border border-border">
                    <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">VIX Level</p>
                    <p className="text-xl font-bold text-foreground">
                      {marketContext.vixLevel.toFixed(2)}
                      <span className={`ml-2 text-sm ${
                        marketContext.vixAssessment === 'low' ? 'text-green-600 dark:text-green-400' :
                        marketContext.vixAssessment === 'high' ? 'text-red-600 dark:text-red-400' :
                        'text-yellow-600 dark:text-yellow-400'
                      }`}>
                        ({marketContext.vixAssessment})
                      </span>
                    </p>
                  </div>

                  {/* Strategies */}
                  <div className="bg-muted/50 rounded-lg p-4 border border-border">
                    <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Recommended Strategies</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {marketContext.recommendations.creditSpreads.enabled && (
                        <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold">
                          Credit Spreads
                        </span>
                      )}
                      {marketContext.recommendations.ironCondor.enabled && (
                        <span className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold">
                          Iron Condor
                        </span>
                      )}
                      {marketContext.recommendations.leaps.enabled && (
                        <span className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold">
                          LEAPS
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-muted/30 rounded-lg p-4 border-l-4 border-l-primary">
                  <p className="text-sm text-foreground leading-relaxed">{marketContext.summary}</p>
                </div>

                {/* AI Analysis - Always visible on Market Context tab */}
                <div className="mt-6 space-y-4">
                  {/* Input Data */}
                  <div className="bg-muted/30 rounded-lg p-4 border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase">Market Data Inputs</p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">VIX:</span>
                        <span className="ml-2 font-mono font-semibold text-foreground">{marketContext.vixLevel.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">SPY:</span>
                        <span className="ml-2 font-mono font-semibold text-foreground">
                          {marketContext.spy ? `$${marketContext.spy.toFixed(2)}` : (marketContext.rawData?.spy ? `$${marketContext.rawData.spy.toFixed(2)}` : 'N/A')}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">QQQ:</span>
                        <span className="ml-2 font-mono font-semibold text-foreground">
                          {marketContext.qqq ? `$${marketContext.qqq.toFixed(2)}` : (marketContext.rawData?.qqq ? `$${marketContext.rawData.qqq.toFixed(2)}` : 'N/A')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Key Risks */}
                  {marketContext.keyRisks && marketContext.keyRisks.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                      <p className="text-sm font-semibold text-red-900 dark:text-red-200 mb-3 uppercase flex items-center gap-2">
                        <AlertTriangle size={14} />
                        Key Risks Identified
                      </p>
                      <ul className="space-y-2">
                        {marketContext.keyRisks.map((risk: string, idx: number) => (
                          <li key={idx} className="text-sm text-red-800 dark:text-red-300 pl-4 border-l-2 border-red-300 dark:border-red-700">
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ticker-by-Ticker Analysis Cards */}
          {marketContext && Object.keys(marketContext.tickerAnalysis || {}).length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-foreground">Ticker Analysis</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {Object.keys(marketContext.tickerAnalysis || {}).length} tickers analyzed from your watchlist
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(marketContext.tickerAnalysis || {}).map(([symbol, analysis]: [string, any]) => (
                  <Card key={symbol} className="bg-gradient-to-br from-muted/30 to-background border-border">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-lg text-foreground">{symbol}</span>
                          <span className={`text-xs px-2 py-1 rounded font-semibold ${
                            analysis.sentiment === 'bullish' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            analysis.sentiment === 'bearish' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                            'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          }`}>
                            {analysis.sentiment.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-mono text-muted-foreground">{(analysis.confidence * 100).toFixed(0)}%</span>
                      </div>
                      
                      {/* News Headlines */}
                      {analysis.keyNews && analysis.keyNews.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Recent News</p>
                          <ul className="space-y-1.5">
                            {analysis.keyNews.slice(0, 3).map((headline: string, idx: number) => (
                              <li key={idx} className="text-xs text-foreground/80 pl-3 border-l-2 border-muted">
                                {headline}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* AI Reasoning */}
                      <div className="bg-muted/30 rounded-md p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">AI Analysis</p>
                        <p className="text-xs text-foreground/80">{analysis.reasoning}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {isLoadingMarketContext && !marketContext && (
            <Card className="mb-6">
              <CardContent className="p-6 flex items-center justify-center">
                <RefreshCw className="animate-spin mr-2 text-primary" size={20} />
                <span className="text-muted-foreground">Loading market context...</span>
              </CardContent>
            </Card>
          )}

          {marketContextError && !marketContext && (
            <Card className="mb-6 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} />
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Market context unavailable</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Run a market context analysis to get AI-powered insights.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!isAuthenticated) {
                        setShowAuthModal(true);
                        return;
                      }
                      refreshMarketContextMutation.mutate();
                    }}
                    disabled={refreshMarketContextMutation.isPending}
                    data-testid="button-refresh-market-context-error"
                    className="gap-2 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  >
                    <RefreshCw size={14} className={refreshMarketContextMutation.isPending ? 'animate-spin' : ''} />
                    Generate
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!marketContext && !isLoadingMarketContext && !marketContextError && (
            <Card className="mb-6">
              <CardContent className="p-8 flex flex-col items-center justify-center text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <BarChart3 className="text-primary" size={32} />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">No Market Context Available</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md">
                  Generate a market context analysis to get AI-powered insights on market regime, VIX levels, and per-ticker sentiment.
                </p>
                <Button
                  onClick={() => {
                    if (!isAuthenticated) {
                      setShowAuthModal(true);
                      return;
                    }
                    refreshMarketContextMutation.mutate();
                  }}
                  disabled={refreshMarketContextMutation.isPending}
                  data-testid="button-generate-market-context"
                  className="gap-2"
                >
                  <RefreshCw size={14} className={refreshMarketContextMutation.isPending ? 'animate-spin' : ''} />
                  Generate Market Context
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Credit Spread & Iron Condor Tab Content */}
      {scannerTab === "cs-ic" && (
        <>
          {/* Page Header for CS/IC */}
          <div className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-3xl font-bold mb-2">Credit Spread & Iron Condor Scanner</h2>
                <p className="text-muted-foreground">
                  Entry signal scanning and spread candidate analysis
                </p>
              </div>
              {/* Compact Market Context Badge */}
              {marketContext && (
                <button
                  onClick={() => setLocation("/scanner/market-context")}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border hover:bg-muted/80 transition-colors"
                  data-testid="badge-market-context-cs-ic"
                >
                  <BarChart3 size={16} className="text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Market:</span>
                  <span className={`text-xs font-bold ${
                    marketContext.marketRegime === 'bullish' ? 'text-green-600 dark:text-green-400' :
                    marketContext.marketRegime === 'bearish' ? 'text-red-600 dark:text-red-400' :
                    'text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {marketContext.marketRegime.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">VIX {marketContext.vixLevel.toFixed(1)}</span>
                </button>
              )}
            </div>
          </div>

          {/* Scanner Controls Bar */}
          <div className="mb-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Left: Scan Results Summary */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="text-green-600 dark:text-green-500" size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Credit Spread/Iron Condor Opportunities</p>
              <p className="text-sm text-muted-foreground">
                {latestBatch ? `Updated ${formatDateTimeInET(latestBatch.startedAt)}` : 'No scans yet'}
              </p>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Batch Date Dropdown - only show batches from last 5 days */}
            {filteredBatches && filteredBatches.length > 0 && (
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBatchDropdownOpen(!batchDropdownOpen)}
                  className={`gap-2 min-w-[160px] justify-start ${
                    selectedBatchId && isBatchOld(filteredBatches.find(b => b.batchId === selectedBatchId)?.startedAt || 0)
                      ? 'border-amber-400 dark:border-amber-600'
                      : ''
                  }`}
                  data-testid="button-batch-dropdown"
                >
                  <Calendar size={16} className="text-primary" />
                  <span className="text-sm">
                    {(() => {
                      const displayBatch = filteredBatches.find(b => b.batchId === selectedBatchId) || latestBatch;
                      return displayBatch ? formatTimestampInET(displayBatch.startedAt).combined : "Select batch";
                    })()}
                  </span>
                  {selectedBatchId && isBatchOld(filteredBatches.find(b => b.batchId === selectedBatchId)?.startedAt || 0) && (
                    <Clock size={14} className="text-amber-500" />
                  )}
                  <ChevronDown size={16} className={`ml-auto transition-transform ${batchDropdownOpen ? 'rotate-180' : ''}`} />
                </Button>
                
                {batchDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                    {filteredBatches.map((b) => {
                      const qualifiedCount = b.items.filter(i => i.status === 'qualified').length;
                      const isOld = isBatchOld(b.startedAt);
                      return (
                        <button
                          key={b.batchId}
                          onClick={() => {
                            setSelectedBatchId(b.batchId);
                            setBatchDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-muted/50 flex items-center justify-between border-b border-border last:border-b-0 ${
                            b.batchId === selectedBatchId ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                          }`}
                          data-testid={`batch-option-${b.batchId}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {formatTimestampInET(b.startedAt).combined}
                            </span>
                            {isOld && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                <Clock size={10} />
                                Old
                              </span>
                            )}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            {qualifiedCount} qualified
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Strategy Filter */}
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-border rounded-md bg-card text-foreground cursor-pointer hover:bg-muted/50 transition-colors"
              data-testid="select-strategy-filter"
            >
              <option value="all">All Strategies</option>
              <option value="credit-spread">Credit Spreads</option>
              <option value="iron-condor">Iron Condors</option>
              <option value="put-spread">Put Credit Spreads</option>
              <option value="call-spread">Call Credit Spreads</option>
            </select>

            {/* Rating Filter */}
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-border rounded-md bg-card text-foreground cursor-pointer hover:bg-muted/50 transition-colors"
              data-testid="select-rating-filter"
            >
              <option value="all">All Ratings</option>
              <option value="excellent">Excellent Only</option>
              <option value="good">Good or Better</option>
            </select>

            {/* Settings Button */}
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-scanner-settings">
                  <Settings size={16} />
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Scan Parameters</SheetTitle>
                  <SheetDescription>
                    Configure the parameters used by the scanner to identify trading opportunities
                  </SheetDescription>
                </SheetHeader>
                {isLoadingSettings ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="animate-spin mr-2" size={24} />
                    <span className="text-muted-foreground">Loading settings...</span>
                  </div>
                ) : (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((data) => {
                      if (isPreLoginMode) {
                        setShowAuthModal(true);
                        return;
                      }
                      saveSettingsMutation.mutate(data);
                    })} className="space-y-6 mt-6">
                    <div className="space-y-4">
                      {/* DTE Target Section */}
                      <div className="bg-muted/50 border border-border rounded-lg p-4">
                        <h4 className="font-semibold mb-3">Days to Expiration (DTE)</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="scanDteTarget"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Target DTE</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                                    data-testid="input-scan-dte-target"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="scanDteBuffer"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Buffer (±days)</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                                    data-testid="input-scan-dte-buffer"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormDescription className="mt-2">
                          Target 45 DTE ±5 days (40-50 DTE range)
                        </FormDescription>
                      </div>

                      {/* Credit Spread Delta Range */}
                      <div className="bg-muted/50 border border-border rounded-lg p-4">
                        <h4 className="font-semibold mb-3">Credit Spread Delta Range</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="scanDeltaMin"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Minimum Delta</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.01"
                                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                    data-testid="input-scan-delta-min"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="scanDeltaMax"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Maximum Delta</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.01"
                                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                    data-testid="input-scan-delta-max"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormDescription className="mt-2">
                          Delta range for Credit Spreads (0.25-0.30 recommended)
                        </FormDescription>
                      </div>

                      {/* Iron Condor Settings */}
                      <div className="bg-muted/50 border border-border rounded-lg p-4">
                        <h4 className="font-semibold mb-3">Iron Condor Settings</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="scanIcDeltaMin"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Minimum Delta</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.01"
                                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                    data-testid="input-scan-ic-delta-min"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="scanIcDeltaMax"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Maximum Delta</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.01"
                                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                    data-testid="input-scan-ic-delta-max"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name="scanIcWidth"
                          render={({ field }) => (
                            <FormItem className="mt-4">
                              <FormLabel>Spread Width</FormLabel>
                              <Select
                                value={field.value.toString()}
                                onValueChange={(val) => field.onChange(parseInt(val))}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-scan-ic-width">
                                    <SelectValue placeholder="Select spread width" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="5">$5 wide</SelectItem>
                                  <SelectItem value="10">$10 wide</SelectItem>
                                  <SelectItem value="15">$15 wide</SelectItem>
                                  <SelectItem value="20">$20 wide</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Width of each leg in the Iron Condor
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormDescription className="mt-2">
                          Delta range for Iron Condors (0.15-0.20 recommended)
                        </FormDescription>
                      </div>

                      {/* Credit Requirements */}
                      <div className="bg-muted/50 border border-border rounded-lg p-4">
                        <h4 className="font-semibold mb-3">Credit Requirements</h4>
                        <FormField
                          control={form.control}
                          name="scanMinCredit"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Minimum Credit ($)</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="number"
                                  step="0.01"
                                  onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                  data-testid="input-scan-min-credit"
                                />
                              </FormControl>
                              <FormDescription>
                                Minimum credit to receive (default: $1.20+)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Risk:Reward Ratio */}
                      <div className="bg-muted/50 border border-border rounded-lg p-4">
                        <h4 className="font-semibold mb-3">Risk:Reward Ratio</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="scanRrMin"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Minimum R:R</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.1"
                                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                    data-testid="input-scan-rr-min"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="scanRrMax"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Maximum R:R</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.1"
                                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                    data-testid="input-scan-rr-max"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormDescription className="mt-2">
                          Acceptable R:R range (1.5:1 to 3.5:1 recommended)
                        </FormDescription>
                      </div>

                      {/* Loss Limits */}
                      <div className="bg-muted/50 border border-border rounded-lg p-4">
                        <h4 className="font-semibold mb-3">Loss Limits</h4>
                        <FormField
                          control={form.control}
                          name="scanMaxLoss"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Maximum Loss ($)</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="number"
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                  data-testid="input-scan-max-loss"
                                />
                              </FormControl>
                              <FormDescription>
                                Base maximum loss threshold (default: $500)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="scanMaxLossBuffer"
                          render={({ field }) => (
                            <FormItem className="mt-4">
                              <FormLabel>Loss Buffer (%)</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="number"
                                  step="0.01"
                                  onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                  data-testid="input-scan-max-loss-buffer"
                                />
                              </FormControl>
                              <FormDescription>
                                Allow higher loss if R:R maintained (default: 0.25 = 25%)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Advanced Settings - Collapsible */}
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/30 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                          <span className="font-semibold text-sm">Advanced Settings</span>
                          <ChevronDown className="h-4 w-4" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="bg-muted/50 border border-t-0 border-border rounded-b-lg p-4 -mt-1">
                          <FormField
                            control={form.control}
                            name="scanMinOi"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Minimum Open Interest</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                                    data-testid="input-scan-min-oi"
                                  />
                                </FormControl>
                                <FormDescription>
                                  Global minimum OI for option contracts. Does NOT apply to LEAPs scanner.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </CollapsibleContent>
                      </Collapsible>
                    </div>

                    <div className="flex gap-2 pt-4 border-t">
                      <Button
                        type="submit"
                        disabled={saveSettingsMutation.isPending}
                        data-testid="button-save-scan-settings"
                        className="flex-1"
                      >
                        {saveSettingsMutation.isPending ? "Saving..." : "Save Parameters"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSettingsOpen(false)}
                        data-testid="button-cancel-scan-settings"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
                )}
              </SheetContent>
            </Sheet>
            {/* Run Scan Button */}
            <Button
              onClick={() => {
                if (isPreLoginMode) {
                  setShowAuthModal(true);
                  return;
                }
                if (!hasTickersInWatchlist) {
                  setShowEmptyWatchlistDialog(true);
                  return;
                }
                runScanMutation.mutate();
              }}
              disabled={isScanning}
              className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white"
              data-testid="button-run-scan"
              data-onboarding="scan-button"
            >
              <RefreshCw className={`mr-2 ${isScanning ? "animate-spin" : ""}`} size={16} />
              {isScanning ? "Scanning..." : "Run Scan"}
            </Button>
          </div>
        </div>
      </div>

      {/* Active Scan Indicator Banner */}
      {isScanning && (
        <Card className="mb-6 bg-gradient-to-r from-blue-500/10 to-primary/10 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <RefreshCw className="text-blue-600 dark:text-blue-400 animate-spin" size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Scan In Progress</p>
                <p className="text-xs text-muted-foreground">
                  Analyzing your watchlist for trading opportunities. This may take a few minutes...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <CandidateStrip scanResults={allResults} />
        </>
      )}

      {/* LEAPS Tab Content */}
      {scannerTab === "leaps" && (
        <div className="mb-8">
          {/* Page Header for LEAPS */}
          <div className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-3xl font-bold mb-2">LEAPS Scanner</h2>
                <p className="text-muted-foreground">
                  Find long-term call options with high intrinsic value and strong underlying fundamentals
                </p>
              </div>
              {/* Compact Market Context Badge */}
              {marketContext && (
                <button
                  onClick={() => setLocation("/scanner/market-context")}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border hover:bg-muted/80 transition-colors"
                  data-testid="badge-market-context-leaps"
                >
                  <BarChart3 size={16} className="text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Market:</span>
                  <span className={`text-xs font-bold ${
                    marketContext.marketRegime === 'bullish' ? 'text-green-600 dark:text-green-400' :
                    marketContext.marketRegime === 'bearish' ? 'text-red-600 dark:text-red-400' :
                    'text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {marketContext.marketRegime.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">VIX {marketContext.vixLevel.toFixed(1)}</span>
                </button>
              )}
            </div>
          </div>

          {/* LEAPS Controls */}
          <div className="mb-6">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              {/* Left: LEAPS Status */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="text-primary" size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">LEAPS Opportunities</p>
                  <p className="text-sm text-muted-foreground">
                    {leapsResults && leapsResults.length > 0 && leapsResults[0].asof 
                      ? `Updated ${formatDateTimeInET(leapsResults[0].asof)}` 
                      : 'No scans yet'}
                  </p>
                </div>
              </div>

              {/* Right: Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                  {/* Sort By */}
                  <select
                    value={leapsSortBy}
                    onChange={(e) => setLeapsSortBy(e.target.value)}
                    className="h-9 px-3 text-sm border border-border rounded-md bg-card text-foreground cursor-pointer hover:bg-muted/50 transition-colors"
                    data-testid="select-leaps-sort"
                  >
                    <option value="score">Sort: Zen Score</option>
                    <option value="extrinsic">Sort: Low Extrinsic</option>
                    <option value="delta">Sort: High Delta</option>
                    <option value="iv">Sort: Low IV Percentile</option>
                  </select>

                  {/* LEAPS Settings Button */}
                  <Sheet open={leapsSettingsOpen} onOpenChange={setLeapsSettingsOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="icon" data-testid="button-leaps-scanner-settings">
                        <Settings size={16} />
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>LEAPS Scan Parameters</SheetTitle>
                        <SheetDescription>
                          Configure the parameters used to identify deep ITM LEAPS opportunities
                        </SheetDescription>
                      </SheetHeader>
                      {isLoadingSettings ? (
                        <div className="flex items-center justify-center py-12">
                          <RefreshCw className="animate-spin mr-2" size={24} />
                          <span className="text-muted-foreground">Loading settings...</span>
                        </div>
                      ) : (
                        <Form {...leapsForm}>
                          <form onSubmit={leapsForm.handleSubmit((data) => {
                            if (isPreLoginMode) {
                              setShowAuthModal(true);
                              return;
                            }
                            saveLeapsSettingsMutation.mutate(data);
                          })} className="space-y-6 mt-6">
                            <div className="space-y-4">
                              <div className="bg-muted/50 border border-border rounded-lg p-4">
                                <h4 className="font-semibold mb-3">Delta Range</h4>
                                <p className="text-xs text-muted-foreground mb-3">
                                  Target deep ITM calls with high delta (0.70-0.90 typical)
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={leapsForm.control}
                                    name="leapsDeltaMin"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Minimum Delta</FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            type="number"
                                            step="0.01"
                                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                            data-testid="input-leaps-delta-min"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={leapsForm.control}
                                    name="leapsDeltaMax"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Maximum Delta</FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            type="number"
                                            step="0.01"
                                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                            data-testid="input-leaps-delta-max"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>

                              <div className="bg-muted/50 border border-border rounded-lg p-4">
                                <h4 className="font-semibold mb-3">Days to Expiration (DTE)</h4>
                                <p className="text-xs text-muted-foreground mb-3">
                                  LEAPS typically have 365+ days to expiration
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={leapsForm.control}
                                    name="leapsDteMin"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Minimum DTE</FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            type="number"
                                            step="1"
                                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                                            data-testid="input-leaps-dte-min"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={leapsForm.control}
                                    name="leapsDteMax"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Maximum DTE</FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            type="number"
                                            step="1"
                                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                                            data-testid="input-leaps-dte-max"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>

                              <div className="bg-muted/50 border border-border rounded-lg p-4">
                                <h4 className="font-semibold mb-3">In-The-Money (ITM) %</h4>
                                <p className="text-xs text-muted-foreground mb-3">
                                  How deep ITM the strike should be (10-20% typical)
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField
                                    control={leapsForm.control}
                                    name="leapsItmMin"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Minimum ITM %</FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            type="number"
                                            step="1"
                                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                                            data-testid="input-leaps-itm-min"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={leapsForm.control}
                                    name="leapsItmMax"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Maximum ITM %</FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            type="number"
                                            step="1"
                                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                                            data-testid="input-leaps-itm-max"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>

                              <div className="bg-muted/50 border border-border rounded-lg p-4">
                                <h4 className="font-semibold mb-3">Minimum ZLVI Score</h4>
                                <p className="text-xs text-muted-foreground mb-3">
                                  ZLVI (Zen LEAPS Value Index) combines extrinsic efficiency, IV percentile, and delta
                                </p>
                                <FormField
                                  control={leapsForm.control}
                                  name="leapsMinZlvi"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Minimum ZLVI (0-100)</FormLabel>
                                      <FormControl>
                                        <Input
                                          {...field}
                                          type="number"
                                          step="1"
                                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                                          data-testid="input-leaps-min-zlvi"
                                        />
                                      </FormControl>
                                      <FormDescription>
                                        Higher score = better value. 50+ is good, 70+ is excellent.
                                      </FormDescription>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-border">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setLeapsSettingsOpen(false)}
                                data-testid="button-leaps-settings-cancel"
                              >
                                Cancel
                              </Button>
                              <Button 
                                type="submit" 
                                disabled={saveLeapsSettingsMutation.isPending}
                                data-testid="button-leaps-settings-save"
                              >
                                {saveLeapsSettingsMutation.isPending ? (
                                  <>
                                    <RefreshCw className="mr-2 animate-spin" size={16} />
                                    Saving...
                                  </>
                                ) : (
                                  "Save Parameters"
                                )}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      )}
                    </SheetContent>
                  </Sheet>

                  {/* Run LEAPS Scan Button */}
                  <Button
                    onClick={() => {
                      if (isPreLoginMode) {
                        setShowAuthModal(true);
                        return;
                      }
                      runLeapsScanMutation.mutate();
                    }}
                    disabled={isLeapsScanning || runLeapsScanMutation.isPending}
                    size="sm"
                    className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground"
                    data-testid="button-run-leaps-scan"
                  >
                    <RefreshCw className={`mr-2 ${(isLeapsScanning || runLeapsScanMutation.isPending) ? "animate-spin" : ""}`} size={14} />
                    {(isLeapsScanning || runLeapsScanMutation.isPending) ? "Scanning..." : "Scan LEAPS"}
                  </Button>
              </div>
            </div>
          </div>

          {/* LEAPS Scanning Indicator */}
          {(isLeapsScanning || runLeapsScanMutation.isPending) && (
            <Card className="mb-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <RefreshCw className="text-primary animate-spin" size={20} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">LEAPS Scan In Progress</p>
                    <p className="text-xs text-muted-foreground">
                      Analyzing your watchlist for LEAPS opportunities...
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* LEAPS Results */}
          {isLoadingLeaps ? (
            <div className="text-center py-12">
              <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
              <p className="text-muted-foreground">Loading LEAPS results...</p>
            </div>
          ) : (sortedLeapsResults.length > 0 || nonQualifiedLeapsResults.length > 0) ? (
            <div>
              {/* Qualified LEAPS Candidates */}
              {sortedLeapsResults.length > 0 && (
                <>
                  <h3 className="text-xl font-semibold mb-4">LEAPS Candidates ({sortedLeapsResults.length})</h3>

                  <p className="text-sm text-muted-foreground mb-6">
                    Best pick per ticker. Click "Details" for full data.
                  </p>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sortedLeapsResults.map((result) => {
                  const zlviScore = result.zlviScore || 0;
                  const verdict = zlviScore >= 70 ? 'STRONG' : zlviScore >= 50 ? 'FAIR' : 'WEAK';
                  const verdictColor = verdict === 'STRONG' 
                    ? 'bg-green-600 text-white' 
                    : verdict === 'FAIR'
                    ? 'bg-blue-600 text-white'
                    : 'bg-amber-600 text-white';
                  
                  // Value rating: Lower extrinsic % = BETTER value (less time decay you're paying for)
                  // GREEN = GREAT (best), BLUE = GOOD (acceptable), AMBER = PRICEY (caution)
                  const extrinsicRating = (result.extrinsicPercent || 0) < 15 ? 'GREAT' : (result.extrinsicPercent || 0) < 30 ? 'GOOD' : 'PRICEY';
                  
                  // IV rating: Lower IV percentile = CHEAPER options (good time to buy)
                  // GREEN = CHEAP (best), BLUE = FAIR (ok), AMBER = PRICEY (caution)
                  const ivRating = (result.ivPercentile || 0) < 25 ? 'CHEAP' : (result.ivPercentile || 0) < 60 ? 'FAIR' : 'PRICEY';
                  
                  // Liquidity: Higher = better
                  const liqRating = result.liquidityFlag === 'excellent' ? 'STRONG' : result.liquidityFlag === 'good' ? 'OK' : 'THIN';
                  
                  return (
                    <Card
                      key={result.id}
                      className="border hover:border-primary transition-all hover:shadow-lg bg-card"
                      data-testid={`leaps-card-${result.symbol}`}
                    >
                      <CardContent className="p-4">
                        {/* Header Row */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold">{result.symbol}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${verdictColor}`}>
                              {verdict}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-lg font-bold text-primary">
                              ZLVI {zlviScore.toFixed(0)}
                            </span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="w-4 h-4 flex items-center justify-center hover:opacity-100 opacity-60 transition-opacity">
                                  <Info className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-52 p-2" side="left">
                                <p className="text-xs">Zen LEAPS Value Index. Weighted score: 50% extrinsic efficiency, 30% IV rank, 20% delta. Higher = better value.</p>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* Contract Info */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                          <span className="font-medium">${result.shortStrike}C</span>
                          <span className="text-muted-foreground/50">|</span>
                          <span>{result.expiry ? format(new Date(result.expiry), "yyyy-MM-dd") : "—"}</span>
                          <span className="text-muted-foreground/50">|</span>
                          <span>{result.dte}d</span>
                          <span className="ml-auto font-bold">
                            ${((result.premiumCents || 0) / 100).toFixed(2)}
                          </span>
                        </div>

                        {/* Quick Metrics Grid */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="relative">
                            <div className={`text-center py-2 px-1 rounded ${
                              extrinsicRating === 'GREAT' ? 'bg-green-100 dark:bg-green-900/40' :
                              extrinsicRating === 'GOOD' ? 'bg-blue-100 dark:bg-blue-900/40' :
                              'bg-amber-100 dark:bg-amber-900/40'
                            }`}>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Value</p>
                              <p className={`text-sm font-bold ${
                                extrinsicRating === 'GREAT' ? 'text-green-700 dark:text-green-300' :
                                extrinsicRating === 'GOOD' ? 'text-blue-700 dark:text-blue-300' :
                                'text-amber-700 dark:text-amber-300'
                              }`}>{extrinsicRating}</p>
                              <p className="text-[10px] text-muted-foreground">{result.extrinsicPercent?.toFixed(0)}% ext</p>
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center hover:opacity-100 opacity-60 transition-opacity">
                                  <Info className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-2" side="top">
                                <p className="text-xs">Extrinsic (time) value %. Lower = better value. GREAT: &lt;15%, GOOD: 15-30%, PRICEY: &gt;30%.</p>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="relative">
                            <div className={`text-center py-2 px-1 rounded ${
                              ivRating === 'CHEAP' ? 'bg-green-100 dark:bg-green-900/40' :
                              ivRating === 'FAIR' ? 'bg-blue-100 dark:bg-blue-900/40' :
                              'bg-amber-100 dark:bg-amber-900/40'
                            }`}>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">IV</p>
                              <p className={`text-sm font-bold ${
                                ivRating === 'CHEAP' ? 'text-green-700 dark:text-green-300' :
                                ivRating === 'FAIR' ? 'text-blue-700 dark:text-blue-300' :
                                'text-amber-700 dark:text-amber-300'
                              }`}>{ivRating}</p>
                              <p className="text-[10px] text-muted-foreground">{result.ivPercentile?.toFixed(0)}%ile</p>
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center hover:opacity-100 opacity-60 transition-opacity">
                                  <Info className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-2" side="top">
                                <p className="text-xs">IV Percentile vs. 52-week range. LOW = options cheap, good entry. HIGH = premiums inflated.</p>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="relative">
                            <div className={`text-center py-2 px-1 rounded ${
                              liqRating === 'STRONG' ? 'bg-green-100 dark:bg-green-900/40' :
                              liqRating === 'OK' ? 'bg-blue-100 dark:bg-blue-900/40' :
                              'bg-amber-100 dark:bg-amber-900/40'
                            }`}>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Liquidity</p>
                              <p className={`text-sm font-bold ${
                                liqRating === 'STRONG' ? 'text-green-700 dark:text-green-300' :
                                liqRating === 'OK' ? 'text-blue-700 dark:text-blue-300' :
                                'text-amber-700 dark:text-amber-300'
                              }`}>{liqRating}</p>
                              <p className="text-[10px] text-muted-foreground">{(result.oi || 0).toLocaleString()} OI</p>
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center hover:opacity-100 opacity-60 transition-opacity">
                                  <Info className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-2" side="top">
                                <p className="text-xs">Open interest + bid/ask spread. THIN = wide spreads, harder fills.</p>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* Underlying Quality + Market Sentiment Row */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="relative">
                            <div className={`text-center py-1.5 px-2 rounded border ${
                              result.uqsRating === 'STRONG' ? 'border-green-500/30 bg-green-50 dark:bg-green-900/20' :
                              result.uqsRating === 'FAIR' ? 'border-blue-500/30 bg-blue-50 dark:bg-blue-900/20' :
                              'border-amber-500/30 bg-amber-50 dark:bg-amber-900/20'
                            }`}>
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground uppercase">Quality</span>
                                <span className={`text-xs font-bold ${
                                  result.uqsRating === 'STRONG' ? 'text-green-700 dark:text-green-300' :
                                  result.uqsRating === 'FAIR' ? 'text-blue-700 dark:text-blue-300' :
                                  'text-amber-700 dark:text-amber-300'
                                }`}>{result.uqsRating || 'N/A'}</span>
                                {result.uqsScore && <span className="text-[10px] text-muted-foreground">({result.uqsScore})</span>}
                              </div>
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center hover:opacity-100 opacity-60 transition-opacity">
                                  <Info className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-2" side="bottom">
                                <p className="text-xs font-medium mb-1">Underlying Quality Score</p>
                                <p className="text-xs text-muted-foreground">{result.uqsInsight || 'Measures trend, cash flow, stability, and earnings.'}</p>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="relative">
                            <div className={`text-center py-1.5 px-2 rounded border ${
                              result.marketSentiment === 'bullish' ? 'border-green-500/30 bg-green-50 dark:bg-green-900/20' :
                              result.marketSentiment === 'bearish' ? 'border-red-500/30 bg-red-50 dark:bg-red-900/20' :
                              'border-gray-300/50 bg-gray-50 dark:bg-gray-800/30'
                            }`}>
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground uppercase">Market</span>
                                <span className={`text-xs font-bold ${
                                  result.marketSentiment === 'bullish' ? 'text-green-700 dark:text-green-300' :
                                  result.marketSentiment === 'bearish' ? 'text-red-700 dark:text-red-300' :
                                  'text-muted-foreground'
                                }`}>{result.marketSentiment?.toUpperCase() || 'N/A'}</span>
                              </div>
                            </div>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center hover:opacity-100 opacity-60 transition-opacity">
                                  <Info className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-2" side="bottom">
                                <p className="text-xs font-medium mb-1">AI Market Analysis</p>
                                <p className="text-xs text-muted-foreground">{result.marketInsight || 'Market regime and LEAPS confidence from AI analysis.'}</p>
                                {result.leapsConfidence && <p className="text-xs text-muted-foreground mt-1">LEAPS Confidence: {result.leapsConfidence}%</p>}
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* One-liner Guidance */}
                        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                          {verdict === 'STRONG' 
                            ? `${extrinsicRating === 'GREAT' ? 'Low time decay.' : ''} ${ivRating === 'CHEAP' ? 'Options cheap.' : ''} Good entry.`
                            : verdict === 'FAIR'
                            ? `Acceptable if bullish. ${ivRating === 'PRICEY' ? 'IV elevated.' : ''} Use limits.`
                            : `Below-average value. ${extrinsicRating === 'PRICEY' ? 'High decay risk.' : ''} Review carefully.`
                          }
                        </p>

                        {/* Collapsible Details with Tabs */}
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-foreground">
                              <ChevronDown className="mr-1 h-3 w-3" />
                              Details
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-3 border-t mt-2">
                            <Tabs defaultValue="technical" className="w-full">
                              <TabsList className="grid w-full grid-cols-2 h-7">
                                <TabsTrigger value="technical" className="text-xs py-1">Technical</TabsTrigger>
                                <TabsTrigger value="fundamentals" className="text-xs py-1">Fundamentals</TabsTrigger>
                              </TabsList>
                              <TabsContent value="technical" className="mt-2">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Delta</span>
                                    <span className="font-medium">{result.delta?.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">ITM %</span>
                                    <span className="font-medium">{result.itmPercent?.toFixed(1)}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Extrinsic</span>
                                    <span className="font-medium">${((result.extrinsicCents || 0) / 100).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Intrinsic</span>
                                    <span className="font-medium">${((result.intrinsicCents || 0) / 100).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Bid/Ask Spread</span>
                                    <span className="font-medium">${((result.baCents || 0) / 100).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Open Interest</span>
                                    <span className="font-medium">{(result.oi || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">IV Percentile</span>
                                    <span className="font-medium">{(result.ivPercentile || 0).toFixed(0)}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">ZLVI Score</span>
                                    <span className="font-medium">{result.zlviScore?.toFixed(0) || 'N/A'}</span>
                                  </div>
                                </div>
                              </TabsContent>
                              <TabsContent value="fundamentals" className="mt-2">
                                <FundamentalsTab result={result} />
                              </TabsContent>
                            </Tabs>
                          </CollapsibleContent>
                        </Collapsible>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
                </>
              )}

              {/* Non-qualified LEAPS - Show reasons for failures */}
              {nonQualifiedLeapsResults.length > 0 && (
                <div className={sortedLeapsResults.length > 0 ? "mt-8" : ""}>
                  <div className="flex items-center gap-3 mb-4">
                    <AlertCircle className="text-amber-500" size={24} />
                    <h3 className="text-lg font-semibold text-muted-foreground">
                      {sortedLeapsResults.length > 0 ? "Other Symbols" : "Scanned Symbols"} ({nonQualifiedLeapsResults.length})
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    {sortedLeapsResults.length > 0 
                      ? "These symbols didn't have qualifying LEAPS options:"
                      : "No qualified LEAPS found. Here's why for each symbol:"}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {nonQualifiedLeapsResults.map((result) => (
                      <Card key={result.id} className="border border-border" data-testid={`leaps-no-result-${result.symbol}`}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">{result.symbol}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                              {result.status === 'no_leaps_available' ? 'No LEAPS' :
                               result.status === 'no_qualified_options' ? 'No Match' : 'Error'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {result.reasonTag || result.reason || 'Unknown reason'}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : !(isLeapsScanning || runLeapsScanMutation.isPending) && leapsResults ? (
            <Card className="text-center py-12">
              <CardContent>
                <TrendingUp className="mx-auto mb-4 text-muted-foreground" size={48} />
                <p className="text-muted-foreground mb-2">No LEAPS scan results</p>
                <p className="text-sm text-muted-foreground">
                  Run a scan to find LEAPS opportunities
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <TrendingUp className="mx-auto mb-4 text-muted-foreground" size={48} />
                <p className="text-muted-foreground mb-4">Run a LEAPS scan to find opportunities</p>
                <Button
                  onClick={() => {
                    if (isPreLoginMode) {
                      setShowAuthModal(true);
                      return;
                    }
                    runLeapsScanMutation.mutate();
                  }}
                  disabled={isLeapsScanning || runLeapsScanMutation.isPending}
                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground"
                  data-testid="button-run-leaps-scan-empty"
                >
                  <RefreshCw className="mr-2" size={16} />
                  Scan LEAPS
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Regular CS/IC Scan Results - In CS/IC Tab content */}
      {scannerTab === "cs-ic" && (isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading scan results...</p>
        </div>
      ) : groupedResults && (filteredQualified.length > 0 || filteredSetupOnly.length > 0 || groupedResults.others.length > 0) ? (
        <>
          {/* Ready Candidates Section */}
          {filteredQualified.length > 0 && (
            <div className="mb-8" data-onboarding="ready-candidates">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="text-green-600 dark:text-green-500" size={24} />
                <h3 className="text-xl font-semibold">Ready Candidates ({filteredQualified.length})</h3>
              </div>

              <p className="text-sm text-muted-foreground mb-6">
                These opportunities have both the right technical setup AND option spreads that meet all our systematic criteria (delta, R:R, DTE, premium).
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredQualified.map((result) => {
                  const rating = getRating(result.score);
                  const creditAmount = ((result.creditMidCents || 0) / 100).toFixed(2);
                  const maxProfit = ((result.creditMidCents || 0) / 100) * 100; // creditMidCents is per-share, multiply by 100 for contract
                  const maxLoss = (result.maxLossCents || 0) / 100; // maxLossCents is already per-contract, just convert cents to dollars
                  const pop = result.score?.toFixed(1) || "—";
                  const isIronCondor = result.strategyType === 'IRON_CONDOR';
                  
                  return (
                    <div
                      key={result.id}
                      className={`bg-card border-2 rounded-xl p-6 flex flex-col gap-5 transition-all hover:-translate-y-1 hover:shadow-xl ${
                        isIronCondor 
                          ? 'border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600' 
                          : 'border-green-200 dark:border-green-800 hover:border-green-400 dark:hover:border-green-600'
                      }`}
                      data-testid={`qualified-${result.symbol}`}
                    >
                      {/* Header */}
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h4 className="text-2xl font-bold mb-2">
                            {result.symbol} <span className={`text-base font-medium ${
                              isIronCondor 
                                ? 'text-purple-600 dark:text-purple-400' 
                                : 'text-green-600 dark:text-green-400'
                            }`}>
                              {isIronCondor 
                                ? "Iron Condor" 
                                : `${result.signal?.includes("PUT") ? "Put" : "Call"} Credit Spread`}
                            </span>
                          </h4>
                          <div className={`inline-flex px-3 py-1.5 rounded-lg text-sm font-semibold ${
                            isIronCondor 
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' 
                              : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                          }`}>
                            ${creditAmount} Credit
                          </div>
                        </div>
                        <div className={`px-3 py-1.5 rounded-lg text-sm font-bold uppercase whitespace-nowrap flex items-center gap-2 ${rating.colorClass}`}>
                          {rating.rating}
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/30 dark:bg-black/30">
                            {pop}
                          </span>
                        </div>
                      </div>

                      {/* Metrics Grid */}
                      <div className="bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/20 dark:to-muted/10 rounded-xl p-4 flex flex-col gap-3">
                        {result.strategyType === 'IRON_CONDOR' ? (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Put Spread</div>
                                <div className="font-semibold text-foreground">{result.shortStrike?.toFixed(0)} / {result.longStrike?.toFixed(0)}</div>
                              </div>
                              <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Call Spread</div>
                                <div className="font-semibold text-foreground">{result.callShortStrike?.toFixed(0)} / {result.callLongStrike?.toFixed(0)}</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Put Delta</div>
                                <div className="font-semibold text-foreground">Δ{result.putDelta?.toFixed(2) || result.delta?.toFixed(2)}</div>
                              </div>
                              <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Call Delta</div>
                                <div className="font-semibold text-foreground">Δ{result.callDelta?.toFixed(2)}</div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Strike / Strike</div>
                              <div className="font-semibold text-foreground">{result.shortStrike?.toFixed(0)} / {result.longStrike?.toFixed(0)}</div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Width / Delta</div>
                              <div className="font-semibold text-foreground">${result.width?.toFixed(0)} / Δ{result.delta?.toFixed(2)}</div>
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">DTE / Expiry</div>
                            <div className="font-semibold text-foreground">{result.dte}d / {result.expiry ? format(new Date(result.expiry), "MMM dd") : "—"}</div>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">R:R Ratio</div>
                            <div className="font-semibold text-green-600 dark:text-green-400">{result.rr?.toFixed(2)}:1</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Max Profit / Loss</div>
                            <div className="font-semibold">
                              <span className="text-green-600 dark:text-green-400">${maxProfit.toFixed(0)}</span>
                              {" / "}
                              <span className="text-red-600 dark:text-red-400">-${maxLoss.toFixed(0)}</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">PoP</div>
                            <div className="font-semibold text-foreground">{pop}%</div>
                          </div>
                        </div>
                      </div>

                      {/* Why This Qualifies */}
                      <div className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/20 border-l-4 border-primary rounded-lg p-4">
                        <h5 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                          <CheckCircle size={16} className="text-primary" />
                          Why This Qualifies
                        </h5>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start gap-2 text-sm">
                            <CheckCircle size={16} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">
                              <strong className="text-foreground">Technical Setup:</strong> {result.signal || "Entry conditions met"}
                            </span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <CheckCircle size={16} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">
                              <strong className="text-foreground">Ideal DTE Window:</strong> {result.dte} days provides optimal time decay
                            </span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <CheckCircle size={16} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">
                              <strong className="text-foreground">High Probability Setup:</strong> {pop}% probability of profit with delta {result.delta?.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <CheckCircle size={16} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">
                              <strong className="text-foreground">Solid Credit:</strong> ${creditAmount}/contract on ${result.width?.toFixed(0)} width = {((parseFloat(creditAmount) / (result.width || 1)) * 100).toFixed(1)}% return
                            </span>
                          </div>
                          {(() => {
                            const analysisLog = result.analysisLog || '';
                            const hasMarketContext = analysisLog.includes('📊 Market Context:');
                            const isAligned = analysisLog.includes('Market Alignment:') && analysisLog.includes('Score boosted');
                            const isMisaligned = analysisLog.includes('Market Misalignment:') && analysisLog.includes('Score reduced');
                            
                            // Parse market sentiment from the log for more detailed display
                            let marketSentiment = '';
                            let tradeDirection = '';
                            const misalignmentMatch = analysisLog.match(/Market Misalignment:.*?(\w+)\s+spread.*?(\w+)\s+sentiment/i);
                            const alignmentMatch = analysisLog.match(/Market Alignment:.*?(\w+)\s+spread.*?(\w+)\s+sentiment/i);
                            
                            if (misalignmentMatch) {
                              tradeDirection = misalignmentMatch[1]; // CALL or PUT
                              marketSentiment = misalignmentMatch[2]; // BULLISH or BEARISH
                            } else if (alignmentMatch) {
                              tradeDirection = alignmentMatch[1];
                              marketSentiment = alignmentMatch[2];
                            }
                            
                            if (hasMarketContext) {
                              return (
                                <div className="flex items-start gap-2 text-sm">
                                  {isAligned ? (
                                    <CheckCircle size={16} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                  ) : isMisaligned ? (
                                    <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                  ) : (
                                    <Info size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                  )}
                                  <span className="text-muted-foreground">
                                    <strong className="text-foreground">AI Market Analysis:</strong>{' '}
                                    {isAligned && (
                                      marketSentiment 
                                        ? `${tradeDirection} spread aligns with ${marketSentiment.toLowerCase()} market (+15% boost)`
                                        : "Trade aligns with market sentiment (+15% confidence boost)"
                                    )}
                                    {isMisaligned && (
                                      marketSentiment 
                                        ? `Counter-trend: ${tradeDirection} spread vs ${marketSentiment.toLowerCase()} market (-30% reduction)`
                                        : "Counter-trend trade vs market sentiment (-30% reduction)"
                                    )}
                                    {!isAligned && !isMisaligned && "Neutral market sentiment (no adjustment applied)"}
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2 border-t border-border">
                        <Button
                          variant="default"
                          className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm sm:text-base"
                          onClick={() => {
                            setAnalysisModalResult(result);
                            setAnalysisModalOpen(true);
                          }}
                          data-testid={`button-view-analysis-${result.symbol}`}
                        >
                          <BarChart3 className="mr-2" size={16} />
                          View Full Analysis
                        </Button>
                        <Button
                          variant="default"
                          className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-sm sm:text-base"
                          onClick={() => handleAddOrder(result)}
                          data-testid={`button-add-order-${result.symbol}`}
                        >
                          <Plus className="mr-2" size={16} />
                          Add to Positions
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isPreLoginMode && groupedResults.others.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Info className="text-muted-foreground" size={24} />
                <h3 className="text-xl font-semibold">Others - No Signal/Error ({groupedResults.others.length})</h3>
              </div>

              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="divide-y divide-border">
                  {groupedResults.others.map((result) => (
                    <div
                      key={result.id}
                      className="p-6"
                      data-testid={`other-${result.symbol}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold mono">{result.symbol}</span>
                          <span className="px-2 py-1 text-xs rounded font-medium bg-muted text-muted-foreground">
                            {result.status === 'no_signal' ? 'NO SIGNAL' : 'ERROR'}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {result.reason || "No entry conditions met"}
                          </span>
                        </div>
                      </div>

                      {result.analysisLog && (
                        <Collapsible open={expanded[result.id!]} onOpenChange={() => toggleExpand(result.id)}>
                          <CollapsibleTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="gap-2"
                              data-testid={`toggle-analysis-${result.symbol}`}
                            >
                              {expanded[result.id!] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              Analysis
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-4">
                            <div className="rounded-md border border-border bg-muted/30 p-4">
                              <p className="text-sm font-medium mb-2">Analysis Log</p>
                              <pre className="text-xs mono bg-background/60 p-4 rounded overflow-x-auto whitespace-pre-wrap border border-border">
                                {result.analysisLog}
                              </pre>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No scan results available</p>
          <Button onClick={() => runScanMutation.mutate()} data-testid="button-run-first-scan">
            <RefreshCw className="mr-2" size={16} />
            Run First Scan
          </Button>
        </div>
      ))}

      <AddTradeModal 
        open={isAddTradeOpen} 
        onOpenChange={setIsAddTradeOpen}
        status="order"
        initialValues={selectedScanResult ? {
          symbol: selectedScanResult.symbol,
          type: selectedScanResult.signal?.includes("PUT") ? "PUT" : "CALL",
          shortStrike: selectedScanResult.shortStrike || 0,
          longStrike: selectedScanResult.longStrike || 0,
          expiry: selectedScanResult.expiry ? new Date(selectedScanResult.expiry) : undefined,
          entryCredit: selectedScanResult.creditMidCents ? selectedScanResult.creditMidCents / 100 : 0,
          notes: `Added from scanner. Score: ${selectedScanResult.score?.toFixed(1) || "N/A"}. ${selectedScanResult.signal || ""}`,
        } : undefined}
      />

      <AddIronCondorModal 
        open={isAddIronCondorOpen} 
        onOpenChange={setIsAddIronCondorOpen}
        status="order"
        initialValues={selectedScanResult ? {
          symbol: selectedScanResult.symbol,
          putShortStrike: selectedScanResult.shortStrike || 0,
          putLongStrike: selectedScanResult.longStrike || 0,
          callShortStrike: selectedScanResult.callShortStrike || 0,
          callLongStrike: selectedScanResult.callLongStrike || 0,
          expiry: selectedScanResult.expiry ? new Date(selectedScanResult.expiry) : undefined,
          entryCredit: selectedScanResult.creditMidCents ? selectedScanResult.creditMidCents / 100 : 0,
          notes: `Added from scanner. Score: ${selectedScanResult.score?.toFixed(1) || "N/A"}. ${selectedScanResult.signal || ""}`,
        } : undefined}
      />
      
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />

      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl">Daily Scan Limit Reached</AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              You've reached the <strong>Free tier limit of 2 manual scans per day</strong>.
              <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
                <div className="flex items-start gap-3">
                  <Crown className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground mb-1">Upgrade to Pro for:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>✓ Unlimited manual scans</li>
                      <li>✓ 4 automated scans daily (pre-market, open, intraday, close)</li>
                      <li>✓ Unlimited watchlist tickers</li>
                      <li>✓ Unlimited positions</li>
                      <li>✓ Telegram alerts for position monitoring</li>
                    </ul>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-scan-upgrade">Stay on Free</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowUpgradeDialog(false);
                setLocation('/subscription');
              }}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-upgrade-scan-pro"
            >
              <Crown className="mr-2 h-4 w-4" />
              Upgrade to Pro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty Watchlist Dialog */}
      <AlertDialog open={showEmptyWatchlistDialog} onOpenChange={setShowEmptyWatchlistDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Info className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl">No Tickers in Watchlist</AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              You need to add tickers to your watchlist before running a scan. The scanner analyzes tickers in your watchlist to find trading opportunities.
              <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
                <p className="text-sm text-muted-foreground">
                  New to Zen Options? Our Quickstart will help you add tickers and run your first scan in minutes.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-empty-watchlist">Close</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowEmptyWatchlistDialog(false);
                startQuickStart();
              }}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-start-quickstart"
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Start Quickstart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Full Analysis Modal */}
      <Dialog open={analysisModalOpen} onOpenChange={setAnalysisModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <BarChart3 className="text-primary" />
              {analysisModalResult?.symbol} - Full Analysis
            </DialogTitle>
          </DialogHeader>
          
          {analysisModalResult && <QualifiedAnalysis result={analysisModalResult} />}
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}

function CandidateStrip({ scanResults }: { scanResults: ScanResult[] }) {
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [selectedSetup, setSelectedSetup] = useState<ScanResult | null>(null);
  
  if (!scanResults || scanResults.length === 0) return null;
  
  // Separate qualified (TRADE), setup only, and no signal
  const tradeResults = scanResults.filter(r => r.status === 'qualified');
  const setupResults = scanResults.filter(r => r.status === 'no_qualified_spread');
  const noSignalResults = scanResults.filter(r => r.status === 'no_signal');
  
  if (tradeResults.length === 0 && setupResults.length === 0 && noSignalResults.length === 0) return null;
  
  const getRating = (score: number | null | undefined) => {
    if (!score) return { rating: "FAIR", colorClass: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400" };
    if (score >= 85) return { rating: "EXCELLENT", colorClass: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400" };
    if (score >= 70) return { rating: "GOOD", colorClass: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400" };
    return { rating: "FAIR", colorClass: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400" };
  };
  
  const renderCompactCard = (result: ScanResult) => {
    const isPut = result.signal?.includes("PUT");
    const isQualified = result.status === 'qualified';
    const isNoSignal = result.status === 'no_signal';
    const isSetup = result.status === 'no_qualified_spread';
    const isIronCondor = result.strategyType === 'IRON_CONDOR';
    const creditAmount = ((result.creditMidCents || 0) / 100).toFixed(2);
    
    const getStrategyLabel = () => {
      if (isNoSignal) {
        // Show which strategy was scanned for no-signal items
        if (isIronCondor) return 'IC - NO SIGNAL';
        return 'CS - NO SIGNAL';
      }
      if (isSetup) {
        // Show strategy type for setups
        if (isIronCondor) return 'IC SETUP';
        return isPut ? 'CS PUT SETUP' : 'CS CALL SETUP';
      }
      if (isIronCondor) return 'IRON CONDOR';
      return isPut ? 'PUT SPREAD' : 'CALL SPREAD';
    };
    
    return (
      <div
        key={result.id}
        className={`bg-card border border-border rounded-lg p-3 flex flex-col gap-1.5 transition-all hover:border-primary hover:shadow-sm min-w-[120px] ${
          !isQualified ? 'cursor-pointer' : ''
        }`}
        data-testid={`monitor-${result.symbol}`}
        onClick={() => {
          if (!isQualified) {
            setSelectedSetup(result);
            setSetupModalOpen(true);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-base">{result.symbol}</span>
          {isQualified && result.score && (
            <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
              result.score >= 85 
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                : result.score >= 70
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
            }`}>
              {Math.round(result.score)}
            </span>
          )}
        </div>
        <div className="inline-flex items-center gap-1.5 w-fit">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
            isQualified 
              ? isIronCondor 
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400'
                : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
              : isNoSignal
              ? 'bg-slate-100 dark:bg-slate-900/30 text-slate-800 dark:text-slate-400'
              : isSetup
              ? isIronCondor
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-400'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400'
          }`}>
            {getStrategyLabel()}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {isQualified && creditAmount && parseFloat(creditAmount) > 0 
            ? `$${creditAmount} Credit`
            : isNoSignal
            ? 'No Setup'
            : 'No Spread'
          }
        </div>
      </div>
    );
  };
  
  return (
    <>
      <div className="mb-6" data-onboarding="scan-results">
        <h3 className="text-base sm:text-lg font-semibold mb-3">Candidates to Monitor</h3>
        <Tabs defaultValue="trade" className="bg-card border border-border rounded-lg p-3 sm:p-4">
          <div className="overflow-x-auto -mx-1 px-1 mb-4">
            <TabsList className="w-max min-w-full sm:w-auto">
              <TabsTrigger value="trade" className="text-xs sm:text-sm whitespace-nowrap" data-testid="tab-monitor-trade">
                <span className="hidden sm:inline">Ready to Trade</span>
                <span className="sm:hidden">Trade</span>
                <span className="ml-1">({tradeResults.length})</span>
              </TabsTrigger>
              <TabsTrigger value="setup" className="text-xs sm:text-sm whitespace-nowrap" data-testid="tab-monitor-setup">
                <span className="hidden sm:inline">Setup Only</span>
                <span className="sm:hidden">Setup</span>
                <span className="ml-1">({setupResults.length})</span>
              </TabsTrigger>
              <TabsTrigger value="nosignal" className="text-xs sm:text-sm whitespace-nowrap" data-testid="tab-monitor-nosignal">
                <span className="hidden sm:inline">No Signal</span>
                <span className="sm:hidden">No Sig</span>
                <span className="ml-1">({noSignalResults.length})</span>
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="trade">
            <p className="text-sm text-muted-foreground mb-3">
              Tickers with both technical setup and qualified option spreads ready for entry.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {tradeResults.map(renderCompactCard)}
            </div>
          </TabsContent>
          
          <TabsContent value="setup">
            <p className="text-sm text-muted-foreground mb-3">
              Tickers with technical signals but no qualified spreads yet. Monitor for spread opportunities.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {setupResults.map(renderCompactCard)}
            </div>
          </TabsContent>
          
          <TabsContent value="nosignal">
            <p className="text-sm text-muted-foreground mb-3">
              Tickers scanned but no technical signal or qualified spreads found. Not currently in a favorable trading setup.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {noSignalResults.map(renderCompactCard)}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Setup Analysis Modal */}
      <Dialog open={setupModalOpen} onOpenChange={setSetupModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {selectedSetup?.symbol} - Setup Analysis
            </DialogTitle>
            <DialogDescription>
              Technical setup detected. Waiting for qualified option spreads.
            </DialogDescription>
          </DialogHeader>
          {selectedSetup && <SetupAnalysis result={selectedSetup} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function QualifiedAnalysis({ result }: { result: ScanResult }) {
  const { data: indicator } = useQuery({
    queryKey: ["/api/indicators", result.symbol, "latest"],
    queryFn: async () => {
      const res = await fetch(`/api/indicators/${result.symbol}/latest`);
      return res.json();
    }
  });
  
  const { data: ticker } = useQuery({
    queryKey: ["/api/tickers", result.symbol],
    queryFn: async () => {
      const res = await fetch(`/api/tickers/${result.symbol}`);
      return res.json();
    }
  });

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const currentPrice = indicator?.price || 0;
  const shortStrike = result.shortStrike || 0;
  const longStrike = result.longStrike || 0;
  
  // Get S/R from new array format (highest confidence level)
  const supportLevels = (ticker?.supportLevels as any[]) || [];
  const resistanceLevels = (ticker?.resistanceLevels as any[]) || [];
  const support = supportLevels[0]?.value || 0;
  const resistance = resistanceLevels[0]?.value || 0;
  const supportConfidence = supportLevels[0]?.confidence;
  const resistanceConfidence = resistanceLevels[0]?.confidence;
  
  const maxProfit = ((result.creditMidCents || 0) / 100) * 100; // creditMidCents is per-share, multiply by 100 for contract
  const maxLoss = (result.maxLossCents || 0) / 100; // maxLossCents is already per-contract, just convert cents to dollars

  // Check market context alignment from analysisLog
  const analysisLog = result.analysisLog || '';
  const isAligned = analysisLog.includes('Market Alignment:') && analysisLog.includes('Score boosted');
  const isMisaligned = analysisLog.includes('Market Misalignment:') && analysisLog.includes('Score reduced');
  const hasMarketContext = analysisLog.includes('📊 Market Context:');
  
  // Parse market sentiment from the log for more detailed display
  let marketSentiment = '';
  let tradeDirection = '';
  const misalignmentMatch = analysisLog.match(/Market Misalignment:.*?(\w+)\s+spread.*?(\w+)\s+sentiment/i);
  const alignmentMatch = analysisLog.match(/Market Alignment:.*?(\w+)\s+spread.*?(\w+)\s+sentiment/i);
  
  if (misalignmentMatch) {
    tradeDirection = misalignmentMatch[1]; // CALL or PUT
    marketSentiment = misalignmentMatch[2]; // BULLISH or BEARISH
  } else if (alignmentMatch) {
    tradeDirection = alignmentMatch[1];
    marketSentiment = alignmentMatch[2];
  }
  
  // Parse market regime from log if available
  let marketContextBadge = null;
  if (hasMarketContext) {
    if (isAligned) {
      marketContextBadge = (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
          <span className="text-green-600 dark:text-green-400 font-semibold text-xs">✅ Trade Aligned</span>
          <span className="text-green-700 dark:text-green-300 text-xs">
            {marketSentiment ? `${tradeDirection} spread + ${marketSentiment.toLowerCase()} market (+15%)` : '+15% confidence boost'}
          </span>
        </div>
      );
    } else if (isMisaligned) {
      marketContextBadge = (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <span className="text-amber-600 dark:text-amber-400 font-semibold text-xs">⚠️ Counter-trend Trade</span>
          <span className="text-amber-700 dark:text-amber-300 text-xs">
            {marketSentiment ? `${tradeDirection} spread vs ${marketSentiment.toLowerCase()} market (-30%)` : '-30% confidence reduction'}
          </span>
        </div>
      );
    } else {
      marketContextBadge = (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
          <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">🔵 Neutral Sentiment</span>
          <span className="text-blue-700 dark:text-blue-300 text-xs">No market adjustment applied</span>
        </div>
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Market Context Badge */}
      {marketContextBadge && (
        <div className="flex items-center justify-between">
          {marketContextBadge}
        </div>
      )}
      
      <Tabs defaultValue="analysis" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="analysis" data-testid="tab-technical-analysis">
            <BarChart3 className="mr-2" size={16} />
            Technical Analysis
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-scan-logs">
            <ChartLine className="mr-2" size={16} />
            Scan Logs
          </TabsTrigger>
        </TabsList>

      {/* Technical Analysis Tab */}
      <TabsContent value="analysis" className="space-y-4">
        {/* Technical Indicators */}
        <div className="bg-muted/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" />
            Technical Indicators
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">RSI (14)</p>
              <p className="text-lg font-bold">{indicator?.rsi14?.toFixed(2) ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">StochRSI K/D</p>
              <p className="text-lg font-bold">{indicator?.stochK?.toFixed(2) ?? "—"}/{indicator?.stochD?.toFixed(2) ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">ATR</p>
              <p className="text-lg font-bold">{indicator?.atr14?.toFixed(2) ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Open Interest</p>
              <p className="text-lg font-bold">{result.oi ? result.oi.toLocaleString() : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Price</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">${currentPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Support</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{support ? `$${support}` : "Not set"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Resistance</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{resistance ? `$${resistance}` : "Not set"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Bid-Ask Spread</p>
              <p className="text-lg font-bold">{result.baCents ? `$${(result.baCents / 100).toFixed(2)}` : "—"}</p>
            </div>
          </div>
        </div>

        {/* Support & Resistance */}
        <div className="bg-muted/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Support & Resistance Levels</h4>
          <div className="space-y-2">
            {resistance > 0 && (
              <div className="grid grid-cols-3 gap-4 p-2 rounded bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500">
                <span className="text-sm text-muted-foreground">Resistance</span>
                <span className="text-sm font-bold">${resistance.toFixed(2)}</span>
                <span className="text-sm text-muted-foreground text-right">
                  {currentPrice > 0 ? `+${((resistance - currentPrice) / currentPrice * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 p-2 rounded bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
              <span className="text-sm text-muted-foreground">Current Price</span>
              <span className="text-sm font-bold">${currentPrice.toFixed(2)}</span>
              <span className="text-sm text-muted-foreground text-right">—</span>
            </div>
            {shortStrike > 0 && (
              <div className="grid grid-cols-3 gap-4 p-2 rounded bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500">
                <span className="text-sm text-muted-foreground">Short Strike</span>
                <span className="text-sm font-bold">${shortStrike.toFixed(2)}</span>
                <span className="text-sm text-muted-foreground text-right">
                  {currentPrice > 0 ? `${((shortStrike - currentPrice) / currentPrice * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            )}
            {support > 0 && (
              <div className="grid grid-cols-3 gap-4 p-2 rounded bg-green-100 dark:bg-green-900/30 border-l-4 border-green-600">
                <span className="text-sm text-muted-foreground">Support</span>
                <span className="text-sm font-bold">${support.toFixed(2)}</span>
                <span className="text-sm text-muted-foreground text-right">
                  {currentPrice > 0 ? `${((support - currentPrice) / currentPrice * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            )}
            {longStrike > 0 && (
              <div className="grid grid-cols-3 gap-4 p-2 rounded bg-gray-50 dark:bg-gray-900/20 border-l-4 border-gray-500">
                <span className="text-sm text-muted-foreground">Long Strike</span>
                <span className="text-sm font-bold">${longStrike.toFixed(2)}</span>
                <span className="text-sm text-muted-foreground text-right">
                  {currentPrice > 0 ? `${((longStrike - currentPrice) / currentPrice * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-start gap-2">
            <Info size={14} className="mt-0.5 flex-shrink-0 text-blue-500" />
            Short strike positioned between current price and support/resistance for optimal premium collection.
          </p>
        </div>

        {/* Risk Analysis */}
        <div className="bg-muted/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Risk Analysis</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Max Profit</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">${maxProfit.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Per contract</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Max Loss</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">-${maxLoss.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Per contract</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">R:R Ratio</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{result.rr?.toFixed(2)}:1</p>
              <p className="text-xs text-muted-foreground">Risk to reward</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Probability</p>
              <p className="text-lg font-bold">{result.score?.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">Chance of profit</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">DTE</p>
              <p className="text-lg font-bold">{result.dte ?? "—"} days</p>
              <p className="text-xs text-muted-foreground">Time to expiry</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Premium</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">${maxProfit.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{result.width ? `${((maxProfit / result.width) * 100).toFixed(1)}% of width` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">IV</p>
              <p className="text-lg font-bold">{result.iv ? `${(result.iv * 100).toFixed(1)}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">Implied Volatility</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Expected Move</p>
              <p className="text-lg font-bold">{result.expectedMove ? `±$${result.expectedMove.toFixed(2)}` : "—"}</p>
              <p className="text-xs text-muted-foreground">{result.dte ? `By expiry (${result.dte}d)` : "—"}</p>
            </div>
          </div>
        </div>

        {/* Systematic Rules */}
        <div className="bg-muted/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Systematic Rules</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-2 rounded text-sm">
              <span className="font-semibold">✓ Delta Range:</span> {result.delta?.toFixed(2)} 
              {(settings as any)?.scanDeltaMin && ` (${(settings as any).scanDeltaMin}-${(settings as any).scanDeltaMax})`}
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-2 rounded text-sm">
              <span className="font-semibold">✓ R:R Ratio:</span> {result.rr?.toFixed(2)}:1
              {(settings as any)?.scanRrMin && ` (${(settings as any).scanRrMin}-${(settings as any).scanRrMax})`}
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-2 rounded text-sm">
              <span className="font-semibold">✓ DTE Window:</span> {result.dte ?? "—"} days
              {(settings as any)?.scanDteMin && ` (${(settings as any).scanDteMin}-${(settings as any).scanDteMax})`}
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-2 rounded text-sm">
              <span className="font-semibold">✓ Credit Min:</span> ${maxProfit.toFixed(2)}
              {(settings as any)?.scanMinCredit && ` (≥$${(settings as any).scanMinCredit})`}
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-2 rounded text-sm">
              <span className="font-semibold">✓ Max Loss:</span> ${maxLoss.toFixed(2)}
              {(settings as any)?.scanMaxLoss && ` (≤$${(settings as any).scanMaxLoss})`}
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-2 rounded text-sm">
              <span className="font-semibold">✓ Spread Width:</span> ${result.width?.toFixed(0)}
              {(settings as any)?.scanWidthMin && ` (${(settings as any).scanWidthMin}-${(settings as any).scanWidthMax})`}
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Scan Logs Tab */}
      <TabsContent value="logs">
        <div className="bg-slate-900 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
          {result.analysisLog ? (
            <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
              {result.analysisLog}
            </pre>
          ) : (
            <p className="text-sm text-slate-400">No scan logs available for this result.</p>
          )}
        </div>
      </TabsContent>
      </Tabs>
    </div>
  );
}

function SetupAnalysis({ result }: { result: ScanResult }) {
  const { data: indicator } = useQuery({
    queryKey: ["/api/indicators", result.symbol, "latest"],
    queryFn: async () => {
      const res = await fetch(`/api/indicators/${result.symbol}/latest`);
      return res.json();
    }
  });
  
  const { data: ticker } = useQuery({
    queryKey: ["/api/tickers", result.symbol],
    queryFn: async () => {
      const res = await fetch(`/api/tickers/${result.symbol}`);
      return res.json();
    }
  });

  return (
    <div className="rounded-md border border-border bg-muted/30 p-4 space-y-4">
      <div>
        <p className="text-sm font-medium mb-2">Technical Indicators</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">RSI(14)</p>
            <p className="mono">{indicator?.rsi14?.toFixed(2) ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">StochRSI K/D</p>
            <p className="mono">{indicator?.stochK?.toFixed(2) ?? "—"}/{indicator?.stochD?.toFixed(2) ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="mono">${indicator?.price?.toFixed(2) ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Support</p>
            <p className="mono">{ticker?.support ? `$${ticker.support}` : "Not set"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Resistance</p>
            <p className="mono">{ticker?.resistance ? `$${ticker.resistance}` : "Not set"}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Setup Status</p>
        <p className="text-sm text-muted-foreground">{result.signal || result.reason || "Signal detected but no qualifying spread found"}</p>
      </div>

      {result.analysisLog && (
        <div>
          <p className="text-sm font-medium mb-2">Analysis Log</p>
          <pre className="text-xs mono bg-background/60 p-4 rounded overflow-x-auto whitespace-pre-wrap border border-border">
            {result.analysisLog}
          </pre>
        </div>
      )}
    </div>
  );
}
