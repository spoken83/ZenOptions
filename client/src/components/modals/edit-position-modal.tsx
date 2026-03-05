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
  type: z.enum(["PUT", "CALL"]),
  shortStrike: z.number().positive("Short strike must be positive"),
  longStrike: z.number().positive("Long strike must be positive"),
  expiry: z.string().min(1, "Expiry is required"),
  entryCredit: z.number().positive("Entry credit must be positive"),
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
      form.reset({
        symbol: position.symbol,
        portfolioId: position.portfolioId || "",
        contracts: position.contracts || 1,
        type: position.type as "PUT" | "CALL",
        shortStrike: position.shortStrike,
        longStrike: position.longStrike || 0,
        expiry: format(expiryDate, "yyyy-MM-dd"),
        entryCredit: (position.entryCreditCents || 0) / 100,
        notes: position.notes || "",
      });
    }
  }, [position, open, form]);

  const mutation = useMutation({
    mutationFn: async (data: EditPositionForm) => {
      if (!position) throw new Error("No position selected");
      
      const response = await apiRequest("PATCH", `/api/positions/${position.id}`, {
        symbol: data.symbol,
        portfolioId: data.portfolioId || null,
        contracts: data.contracts,
        type: data.type,
        shortStrike: data.shortStrike,
        longStrike: data.longStrike,
        expiry: new Date(data.expiry),
        entryCreditCents: Math.round(data.entryCredit * 100),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Position</DialogTitle>
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

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="shortStrike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Strike</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
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

              <FormField
                control={form.control}
                name="longStrike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Long Strike</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
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
                        placeholder="1.50"
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
