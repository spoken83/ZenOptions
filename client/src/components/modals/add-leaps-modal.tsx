import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { calculateDte } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Portfolio } from "@shared/schema";
import { AuthModal } from "@/components/auth/AuthModal";
import { Crown } from "lucide-react";
import { useLocation } from "wouter";

const addLeapsSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  portfolioId: z.string().min(1, "Account is required"),
  contracts: z.number().int().positive("Number of contracts must be at least 1").default(1),
  strike: z.number().positive("Strike must be positive"),
  expiry: z.string().min(1, "Expiry is required"),
  entryDebit: z.number().positive("Entry debit must be positive"),
  entryDelta: z.number().min(0).max(1, "Delta must be between 0 and 1"),
  notes: z.string().optional(),
});

type AddLeapsForm = z.infer<typeof addLeapsSchema>;

interface AddLeapsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: "open" | "order";
  initialValues?: {
    symbol?: string;
    strike?: number;
    expiry?: Date;
    entryDebit?: number;
    entryDelta?: number;
    portfolioId?: string;
    contracts?: number;
    notes?: string;
  };
  executingOrderId?: string | null;
}

export default function AddLeapsModal({ open, onOpenChange, status = "open", initialValues, executingOrderId }: AddLeapsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [, setLocation] = useLocation();

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const form = useForm<AddLeapsForm>({
    resolver: zodResolver(addLeapsSchema),
    defaultValues: {
      symbol: "",
      portfolioId: portfolios?.[0]?.id || "",
      contracts: 1,
      strike: 0,
      expiry: "",
      entryDebit: 0,
      entryDelta: 0.7,
      notes: "",
    },
  });

  useEffect(() => {
    if (open && initialValues) {
      form.reset({
        symbol: initialValues.symbol || "",
        portfolioId: initialValues.portfolioId || portfolios?.[0]?.id || "",
        contracts: initialValues.contracts || 1,
        strike: initialValues.strike || 0,
        expiry: initialValues.expiry ? format(initialValues.expiry, "yyyy-MM-dd") : "",
        entryDebit: initialValues.entryDebit || 0,
        entryDelta: initialValues.entryDelta || 0.7,
        notes: initialValues.notes || "",
      });
    } else if (open && !initialValues) {
      form.reset({
        symbol: "",
        portfolioId: portfolios?.[0]?.id || "",
        contracts: 1,
        strike: 0,
        expiry: "",
        entryDebit: 0,
        entryDelta: 0.7,
        notes: "",
      });
    }
  }, [open, initialValues, form, portfolios]);

  const mutation = useMutation({
    mutationFn: async (data: AddLeapsForm) => {
      if (executingOrderId) {
        // Execute order: PATCH to update existing order to open position
        const response = await apiRequest("PATCH", `/api/positions/${executingOrderId}`, {
          portfolioId: data.portfolioId,
          contracts: data.contracts,
          shortStrike: data.strike,
          expiry: new Date(data.expiry),
          entryDebitCents: Math.round(data.entryDebit * 100),
          entryDelta: data.entryDelta,
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
          strategyType: "LEAPS",
          type: "CALL",
          shortStrike: data.strike,
          longStrike: null,
          expiry: new Date(data.expiry),
          entryCreditCents: null,
          entryDebitCents: Math.round(data.entryDebit * 100),
          entryDelta: data.entryDelta,
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
        title: executingOrderId ? "Order Executed" : "LEAPS Position Added",
        description: executingOrderId 
          ? "Order has been executed and moved to open positions" 
          : status === "order" ? "Order has been added successfully" : "Long CALL position has been added successfully",
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

  const watchStrike = form.watch("strike");
  const watchDebit = form.watch("entryDebit");
  const watchContracts = form.watch("contracts") || 1;
  const watchExpiry = form.watch("expiry");

  const maxLossPerContract = watchDebit ? watchDebit * 100 : 0;
  const maxLoss = maxLossPerContract * watchContracts;
  const breakEven = watchStrike && watchDebit ? watchStrike + watchDebit : 0;
  
  const dte = calculateDte(watchExpiry);

  const onSubmit = (data: AddLeapsForm) => {
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
              ? "Execute LEAPS Order" 
              : status === "order" ? "Add LEAPS Order" : "Add LEAPS Position"}
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
                        data-testid="input-leaps-symbol"
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
                name="portfolioId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-leaps-portfolio">
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="strike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Strike Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        placeholder="160.00"
                        className="mono"
                        data-testid="input-leaps-strike"
                      />
                    </FormControl>
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
                        type="number"
                        min="1"
                        step="1"
                        value={field.value || 1}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        className="mono"
                        data-testid="input-leaps-contracts"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="expiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiry Date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-leaps-expiry" />
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="entryDebit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entry Debit (per share)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        placeholder="12.50"
                        className="mono"
                        data-testid="input-leaps-debit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="entryDelta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entry Delta</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        placeholder="0.70"
                        className="mono"
                        data-testid="input-leaps-delta"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <h4 className="font-medium text-sm mb-3">Calculated Values</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Max Loss</p>
                  <p className="font-semibold mono text-muted-foreground" data-testid="text-leaps-max-loss">${maxLoss.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Max Gain</p>
                  <p className="font-semibold mono text-success" data-testid="text-leaps-max-gain">Unlimited</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Break-Even</p>
                  <p className="font-semibold mono" data-testid="text-leaps-breakeven">${breakEven.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Type</p>
                  <p className="font-semibold mono">Long CALL</p>
                </div>
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
                      placeholder="Add any notes about this LEAPS position..."
                      className="resize-none"
                      data-testid="input-leaps-notes"
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
                data-testid="button-leaps-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-leaps-submit">
                {mutation.isPending 
                  ? (executingOrderId ? "Executing..." : "Adding...") 
                  : (executingOrderId ? "Execute Order to Position" : (status === "order" ? "Add Order" : "Add LEAPS Position"))}
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
