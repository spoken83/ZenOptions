import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Bell, Calendar, Activity, Crown, Zap, MessageSquare, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { PageSEO } from "@/components/seo/PageSEO";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { convertETtoLocal, getUserTimezoneAbbr } from "@/lib/timezone";
import type { Setting } from "@shared/schema";

const settingsSchema = z.object({
  alertOnProfitReady: z.boolean().default(true),
  alertOnActionNeeded: z.boolean().default(true),
  alertOnMonitor: z.boolean().default(false),
  alertProfitThreshold: z.number().int().min(50).max(70).default(60),
  alertCooldownHours: z.number().int().default(4),
  // Action Needed Triggers
  alertActionBeBreached: z.boolean().default(true),
  alertActionStrikeBreached: z.boolean().default(true),
  alertActionCsDte: z.boolean().default(true),
  alertActionCsDteThreshold: z.number().int().default(21),
  alertActionIcDte: z.boolean().default(true),
  alertActionIcDteThreshold: z.number().int().default(21),
  alertActionLossZone: z.boolean().default(true),
  alertActionLossZoneThreshold: z.number().int().default(40),
  scanSchedulesEnabled: z.boolean().default(false),
  preOpeningScanTime: z.string().default("08:00"),
  marketOpenScanTime: z.string().default("10:00"),
  marketCloseScanTime: z.string().default("16:00"),
  dailyScanTime: z.string().default("16:30"),
  daysToKeepScans: z.number().int().positive().default(30),
  monitorEnabled: z.boolean().default(true),
  monitorIntervalMinutes: z.number().int().positive().default(30),
  monitorStartTime: z.string().default("09:30"),
  monitorEndTime: z.string().default("12:00"),
  autoScanEnabled: z.boolean().default(false),
  autoScanIntervalMinutes: z.number().int().positive().default(30),
  autoScanStartTime: z.string().default("09:30"),
  autoScanEndTime: z.string().default("16:00"),
  tigerSyncEnabled: z.boolean().default(false),
  tigerSyncIntervalMinutes: z.number().int().positive().default(60),
  tigerSyncStartTime: z.string().default("09:30"),
  tigerSyncEndTime: z.string().default("16:00"),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isPro = user?.subscriptionTier === 'pro';
  const [, setLocation] = useLocation();

  const showUpgradePrompt = (feature: string) => {
    setLocation('/subscription');
  };

  const { data: settings, isLoading} = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      alertOnProfitReady: true,
      alertOnActionNeeded: true,
      alertOnMonitor: false,
      alertProfitThreshold: 60,
      alertCooldownHours: 4,
      alertActionBeBreached: true,
      alertActionStrikeBreached: true,
      alertActionCsDte: true,
      alertActionCsDteThreshold: 21,
      alertActionIcDte: true,
      alertActionIcDteThreshold: 21,
      alertActionLossZone: true,
      alertActionLossZoneThreshold: 40,
      scanSchedulesEnabled: false,
      preOpeningScanTime: "08:00",
      marketOpenScanTime: "10:00",
      marketCloseScanTime: "16:00",
      dailyScanTime: "16:30",
      daysToKeepScans: 30,
      monitorEnabled: true,
      monitorIntervalMinutes: 30,
      monitorStartTime: "09:30",
      monitorEndTime: "12:00",
      autoScanEnabled: false,
      autoScanIntervalMinutes: 30,
      autoScanStartTime: "09:30",
      autoScanEndTime: "16:00",
      tigerSyncEnabled: false,
      tigerSyncIntervalMinutes: 60,
      tigerSyncStartTime: "09:30",
      tigerSyncEndTime: "16:00",
    },
  });

  useEffect(() => {
    if (settings && !isLoading) {
      const getValue = (key: string) => settings.find((s) => s.key === key)?.value;
      
      const formData: Partial<SettingsForm> = {};

      
      const alertOnProfitReady = getValue("alert_on_profit_ready");
      if (alertOnProfitReady) formData.alertOnProfitReady = alertOnProfitReady === "true";
      
      const alertOnActionNeeded = getValue("alert_on_action_needed");
      if (alertOnActionNeeded) formData.alertOnActionNeeded = alertOnActionNeeded === "true";
      
      const alertOnMonitor = getValue("alert_on_monitor");
      if (alertOnMonitor) formData.alertOnMonitor = alertOnMonitor === "true";
      
      const alertProfitThreshold = getValue("alert_profit_threshold");
      if (alertProfitThreshold) formData.alertProfitThreshold = parseInt(alertProfitThreshold);
      
      const alertCooldownHours = getValue("alert_cooldown_hours");
      if (alertCooldownHours) formData.alertCooldownHours = parseInt(alertCooldownHours);
      
      // Action Needed Triggers
      const alertActionBeBreached = getValue("alert_action_be_breached");
      if (alertActionBeBreached) formData.alertActionBeBreached = alertActionBeBreached === "true";
      
      const alertActionStrikeBreached = getValue("alert_action_strike_breached");
      if (alertActionStrikeBreached) formData.alertActionStrikeBreached = alertActionStrikeBreached === "true";
      
      const alertActionCsDte = getValue("alert_action_cs_dte");
      if (alertActionCsDte) formData.alertActionCsDte = alertActionCsDte === "true";
      
      const alertActionCsDteThreshold = getValue("alert_action_cs_dte_threshold");
      if (alertActionCsDteThreshold) formData.alertActionCsDteThreshold = parseInt(alertActionCsDteThreshold);
      
      const alertActionIcDte = getValue("alert_action_ic_dte");
      if (alertActionIcDte) formData.alertActionIcDte = alertActionIcDte === "true";
      
      const alertActionIcDteThreshold = getValue("alert_action_ic_dte_threshold");
      if (alertActionIcDteThreshold) formData.alertActionIcDteThreshold = parseInt(alertActionIcDteThreshold);
      
      const alertActionLossZone = getValue("alert_action_loss_zone");
      if (alertActionLossZone) formData.alertActionLossZone = alertActionLossZone === "true";
      
      const alertActionLossZoneThreshold = getValue("alert_action_loss_zone_threshold");
      if (alertActionLossZoneThreshold) formData.alertActionLossZoneThreshold = parseInt(alertActionLossZoneThreshold);

      const scanSchedulesEnabled = getValue("scan_schedules_enabled");
      if (scanSchedulesEnabled) formData.scanSchedulesEnabled = scanSchedulesEnabled === "true";
      
      const preOpeningScanTime = getValue("pre_opening_scan_time");
      if (preOpeningScanTime) formData.preOpeningScanTime = preOpeningScanTime;
      
      const marketOpenScanTime = getValue("market_open_scan_time");
      if (marketOpenScanTime) formData.marketOpenScanTime = marketOpenScanTime;
      
      const marketCloseScanTime = getValue("market_close_scan_time");
      if (marketCloseScanTime) formData.marketCloseScanTime = marketCloseScanTime;
      
      const dailyScanTime = getValue("daily_scan_time");
      if (dailyScanTime) formData.dailyScanTime = dailyScanTime;
      
      const daysToKeepScans = getValue("days_to_keep_scans");
      if (daysToKeepScans) formData.daysToKeepScans = parseInt(daysToKeepScans);
      
      const monitorEnabled = getValue("monitor_enabled");
      if (monitorEnabled) formData.monitorEnabled = monitorEnabled === "true";
      
      const monitorIntervalMinutes = getValue("monitor_interval_minutes");
      if (monitorIntervalMinutes) formData.monitorIntervalMinutes = parseInt(monitorIntervalMinutes);
      
      const monitorStartTime = getValue("monitor_start_time");
      if (monitorStartTime) formData.monitorStartTime = monitorStartTime;
      
      const monitorEndTime = getValue("monitor_end_time");
      if (monitorEndTime) formData.monitorEndTime = monitorEndTime;
      
      const autoScanEnabled = getValue("auto_scan_enabled");
      if (autoScanEnabled) formData.autoScanEnabled = autoScanEnabled === "true";
      
      const autoScanIntervalMinutes = getValue("auto_scan_interval_minutes");
      if (autoScanIntervalMinutes) formData.autoScanIntervalMinutes = parseInt(autoScanIntervalMinutes);
      
      const autoScanStartTime = getValue("auto_scan_start_time");
      if (autoScanStartTime) formData.autoScanStartTime = autoScanStartTime;
      
      const autoScanEndTime = getValue("auto_scan_end_time");
      if (autoScanEndTime) formData.autoScanEndTime = autoScanEndTime;
      
      const tigerSyncEnabled = getValue("tiger_sync_enabled");
      if (tigerSyncEnabled) formData.tigerSyncEnabled = tigerSyncEnabled === "true";
      
      const tigerSyncIntervalMinutes = getValue("tiger_sync_interval_minutes");
      if (tigerSyncIntervalMinutes) formData.tigerSyncIntervalMinutes = parseInt(tigerSyncIntervalMinutes);
      
      const tigerSyncStartTime = getValue("tiger_sync_start_time");
      if (tigerSyncStartTime) formData.tigerSyncStartTime = tigerSyncStartTime;
      
      const tigerSyncEndTime = getValue("tiger_sync_end_time");
      if (tigerSyncEndTime) formData.tigerSyncEndTime = tigerSyncEndTime;

      form.reset(formData as SettingsForm);
    }
  }, [settings, isLoading, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: SettingsForm) => {
      const promises = [
        apiRequest("POST", "/api/settings", { key: "alert_on_profit_ready", value: data.alertOnProfitReady.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_on_action_needed", value: data.alertOnActionNeeded.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_on_monitor", value: data.alertOnMonitor.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_profit_threshold", value: data.alertProfitThreshold.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_cooldown_hours", value: data.alertCooldownHours.toString() }),
        // Action Needed Triggers
        apiRequest("POST", "/api/settings", { key: "alert_action_be_breached", value: data.alertActionBeBreached.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_action_strike_breached", value: data.alertActionStrikeBreached.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_action_cs_dte", value: data.alertActionCsDte.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_action_cs_dte_threshold", value: data.alertActionCsDteThreshold.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_action_ic_dte", value: data.alertActionIcDte.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_action_ic_dte_threshold", value: data.alertActionIcDteThreshold.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_action_loss_zone", value: data.alertActionLossZone.toString() }),
        apiRequest("POST", "/api/settings", { key: "alert_action_loss_zone_threshold", value: data.alertActionLossZoneThreshold.toString() }),
        apiRequest("POST", "/api/settings", { key: "scan_schedules_enabled", value: data.scanSchedulesEnabled.toString() }),
        apiRequest("POST", "/api/settings", { key: "pre_opening_scan_time", value: data.preOpeningScanTime }),
        apiRequest("POST", "/api/settings", { key: "market_open_scan_time", value: data.marketOpenScanTime }),
        apiRequest("POST", "/api/settings", { key: "market_close_scan_time", value: data.marketCloseScanTime }),
        apiRequest("POST", "/api/settings", { key: "daily_scan_time", value: data.dailyScanTime }),
        apiRequest("POST", "/api/settings", { key: "days_to_keep_scans", value: data.daysToKeepScans.toString() }),
        apiRequest("POST", "/api/settings", { key: "monitor_enabled", value: data.monitorEnabled.toString() }),
        apiRequest("POST", "/api/settings", { key: "monitor_interval_minutes", value: data.monitorIntervalMinutes.toString() }),
        apiRequest("POST", "/api/settings", { key: "monitor_start_time", value: data.monitorStartTime }),
        apiRequest("POST", "/api/settings", { key: "monitor_end_time", value: data.monitorEndTime }),
        apiRequest("POST", "/api/settings", { key: "auto_scan_enabled", value: data.autoScanEnabled.toString() }),
        apiRequest("POST", "/api/settings", { key: "auto_scan_interval_minutes", value: data.autoScanIntervalMinutes.toString() }),
        apiRequest("POST", "/api/settings", { key: "auto_scan_start_time", value: data.autoScanStartTime }),
        apiRequest("POST", "/api/settings", { key: "auto_scan_end_time", value: data.autoScanEndTime }),
        apiRequest("POST", "/api/settings", { key: "tiger_sync_enabled", value: data.tigerSyncEnabled.toString() }),
        apiRequest("POST", "/api/settings", { key: "tiger_sync_interval_minutes", value: data.tigerSyncIntervalMinutes.toString() }),
        apiRequest("POST", "/api/settings", { key: "tiger_sync_start_time", value: data.tigerSyncStartTime }),
        apiRequest("POST", "/api/settings", { key: "tiger_sync_end_time", value: data.tigerSyncEndTime }),
      ];
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save settings. Please try again.",
      });
    },
  });

  const onSubmit = (data: SettingsForm) => {
    saveMutation.mutate(data);
  };

  const ProBadge = () => (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
      <Crown className="h-3 w-3 mr-1" />
      Pro
    </span>
  );

  const UpgradeButton = ({ feature, testId }: { feature: string; testId: string }) => (
    <Button
      variant="outline"
      size="sm"
      onClick={() => showUpgradePrompt(feature)}
      className="border-primary/30 text-primary hover:bg-primary/5"
      data-testid={testId}
    >
      <Crown className="h-3.5 w-3.5 mr-1.5" />
      Upgrade to Pro
    </Button>
  );

  const scanSchedulesEnabled = form.watch("scanSchedulesEnabled");
  const monitorEnabled = form.watch("monitorEnabled");
  const autoScanEnabled = form.watch("autoScanEnabled");
  const tigerSyncEnabled = form.watch("tigerSyncEnabled");
  const alertProfitThreshold = form.watch("alertProfitThreshold");

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <PageSEO 
        title="Settings" 
        description="Configure your trading alerts, scan schedules, and monitoring preferences."
      />
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Settings</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Customize your alerts and automation preferences
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* ZenStatus Guidance - Configuration for all users */}
            <Card className="border-primary/20">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">ZenStatus Guidance</CardTitle>
                    <CardDescription>Configure your systematic position monitoring and alerts</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <div className="space-y-6">
                  
                  {/* Header row explaining the columns */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-4">
                    <span>Condition</span>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3 w-3" />
                      <span>Telegram Alert</span>
                      {!isPro && <span className="text-[10px] text-amber-500">(Pro)</span>}
                    </div>
                  </div>

                  {/* Profit Ready Row */}
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Profit Ready</p>
                          <p className="text-xs text-muted-foreground">When it's time to take profits</p>
                        </div>
                      </div>
                      <FormField
                        control={form.control}
                        name="alertOnProfitReady"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={!isPro}
                                data-testid="switch-alert-profit-ready"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    {/* Profit Threshold Slider */}
                    <div className="pl-11 space-y-3">
                      <FormField
                        control={form.control}
                        name="alertProfitThreshold"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className="text-xs text-muted-foreground">Profit Target</FormLabel>
                            <FormControl>
                              <div className="space-y-2">
                                <Slider
                                  value={[field.value]}
                                  onValueChange={(vals) => field.onChange(vals[0])}
                                  min={50}
                                  max={70}
                                  step={5}
                                  className="w-full max-w-xs"
                                  data-testid="slider-profit-threshold"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground max-w-xs">
                                  <span>50%</span>
                                  <span className="font-medium text-foreground">{alertProfitThreshold}% of max profit</span>
                                  <span>70%</span>
                                </div>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Action Needed Section */}
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Action Needed</p>
                          <p className="text-xs text-muted-foreground">Urgent conditions requiring attention</p>
                        </div>
                      </div>
                      <FormField
                        control={form.control}
                        name="alertOnActionNeeded"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={!isPro}
                                data-testid="switch-alert-action-needed"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    {/* Action Triggers Configuration */}
                    <div className="pl-11 space-y-4">
                      <p className="text-xs text-muted-foreground">Configure which conditions trigger Action Needed status:</p>
                      
                      <div className="space-y-3 bg-muted/30 rounded-lg p-3">
                        {/* B/E Breached */}
                        <FormField
                          control={form.control}
                          name="alertActionBeBreached"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2">
                              <FormLabel className="text-sm font-normal cursor-pointer">Breakeven (B/E) breached</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-action-be-breached"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        
                        {/* Strike Breached */}
                        <FormField
                          control={form.control}
                          name="alertActionStrikeBreached"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between gap-2">
                              <FormLabel className="text-sm font-normal cursor-pointer">Strike breached</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="switch-action-strike-breached"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        {/* Credit Spread DTE */}
                        <div className="flex items-center justify-between gap-2">
                          <FormField
                            control={form.control}
                            name="alertActionCsDte"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-2 flex-1">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-action-cs-dte"
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal cursor-pointer">Credit Spread DTE at or below</FormLabel>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="alertActionCsDteThreshold"
                            render={({ field }) => (
                              <Select
                                value={field.value.toString()}
                                onValueChange={(val) => field.onChange(parseInt(val))}
                              >
                                <SelectTrigger className="w-24" data-testid="select-cs-dte-threshold">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="7">7 days</SelectItem>
                                  <SelectItem value="14">14 days</SelectItem>
                                  <SelectItem value="18">18 days</SelectItem>
                                  <SelectItem value="21">21 days</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>

                        {/* Iron Condor DTE */}
                        <div className="flex items-center justify-between gap-2">
                          <FormField
                            control={form.control}
                            name="alertActionIcDte"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-2 flex-1">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-action-ic-dte"
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal cursor-pointer">Iron Condor DTE at or below</FormLabel>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="alertActionIcDteThreshold"
                            render={({ field }) => (
                              <Select
                                value={field.value.toString()}
                                onValueChange={(val) => field.onChange(parseInt(val))}
                              >
                                <SelectTrigger className="w-24" data-testid="select-ic-dte-threshold">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="7">7 days</SelectItem>
                                  <SelectItem value="14">14 days</SelectItem>
                                  <SelectItem value="18">18 days</SelectItem>
                                  <SelectItem value="21">21 days</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>

                        {/* Loss Zone Warning */}
                        <div className="flex items-center justify-between gap-2">
                          <FormField
                            control={form.control}
                            name="alertActionLossZone"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-2 flex-1">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-action-loss-zone"
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal cursor-pointer">Loss exceeds</FormLabel>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="alertActionLossZoneThreshold"
                            render={({ field }) => (
                              <Select
                                value={field.value.toString()}
                                onValueChange={(val) => field.onChange(parseInt(val))}
                              >
                                <SelectTrigger className="w-28" data-testid="select-loss-zone-threshold">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="20">20% of max</SelectItem>
                                  <SelectItem value="30">30% of max</SelectItem>
                                  <SelectItem value="40">40% of max</SelectItem>
                                  <SelectItem value="50">50% of max</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Monitor Status Row */}
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                          <Clock className="h-4 w-4 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Monitor Updates</p>
                          <p className="text-xs text-muted-foreground">General updates when positions are worth monitoring</p>
                        </div>
                      </div>
                      <FormField
                        control={form.control}
                        name="alertOnMonitor"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={!isPro}
                                data-testid="switch-alert-monitor"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Position Monitoring Schedule */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-medium">Position Monitoring Schedule</h4>
                        <p className="text-xs text-muted-foreground">How often ZenStatus checks your open positions</p>
                      </div>
                      <FormField
                        control={form.control}
                        name="monitorEnabled"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={!isPro}
                                data-testid="switch-monitor-enabled"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {!isPro && (
                      <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium mb-1">Real-time monitoring with Pro</p>
                            <p className="text-xs text-muted-foreground">Free tier updates ZenStatus once daily. Pro monitors every few minutes.</p>
                          </div>
                          <UpgradeButton feature="real-time monitoring" testId="button-upgrade-monitoring" />
                        </div>
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="monitorIntervalMinutes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Check Frequency</FormLabel>
                            <Select
                              value={field.value.toString()}
                              onValueChange={(val) => field.onChange(parseInt(val))}
                              disabled={!isPro || !monitorEnabled}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-monitor-interval">
                                  <SelectValue placeholder="Select interval" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="5">Every 5 min</SelectItem>
                                <SelectItem value="15">Every 15 min</SelectItem>
                                <SelectItem value="30">Every 30 min</SelectItem>
                                <SelectItem value="60">Every hour</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="monitorStartTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Start Time</FormLabel>
                            <FormControl>
                              <Input {...field} type="time" disabled={!isPro || !monitorEnabled} data-testid="input-monitor-start-time" />
                            </FormControl>
                            <FormDescription className="text-xs">
                              {field.value} ET
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="monitorEndTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">End Time</FormLabel>
                            <FormControl>
                              <Input {...field} type="time" disabled={!isPro || !monitorEnabled} data-testid="input-monitor-end-time" />
                            </FormControl>
                            <FormDescription className="text-xs">
                              {field.value} ET
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Alert Cooldown */}
                  <FormField
                    control={form.control}
                    name="alertCooldownHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alert Cooldown</FormLabel>
                        <Select
                          value={field.value.toString()}
                          onValueChange={(val) => field.onChange(parseInt(val))}
                          disabled={!isPro}
                        >
                          <FormControl>
                            <SelectTrigger className="max-w-xs" data-testid="select-alert-cooldown">
                              <SelectValue placeholder="Select cooldown" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 hour</SelectItem>
                            <SelectItem value="4">4 hours</SelectItem>
                            <SelectItem value="8">8 hours</SelectItem>
                            <SelectItem value="24">24 hours</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          Minimum time between repeated Telegram alerts for the same position
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
            
            {/* Scan Schedules */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Scheduled Scans</CardTitle>
                      <CardDescription>Run scans automatically at set times</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isPro && <ProBadge />}
                    <FormField
                      control={form.control}
                      name="scanSchedulesEnabled"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isPro}
                              data-testid="switch-scan-schedules-enabled"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                {!isPro && (
                  <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Scheduled scans available with Pro</p>
                        <p className="text-xs text-muted-foreground">Automatically find opportunities at key market times</p>
                      </div>
                      <UpgradeButton feature="scheduled scans" testId="button-upgrade-schedules" />
                    </div>
                  </div>
                )}
                
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="preOpeningScanTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pre-Market Scan</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={!isPro || !scanSchedulesEnabled} data-testid="input-pre-opening-scan-time" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {field.value} ET ({convertETtoLocal(field.value)} {getUserTimezoneAbbr()})
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="marketOpenScanTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Market Open Scan</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={!isPro || !scanSchedulesEnabled} data-testid="input-market-open-scan-time" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {field.value} ET ({convertETtoLocal(field.value)} {getUserTimezoneAbbr()})
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="marketCloseScanTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Market Close Scan</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={!isPro || !scanSchedulesEnabled} data-testid="input-market-close-scan-time" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {field.value} ET ({convertETtoLocal(field.value)} {getUserTimezoneAbbr()})
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dailyScanTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Daily Summary</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={!isPro || !scanSchedulesEnabled} data-testid="input-daily-scan-time" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {field.value} ET ({convertETtoLocal(field.value)} {getUserTimezoneAbbr()})
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Intraday Scanner */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Continuous Scanning</CardTitle>
                      <CardDescription>Scan for opportunities throughout the day</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isPro && <ProBadge />}
                    <FormField
                      control={form.control}
                      name="autoScanEnabled"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isPro}
                              data-testid="switch-auto-scan-enabled"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                {!isPro && (
                  <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Continuous scanning available with Pro</p>
                        <p className="text-xs text-muted-foreground">Never miss an opportunity during market hours</p>
                      </div>
                      <UpgradeButton feature="continuous scanning" testId="button-upgrade-autoscan" />
                    </div>
                  </div>
                )}

                <div className="grid gap-6 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="autoScanIntervalMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scan Frequency</FormLabel>
                        <Select
                          value={field.value.toString()}
                          onValueChange={(val) => field.onChange(parseInt(val))}
                          disabled={!isPro || !autoScanEnabled}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-auto-scan-interval">
                              <SelectValue placeholder="Select interval" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="15">Every 15 minutes</SelectItem>
                            <SelectItem value="30">Every 30 minutes</SelectItem>
                            <SelectItem value="60">Every hour</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          How often to scan for new trades
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="autoScanStartTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={!isPro || !autoScanEnabled} data-testid="input-auto-scan-start-time" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {field.value} ET ({convertETtoLocal(field.value)} {getUserTimezoneAbbr()})
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="autoScanEndTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={!isPro || !autoScanEnabled} data-testid="input-auto-scan-end-time" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {field.value} ET ({convertETtoLocal(field.value)} {getUserTimezoneAbbr()})
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Tiger Brokers Sync */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Broker Sync</CardTitle>
                      <CardDescription>Auto-import positions from Tiger Brokers</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isPro && <ProBadge />}
                    <FormField
                      control={form.control}
                      name="tigerSyncEnabled"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isPro}
                              data-testid="switch-tiger-sync-enabled"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                {!isPro && (
                  <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Broker sync available with Pro</p>
                        <p className="text-xs text-muted-foreground">Automatically import your positions - no manual entry needed</p>
                      </div>
                      <UpgradeButton feature="broker sync" testId="button-upgrade-tigersync" />
                    </div>
                  </div>
                )}

                <div className="grid gap-6 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="tigerSyncIntervalMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sync Frequency</FormLabel>
                        <Select
                          value={field.value.toString()}
                          onValueChange={(val) => field.onChange(parseInt(val))}
                          disabled={!isPro || !tigerSyncEnabled}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-tiger-sync-interval">
                              <SelectValue placeholder="Select interval" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="30">Every 30 minutes</SelectItem>
                            <SelectItem value="60">Every hour</SelectItem>
                            <SelectItem value="120">Every 2 hours</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          How often to sync positions
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tigerSyncStartTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={!isPro || !tigerSyncEnabled} data-testid="input-tiger-sync-start-time" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {field.value} ET ({convertETtoLocal(field.value)} {getUserTimezoneAbbr()})
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tigerSyncEndTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={!isPro || !tigerSyncEnabled} data-testid="input-tiger-sync-end-time" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {field.value} ET ({convertETtoLocal(field.value)} {getUserTimezoneAbbr()})
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                size="lg"
                data-testid="button-save-settings"
                className="min-w-[140px]"
              >
                <Save className="mr-2 h-4 w-4" />
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}
