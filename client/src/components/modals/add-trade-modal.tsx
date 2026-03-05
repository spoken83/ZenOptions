import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { calculateDte } from "@/lib/utils";
import { format } from "date-fns";
import type { Portfolio } from "@shared/schema";
import { AuthModal } from "@/components/auth/AuthModal";
import { Crown } from "lucide-react";
import { useLocation } from "wouter";

const addTradeSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  portfolioId: z.string().min(1, "Account is required"),
  contracts: z.number().int().positive("Number of contracts must be at least 1").default(1),
  type: z.enum(["PUT", "CALL", "COVERED_CALL"]),
  shortStrike: z.number().positive("Short strike must be positive"),
  longStrike: z.number().nullable().optional(),
  expiry: z.string().min(1, "Expiry is required"),
  entryCredit: z.number().positive("Entry credit must be positive"),
  notes: z.string().optional(),
}).refine(
  (data) => {
    // Covered calls don't need a long strike - skip all long strike validation
    if (data.type === "COVERED_CALL") {
      return true;
    }
    // Regular spreads need a valid positive long strike
    if (data.longStrike === null || data.longStrike === undefined || data.longStrike <= 0 || isNaN(data.longStrike)) {
      return false;
    }
    return true;
  },
  {
    message: "Long strike is required and must be positive for credit spreads",
    path: ["longStrike"],
  }
).refine(
  (data) => {
    // Skip ordering validation for covered calls or if longStrike is invalid
    if (data.type === "COVERED_CALL" || !data.longStrike || data.longStrike <= 0) {
      return true;
    }
    if (data.type === "PUT") {
      return data.shortStrike > data.longStrike;
    }
    return true;
  },
  {
    message: "For PUT credit spreads, short strike must be above long strike",
    path: ["shortStrike"],
  }
).refine(
  (data) => {
    // Skip ordering validation for covered calls or if longStrike is invalid
    if (data.type === "COVERED_CALL" || !data.longStrike || data.longStrike <= 0) {
      return true;
    }
    if (data.type === "CALL") {
      return data.shortStrike < data.longStrike;
    }
    return true;
  },
  {
    message: "For CALL credit spreads, short strike must be below long strike",
    path: ["shortStrike"],
  }
);

type AddTradeForm = z.infer<typeof addTradeSchema>;

interface AddTradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: "open" | "order";
  initialValues?: {
    symbol?: string;
    type?: "PUT" | "CALL";
    shortStrike?: number;
    longStrike?: number;
    expiry?: Date;
    entryCredit?: number;
    portfolioId?: string;
    contracts?: number;
    notes?: string;
  };
  executingOrderId?: string | null;
}

