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
import { apiRequest, invalidateAfterPositionChange } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Position, Portfolio } from "@shared/schema";
import { AuthModal } from "@/components/auth/AuthModal";

const editLeapsSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  portfolioId: z.string().nullable(),
  contracts: z.number().int().positive("Number of contracts must be at least 1").default(1),
  strike: z.number().positive("Strike must be positive"),
  expiry: z.string().min(1, "Expiry is required"),
  entryDebit: z.number().positive("Entry debit must be positive"),
  entryDelta: z.number().min(0).max(1, "Delta must be between 0 and 1"),
  notes: z.string().optional(),
});

type EditLeapsForm = z.infer<typeof editLeapsSchema>;

interface EditLeapsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: Position | null;
}

export default function EditLeapsModal({ open, onOpenChange, position }: EditLeapsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const form = useForm<EditLeapsForm>({
    resolver: zodResolver(editLeapsSchema),
    defaultValues: {
      symbol: "",
      portfolioId: null,
      contracts: 1,
      strike: 0,
      expiry: "",
      entryDebit: 0,
      entryDelta: 0.7,
      notes: "",
    },
  });

  useEffect(() => {
    if (position && open) {
      const expiryDate = new Date(position.expiry);
      form.reset({
        symbol: position.symbol,
        portfolioId: position.portfolioId || null,
        contracts: position.contracts || 1,
        strike: position.shortStrike ?? undefined,
        expiry: format(expiryDate, "yyyy-MM-dd"),
        entryDebit: (position.entryDebitCents || 0) / 100,
        entryDelta: position.entryDelta || 0.7,
        notes: position.notes || "",
      });
    }
  }, [position, open, form]);

  const mutation = useMutation({
    mutationFn: async (data: EditLeapsForm) => {
      if (!position) throw new Error("No position selected");
      
      const response = await apiRequest("PATCH", `/api/positions/${position.id}`, {
        symbol: data.symbol,
        portfolioId: data.portfolioId,
        contracts: data.contracts,
        shortStrike: data.strike,
        longStrike: null,
        expiry: new Date(data.expiry),
        entryCreditCents: null,
        entryDebitCents: Math.round(data.entryDebit * 100),
        entryDelta: data.entryDelta,
        notes: data.notes,
      });
      return response.json();
    },
    onSuccess: () => {
      invalidateAfterPositionChange();
      toast({
        title: "LEAPS Position Updated",
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

  const watchStrike = form.watch("strike");
  const watchDebit = form.watch("entryDebit");
  const watchContracts = form.watch("contracts") || 1;
  const watchExpiry = form.watch("expiry");

  const maxLossPerContract = watchDebit ? watchDebit * 100 : 0;
  const maxLoss = maxLossPerContract * watchContracts;
  const breakEven = watchStrike && watchDebit ? watchStrike + watchDebit : 0;
  
  const dte = calculateDte(watchExpiry);

  const onSubmit = (data: EditLeapsForm) => {
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
          <DialogTitle>Edit LEAPS Position</DialogTitle>
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
                        data-testid="input-edit-leaps-symbol"
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
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-leaps-portfolio">
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
                        data-testid="input-edit-leaps-strike"
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
                        data-testid="input-edit-leaps-contracts"
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
                    <Input {...field} type="date" data-testid="input-edit-leaps-expiry" />
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
                        data-testid="input-edit-leaps-debit"
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
                        data-testid="input-edit-leaps-delta"
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
                  <p className="font-semibold mono text-muted-foreground" data-testid="text-edit-leaps-max-loss">${maxLoss.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Max Gain</p>
                  <p className="font-semibold mono text-success" data-testid="text-edit-leaps-max-gain">Unlimited</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Break-Even</p>
                  <p className="font-semibold mono" data-testid="text-edit-leaps-breakeven">${breakEven.toFixed(2)}</p>
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
                      data-testid="input-edit-leaps-notes"
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
                data-testid="button-edit-leaps-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-edit-leaps-submit">
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
