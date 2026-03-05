import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "@/components/auth/AuthModal";
import type { Ticker } from "@shared/schema";

const editTickerSchema = z.object({
  support: z.number().nullable().optional(),
  resistance: z.number().nullable().optional(),
  minOI: z.number().int().positive(),
  maxBidAskCents: z.number().int().positive(),
});

type EditTickerForm = z.infer<typeof editTickerSchema>;

interface EditTickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticker: Ticker | null;
}

export default function EditTickerModal({ open, onOpenChange, ticker }: EditTickerModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPreLoginMode } = useAuth();
  const [showSignupModal, setShowSignupModal] = useState(false);

  const form = useForm<EditTickerForm>({
    resolver: zodResolver(editTickerSchema),
  });

  useEffect(() => {
    if (ticker) {
      form.reset({
        support: ticker.support,
        resistance: ticker.resistance,
        minOI: ticker.minOI,
        maxBidAskCents: ticker.maxBidAskCents,
      });
    }
  }, [ticker, form]);

  const mutation = useMutation({
    mutationFn: async (data: EditTickerForm) => {
      if (!ticker) return;
      const response = await apiRequest("PATCH", `/api/tickers/${ticker.symbol}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist-market-data"] });
      toast({
        title: "Ticker Updated",
        description: "Ticker configuration has been updated successfully",
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

  const onSubmit = (data: EditTickerForm) => {
    if (isPreLoginMode) {
      onOpenChange(false);
      setShowSignupModal(true);
      return;
    }
    mutation.mutate(data);
  };

  if (!ticker) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {ticker.symbol} Configuration</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="support"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Support Level (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          value={field.value || ''}
                          type="number"
                          step="0.01"
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                          className="mono pr-8"
                          data-testid="input-support"
                          placeholder="Leave empty for all-time low"
                        />
                        {field.value && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                            onClick={() => field.onChange(null)}
                            data-testid="button-clear-support"
                          >
                            <X size={12} />
                          </Button>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="resistance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resistance Level (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          value={field.value || ''}
                          type="number"
                          step="0.01"
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                          className="mono pr-8"
                          data-testid="input-resistance"
                          placeholder="Leave empty for all-time high"
                        />
                        {field.value && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                            onClick={() => field.onChange(null)}
                            data-testid="button-clear-resistance"
                          >
                            <X size={12} />
                          </Button>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>


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
                {mutation.isPending ? "Updating..." : "Update Ticker"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
      
      <AuthModal 
        open={showSignupModal} 
        onOpenChange={setShowSignupModal}
        defaultTab="signup"
      />
    </Dialog>
  );
}
