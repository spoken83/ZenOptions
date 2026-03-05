import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Building2, ExternalLink, User, Mail, CreditCard, Calendar, Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { PageSEO } from "@/components/seo/PageSEO";
import type { Portfolio, InsertPortfolio } from "@shared/schema";

const portfolioSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  accountNumber: z.string().optional(),
  isExternal: z.boolean().default(false),
});

type PortfolioForm = z.infer<typeof portfolioSchema>;

export default function Profile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isPro = user?.subscriptionTier === 'pro';
  const [portfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [editingTelegram, setEditingTelegram] = useState(false);

  // Populate Telegram chat ID when user data loads
  useEffect(() => {
    if (user) {
      setTelegramChatId(user.telegramChatId || '');
    }
  }, [user]);

  const { data: portfolios } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios"],
  });

  const portfolioForm = useForm<PortfolioForm>({
    resolver: zodResolver(portfolioSchema),
    defaultValues: {
      name: "",
      description: "",
      accountNumber: "",
      isExternal: false,
    },
  });

  const createPortfolioMutation = useMutation({
    mutationFn: async (data: InsertPortfolio) => {
      return await apiRequest("POST", "/api/portfolios", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
      setPortfolioDialogOpen(false);
      portfolioForm.reset();
      toast({
        title: "Portfolio Created",
        description: "Portfolio has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create portfolio",
        variant: "destructive",
      });
    },
  });

  const updatePortfolioMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertPortfolio> }) => {
      return await apiRequest("PATCH", `/api/portfolios/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
      setPortfolioDialogOpen(false);
      setEditingPortfolio(null);
      portfolioForm.reset();
      toast({
        title: "Portfolio Updated",
        description: "Portfolio has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update portfolio",
        variant: "destructive",
      });
    },
  });

  const deletePortfolioMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/portfolios/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
      toast({
        title: "Portfolio Deleted",
        description: "Portfolio has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete portfolio. Ensure no positions are assigned to this portfolio.",
        variant: "destructive",
      });
    },
  });

  const saveTelegramMutation = useMutation({
    mutationFn: async (chatId: string) => {
      const response = await apiRequest("PATCH", "/api/user/telegram", {
        telegramChatId: chatId,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      // Update the cache directly with the parsed user data
      queryClient.setQueryData(["/api/auth/user"], data);
      setEditingTelegram(false);
      toast({
        title: "Telegram Chat ID Saved",
        description: "Your Telegram chat ID has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save Telegram chat ID",
        variant: "destructive",
      });
    },
  });

  const removeTelegramMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", "/api/user/telegram", {
        telegramChatId: null,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.setQueryData(["/api/auth/user"], data);
      setTelegramChatId('');
      setEditingTelegram(false);
      toast({
        title: "Telegram Disconnected",
        description: "Your Telegram chat ID has been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove Telegram chat ID",
        variant: "destructive",
      });
    },
  });

  const testTelegramMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/telegram/test", {});
    },
    onSuccess: () => {
      toast({
        title: "Test Message Sent",
        description: "Check your Telegram for the test message ✅",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send test message",
        variant: "destructive",
      });
    },
  });

  const handleAddPortfolio = () => {
    setEditingPortfolio(null);
    portfolioForm.reset({
      name: "",
      description: "",
      accountNumber: "",
      isExternal: false,
    });
    setPortfolioDialogOpen(true);
  };

  const handleEditPortfolio = (portfolio: Portfolio) => {
    setEditingPortfolio(portfolio);
    portfolioForm.reset({
      name: portfolio.name,
      description: portfolio.description || "",
      accountNumber: portfolio.accountNumber || "",
      isExternal: portfolio.isExternal || false,
    });
    setPortfolioDialogOpen(true);
  };

  const handleDeletePortfolio = (id: string) => {
    if (confirm("Are you sure you want to delete this portfolio? All positions assigned to it will become unassigned.")) {
      deletePortfolioMutation.mutate(id);
    }
  };

  const onPortfolioSubmit = (data: PortfolioForm) => {
    if (editingPortfolio) {
      updatePortfolioMutation.mutate({
        id: editingPortfolio.id,
        data,
      });
    } else {
      createPortfolioMutation.mutate(data as InsertPortfolio);
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <PageSEO 
        title="Profile" 
        description="Manage your account information, portfolio accounts, and Telegram notification settings."
      />
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2">Profile</h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          Manage your account information and portfolio accounts
        </p>
      </div>

      {/* User Information Section */}
      {user && (
        <Card className="mb-8" data-testid="card-user-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Email</div>
                  <div className="text-base font-medium" data-testid="text-user-email">
                    {user.email || 'Not available'}
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Subscription</div>
                  <div className="mt-1">
                    <Badge 
                      variant={user.subscriptionTier === 'pro' ? 'default' : 'secondary'}
                      data-testid="badge-subscription-tier"
                    >
                      {user.subscriptionTier === 'pro' ? 'Pro Plan' : 'Free Plan'}
                    </Badge>
                  </div>
                </div>
              </div>

              {user.createdAt && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Member Since</div>
                    <div className="text-base" data-testid="text-user-created">
                      {new Date(user.createdAt).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Telegram Chat ID */}
              {isPro && (
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-muted-foreground mb-1">Telegram Chat ID</div>
                    {!editingTelegram ? (
                      <div className="flex items-center gap-2">
                        <div className={`text-base ${user.telegramChatId ? 'font-medium' : 'text-muted-foreground'}`} data-testid="text-telegram-chat-id">
                          {user.telegramChatId || 'Not Set'}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditingTelegram(true)}
                          data-testid="button-edit-telegram"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Input
                          type="text"
                          placeholder="123456789 or @username"
                          value={telegramChatId}
                          onChange={(e) => setTelegramChatId(e.target.value)}
                          className="max-w-xs"
                          data-testid="input-telegram-chat-id"
                          autoFocus
                        />
                        <p className="text-xs text-muted-foreground">
                          Get your chat ID from @userinfobot on Telegram
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={() => saveTelegramMutation.mutate(telegramChatId)}
                            disabled={saveTelegramMutation.isPending || !telegramChatId}
                            data-testid="button-save-telegram"
                          >
                            {saveTelegramMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => testTelegramMutation.mutate()}
                            disabled={testTelegramMutation.isPending || !telegramChatId}
                            data-testid="button-test-telegram"
                          >
                            <Send className="mr-2" size={14} />
                            Test
                          </Button>
                          {user.telegramChatId && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm("Are you sure you want to disconnect Telegram? You will stop receiving alerts.")) {
                                  removeTelegramMutation.mutate();
                                }
                              }}
                              disabled={removeTelegramMutation.isPending}
                              data-testid="button-remove-telegram"
                            >
                              <Trash2 className="mr-2" size={14} />
                              {removeTelegramMutation.isPending ? "Removing..." : "Remove"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingTelegram(false);
                              setTelegramChatId(user.telegramChatId || '');
                            }}
                            data-testid="button-cancel-telegram"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Portfolio Management Section */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Portfolio Accounts</h3>
            <p className="text-sm text-muted-foreground">
              Manage portfolios/accounts for organizing your positions. Support for multiple broker accounts.
            </p>
          </div>
          <Button
            onClick={handleAddPortfolio}
            data-testid="button-add-portfolio"
          >
            <Plus className="mr-2" size={16} />
            Add Portfolio
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-semibold">Name</th>
                <th className="text-left p-3 font-semibold">Description</th>
                <th className="text-left p-3 font-semibold">Account Number</th>
                <th className="text-left p-3 font-semibold">Source</th>
                <th className="text-right p-3 font-semibold">Cash Balance</th>
                <th className="text-right p-3 font-semibold">Total Value</th>
                <th className="text-left p-3 font-semibold">Account Type</th>
                <th className="text-right p-3 font-semibold">Buying Power</th>
                <th className="text-right p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {portfolios && portfolios.length > 0 ? (
                portfolios.map((portfolio) => (
                  <tr key={portfolio.id} className="border-t" data-testid={`row-portfolio-${portfolio.id}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-muted-foreground" />
                        <span className="font-medium">{portfolio.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {portfolio.description || "—"}
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-sm">
                        {portfolio.accountNumber || "—"}
                      </span>
                    </td>
                    <td className="p-3">
                      {portfolio.isExternal ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-orange-500/20 text-orange-700 dark:text-orange-400">
                          <ExternalLink size={12} />
                          External
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-mono text-sm" data-testid={`text-portfolio-cash-${portfolio.id}`}>
                        {portfolio.cashBalance != null 
                          ? `$${portfolio.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-mono text-sm font-semibold" data-testid={`text-portfolio-total-${portfolio.id}`}>
                        {portfolio.totalValue != null 
                          ? `$${portfolio.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </span>
                    </td>
                    <td className="p-3">
                      {portfolio.accountType ? (
                        <span className="text-sm">
                          {portfolio.accountType}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-mono text-sm" data-testid={`text-portfolio-buying-power-${portfolio.id}`}>
                        {portfolio.buyingPower != null 
                          ? `$${portfolio.buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditPortfolio(portfolio)}
                          data-testid={`button-edit-portfolio-${portfolio.id}`}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePortfolio(portfolio.id)}
                          data-testid={`button-delete-portfolio-${portfolio.id}`}
                        >
                          <Trash2 size={16} className="text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    No portfolios found. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Portfolio Dialog */}
      <Dialog open={portfolioDialogOpen} onOpenChange={setPortfolioDialogOpen}>
        <DialogContent data-testid="dialog-portfolio">
          <DialogHeader>
            <DialogTitle>
              {editingPortfolio ? "Edit Portfolio" : "Add Portfolio"}
            </DialogTitle>
          </DialogHeader>
          <Form {...portfolioForm}>
            <form onSubmit={portfolioForm.handleSubmit(onPortfolioSubmit)} className="space-y-4">
              <FormField
                control={portfolioForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Tiger Brokers, Demo Account" data-testid="input-portfolio-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={portfolioForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Optional description" data-testid="input-portfolio-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={portfolioForm.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., 50133709" data-testid="input-portfolio-account-number" />
                    </FormControl>
                    <FormDescription>
                      Optional. Useful for tracking multiple broker accounts (e.g., Tiger account ID)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={portfolioForm.control}
                name="isExternal"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>External Broker Account</FormLabel>
                      <FormDescription>
                        Mark this portfolio as imported from an external broker (e.g., Tiger Brokers)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-portfolio-is-external"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPortfolioDialogOpen(false)}
                  data-testid="button-cancel-portfolio"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPortfolioMutation.isPending || updatePortfolioMutation.isPending}
                  data-testid="button-save-portfolio"
                >
                  {editingPortfolio ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
