import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { calculateDte } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import type { Position, Portfolio } from "@shared/schema";
import { format } from "date-fns";
import { AuthModal } from "@/components/auth/AuthModal";

const editPositionSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  portfolioId: z.string().optional(),
  contracts: z.number().int().positive("Number of contracts must be at least 1").default(1),
  type: z.string().min(1, "Type is required"),
  shortStrike: z.number().nullable().optional(),
  longStrike: z.number().nullable().optional(),
  expiry: z.string().min(1, "Expiry is required"),
  entryCredit: z.number().positive("Entry credit must be positive").nullable().optional(),
  entryDebit: z.number().positive("Entry price must be positive").nullable().optional(),
  linkedPositionId: z.string().nullable().optional(),
  notes: z.string().optional(),
});

type EditPositionForm = z.infer<typeof editPositionSchema>;

interface EditPositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: Position | null;
}

export default function EditPositionModal({ open, onOpenChange, position }: EditPositionModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const { data: allPositions } = useQuery<Position[]>({
    queryKey: ["/api/positions?status=open"],
  });

  const form = useForm<EditPositionForm>({
    resolver: zodResolver(editPositionSchema),
    defaultValues: {
      type: "PUT",
      portfolioId: "",
      contracts: 1,
      notes: "",
    },
  });

  useEffect(() => {
    if (position && open) {
      const expiryDate = new Date(position.expiry);
      const isStock = position.strategyType === 'STOCK';
      const isDebit = position.strategyType === 'LEAPS' || isStock;
      form.reset({
        symbol: position.symbol,
        portfolioId: position.portfolioId || "",
        contracts: position.contracts || 1,
        type: position.type,
        shortStrike: position.shortStrike,
        longStrike: position.longStrike || null,
        expiry: format(expiryDate, "yyyy-MM-dd"),
        entryCredit: isDebit ? null : (position.entryCreditCents || 0) / 100,
        entryDebit: isDebit ? (position.entryDebitCents || 0) / 100 : null,
        linkedPositionId: position.linkedPositionId || null,
        notes: position.notes || "",
      });
    }
  }, [position, open, form]);

  const mutation = useMutation({
    mutationFn: async (data: EditPositionForm) => {
      if (!position) throw new Error("No position selected");
      
      const isStock = position.strategyType === 'STOCK';
      const isDebit = position.strategyType === 'LEAPS' || isStock;
      const response = await apiRequest("PATCH", `/api/positions/${position.id}`, {
        symbol: data.symbol,
        portfolioId: data.portfolioId || null,
        contracts: data.contracts,
        type: data.type,
        shortStrike: data.shortStrike,
        longStrike: data.longStrike,
        expiry: new Date(data.expiry),
        ...(isDebit
          ? { entryDebitCents: data.entryDebit ? Math.round(data.entryDebit * 100) : null }
          : { entryCreditCents: data.entryCredit ? Math.round(data.entryCredit * 100) : null }),
        linkedPositionId: data.linkedPositionId || null,
        notes: data.notes,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions?status=open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions?status=order"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions/pnl"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions/ticker-prices"] });
      toast({
        title: "Position Updated",
        description: "Position has been updated successfully",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const watchShort = form.watch("shortStrike");
  const watchLong = form.watch("longStrike");
  const watchCredit = form.watch("entryCredit");
  const watchContracts = form.watch("contracts") || 1;
  const watchExpiry = form.watch("expiry");

  const width = watchShort && watchLong ? Math.abs(watchShort - watchLong) : 0;
  const maxGainPerContract = watchCredit ? watchCredit * 100 : 0;
  const maxLossPerContract = width && watchCredit ? (width - watchCredit) * 100 : 0;
  const maxGain = maxGainPerContract * watchContracts;
  
  const dte = calculateDte(watchExpiry);
  const maxLoss = maxLossPerContract * watchContracts;
  const rr = maxGain > 0 ? (maxLoss / maxGain).toFixed(2) : "0.00";

  const onSubmit = (data: EditPositionForm) => {
    if (isPreLoginMode) {
      setShowAuthModal(true);
      return;
    }
    mutation.mutate(data);
  };

  if (!position) return null;

  const isCoveredCall = position.strategyType === 'COVERED_CALL';
  const isStock = position.strategyType === 'STOCK';
  const isDebit = position.strategyType === 'LEAPS' || isStock;
  const showType = !isCoveredCall && !isStock;
  const showLongStrike = !isCoveredCall && !isStock;
  const showStrike = !isStock;
  const showExpiry = !isStock;

  const titleMap: Record<string, string> = {
    'COVERED_CALL': 'Edit Covered Call',
    'STOCK': 'Edit Stock Position',
    'CREDIT_SPREAD': 'Edit Credit Spread',
    'IRON_CONDOR': 'Edit Iron Condor',
    'LEAPS': 'Edit LEAPS',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titleMap[position.strategyType] || 'Edit Position'}</DialogTitle>
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
                      <Input {...field} placeholder="SPY" className="mono" data-testid="input-symbol" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {showType ? (
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PUT">PUT Spread</SelectItem>
                        <SelectItem value="CALL">CALL Spread</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              ) : (
                <div className="flex items-end pb-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    {isCoveredCall ? 'Covered Call' : isStock ? 'Long Stock' : position.type}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="portfolioId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account (Optional)</FormLabel>
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

            <div className={`grid gap-4 ${showLongStrike ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {showStrike && (
              <FormField
                control={form.control}
                name="shortStrike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isCoveredCall ? 'Strike Price' : 'Short Strike'}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        type="number"
                        step="0.01"
                        placeholder="420.00"
                        className="mono"
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        data-testid="input-short-strike"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}

              {showLongStrike && (
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
                        placeholder="415.00"
                        className="mono"
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        data-testid="input-long-strike"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}

              <FormField
                control={form.control}
                name={isDebit ? "entryDebit" : "entryCredit"}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isStock ? 'Entry Price ($)' : isCoveredCall ? 'Premium Received ($)' : isDebit ? 'Entry Debit ($)' : 'Entry Credit ($)'}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        type="number"
                        step="0.01"
                        placeholder={isDebit ? "150.00" : "1.50"}
                        className="mono"
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        data-testid="input-entry-credit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isCoveredCall && (
              <FormField
                control={form.control}
                name="linkedPositionId"
                render={({ field }) => {
                  // Only show LEAPS/STOCK in same portfolio with same symbol
                  const parentCandidates = (allPositions || []).filter(p =>
                    (p.strategyType === 'LEAPS' || p.strategyType === 'STOCK') &&
                    p.symbol === position.symbol &&
                    p.portfolioId === position.portfolioId &&
                    p.id !== position.id
                  );
                  return (
                    <FormItem>
                      <FormLabel>Linked To (LEAPS / Stock)</FormLabel>
                      <Select onValueChange={(v) => field.onChange(v === "none" ? null : v)} value={field.value || "none"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select parent position" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None (unlinked)</SelectItem>
                          {parentCandidates.map((p) => {
                            const portfolio = portfolios?.find(port => port.id === p.portfolioId);
                            return (
                              <SelectItem key={p.id} value={p.id}>
                                {p.symbol} {p.strategyType === 'STOCK' ? 'Stock' : `LEAPS $${p.shortStrike}`}
                                {p.strategyType === 'LEAPS' && p.expiry ? ` • ${format(new Date(p.expiry), "MMM yyyy")}` : ''}
                                {` (${p.contracts}x)`}
                                {portfolio ? ` • ${portfolio.name}` : ''}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            )}

            {showExpiry && (
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
            )}

            {!isCoveredCall && !isStock && (
            <div>
              <h4 className="text-sm font-medium mb-3">Position Details</h4>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Width</p>
                  <p className="font-semibold mono">${width.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Max Gain</p>
                  <p className="font-semibold mono text-success">${maxGain.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Max Loss</p>
                  <p className="font-semibold mono text-destructive">${maxLoss.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">R:R Ratio</p>
                  <p className="font-semibold mono">{rr}:1</p>
                </div>
              </div>
            </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Add any notes about this position..."
                      className="min-h-[100px]"
                      data-testid="input-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save">
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </Dialog>
  );
}
