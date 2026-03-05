import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "@/components/auth/AuthModal";
import { AlertTriangle, Crown, Search, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const addTickerSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  support: z.number().optional(),
  resistance: z.number().optional(),
  minOI: z.number().int().positive().default(100),
  maxBidAskCents: z.number().int().positive().default(15),
});

type AddTickerForm = z.infer<typeof addTickerSchema>;

interface TickerSearchResult {
  symbol: string;
  name: string;
  type: string;
}

interface AddTickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddTickerModal({ open, onOpenChange }: AddTickerModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [, setLocation] = useLocation();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<TickerSearchResult | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const form = useForm<AddTickerForm>({
    resolver: zodResolver(addTickerSchema),
    defaultValues: {
      minOI: 100,
      maxBidAskCents: 15,
    },
  });

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Don't search if a ticker is already selected
    if (selectedTicker) {
      setShowResults(false);
      return;
    }

    if (searchQuery.length < 1) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/tickers/search?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const results = await response.json();
          setSearchResults(results);
          setShowResults(true);
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
  }, [searchQuery, selectedTicker]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
      setShowResults(false);
      setSelectedTicker(null);
      form.reset();
    }
  }, [open, form]);

  const selectTicker = (ticker: TickerSearchResult) => {
    setSelectedTicker(ticker);
    setSearchQuery(`${ticker.symbol} - ${ticker.name}`);
    form.setValue("symbol", ticker.symbol);
    setShowResults(false);
  };

  const watchlistMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const response = await apiRequest("POST", "/api/watchlist", {
        symbol,
        active: true,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to add to watchlist");
      }
      return response.json();
    },
  });

  const tickerMutation = useMutation({
    mutationFn: async (data: AddTickerForm) => {
      const response = await apiRequest("POST", "/api/tickers", data);
      if (!response.ok) {
        const error = await response.json();
        if (response.status === 403) {
          const tierError = new Error(error.message || "Tier limit reached");
          (tierError as any).isTierLimit = true;
          throw tierError;
        }
        throw new Error(error.message || "Failed to add ticker");
      }
      return response.json();
    },
    onSuccess: async (_, variables) => {
      try {
        await watchlistMutation.mutateAsync(variables.symbol);
        queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
        toast({
          title: "Ticker Added",
          description: selectedTicker 
            ? `${selectedTicker.symbol} (${selectedTicker.name}) has been added to watchlist`
            : "Ticker has been added to watchlist successfully",
        });
        form.reset();
        setSearchQuery("");
        setSelectedTicker(null);
        onOpenChange(false);
      } catch (error: any) {
        onOpenChange(false);
        setShowUpgradeDialog(true);
      }
    },
    onError: (error: any) => {
      const errorMsg = error.message || "";
      if (errorMsg.includes("Free tier limited") || errorMsg.includes("Upgrade to Pro")) {
        onOpenChange(false);
        setShowUpgradeDialog(true);
        return;
      }
      
      let title = "Error";
      let description = errorMsg;
      
      if (errorMsg.includes("duplicate key") || errorMsg.includes("already exists")) {
        title = "Ticker Already Exists";
        description = "This ticker is already in your watchlist. You can edit it from the Watchlist page.";
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AddTickerForm) => {
    if (isPreLoginMode) {
      onOpenChange(false);
      setShowSignupModal(true);
      return;
    }
    tickerMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Ticker to Watchlist</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="symbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Symbol or Company Name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          ref={inputRef}
                          value={searchQuery}
                          onChange={(e) => {
                            const value = e.target.value;
                            setSearchQuery(value);
                            setSelectedTicker(null);
                            field.onChange(value.toUpperCase());
                          }}
                          onFocus={() => {
                            if (searchResults.length > 0) {
                              setShowResults(true);
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => setShowResults(false), 200);
                          }}
                          placeholder="Search by symbol (AAPL) or company name (Apple)"
                          className="pl-9 pr-9"
                          data-testid="input-symbol"
                          autoComplete="off"
                        />
                        {isSearching && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      
                      {showResults && searchResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                          {searchResults.map((result) => (
                            <button
                              key={result.symbol}
                              type="button"
                              onClick={() => selectTicker(result)}
                              className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between gap-2 border-b border-border last:border-0"
                              data-testid={`search-result-${result.symbol}`}
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-mono font-semibold text-primary">{result.symbol}</span>
                                <span className="text-muted-foreground text-sm ml-2 truncate">{result.name}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {showResults && searchQuery.length >= 1 && searchResults.length === 0 && !isSearching && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg p-3 text-center text-sm text-muted-foreground">
                          No matches found for "{searchQuery}"
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <input type="hidden" {...field} />
                  {selectedTicker && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Selected: <span className="font-mono font-semibold text-foreground">{selectedTicker.symbol}</span> - {selectedTicker.name}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="support"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Support Level (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder="165.00"
                        className="mono"
                        data-testid="input-support"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="resistance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resistance Level (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder="175.00"
                        className="mono"
                        data-testid="input-resistance"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={tickerMutation.isPending || !form.getValues("symbol")} 
                data-testid="button-submit"
              >
                {tickerMutation.isPending ? "Adding..." : "Add Ticker"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
      
      <AuthModal 
        open={showSignupModal} 
        onOpenChange={setShowSignupModal}
        defaultTab="signup"
      />

      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl">Watchlist Limit Reached</AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              You've reached the <strong>Free tier limit of 3 watchlist tickers</strong>.
              <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
                <div className="flex items-start gap-3">
                  <Crown className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground mb-1">Upgrade to Pro for:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>✓ Unlimited watchlist tickers</li>
                      <li>✓ Unlimited positions</li>
                      <li>✓ Unlimited scans</li>
                      <li>✓ Automated scheduled scans</li>
                      <li>✓ Telegram alerts</li>
                    </ul>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-upgrade">Stay on Free</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowUpgradeDialog(false);
                setLocation('/subscription');
              }}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-upgrade-to-pro"
            >
              <Crown className="mr-2 h-4 w-4" />
              Upgrade to Pro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
