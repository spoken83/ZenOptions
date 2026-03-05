import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";

interface Setting {
  key: string;
  value: string;
}
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Search, 
  Loader2, 
  TrendingUp,
  BookOpen,
  Rocket,
  Check,
  PartyPopper,
  X
} from "lucide-react";

interface QuickStartWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface TickerSearchResult {
  symbol: string;
  name: string;
  type: string;
}

interface ScanResult {
  id: number;
  tickerSymbol: string;
  strategyType: string;
  signal: string;
  confidence: number;
  shortStrike?: number;
  longStrike?: number;
  expiry?: string;
  premium?: number;
  riskReward?: string;
}

const SUGGESTED_TICKERS = [
  { symbol: "AMZN", name: "Amazon.com Inc" },
  { symbol: "MSFT", name: "Microsoft Corporation" },
  { symbol: "TSLA", name: "Tesla Inc" },
  { symbol: "META", name: "Meta Platforms Inc" },
  { symbol: "NFLX", name: "Netflix Inc" },
  { symbol: "PLTR", name: "Palantir Technologies Inc" },
];

export default function QuickStartWizard({ open, onOpenChange, onComplete }: QuickStartWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch settings to check if experience is already saved
  const { data: settings } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
    enabled: open,
  });
  
  const experienceAlreadySaved = settings?.find(s => s.key === "is_new_to_credit_spreads")?.value !== undefined;
  
  // Calculate total steps dynamically based on whether we need to show step 1
  const TOTAL_STEPS = experienceAlreadySaved ? 3 : 4;
  const STARTING_STEP = experienceAlreadySaved ? 2 : 1;
  
  const [currentStep, setCurrentStep] = useState(STARTING_STEP);
  const [isNewToCS, setIsNewToCS] = useState<boolean | null>(null);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [tickersAdded, setTickersAdded] = useState(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when dialog opens (not when it closes, to prevent flash)
  useEffect(() => {
    if (open) {
      const startStep = experienceAlreadySaved ? 2 : 1;
      setCurrentStep(startStep);
      setIsNewToCS(null);
      setSelectedTickers([]);
      setSearchQuery("");
      setSearchResults([]);
      setScanResults([]);
      setScanCompleted(false);
      setScanError(null);
      setTickersAdded(0);
    }
  }, [open, experienceAlreadySaved]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length < 1) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/tickers/search?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const results = await response.json();
          setSearchResults(results);
          setShowSearchResults(true);
        }
      } catch (error) {
        console.error("Error searching tickers:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const saveExperienceMutation = useMutation({
    mutationFn: async (isNew: boolean) => {
      const response = await apiRequest("POST", "/api/settings", { 
        key: "is_new_to_credit_spreads", 
        value: isNew ? "true" : "false" 
      });
      if (!response.ok) throw new Error("Failed to save setting");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  const addTickerMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const tickerResponse = await apiRequest("POST", "/api/tickers", {
        symbol,
        minOI: 100,
        maxBidAskCents: 15,
      });
      if (!tickerResponse.ok) {
        const error = await tickerResponse.json();
        if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
          return { alreadyExists: true };
        }
        throw new Error(error.message || "Failed to add ticker");
      }
      
      const watchlistResponse = await apiRequest("POST", "/api/watchlist", {
        symbol,
        active: true,
      });
      if (!watchlistResponse.ok) {
        const error = await watchlistResponse.json();
        if (!error.message?.includes("already exists")) {
          throw new Error(error.message || "Failed to add to watchlist");
        }
      }
      
      return tickerResponse.json();
    },
  });

  const runScanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/scan/run");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to run scan");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-results"] });
      setScanResults(data.results || []);
      setScanCompleted(true);
      setScanError(null);
    },
    onError: (error: any) => {
      setScanError(error.message || "Failed to run scan. You can try again from the Scanner page.");
      setScanCompleted(true);
    },
  });

  const toggleTicker = (symbol: string) => {
    setSelectedTickers(prev => 
      prev.includes(symbol) 
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  };

  const addSearchedTicker = (ticker: TickerSearchResult) => {
    if (!selectedTickers.includes(ticker.symbol)) {
      setSelectedTickers(prev => [...prev, ticker.symbol]);
    }
    setSearchQuery("");
    setShowSearchResults(false);
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (isNewToCS !== null) {
        await saveExperienceMutation.mutateAsync(isNewToCS);
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      let addedCount = 0;
      const addedTickerIds: string[] = [];
      
      // Step 1: Add tickers to watchlist
      for (const symbol of selectedTickers) {
        try {
          const result = await addTickerMutation.mutateAsync(symbol);
          if (result && result.id) {
            addedTickerIds.push(result.id);
            addedCount++;
          } else if (!result?.alreadyExists) {
            addedCount++;
          }
        } catch (error) {
          console.error(`Error adding ${symbol}:`, error);
        }
      }
      
      // Step 2: Fetch S/R levels for each new ticker (required for scanning)
      for (const tickerId of addedTickerIds) {
        try {
          await apiRequest("POST", `/api/tickers/${tickerId}/refresh-sr`);
        } catch (error) {
          console.error(`Error fetching S/R for ticker ${tickerId}:`, error);
        }
      }
      
      setTickersAdded(addedCount);
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setIsScanning(true);
      setScanError(null);
      try {
        await runScanMutation.mutateAsync();
      } catch (error) {
        console.error("Scan error:", error);
      }
      setIsScanning(false);
      setCurrentStep(4);
    } else if (currentStep === 4) {
      onComplete();
      onOpenChange(false);
    }
  };
  
  const handleRetryScan = async () => {
    setCurrentStep(3);
    setScanError(null);
    setScanCompleted(false);
  };

  const handleBack = () => {
    if (currentStep > STARTING_STEP) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
    onOpenChange(false);
  };

  // Calculate display step number (1-indexed relative to visible steps)
  const displayStep = experienceAlreadySaved ? currentStep - 1 : currentStep;
  
  const renderProgressIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i + 1 === displayStep
              ? "w-8 bg-primary"
              : i + 1 < displayStep
              ? "w-2 bg-primary"
              : "w-2 bg-muted"
          }`}
        />
      ))}
      <span className="ml-3 text-sm text-muted-foreground font-medium">
        {displayStep}/{TOTAL_STEPS}
      </span>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Welcome to Zen Options!</h2>
        <p className="text-muted-foreground">
          Let's personalize your experience. First, tell us about yourself:
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => setIsNewToCS(true)}
          className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
            isNewToCS === true
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          data-testid="button-new-to-cs"
        >
          <div className="flex items-start gap-3">
            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
              isNewToCS === true ? "border-primary bg-primary" : "border-muted-foreground"
            }`}>
              {isNewToCS === true && <Check className="h-3 w-3 text-white" />}
            </div>
            <div>
              <p className="font-semibold">I'm new to Credit Spreads</p>
              <p className="text-sm text-muted-foreground">
                I'd like guidance on how options trading works
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setIsNewToCS(false)}
          className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
            isNewToCS === false
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          data-testid="button-experienced"
        >
          <div className="flex items-start gap-3">
            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
              isNewToCS === false ? "border-primary bg-primary" : "border-muted-foreground"
            }`}>
              {isNewToCS === false && <Check className="h-3 w-3 text-white" />}
            </div>
            <div>
              <p className="font-semibold">I have experience with options</p>
              <p className="text-sm text-muted-foreground">
                I understand Credit Spreads, Iron Condors, or LEAPS
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Pick Your Tickers</h2>
        <p className="text-muted-foreground">
          Select stocks you want to monitor for trading opportunities
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowSearchResults(true);
            }}
            onBlur={() => {
              setTimeout(() => setShowSearchResults(false), 200);
            }}
            placeholder="Search for more tickers..."
            className="pl-9 pr-9"
            data-testid="input-search-ticker"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[150px] overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.symbol}
                  type="button"
                  onClick={() => addSearchedTicker(result)}
                  className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between gap-2 border-b border-border last:border-0"
                  data-testid={`search-result-${result.symbol}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-mono font-semibold text-primary">{result.symbol}</span>
                    <span className="text-muted-foreground text-sm ml-2 truncate">{result.name}</span>
                  </div>
                  {selectedTickers.includes(result.symbol) && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium mb-3 text-muted-foreground">Popular tickers:</p>
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTED_TICKERS.map((ticker) => (
              <button
                key={ticker.symbol}
                onClick={() => toggleTicker(ticker.symbol)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  selectedTickers.includes(ticker.symbol)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                data-testid={`ticker-${ticker.symbol}`}
              >
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={selectedTickers.includes(ticker.symbol)}
                    className="pointer-events-none"
                  />
                  <div>
                    <p className="font-mono font-semibold">{ticker.symbol}</p>
                    <p className="text-xs text-muted-foreground truncate">{ticker.name}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {selectedTickers.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <span className="text-sm text-muted-foreground">Selected:</span>
            {selectedTickers.map((symbol) => (
              <Badge 
                key={symbol} 
                variant="secondary"
                className="cursor-pointer hover:bg-destructive/10"
                onClick={() => toggleTicker(symbol)}
              >
                {symbol}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Rocket className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Run Your First Scan</h2>
        <p className="text-muted-foreground">
          We'll analyze your selected tickers for trading opportunities
        </p>
      </div>

      <div className="p-6 rounded-lg bg-muted/50 border border-border">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">1</span>
            </div>
            <div>
              <p className="font-medium text-sm">Credit Spread & Iron Condor Analysis</p>
              <p className="text-xs text-muted-foreground">Find optimal entry points based on technical signals</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">2</span>
            </div>
            <div>
              <p className="font-medium text-sm">Support & Resistance Detection</p>
              <p className="text-xs text-muted-foreground">AI identifies key price levels for strike selection</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">3</span>
            </div>
            <div>
              <p className="font-medium text-sm">Risk/Reward Optimization</p>
              <p className="text-xs text-muted-foreground">Filter trades that meet quality thresholds</p>
            </div>
          </div>
        </div>

        {selectedTickers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">Scanning {selectedTickers.length} ticker{selectedTickers.length > 1 ? "s" : ""}:</p>
            <div className="flex flex-wrap gap-1">
              {selectedTickers.map((symbol) => (
                <Badge key={symbol} variant="outline">{symbol}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {isScanning && (
        <div className="flex items-center justify-center gap-3 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Scanning your tickers...</span>
        </div>
      )}
    </div>
  );

  const renderStep4 = () => {
    const readyTrades = scanResults.filter(r => r.signal === "READY");
    const candidates = scanResults.filter(r => r.signal === "CANDIDATE");
    
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            scanError ? "bg-orange-500/10" : "bg-emerald-500/10"
          }`}>
            <PartyPopper className={`h-8 w-8 ${scanError ? "text-orange-500" : "text-emerald-500"}`} />
          </div>
          <h2 className="text-2xl font-bold mb-2">
            {scanError ? "Almost There!" : "You're All Set!"}
          </h2>
          <p className="text-muted-foreground">
            {scanError 
              ? "Your watchlist is ready. The scan had an issue, but you can try again."
              : "Your watchlist is ready and your first scan is complete"
            }
          </p>
        </div>

        <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Tickers Added</span>
            <Badge variant="secondary">{tickersAdded > 0 ? tickersAdded : selectedTickers.length}</Badge>
          </div>
          
          {scanError && (
            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="text-sm text-orange-600 dark:text-orange-400">
                {scanError}
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2"
                onClick={handleRetryScan}
                data-testid="button-retry-scan"
              >
                <Rocket className="h-4 w-4 mr-2" />
                Try Scan Again
              </Button>
            </div>
          )}
          
          {!scanError && scanResults.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Ready to Trade</span>
                <Badge className="bg-emerald-500">{readyTrades.length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Candidates</span>
                <Badge variant="outline">{candidates.length}</Badge>
              </div>
            </>
          )}
          
          {!scanError && scanResults.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No immediate opportunities found. The scanner will continue monitoring your tickers for setups.
            </p>
          )}
        </div>

        <div className="space-y-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
          <p className="font-semibold text-sm">What's Next?</p>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>Check the <strong>Scanner</strong> page for detailed results</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>Add positions from scan results with one click</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span><strong>ZenStatus</strong> will guide you on when to act</span>
            </li>
          </ul>
        </div>
      </div>
    );
  };

  const canProceed = () => {
    if (currentStep === 1) return isNewToCS !== null;
    if (currentStep === 2) return selectedTickers.length > 0;
    if (currentStep === 3) return !isScanning;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" hideCloseButton>
        <div className="p-6">
          {renderProgressIndicator()}
          
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}

          <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
            <div>
              {currentStep > 1 && currentStep < 4 && (
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={isScanning}
                  data-testid="button-back"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {currentStep < 4 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  disabled={isScanning}
                  className="text-muted-foreground"
                  data-testid="button-skip"
                >
                  Skip
                </Button>
              )}
              
              <Button
                onClick={handleNext}
                disabled={!canProceed() || addTickerMutation.isPending}
                data-testid="button-next"
              >
                {addTickerMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : currentStep === 3 ? (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Run Scan
                  </>
                ) : currentStep === 4 ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start Trading
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
