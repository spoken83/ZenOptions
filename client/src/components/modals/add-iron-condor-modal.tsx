import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { calculateDte } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, invalidateAfterPositionChange } from "@/lib/queryClient";
import type { Portfolio } from "@shared/schema";
import { AuthModal } from "@/components/auth/AuthModal";
import { Crown } from "lucide-react";
import { useLocation } from "wouter";

const addIronCondorSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  portfolioId: z.string().nullable(),
  putShortStrike: z.number().positive("Put short strike must be positive"),
  putLongStrike: z.number().positive("Put long strike must be positive"),
  callShortStrike: z.number().positive("Call short strike must be positive"),
  callLongStrike: z.number().positive("Call long strike must be positive"),
  expiry: z.coerce.date(),
  entryCredit: z.number().positive("Entry credit must be positive"),
  contracts: z.number().int().positive("Contracts must be at least 1").default(1),
  notes: z.string().optional(),
}).refine(
  (data) => data.putLongStrike < data.putShortStrike,
  {
    message: "Put long strike must be below put short strike",
    path: ["putLongStrike"],
  }
).refine(
  (data) => data.callShortStrike < data.callLongStrike,
  {
    message: "Call long strike must be above call short strike",
    path: ["callLongStrike"],
  }
).refine(
  (data) => data.putShortStrike < data.callShortStrike,
  {
    message: "Call short strike must be above put short strike",
    path: ["callShortStrike"],
  }
);

type AddIronCondorForm = z.infer<typeof addIronCondorSchema>;

interface AddIronCondorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: "open" | "order";
  initialValues?: {
    symbol?: string;
    putShortStrike?: number;
    putLongStrike?: number;
    callShortStrike?: number;
    callLongStrike?: number;
    expiry?: Date;
    entryCredit?: number;
    portfolioId?: string;
    contracts?: number;
    notes?: string;
  };
  executingOrderId?: string | null;
}

