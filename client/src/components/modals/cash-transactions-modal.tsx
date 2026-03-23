import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Trash2, Plus } from "lucide-react";
import { format } from "date-fns";
import type { Portfolio, CashTransaction } from "@shared/schema";

const addTransactionSchema = z.object({
  type: z.enum(["deposit", "withdrawal"]),
  amount: z.number().positive("Amount must be positive"),
  portfolioId: z.string().min(1, "Select a portfolio"),
  date: z.string().min(1, "Date is required"),
  note: z.string().optional(),
});

type AddTransactionForm = z.infer<typeof addTransactionSchema>;

interface CashTransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CashTransactionsModal({ open, onOpenChange }: CashTransactionsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: transactions } = useQuery<CashTransaction[]>({
    queryKey: ["/api/cash-transactions"],
    enabled: open,
  });

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const form = useForm<AddTransactionForm>({
    resolver: zodResolver(addTransactionSchema),
    defaultValues: {
      type: "deposit",
      amount: 0,
      portfolioId: "",
      date: format(new Date(), "yyyy-MM-dd"),
      note: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: AddTransactionForm) => {
      const res = await apiRequest("POST", "/api/cash-transactions", {
        type: data.type,
        amountCents: Math.round(data.amount * 100),
        portfolioId: data.portfolioId,
        date: data.date,
        note: data.note || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-transactions"] });
      toast({ title: "Transaction added" });
      form.reset({ type: "deposit", amount: 0, portfolioId: form.getValues("portfolioId"), date: format(new Date(), "yyyy-MM-dd"), note: "" });
      setShowForm(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to add transaction", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/cash-transactions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-transactions"] });
      toast({ title: "Transaction deleted" });
    },
  });

  const getPortfolioName = (portfolioId: string | null) => {
    if (!portfolioId || !portfolios) return "—";
    const p = portfolios.find(p => p.id === portfolioId);
    return p ? (p.accountNumber ? `${p.name} (${p.accountNumber})` : p.name) : "Unknown";
  };

  const totalDeposits = (transactions || [])
    .filter(t => t.type === "deposit")
    .reduce((sum, t) => sum + t.amountCents, 0) / 100;

  const totalWithdrawals = (transactions || [])
    .filter(t => t.type === "withdrawal")
    .reduce((sum, t) => sum + t.amountCents, 0) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deposits & Withdrawals</DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-success">${totalDeposits.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Deposits</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-destructive">${totalWithdrawals.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Withdrawals</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-lg font-bold">${(totalDeposits - totalWithdrawals).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Net Funded</div>
          </div>
        </div>

        {/* Transactions list */}
        {transactions && transactions.length > 0 ? (
          <div className="border rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-right p-2">Amount</th>
                  <th className="text-left p-2">Portfolio</th>
                  <th className="text-left p-2">Note</th>
                  <th className="w-8 p-2"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{format(new Date(tx.date), "dd/MM/yyyy")}</td>
                    <td className="p-2">
                      <Badge variant={tx.type === "deposit" ? "default" : "secondary"} className="text-xs">
                        {tx.type === "deposit" ? "Deposit" : "Withdrawal"}
                      </Badge>
                    </td>
                    <td className={`p-2 text-right font-mono font-semibold ${tx.type === "deposit" ? "text-success" : "text-destructive"}`}>
                      {tx.type === "deposit" ? "+" : "-"}${(tx.amountCents / 100).toLocaleString()}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{getPortfolioName(tx.portfolioId)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{tx.note || "—"}</td>
                    <td className="p-2">
                      <button
                        onClick={() => deleteMutation.mutate(tx.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground text-sm mb-4">
            No transactions yet. Add your first deposit to get started.
          </div>
        )}

        {/* Add form */}
        {showForm ? (
          <div className="border rounded-lg p-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="deposit">Deposit</SelectItem>
                            <SelectItem value="withdrawal">Withdrawal</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="portfolioId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Portfolio</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select portfolio" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {portfolios?.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.accountNumber ? `${p.name} (${p.accountNumber})` : p.name}
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
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Initial funding" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={createMutation.isPending}>Add Transaction</Button>
                </div>
              </form>
            </Form>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Transaction
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
