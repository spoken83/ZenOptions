import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Position } from "@shared/schema";

const editCloseSchema = z.object({
  exitCredit: z.number().min(0, "Exit credit must be positive or zero"),
});

type EditCloseForm = z.infer<typeof editCloseSchema>;

interface EditCloseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: Position | null;
}

export default function EditCloseModal({ open, onOpenChange, position }: EditCloseModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<EditCloseForm>({
    resolver: zodResolver(editCloseSchema),
    defaultValues: {
      exitCredit: 0,
    },
  });

  useEffect(() => {
    if (position && open) {
      form.reset({
        exitCredit: position.exitCreditCents ? position.exitCreditCents / 100 : 0,
      });
    }
  }, [position, open, form]);

  const mutation = useMutation({
    mutationFn: async (data: EditCloseForm) => {
      if (!position) throw new Error("No position selected");
      
      const response = await apiRequest("POST", `/api/positions/${position.id}/close`, {
        exitCreditCents: Math.round(data.exitCredit * 100),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions/pnl"] });
      toast({
        title: "Close Updated",
        description: "Exit credit has been updated successfully",
      });
      form.reset();
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

  const watchExit = form.watch("exitCredit");

  if (!position) return null;

  const isLeaps = position.strategyType === 'LEAPS';
  const isStock = position.strategyType === 'STOCK';
  const isDebit = isLeaps || isStock;
  const contracts = position.contracts || 1;

  let pl = 0;
  let plPercent = "0.0";
  let maxLoss = 0;
  let maxSpreadWidth = 0;

  if (isStock) {
    const entryDebit = (position.entryDebitCents || 0) / 100;
    pl = (watchExit - entryDebit) * contracts;
    plPercent = entryDebit > 0 ? (((watchExit - entryDebit) / entryDebit) * 100).toFixed(1) : "0.0";
    maxLoss = entryDebit * contracts;
  } else if (isLeaps) {
    const entryDebit = (position.entryDebitCents || 0) / 100;
    pl = (watchExit - entryDebit) * 100 * contracts;
    plPercent = entryDebit > 0 ? (((watchExit - entryDebit) / entryDebit) * 100).toFixed(1) : "0.0";
    maxLoss = entryDebit * 100 * contracts;
  } else {
    const entryCredit = (position.entryCreditCents || 0) / 100;
    pl = (entryCredit - watchExit) * 100 * contracts;
    plPercent = entryCredit > 0 ? (((entryCredit - watchExit) / entryCredit) * 100).toFixed(1) : "0.0";
    
    if (position.strategyType === 'IRON_CONDOR') {
      const putSpreadWidth = Math.abs((position.longStrike || 0) - (position.shortStrike || 0));
      const callSpreadWidth = Math.abs((position.callLongStrike || 0) - (position.callShortStrike || 0));
      maxSpreadWidth = Math.max(putSpreadWidth, callSpreadWidth);
      maxLoss = (maxSpreadWidth - entryCredit) * 100 * contracts;
    } else {
      maxSpreadWidth = Math.abs((position.shortStrike || 0) - (position.longStrike || 0));
      maxLoss = (maxSpreadWidth - entryCredit) * 100 * contracts;
    }
  }

  const onSubmit = (data: EditCloseForm) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Close</DialogTitle>
          <DialogDescription>
            {isStock
              ? "Update the sale price for this closed stock position."
              : isLeaps
              ? "Update the exit price for this closed LEAPS position."
              : "Update the exit credit for this closed position."}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4">
          <h4 className="text-sm font-medium mb-3">Position Summary</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Symbol</p>
              <p className="font-semibold mono">{position.symbol}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Type</p>
              {isStock ? (
                <p className="font-semibold text-primary">Stock (Long)</p>
              ) : isLeaps ? (
                <p className="font-semibold text-primary">LEAPS</p>
              ) : position.strategyType === 'IRON_CONDOR' ? (
                <p className="font-semibold text-primary">Iron Condor</p>
              ) : (
                <p className={`font-semibold ${
                  position.type === "PUT" ? "text-success" : "text-destructive"
                }`}>
                  {position.type} Spread
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">{isStock ? "Shares" : isLeaps ? "Strike" : "Strikes"}</p>
              {isStock ? (
                <p className="font-semibold mono">{contracts}x</p>
              ) : isLeaps ? (
                <p className="font-semibold mono">${(position.shortStrike || 0).toFixed(2)}</p>
              ) : position.strategyType === 'IRON_CONDOR' ? (
                <div className="space-y-1">
                  <p className="font-semibold mono text-xs text-success">
                    P: {(position.shortStrike || 0).toFixed(2)}/{(position.longStrike || 0).toFixed(2)}
                  </p>
                  <p className="font-semibold mono text-xs text-destructive">
                    C: {(position.callShortStrike || 0).toFixed(2)}/{(position.callLongStrike || 0).toFixed(2)}
                  </p>
                </div>
              ) : (
                <p className="font-semibold mono">{(position.shortStrike || 0).toFixed(2)}/{(position.longStrike || 0).toFixed(2)}</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">{isStock ? "Entry Price" : isLeaps ? "Entry Debit" : "Entry Credit"}</p>
              <p className="font-semibold mono">
                ${isDebit
                  ? ((position.entryDebitCents || 0) / 100).toFixed(2)
                  : ((position.entryCreditCents || 0) / 100).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Current Exit</p>
              <p className="font-semibold mono">${position.exitCreditCents ? (position.exitCreditCents / 100).toFixed(2) : "—"}</p>
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="exitCredit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isStock ? "Sale Price (per share)" : isLeaps ? "Exit Price (per share)" : "Exit Credit ($)"}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={isLeaps ? "15.00" : "0.50"}
                      className="mono"
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      data-testid="input-exit-credit"
                      autoFocus
                    />
                  </FormControl>
                  <FormDescription>
                    {isLeaps 
                      ? "Price per share you sold the LEAPS option for"
                      : "Enter 0 if the spread expired worthless (max profit)"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <h4 className="text-sm font-medium mb-3">Updated Result</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">P/L</p>
                  <p className={`font-semibold mono ${pl >= 0 ? "text-success" : "text-destructive"}`}>
                    ${pl.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">P/L %</p>
                  <p className={`font-semibold mono ${pl >= 0 ? "text-success" : "text-destructive"}`}>
                    {pl >= 0 ? "+" : ""}{plPercent}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Max Loss</p>
                  <p className="font-semibold mono text-muted-foreground">
                    ${maxLoss.toFixed(2)}
                  </p>
                </div>
              </div>
              {watchExit >= maxSpreadWidth && (
                <p className="text-destructive text-xs mt-2 font-medium">
                  ⚠️ Warning: Exit credit is at or above spread width (max loss)
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-update-close">
                {mutation.isPending ? "Updating..." : "Update Close"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
