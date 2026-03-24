import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import type { Portfolio } from "@shared/schema";
import { AuthModal } from "@/components/auth/AuthModal";
import { Crown } from "lucide-react";
import { useLocation } from "wouter";

const addStockSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  portfolioId: z.string().min(1, "Account is required"),
  shares: z.number().int().positive("Number of shares must be at least 1").default(1),
  entryPrice: z.number().positive("Entry price must be positive"),
  notes: z.string().optional(),
});

type AddStockForm = z.infer<typeof addStockSchema>;

interface AddStockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: "open" | "order";
  initialValues?: {
    symbol?: string;
    entryPrice?: number;
    portfolioId?: string;
    shares?: number;
    notes?: string;
  };
  executingOrderId?: string | null;
}

export default function AddStockModal({ open, onOpenChange, status = "open", initialValues, executingOrderId }: AddStockModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [, setLocation] = useLocation();

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const form = useForm<AddStockForm>({
    resolver: zodResolver(addStockSchema),
    defaultValues: {
      symbol: "",
      portfolioId: portfolios?.[0]?.id || "",
      shares: 1,
      entryPrice: 0,
      notes: "",
    },
  });

  useEffect(() => {
    if (open && initialValues) {
      form.reset({
        symbol: initialValues.symbol || "",
        portfolioId: initialValues.portfolioId || portfolios?.[0]?.id || "",
        shares: initialValues.shares || 1,
        entryPrice: initialValues.entryPrice || 0,
        notes: initialValues.notes || "",
      });
    } else if (open && !initialValues) {
      form.reset({
        symbol: "",
        portfolioId: portfolios?.[0]?.id || "",
        shares: 1,
        entryPrice: 0,
        notes: "",
      });
    }
  }, [open, initialValues, form, portfolios]);

  const mutation = useMutation({
    mutationFn: async (data: AddStockForm) => {
      if (executingOrderId) {
        const response = await apiRequest("PATCH", `/api/positions/${executingOrderId}`, {
          portfolioId: data.portfolioId,
          contracts: data.shares,
          entryDebitCents: Math.round(data.entryPrice * 100),
          notes: data.notes,
          status: "open",
        });
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/positions", {
          symbol: data.symbol,
          portfolioId: data.portfolioId,
          contracts: data.shares,
          strategyType: "STOCK",
          type: "LONG",
          shortStrike: 0,
          longStrike: null,
          expiry: new Date("2099-12-31"),
          entryCreditCents: null,
          entryDebitCents: Math.round(data.entryPrice * 100),
          entryDelta: null,
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
        title: executingOrderId ? "Order Executed" : "Stock Position Added",
        description: executingOrderId
          ? "Order has been executed and moved to open positions"
          : status === "order" ? "Order has been added successfully" : "Stock position has been added successfully",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
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

  const watchPrice = form.watch("entryPrice");
  const watchShares = form.watch("shares") || 1;
  const totalCost = watchPrice ? watchPrice * watchShares : 0;

  const onSubmit = (data: AddStockForm) => {
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
              ? "Execute Stock Order"
              : status === "order" ? "Add Stock Order" : "Add Stock Position"}
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
                        data-testid="input-stock-symbol"
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
                        <SelectTrigger data-testid="select-stock-portfolio">
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
                name="shares"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>No. of Shares</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={field.value || 1}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        className="mono"
                        data-testid="input-stock-shares"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="entryPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entry Price (per share)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        placeholder="150.00"
                        className="mono"
                        data-testid="input-stock-price"
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
                  <p className="text-muted-foreground mb-1">Total Cost</p>
                  <p className="font-semibold mono" data-testid="text-stock-total-cost">${totalCost.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Max Gain</p>
                  <p className="font-semibold mono text-success" data-testid="text-stock-max-gain">Unlimited</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Max Loss</p>
                  <p className="font-semibold mono text-muted-foreground" data-testid="text-stock-max-loss">${totalCost.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Type</p>
                  <p className="font-semibold mono">Long Stock</p>
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
                      placeholder="Add any notes about this stock position..."
                      className="resize-none"
                      data-testid="input-stock-notes"
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
                data-testid="button-stock-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-stock-submit">
                {mutation.isPending
                  ? (executingOrderId ? "Executing..." : "Adding...")
                  : (executingOrderId ? "Execute Order to Position" : (status === "order" ? "Add Order" : "Add Stock Position"))}
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
              You've reached the free tier limit of 5 positions. Upgrade to Pro for unlimited positions.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
