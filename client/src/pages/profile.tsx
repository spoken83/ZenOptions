import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Building2, ExternalLink, User, Mail, CreditCard, Calendar, Send, MessageSquare, Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown, ChevronRight, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  // Reconciliation state
  const [reconPortfolioId, setReconPortfolioId] = useState<string>('');
  const [reconResult, setReconResult] = useState<any>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError] = useState<string | null>(null);
  const [expandedMissing, setExpandedMissing] = useState<Set<number>>(new Set());
  const [expandedDiffs, setExpandedDiffs] = useState<Set<number>>(new Set());
  const [selectedForImport, setSelectedForImport] = useState<Set<number>>(new Set());
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleStatementUpload = useCallback(async (file: File) => {
    if (!reconPortfolioId) {
      toast({
        title: "Select Account",
        description: "Please select which portfolio account this statement belongs to",
        variant: "destructive",
      });
      return;
    }

    setReconLoading(true);
    setReconError(null);
    setReconResult(null);

    try {
      const formData = new FormData();
      formData.append('statement', file);
      formData.append('portfolioId', reconPortfolioId);

      const response = await fetch('/api/reconciliation/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      setReconResult(result);
      toast({
        title: "Statement Processed",
        description: `Extracted ${result.summary.totalStatementPositions} positions from statement`,
      });
    } catch (error: any) {
      setReconError(error.message || 'Failed to process statement');
      toast({
        title: "Error",
        description: error.message || "Failed to process statement",
        variant: "destructive",
      });
    } finally {
      setReconLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [reconPortfolioId, toast]);

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

      {/* Statement Reconciliation Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Statement Reconciliation
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload a broker statement (PDF) to compare trades against your tracked positions and identify discrepancies.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Account selection + Upload */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1.5 block">Statement Account</label>
                <Select value={reconPortfolioId} onValueChange={setReconPortfolioId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select which account this statement belongs to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {portfolios?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.accountNumber ? `(${p.accountNumber})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleStatementUpload(file);
                  }}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={reconLoading || !reconPortfolioId}
                >
                  {reconLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Statement
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Error */}
            {reconError && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                <XCircle className="h-4 w-4 flex-shrink-0" />
                {reconError}
              </div>
            )}

            {/* Results */}
            {reconResult && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="p-4 rounded-lg bg-muted">
                  <div className="flex flex-wrap items-center gap-4 mb-3">
                    <span className="font-semibold">{reconResult.accountName}</span>
                    <span className="text-sm text-muted-foreground">Account: {reconResult.accountNumber}</span>
                    <span className="text-sm text-muted-foreground">Period: {reconResult.statementPeriod}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{reconResult.summary.totalStatementPositions}</div>
                      <div className="text-xs text-muted-foreground">In Statement</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-success">{reconResult.summary.matched}</div>
                      <div className="text-xs text-muted-foreground">Matched</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${reconResult.matched.filter((m: any) => m.differences.length > 0).length > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                        {reconResult.matched.filter((m: any) => m.differences.length > 0).length}
                      </div>
                      <div className="text-xs text-muted-foreground">Differences</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${(reconResult.summary.potentialMatches || 0) > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                        {reconResult.summary.potentialMatches || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Possible Matches</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${reconResult.summary.missingFromDB > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {reconResult.summary.missingFromDB}
                      </div>
                      <div className="text-xs text-muted-foreground">Missing from DB</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${(reconResult.summary.inDBNotInStatement || 0) > 0 ? 'text-blue-500' : 'text-muted-foreground'}`}>
                        {reconResult.summary.inDBNotInStatement || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">In DB Only</div>
                    </div>
                  </div>
                </div>

                {/* Potential Matches - same symbol but wrong parameters */}
                {reconResult.potentialMatches && reconResult.potentialMatches.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-orange-500">
                      <AlertTriangle className="h-4 w-4" />
                      Possible Matches - Verify Parameters ({reconResult.potentialMatches.length})
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      These positions exist in both the statement and DB but couldn't auto-match. They likely have incorrect parameters in the DB that need updating.
                    </p>
                    <div className="space-y-2">
                      {reconResult.potentialMatches.map((m: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{m.statement.symbol}</span>
                            <span className="text-sm text-muted-foreground">
                              {m.statement.type} {m.statement.shortStrike}/{m.statement.longStrike}
                            </span>
                            <span className="text-sm text-muted-foreground">exp {m.statement.expiry}</span>
                          </div>
                          <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">{m.matchReason}</p>
                          <ul className="text-sm space-y-0.5">
                            {m.differences.map((diff: string, j: number) => (
                              <li key={j} className="text-orange-600 dark:text-orange-400">- {diff}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing from DB - truly unmatched statement positions */}
                {reconResult.missingFromDB.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-destructive">
                      <XCircle className="h-4 w-4" />
                      In Statement but Not in Database ({reconResult.missingFromDB.length})
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      These trades appear in the broker statement but have no corresponding position in your database. Select trades to import them.
                    </p>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="w-8 p-2">
                              <Checkbox
                                checked={selectedForImport.size === reconResult.missingFromDB.length && reconResult.missingFromDB.length > 0}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedForImport(new Set(reconResult.missingFromDB.map((_: any, i: number) => i)));
                                  } else {
                                    setSelectedForImport(new Set());
                                  }
                                }}
                              />
                            </th>
                            <th className="w-6 p-2"></th>
                            <th className="text-left p-2">Symbol</th>
                            <th className="text-left p-2">Strategy</th>
                            <th className="text-left p-2">Strikes</th>
                            <th className="text-left p-2">Expiry</th>
                            <th className="text-right p-2">Contracts</th>
                            <th className="text-right p-2">Entry Credit</th>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconResult.missingFromDB.map((pos: any, i: number) => {
                            const isExpanded = expandedMissing.has(i);
                            const trades = (reconResult.extractedTrades || []).filter((t: any) =>
                              t.symbol === pos.symbol && t.expiry === pos.expiry
                            );
                            return (
                              <React.Fragment key={i}>
                                <tr
                                  className="border-t cursor-pointer hover:bg-muted/50"
                                  onClick={() => {
                                    setExpandedMissing(prev => {
                                      const next = new Set(prev);
                                      if (next.has(i)) next.delete(i); else next.add(i);
                                      return next;
                                    });
                                  }}
                                >
                                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={selectedForImport.has(i)}
                                      onCheckedChange={(checked) => {
                                        setSelectedForImport(prev => {
                                          const next = new Set(prev);
                                          if (checked) next.add(i); else next.delete(i);
                                          return next;
                                        });
                                      }}
                                    />
                                  </td>
                                  <td className="p-2">
                                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                  </td>
                                  <td className="p-2 font-medium">{pos.symbol}</td>
                                  <td className="p-2">
                                    <Badge variant="outline" className="text-xs">
                                      {pos.strategyType === 'IRON_CONDOR' ? 'IC' : pos.strategyType === 'LEAPS' ? 'LEAPS' : pos.strategyType === 'COVERED_CALL' ? 'CC' : pos.type === 'PUT' ? 'PCS' : 'CCS'}
                                    </Badge>
                                  </td>
                                  <td className="p-2 font-mono text-xs">
                                    {pos.shortStrike}{pos.longStrike ? `/${pos.longStrike}` : ''}
                                    {pos.callShortStrike ? ` | ${pos.callShortStrike}/${pos.callLongStrike}` : ''}
                                  </td>
                                  <td className="p-2">{pos.expiry}</td>
                                  <td className="p-2 text-right">{pos.contracts}</td>
                                  <td className="p-2 text-right font-mono">${pos.entryCredit?.toFixed(2)}</td>
                                  <td className="p-2">
                                    {pos.closedAt ? (
                                      <Badge variant="secondary" className="text-xs">Closed</Badge>
                                    ) : (
                                      <Badge className="text-xs">Open</Badge>
                                    )}
                                  </td>
                                  <td className="p-2 text-xs text-muted-foreground">
                                    {pos.tradeTime ? new Date(pos.tradeTime).toLocaleDateString() : '—'}
                                  </td>
                                </tr>
                                {isExpanded && trades.length > 0 && (
                                  <tr>
                                    <td colSpan={10} className="p-0">
                                      <div className="bg-muted/30 px-6 py-2 border-t">
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Extracted Trade Legs:</p>
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="text-muted-foreground">
                                              <th className="text-left py-1">Type</th>
                                              <th className="text-left py-1">Strike</th>
                                              <th className="text-left py-1">Put/Call</th>
                                              <th className="text-left py-1">Activity</th>
                                              <th className="text-right py-1">Qty</th>
                                              <th className="text-right py-1">Price</th>
                                              <th className="text-right py-1">Amount</th>
                                              <th className="text-right py-1">Fees</th>
                                              <th className="text-left py-1">Time</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {trades.map((t: any, j: number) => (
                                              <tr key={j} className="border-t border-muted">
                                                <td className="py-1">{t.activityType}</td>
                                                <td className="py-1 font-mono">{t.strike}</td>
                                                <td className="py-1">{t.type}</td>
                                                <td className="py-1">{t.activityType}</td>
                                                <td className="py-1 text-right">{t.quantity}</td>
                                                <td className="py-1 text-right font-mono">${t.tradePrice?.toFixed(2)}</td>
                                                <td className="py-1 text-right font-mono">${t.amount?.toFixed(2)}</td>
                                                <td className="py-1 text-right font-mono">${t.fees?.toFixed(2)}</td>
                                                <td className="py-1">{t.tradeTime || '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Import action bar */}
                    {selectedForImport.size > 0 && (() => {
                      const selected = reconResult.missingFromDB.filter((_: any, i: number) => selectedForImport.has(i));
                      const openCount = selected.filter((p: any) => !p.closedAt).length;
                      const closedCount = selected.filter((p: any) => p.closedAt).length;
                      const totalPremium = selected.reduce((sum: number, p: any) => sum + (p.entryCredit || 0) * (p.contracts || 1) * 100, 0);
                      const totalPL = selected.filter((p: any) => p.closedAt && p.realizedPL != null).reduce((sum: number, p: any) => sum + p.realizedPL, 0);
                      const totalFees = selected.reduce((sum: number, p: any) => sum + (p.totalFees || 0), 0);

                      return (
                        <>
                          <div className="mt-3 p-3 bg-muted/50 border rounded-lg flex items-center justify-between gap-4">
                            <div className="text-sm">
                              <span className="font-medium">{selectedForImport.size} position{selectedForImport.size > 1 ? 's' : ''} selected</span>
                              <span className="text-muted-foreground ml-2">
                                ({openCount} open, {closedCount} closed)
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setImportPreviewOpen(true)}
                              >
                                Preview Impact
                              </Button>
                              <Button
                                size="sm"
                                disabled={importLoading}
                                onClick={() => setImportPreviewOpen(true)}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Import Selected
                              </Button>
                            </div>
                          </div>

                          {/* Preview / Confirm dialog */}
                          <Dialog open={importPreviewOpen} onOpenChange={setImportPreviewOpen}>
                            <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>Import Preview</DialogTitle>
                              </DialogHeader>

                              <div className="space-y-4">
                                {/* Summary cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold">{openCount}</div>
                                    <div className="text-xs text-muted-foreground">Open Positions</div>
                                  </div>
                                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold">{closedCount}</div>
                                    <div className="text-xs text-muted-foreground">Closed Positions</div>
                                  </div>
                                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                                    <div className="text-lg font-bold font-mono">${totalPremium.toFixed(0)}</div>
                                    <div className="text-xs text-muted-foreground">Total Premium</div>
                                  </div>
                                  {closedCount > 0 && (
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                      <div className={`text-lg font-bold font-mono ${totalPL >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                                        ${totalPL.toFixed(0)}
                                      </div>
                                      <div className="text-xs text-muted-foreground">Realized P&L</div>
                                    </div>
                                  )}
                                </div>

                                {totalFees > 0 && (
                                  <p className="text-xs text-muted-foreground">Total fees: ${totalFees.toFixed(2)}</p>
                                )}

                                {/* Open positions table */}
                                {openCount > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">Open Positions</h4>
                                    <div className="border rounded-lg overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead className="bg-muted">
                                          <tr>
                                            <th className="text-left p-2">Symbol</th>
                                            <th className="text-left p-2">Strategy</th>
                                            <th className="text-left p-2">Strikes</th>
                                            <th className="text-left p-2">Expiry</th>
                                            <th className="text-right p-2">Contracts</th>
                                            <th className="text-right p-2">Entry</th>
                                            <th className="text-left p-2">Entered</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {selected.filter((p: any) => !p.closedAt).map((pos: any, idx: number) => (
                                            <tr key={idx} className="border-t">
                                              <td className="p-2 font-medium">{pos.symbol}</td>
                                              <td className="p-2">
                                                <Badge variant="outline" className="text-xs">
                                                  {pos.strategyType === 'IRON_CONDOR' ? 'IC' : pos.strategyType === 'LEAPS' ? 'LEAPS' : pos.strategyType === 'COVERED_CALL' ? 'CC' : pos.type === 'PUT' ? 'PCS' : 'CCS'}
                                                </Badge>
                                              </td>
                                              <td className="p-2 font-mono">
                                                {pos.shortStrike}{pos.longStrike ? `/${pos.longStrike}` : ''}
                                              </td>
                                              <td className="p-2">{pos.expiry}</td>
                                              <td className="p-2 text-right">{pos.contracts}</td>
                                              <td className="p-2 text-right font-mono">${pos.entryCredit?.toFixed(2)}</td>
                                              <td className="p-2 text-muted-foreground">
                                                {pos.tradeTime ? new Date(pos.tradeTime).toLocaleDateString() : '—'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* Closed positions table */}
                                {closedCount > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">Closed Positions</h4>
                                    <div className="border rounded-lg overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead className="bg-muted">
                                          <tr>
                                            <th className="text-left p-2">Symbol</th>
                                            <th className="text-left p-2">Strategy</th>
                                            <th className="text-left p-2">Strikes</th>
                                            <th className="text-left p-2">Expiry</th>
                                            <th className="text-right p-2">Contracts</th>
                                            <th className="text-right p-2">Entry</th>
                                            <th className="text-right p-2">Exit</th>
                                            <th className="text-right p-2">Realised P/L</th>
                                            <th className="text-left p-2">Entered</th>
                                            <th className="text-left p-2">Closed</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {selected.filter((p: any) => p.closedAt).map((pos: any, idx: number) => (
                                            <tr key={idx} className="border-t">
                                              <td className="p-2 font-medium">{pos.symbol}</td>
                                              <td className="p-2">
                                                <Badge variant="outline" className="text-xs">
                                                  {pos.strategyType === 'IRON_CONDOR' ? 'IC' : pos.strategyType === 'LEAPS' ? 'LEAPS' : pos.strategyType === 'COVERED_CALL' ? 'CC' : pos.type === 'PUT' ? 'PCS' : 'CCS'}
                                                </Badge>
                                              </td>
                                              <td className="p-2 font-mono">
                                                {pos.shortStrike}{pos.longStrike ? `/${pos.longStrike}` : ''}
                                              </td>
                                              <td className="p-2">{pos.expiry}</td>
                                              <td className="p-2 text-right">{pos.contracts}</td>
                                              <td className="p-2 text-right font-mono">${pos.entryCredit?.toFixed(2)}</td>
                                              <td className="p-2 text-right font-mono">
                                                {pos.exitCredit != null ? `$${pos.exitCredit.toFixed(2)}` : '—'}
                                              </td>
                                              <td className="p-2 text-right font-mono">
                                                {pos.realizedPL != null ? (
                                                  <span className={pos.realizedPL >= 0 ? 'text-green-500' : 'text-destructive'}>
                                                    {pos.realizedPL >= 0 ? '+' : ''}${pos.realizedPL.toFixed(2)}
                                                  </span>
                                                ) : '—'}
                                              </td>
                                              <td className="p-2 text-muted-foreground">
                                                {pos.tradeTime ? new Date(pos.tradeTime).toLocaleDateString() : '—'}
                                              </td>
                                              <td className="p-2 text-muted-foreground">
                                                {pos.closedAt ? new Date(pos.closedAt).toLocaleDateString() : '—'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <DialogFooter>
                                <Button variant="outline" onClick={() => setImportPreviewOpen(false)}>
                                  Cancel
                                </Button>
                                <Button
                                  disabled={importLoading}
                                  onClick={async () => {
                                    setImportLoading(true);
                                    try {
                                      const res = await apiRequest('POST', '/api/reconciliation/import', {
                                        positions: selected,
                                        portfolioId: reconPortfolioId,
                                      });
                                      const data = await res.json();
                                      if (data.success) {
                                        toast({
                                          title: 'Positions imported',
                                          description: `${data.imported} position${data.imported > 1 ? 's' : ''} imported successfully.${data.errors > 0 ? ` ${data.errors} failed.` : ''}`,
                                        });
                                        // Remove imported items from reconResult
                                        setReconResult((prev: any) => ({
                                          ...prev,
                                          missingFromDB: prev.missingFromDB.filter((_: any, i: number) => !selectedForImport.has(i)),
                                          summary: {
                                            ...prev.summary,
                                            missingFromDB: prev.summary.missingFromDB - data.imported,
                                          },
                                        }));
                                        setSelectedForImport(new Set());
                                        setImportPreviewOpen(false);
                                        queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
                                      } else {
                                        toast({ title: 'Import failed', description: data.message, variant: 'destructive' });
                                      }
                                    } catch (err: any) {
                                      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
                                    } finally {
                                      setImportLoading(false);
                                    }
                                  }}
                                >
                                  {importLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                                  Confirm Import
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* In DB but not in Statement */}
                {reconResult.inDBNotInStatement && reconResult.inDBNotInStatement.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-blue-500">
                      <AlertTriangle className="h-4 w-4" />
                      In Database but Not in Statement ({reconResult.inDBNotInStatement.length})
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      These positions are in your DB for this period but weren't found in the broker statement. They may have been entered incorrectly or belong to a different account/period.
                    </p>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-2">Symbol</th>
                            <th className="text-left p-2">Strategy</th>
                            <th className="text-left p-2">Strikes</th>
                            <th className="text-left p-2">Expiry</th>
                            <th className="text-right p-2">Contracts</th>
                            <th className="text-right p-2">Entry Credit</th>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2">Entry Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconResult.inDBNotInStatement.map((pos: any, i: number) => (
                            <tr key={i} className="border-t">
                              <td className="p-2 font-medium">{pos.symbol}</td>
                              <td className="p-2">
                                <Badge variant="outline" className="text-xs">
                                  {pos.strategyType === 'IRON_CONDOR' ? 'IC' : pos.strategyType === 'LEAPS' ? 'LEAPS' : pos.strategyType === 'COVERED_CALL' ? 'CC' : pos.type === 'PUT' ? 'PCS' : 'CCS'}
                                </Badge>
                              </td>
                              <td className="p-2 font-mono text-xs">
                                {pos.shortStrike}{pos.longStrike ? `/${pos.longStrike}` : ''}
                                {pos.callShortStrike ? ` | ${pos.callShortStrike}/${pos.callLongStrike}` : ''}
                              </td>
                              <td className="p-2">{pos.expiry ? new Date(pos.expiry).toLocaleDateString() : '—'}</td>
                              <td className="p-2 text-right">{pos.contracts}</td>
                              <td className="p-2 text-right font-mono">
                                {pos.entryCreditCents != null ? `$${(pos.entryCreditCents / 100).toFixed(2)}` : pos.entryDebitCents != null ? `$${(pos.entryDebitCents / 100).toFixed(2)}` : '—'}
                              </td>
                              <td className="p-2">
                                <Badge variant={pos.status === 'closed' ? 'secondary' : 'default'} className="text-xs">
                                  {pos.status}
                                </Badge>
                              </td>
                              <td className="p-2 text-xs text-muted-foreground">
                                {pos.entryDt ? new Date(pos.entryDt).toLocaleDateString() : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Matched with differences */}
                {reconResult.matched.filter((m: any) => m.differences.length > 0).length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-warning">
                      <AlertTriangle className="h-4 w-4" />
                      Matched with Differences ({reconResult.matched.filter((m: any) => m.differences.length > 0).length})
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      Click to see extracted trade legs from the statement.
                    </p>
                    <div className="space-y-2">
                      {reconResult.matched
                        .filter((m: any) => m.differences.length > 0)
                        .map((m: any, i: number) => {
                          const isExpanded = expandedDiffs.has(i);
                          const trades = (reconResult.extractedTrades || []).filter((t: any) =>
                            t.symbol === m.statement.symbol && t.expiry === m.statement.expiry
                          );
                          return (
                            <div
                              key={i}
                              className="rounded-lg border border-warning/30 bg-warning/5 cursor-pointer"
                              onClick={() => {
                                setExpandedDiffs(prev => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i); else next.add(i);
                                  return next;
                                });
                              }}
                            >
                              <div className="p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                  <span className="font-medium">{m.statement.symbol}</span>
                                  <span className="text-sm text-muted-foreground">
                                    {m.statement.type} {m.statement.shortStrike}/{m.statement.longStrike}
                                  </span>
                                  <span className="text-sm text-muted-foreground">exp {m.statement.expiry}</span>
                                </div>
                                <ul className="text-sm space-y-0.5 ml-5">
                                  {m.differences.map((diff: string, j: number) => (
                                    <li key={j} className="text-warning">- {diff}</li>
                                  ))}
                                </ul>
                              </div>
                              {isExpanded && trades.length > 0 && (
                                <div className="bg-muted/30 px-4 py-2 border-t border-warning/20 rounded-b-lg">
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Extracted Trade Legs:</p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-muted-foreground">
                                        <th className="text-left py-1">Type</th>
                                        <th className="text-left py-1">Strike</th>
                                        <th className="text-left py-1">Put/Call</th>
                                        <th className="text-left py-1">Activity</th>
                                        <th className="text-right py-1">Qty</th>
                                        <th className="text-right py-1">Price</th>
                                        <th className="text-right py-1">Amount</th>
                                        <th className="text-right py-1">Fees</th>
                                        <th className="text-left py-1">Time</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {trades.map((t: any, j: number) => (
                                        <tr key={j} className="border-t border-muted">
                                          <td className="py-1">{t.activityType}</td>
                                          <td className="py-1 font-mono">{t.strike}</td>
                                          <td className="py-1">{t.type}</td>
                                          <td className="py-1">{t.activityType}</td>
                                          <td className="py-1 text-right">{t.quantity}</td>
                                          <td className="py-1 text-right font-mono">${t.tradePrice?.toFixed(2)}</td>
                                          <td className="py-1 text-right font-mono">${t.amount?.toFixed(2)}</td>
                                          <td className="py-1 text-right font-mono">${t.fees?.toFixed(2)}</td>
                                          <td className="py-1">{t.tradeTime || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Successfully matched */}
                {reconResult.matched.filter((m: any) => m.differences.length === 0).length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Matched ({reconResult.matched.filter((m: any) => m.differences.length === 0).length})
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-2">Symbol</th>
                            <th className="text-left p-2">Strategy</th>
                            <th className="text-left p-2">Strikes</th>
                            <th className="text-left p-2">Expiry</th>
                            <th className="text-right p-2">Contracts</th>
                            <th className="text-right p-2">Entry Credit</th>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconResult.matched
                            .filter((m: any) => m.differences.length === 0)
                            .map((m: any, i: number) => (
                              <tr key={i} className="border-t">
                                <td className="p-2 font-medium">{m.statement.symbol}</td>
                                <td className="p-2">
                                  <Badge variant="outline" className="text-xs">
                                    {(m.database.strategyType || m.statement.strategyType) === 'IRON_CONDOR' ? 'IC' : (m.database.strategyType || m.statement.strategyType) === 'LEAPS' ? 'LEAPS' : (m.database.strategyType || m.statement.strategyType) === 'COVERED_CALL' ? 'CC' : m.statement.type === 'PUT' ? 'PCS' : 'CCS'}
                                  </Badge>
                                </td>
                                <td className="p-2 font-mono text-xs">
                                  {m.statement.shortStrike}{m.statement.longStrike ? `/${m.statement.longStrike}` : ''}
                                </td>
                                <td className="p-2">{m.statement.expiry}</td>
                                <td className="p-2 text-right">{m.statement.contracts}</td>
                                <td className="p-2 text-right font-mono">${m.statement.entryCredit?.toFixed(2)}</td>
                                <td className="p-2">
                                  {m.database.status === 'closed' ? (
                                    <Badge variant="secondary" className="text-xs">Closed</Badge>
                                  ) : (
                                    <Badge className="text-xs">Open</Badge>
                                  )}
                                </td>
                                <td className="p-2 text-xs text-muted-foreground">
                                  {m.statement.tradeTime ? new Date(m.statement.tradeTime).toLocaleDateString() : '—'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
