import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { calculateDte } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import type { Position, Portfolio } from "@shared/schema";
import { format } from "date-fns";
import { AuthModal } from "@/components/auth/AuthModal";

const editIronCondorSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  portfolioId: z.string().nullable(),
  putShortStrike: z.number().positive("Put short strike must be positive"),
  putLongStrike: z.number().positive("Put long strike must be positive"),
  callShortStrike: z.number().positive("Call short strike must be positive"),
  callLongStrike: z.number().positive("Call long strike must be positive"),
  expiry: z.string().min(1, "Expiry is required"),
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

type EditIronCondorForm = z.infer<typeof editIronCondorSchema>;

interface EditIronCondorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: Position | null;
}

export default function EditIronCondorModal({ open, onOpenChange, position }: EditIronCondorModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const form = useForm<EditIronCondorForm>({
    resolver: zodResolver(editIronCondorSchema),
    defaultValues: {
      symbol: "",
      portfolioId: null,
      putShortStrike: 0,
      putLongStrike: 0,
      callShortStrike: 0,
      callLongStrike: 0,
      expiry: "",
      entryCredit: 0,
      contracts: 1,
      notes: "",
    },
  });

  useEffect(() => {
    if (position && open) {
      const expiryDate = new Date(position.expiry);
      form.reset({
        symbol: position.symbol,
        portfolioId: position.portfolioId || null,
        putShortStrike: position.shortStrike,
        putLongStrike: position.longStrike || 0,
        callShortStrike: position.callShortStrike || 0,
        callLongStrike: position.callLongStrike || 0,
        expiry: format(expiryDate, "yyyy-MM-dd"),
        entryCredit: (position.entryCreditCents || 0) / 100,
        contracts: position.contracts || 1,
        notes: position.notes || "",
      });
    }
  }, [position, open, form]);

  const mutation = useMutation({
    mutationFn: async (data: EditIronCondorForm) => {
      if (!position) throw new Error("No position selected");
      
      const response = await apiRequest("PATCH", `/api/positions/${position.id}`, {
        symbol: data.symbol,
        portfolioId: data.portfolioId,
        shortStrike: data.putShortStrike,
        longStrike: data.putLongStrike,
        callShortStrike: data.callShortStrike,
        callLongStrike: data.callLongStrike,
        expiry: new Date(data.expiry),
        entryCreditCents: Math.round(data.entryCredit * 100),
        contracts: data.contracts,
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
        title: "Iron Condor Updated",
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

  const watchPutShort = form.watch("putShortStrike");
  const watchPutLong = form.watch("putLongStrike");
  const watchCallShort = form.watch("callShortStrike");
  const watchCallLong = form.watch("callLongStrike");
  const watchEntryCredit = form.watch("entryCredit");
  const watchContracts = form.watch("contracts") || 1;
  const watchExpiry = form.watch("expiry");

  const putSpreadWidth = Math.abs(watchPutShort - watchPutLong);
  const callSpreadWidth = Math.abs(watchCallShort - watchCallLong);
  const maxSpreadWidth = Math.max(putSpreadWidth, callSpreadWidth);
  
  const dte = calculateDte(watchExpiry);
  
  const maxProfit = watchEntryCredit * 100 * watchContracts;
  const maxLoss = maxSpreadWidth > 0 && watchEntryCredit > 0 ? (maxSpreadWidth - watchEntryCredit) * 100 * watchContracts : 0;
  const putBreakEven = watchPutShort - watchEntryCredit;
  const callBreakEven = watchCallShort + watchEntryCredit;

  const onSubmit = (data: EditIronCondorForm) => {
    if (isPreLoginMode) {
      setShowAuthModal(true);
      return;
    }
    mutation.mutate(data);
  };

  if (!position) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Iron Condor Position</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="SPY" className="mono" data-testid="input-ic-symbol" />
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
                    <Select onValueChange={(value) => field.onChange(value === "none" ? null : value)} value={field.value || "none"}>
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

            <div className="grid grid-cols-2 gap-4">
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
                        placeholder="4.50"
                        className="mono"
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-ic-entry-credit"
                      />
                    </FormControl>
                    <FormDescription>Total credit received</FormDescription>
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
                {mutation.isPending ? "Updating..." : "Update Position"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </Dialog>
  );
}