export default function AddTradeModal({ open, onOpenChange, status = "open", initialValues, executingOrderId }: AddTradeModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [, setLocation] = useLocation();

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const form = useForm<AddTradeForm>({
    resolver: zodResolver(addTradeSchema),
    defaultValues: {
      type: "PUT",
      portfolioId: portfolios?.[0]?.id || "",
      contracts: 1,
      notes: "",
    },
  });

  useEffect(() => {
    if (open && initialValues) {
      form.reset({
        symbol: initialValues.symbol || "",
        portfolioId: initialValues.portfolioId || portfolios?.[0]?.id || "",
        contracts: initialValues.contracts || 1,
        type: initialValues.type || "PUT",
        shortStrike: initialValues.shortStrike || 0,
        longStrike: initialValues.longStrike ?? null, // Use null for covered calls, not 0
        expiry: initialValues.expiry ? format(initialValues.expiry, "yyyy-MM-dd") : "",
        entryCredit: initialValues.entryCredit || 0,
        notes: initialValues.notes || "",
      });
    } else if (open && !initialValues) {
      form.reset({
        type: "PUT",
        portfolioId: portfolios?.[0]?.id || "",
        contracts: 1,
        notes: "",
        longStrike: null,
      });
    }
  }, [open, initialValues, form, portfolios]);

  const mutation = useMutation({
    mutationFn: async (data: AddTradeForm) => {
      // For covered calls, send as CALL type with null longStrike
      const isCoveredCallType = data.type === "COVERED_CALL";
      const actualType = isCoveredCallType ? "CALL" : data.type;
      const actualLongStrike = isCoveredCallType ? null : data.longStrike;
      
      if (executingOrderId) {
        // Execute order: PATCH to update existing order to open position
        const response = await apiRequest("PATCH", `/api/positions/${executingOrderId}`, {
          portfolioId: data.portfolioId,
          contracts: data.contracts,
          shortStrike: data.shortStrike,
          longStrike: actualLongStrike,
          expiry: new Date(data.expiry),
          entryCreditCents: Math.round(data.entryCredit * 100),
          notes: data.notes,
          status: "open",
        });
        return response.json();
      } else {
        // Add new order or position: POST
        const response = await apiRequest("POST", "/api/positions", {
          symbol: data.symbol,
          portfolioId: data.portfolioId,
          contracts: data.contracts,
          type: actualType,
          shortStrike: data.shortStrike,
          longStrike: actualLongStrike,
          expiry: new Date(data.expiry),
          entryCreditCents: Math.round(data.entryCredit * 100),
          notes: data.notes,
          status,
        });
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions?status=open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions?status=order"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions/pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions/ticker-prices"] });
      toast({
        title: executingOrderId ? "Order Executed" : "Trade Added",
        description: executingOrderId 
          ? "Order has been executed and moved to open positions" 
          : status === "order" ? "Order has been added successfully" : "Position has been added successfully",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      // Check if this is a tier limit error
      const errorMsg = error.message || "";
      if (errorMsg.includes("Free tier limited") || errorMsg.includes("Upgrade to Pro")) {
        onOpenChange(false);
        setShowUpgradeDialog(true);
        return;
      }
      
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
    },
  });

  const watchShort = form.watch("shortStrike");
  const watchLong = form.watch("longStrike");
  const watchCredit = form.watch("entryCredit");
  const watchContracts = form.watch("contracts") || 1;
  const watchExpiry = form.watch("expiry");
  const watchType = form.watch("type");

  // Clear longStrike when switching to COVERED_CALL type
  useEffect(() => {
    if (watchType === "COVERED_CALL") {
      form.setValue("longStrike", null);
    }
  }, [watchType, form]);

  const isCoveredCall = watchType === "COVERED_CALL";
  const width = watchShort && watchLong ? Math.abs(watchShort - watchLong) : 0;
  const maxGainPerContract = watchCredit ? watchCredit * 100 : 0;
  const maxLossPerContract = isCoveredCall ? null : (width && watchCredit ? (width - watchCredit) * 100 : 0);
  const maxGain = maxGainPerContract * watchContracts;
  const maxLoss = maxLossPerContract !== null ? maxLossPerContract * watchContracts : null;
  const rr = maxGain > 0 && maxLoss !== null ? (maxLoss / maxGain).toFixed(2) : null;
  
  const dte = calculateDte(watchExpiry);

  const onSubmit = (data: AddTradeForm) => {
    if (isPreLoginMode) {
      setShowAuthModal(true);
      return;
    }
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {executingOrderId 
              ? "Execute Credit Spread Order" 
              : isCoveredCall 
                ? (status === "order" ? "Add Covered Call Order" : "Add Covered Call Position")
                : (status === "order" ? "Add Credit Spread Order" : "Add Credit Spread Position")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="AAPL"
                        className="uppercase mono"
                        data-testid="input-symbol"
                        disabled={!!executingOrderId}
                        readOnly={!!executingOrderId}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!executingOrderId}>
                      <FormControl>
                        <SelectTrigger data-testid="select-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PUT">PUT Credit Spread</SelectItem>
                        <SelectItem value="CALL">CALL Credit Spread</SelectItem>
                        <SelectItem value="COVERED_CALL">Covered Call (for PMCC)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="portfolioId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-portfolio">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {portfolios && portfolios.length > 0 ? (
                          portfolios.map((portfolio) => (
                            <SelectItem key={portfolio.id} value={portfolio.id}>
                              {portfolio.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>No accounts available</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contracts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>No. of Contracts</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="1"
                        step="1"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        className="mono"
                        data-testid="input-contracts"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className={isCoveredCall ? "" : "grid grid-cols-2 gap-4"}>
              <FormField
                control={form.control}
                name="shortStrike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isCoveredCall ? "Strike Price" : "Short Strike"}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        placeholder="160.00"
                        className="mono"
                        data-testid="input-short-strike"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isCoveredCall && (
                <FormField
                  control={form.control}
                  name="longStrike"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Long Strike</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          type="number"
                          step="0.01"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || null)}
                          placeholder="155.00"
                          className="mono"
                          data-testid="input-long-strike"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="expiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiry Date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-expiry" />
                  </FormControl>
                  {dte !== null && (
                    <FormDescription data-testid="text-dte">
                      {dte < 0 ? (
                        <span className="text-destructive">Expired {Math.abs(dte)} days ago</span>
                      ) : (
                        <span>{dte} days to expiration (DTE)</span>
                      )}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="entryCredit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entry Credit (per share)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      step="0.01"
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      placeholder="1.55"
                      className="mono"
                      data-testid="input-credit"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <h4 className="font-medium text-sm mb-3">Calculated Values</h4>
              <div className={isCoveredCall ? "text-sm" : "grid grid-cols-2 gap-4 text-sm"}>
                {!isCoveredCall && (
                  <div>
                    <p className="text-muted-foreground mb-1">Spread Width</p>
                    <p className="font-semibold mono" data-testid="text-width">${width.toFixed(2)}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground mb-1">Max Gain (Premium)</p>
                  <p className="font-semibold mono text-success" data-testid="text-max-gain">${maxGain.toFixed(2)}</p>
                </div>
                {!isCoveredCall && (
                  <>
                    <div>
                      <p className="text-muted-foreground mb-1">Max Loss</p>
                      <p className="font-semibold mono text-destructive" data-testid="text-max-loss">${maxLoss !== null ? maxLoss.toFixed(2) : "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">R:R Ratio</p>
                      <p className="font-semibold mono" data-testid="text-rr">{rr !== null ? `${rr}:1` : "-"}</p>
                    </div>
                  </>
                )}
                {isCoveredCall && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Covered calls have undefined max loss when stock moves against you.
                    Link this to a LEAPS position for PMCC protection.
                  </p>
                )}
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="Add any notes about this trade..."
                      className="resize-none"
                      data-testid="input-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit">
                {mutation.isPending 
                  ? (executingOrderId ? "Executing..." : "Adding...") 
                  : (executingOrderId ? "Execute Order to Position" : (status === "order" ? "Add Order" : "Add Trade"))}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      
      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Crown className="h-6 w-6 text-primary" />
              </div>
              <AlertDialogTitle className="text-2xl">Upgrade to Pro</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-4">
              You've reached the free tier limit of 5 positions. Upgrade to Pro for unlimited positions and unlock:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-1 text-primary">✓</div>
              <div>
                <p className="font-medium">Unlimited Positions & Watchlist</p>
                <p className="text-sm text-muted-foreground">Track as many trades as you need</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-primary">✓</div>
              <div>
                <p className="font-medium">Unlimited Scans</p>
                <p className="text-sm text-muted-foreground">Run unlimited manual and automated scans</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-primary">✓</div>
              <div>
                <p className="font-medium">Automated Monitoring</p>
                <p className="text-sm text-muted-foreground">Position alerts & scheduled scans</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-primary">✓</div>
              <div>
                <p className="font-medium">Tiger Brokers Integration</p>
                <p className="text-sm text-muted-foreground">Sync positions from your broker account</p>
              </div>
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowUpgradeDialog(false); setLocation('/subscription'); }}>
              Upgrade to Pro - $9/month
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
