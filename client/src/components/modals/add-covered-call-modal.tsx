import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { calculateDte } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, invalidateAfterPositionChange } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Portfolio, Position } from "@shared/schema";
import { AuthModal } from "@/components/auth/AuthModal";
import { Crown, Link2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

const addCoveredCallSchema = z.object({
  leapsId: z.string().min(1, "Select a LEAPS position to sell against"),
  portfolioId: z.string().min(1, "Account is required"),
  contracts: z.number().int().positive("Number of contracts must be at least 1").default(1),
  strike: z.number().positive("Strike must be positive"),
  expiry: z.string().min(1, "Expiry is required"),
  entryCredit: z.number().positive("Premium must be positive"),
});

type AddCoveredCallForm = z.infer<typeof addCoveredCallSchema>;

interface AddCoveredCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddCoveredCallModal({ open, onOpenChange }: AddCoveredCallModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [, setLocation] = useLocation();

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const { data: positions } = useQuery<Position[]>({
    queryKey: ["/api/positions?status=open"],
  });

  // Include both LEAPS and STOCK positions as valid parents for covered calls
  const parentPositions = positions?.filter(p => p.strategyType === "LEAPS" || p.strategyType === "STOCK") || [];

  const form = useForm<AddCoveredCallForm>({
    resolver: zodResolver(addCoveredCallSchema),
    defaultValues: {
      leapsId: "",
      portfolioId: portfolios?.[0]?.id || "",
      contracts: 1,
      strike: 0,
      expiry: "",
      entryCredit: 0,
    },
  });

  const watchLeapsId = form.watch("leapsId");
  const selectedLeaps = parentPositions.find(l => l.id === watchLeapsId);
  const watchCredit = form.watch("entryCredit");
  const watchContracts = form.watch("contracts") || 1;
  const watchExpiry = form.watch("expiry");

  const maxGainPerContract = watchCredit ? watchCredit * 100 : 0;
  const maxGain = maxGainPerContract * watchContracts;
  const dte = watchExpiry ? calculateDte(new Date(watchExpiry)) : null;

  useEffect(() => {
    if (selectedLeaps) {
      if (selectedLeaps.portfolioId) {
        form.setValue("portfolioId", selectedLeaps.portfolioId);
      }
      form.setValue("contracts", selectedLeaps.contracts);
    }
  }, [selectedLeaps, form]);

  useEffect(() => {
    if (open) {
      form.reset({
        leapsId: "",
        portfolioId: portfolios?.[0]?.id || "",
        contracts: 1,
        strike: 0,
        expiry: "",
        entryCredit: 0,
      });
    }
  }, [open, portfolios, form]);

  const createMutation = useMutation({
    mutationFn: async (data: AddCoveredCallForm) => {
      const payload = {
        symbol: selectedLeaps!.symbol,
        portfolioId: data.portfolioId,
        strategyType: "COVERED_CALL",
        type: "CALL",
        shortStrike: data.strike,
        longStrike: null,
        expiry: data.expiry,
        contracts: data.contracts,
        entryCreditCents: Math.round(data.entryCredit * 100),
        status: "open",
        linkedPositionId: data.leapsId,
      };
      const res = await apiRequest("POST", "/api/positions", payload);
      return res.json();
    },
    onSuccess: () => {
      invalidateAfterPositionChange();
      toast({
        title: "Covered Call Added",
        description: `Covered call linked to ${selectedLeaps?.symbol} ${selectedLeaps?.strategyType === 'STOCK' ? 'Stock' : 'LEAPS'}`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      if (error.message.includes("position limit")) {
        setShowUpgradeDialog(true);
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (data: AddCoveredCallForm) => {
    if (isPreLoginMode) {
      setShowAuthModal(true);
      return;
    }
    createMutation.mutate(data);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Add Covered Call (PMCC)
            </DialogTitle>
          </DialogHeader>

          {parentPositions.length === 0 ? (
            <div className="py-8 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No LEAPS or Stock Positions Found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                You need to have an open LEAPS or Stock position before adding a covered call.
                Add one first, then come back to sell covered calls against it.
              </p>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="leapsId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select LEAPS / Stock Position</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-leaps">
                            <SelectValue placeholder="Choose a position to sell against" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {parentPositions.map((pos) => {
                            const portfolio = portfolios?.find(p => p.id === pos.portfolioId);
                            const isStock = pos.strategyType === "STOCK";
                            return (
                            <SelectItem key={pos.id} value={pos.id}>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{pos.symbol}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{isStock ? "Stock" : "LEAPS"}</span>
                                {!isStock && (
                                  <span className="text-muted-foreground">
                                    ${pos.shortStrike} • {pos.expiry ? format(new Date(pos.expiry), "MMM yyyy") : "N/A"}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  ({pos.contracts}x)
                                </span>
                                {portfolio && (
                                  <span className="text-xs text-muted-foreground border-l pl-2 ml-1">
                                    {portfolio.name}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedLeaps && (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <p className="font-medium mb-1">Selling against:</p>
                    <p className="text-muted-foreground">
                      {selectedLeaps.symbol} {selectedLeaps.strategyType === "STOCK"
                        ? `Stock • ${selectedLeaps.contracts} share${selectedLeaps.contracts > 1 ? "s" : ""}`
                        : `$${selectedLeaps.shortStrike} LEAPS • Expires ${selectedLeaps.expiry ? format(new Date(selectedLeaps.expiry), "MMM dd, yyyy") : "N/A"} • ${selectedLeaps.contracts} contract${selectedLeaps.contracts > 1 ? "s" : ""}`
                      }
                      {(() => { const p = portfolios?.find(p => p.id === selectedLeaps.portfolioId); return p ? ` • ${p.name}` : ""; })()}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="strike"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Strike Price</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.5"
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                            placeholder="175.00"
                            className="mono"
                            data-testid="input-strike"
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
                        <FormLabel>Contracts</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={1}
                            max={selectedLeaps?.contracts || 100}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-contracts"
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
                        <Input
                          {...field}
                          type="date"
                          data-testid="input-expiry"
                        />
                      </FormControl>
                      {dte !== null && (
                        <p className="text-xs text-muted-foreground">{dte} days to expiration</p>
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
                      <FormLabel>Premium Received (per share)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          placeholder="2.50"
                          className="mono"
                          data-testid="input-credit"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="p-3 bg-success/10 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Premium Collected</p>
                  <p className="font-semibold text-success text-lg mono" data-testid="text-max-gain">
                    ${maxGain.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    This premium reduces your LEAPS cost basis. View combined metrics in the Debit Strategies section.
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={createMutation.isPending || !selectedLeaps}
                  data-testid="button-submit"
                >
                  {createMutation.isPending ? "Adding..." : "Add Covered Call"}
                </Button>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              Position Limit Reached
            </AlertDialogTitle>
            <AlertDialogDescription>
              You've reached the maximum positions for your current plan.
              Upgrade to Pro to track unlimited positions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setLocation("/pricing")}>
              View Pricing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuthModal 
        open={showAuthModal} 
        onOpenChange={setShowAuthModal}
      />
    </>
  );
}