export default function AddIronCondorModal({ open, onOpenChange, status = "open", initialValues, executingOrderId }: AddIronCondorModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [, setLocation] = useLocation();

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const form = useForm<AddIronCondorForm>({
    resolver: zodResolver(addIronCondorSchema),
    defaultValues: {
      symbol: "",
      portfolioId: null,
      putShortStrike: 0,
      putLongStrike: 0,
      callShortStrike: 0,
      callLongStrike: 0,
      expiry: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // Default 45 DTE
      entryCredit: 0,
      contracts: 1,
      notes: "",
    },
  });

  useEffect(() => {
    if (open && initialValues) {
      form.reset({
        symbol: initialValues.symbol || "",
        portfolioId: initialValues.portfolioId || portfolios?.[0]?.id || null,
        putShortStrike: initialValues.putShortStrike || 0,
        putLongStrike: initialValues.putLongStrike || 0,
        callShortStrike: initialValues.callShortStrike || 0,
        callLongStrike: initialValues.callLongStrike || 0,
        expiry: initialValues.expiry || new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        entryCredit: initialValues.entryCredit || 0,
        contracts: initialValues.contracts || 1,
        notes: initialValues.notes || "",
      });
    } else if (open && !initialValues) {
      form.reset({
        symbol: "",
        portfolioId: portfolios?.[0]?.id || null,
        putShortStrike: 0,
        putLongStrike: 0,
        callShortStrike: 0,
        callLongStrike: 0,
        expiry: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        entryCredit: 0,
        contracts: 1,
        notes: "",
      });
    }
  }, [open, initialValues, form, portfolios]);

  const mutation = useMutation({
    mutationFn: async (data: AddIronCondorForm) => {
      if (executingOrderId) {
        // Execute order: PATCH to update existing order to open position
        const response = await apiRequest("PATCH", `/api/positions/${executingOrderId}`, {
          portfolioId: data.portfolioId,
          shortStrike: data.putShortStrike,
          longStrike: data.putLongStrike,
          callShortStrike: data.callShortStrike,
          callLongStrike: data.callLongStrike,
          expiry: data.expiry,
          entryCreditCents: Math.round(data.entryCredit * 100),
          contracts: data.contracts,
          notes: data.notes || null,
          status: "open",
        });
        return response.json();
      } else {
        // Add new order or position: POST
        const response = await apiRequest("POST", "/api/positions", {
          symbol: data.symbol,
          portfolioId: data.portfolioId,
          strategyType: "IRON_CONDOR",
          shortStrike: data.putShortStrike,
          longStrike: data.putLongStrike,
          type: "PUT", // For IC, we use PUT but also have call strikes
          callShortStrike: data.callShortStrike,
          callLongStrike: data.callLongStrike,
          expiry: data.expiry,
          entryCreditCents: Math.round(data.entryCredit * 100),
          contracts: data.contracts,
          notes: data.notes || null,
          status,
        });
        return response.json();
      }
    },
    onSuccess: () => {
      invalidateAfterPositionChange();
      toast({
        title: executingOrderId ? "Order Executed" : "Iron Condor Added",
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

  const onSubmit = (data: AddIronCondorForm) => {
    if (isPreLoginMode) {
      setShowAuthModal(true);
      return;
    }
    mutation.mutate(data);
  };

  const watchPutShort = form.watch("putShortStrike");
  const watchPutLong = form.watch("putLongStrike");
  const watchCallShort = form.watch("callShortStrike");
  const watchCallLong = form.watch("callLongStrike");
  const watchEntryCredit = form.watch("entryCredit");
  const watchExpiry = form.watch("expiry");

  const putSpreadWidth = Math.abs(watchPutShort - watchPutLong);
  const callSpreadWidth = Math.abs(watchCallLong - watchCallShort);
  const maxLoss = Math.max(putSpreadWidth, callSpreadWidth) * 100 - watchEntryCredit * 100;
  const maxProfit = watchEntryCredit * 100;
  const putBreakEven = watchPutShort - watchEntryCredit;
  const callBreakEven = watchCallShort + watchEntryCredit;
  
  const dte = calculateDte(watchExpiry);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {executingOrderId 
              ? "Execute Iron Condor Order" 
              : status === "order" ? "Add Iron Condor Order" : "Add Iron Condor Position"}
          </DialogTitle>
          <DialogDescription>
            Enter the details for your Iron Condor trade (bull put spread + bear call spread)
          </DialogDescription>
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
                        placeholder="SPY"
                        className="uppercase"
                        data-testid="input-ic-symbol"
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
                    <FormLabel>Account (Optional)</FormLabel>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-ic-portfolio">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Account</SelectItem>
                        {portfolios?.map((portfolio) => (
                          <SelectItem key={portfolio.id} value={portfolio.id}>
                            {portfolio.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* PUT Spread Section */}
            <div className="border border-success/30 bg-success/5 rounded-lg p-4">
              <h4 className="font-semibold text-success mb-3">Bull PUT Spread</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="putShortStrike"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Strike</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.5"
                          placeholder="560"
                          className="mono"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-ic-put-short"
                        />
                      </FormControl>
                      <FormDescription>Sell PUT at this strike</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="putLongStrike"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Long Strike</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.5"
                          placeholder="550"
                          className="mono"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-ic-put-long"
                        />
                      </FormControl>
                      <FormDescription>Buy PUT at this strike</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {putSpreadWidth > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Width: ${putSpreadWidth.toFixed(2)} ({(putSpreadWidth * 100).toFixed(0)} per contract)
                </p>
              )}
            </div>

            {/* CALL Spread Section */}
            <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-4">
              <h4 className="font-semibold text-destructive mb-3">Bear CALL Spread</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="callShortStrike"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Strike</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.5"
                          placeholder="590"
                          className="mono"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-ic-call-short"
                        />
                      </FormControl>
                      <FormDescription>Sell CALL at this strike</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="callLongStrike"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Long Strike</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.5"
                          placeholder="600"
                          className="mono"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-ic-call-long"
                        />
                      </FormControl>
                      <FormDescription>Buy CALL at this strike</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {callSpreadWidth > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Width: ${callSpreadWidth.toFixed(2)} ({(callSpreadWidth * 100).toFixed(0)} per contract)
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="expiry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry Date</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="date"
                        value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(new Date(e.target.value))}
                        data-testid="input-ic-expiry"
                      />
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
                    <FormLabel>Entry Credit ($)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        placeholder="3.50"
                        className="mono"
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-ic-credit"
                      />
                    </FormControl>
                    <FormDescription>Total credit received</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contracts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contracts</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="1"
                        step="1"
                        placeholder="1"
                        className="mono"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        data-testid="input-ic-contracts"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                      placeholder="Add any notes about this trade..."
                      className="resize-none"
                      rows={2}
                      data-testid="input-ic-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Summary Section */}
            {watchEntryCredit > 0 && putSpreadWidth > 0 && callSpreadWidth > 0 && (
              <div>
                <h4 className="font-semibold mb-3">Position Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Max Profit</p>
                    <p className="font-semibold mono text-success">
                      ${maxProfit.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Max Loss</p>
                    <p className="font-semibold mono text-destructive">
                      ${maxLoss.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">R:R Ratio</p>
                    <p className="font-semibold mono text-primary">
                      1:{maxLoss > 0 ? (maxLoss / maxProfit).toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <div></div>
                  <div>
                    <p className="text-muted-foreground mb-1">PUT Break-Even</p>
                    <p className="font-semibold mono">
                      ${putBreakEven.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">CALL Break-Even</p>
                    <p className="font-semibold mono">
                      ${callBreakEven.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-ic-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-ic-submit"
              >
                {mutation.isPending 
                  ? (executingOrderId ? "Executing..." : "Adding...") 
                  : (executingOrderId ? "Execute Order to Position" : (status === "order" ? "Add Order" : "Add Position"))}
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
