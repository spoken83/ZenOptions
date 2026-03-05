import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSEO } from "@/components/seo/PageSEO";
import {
  Users,
  DollarSign,
  TrendingUp,
  Activity,
  Crown,
  Eye,
  Search,
  Bell,
  BarChart3,
  Target,
  Zap,
  RefreshCw,
  LogOut,
  Shield,
  ChevronUp,
  ChevronDown,
  Send,
  Briefcase,
  Lock,
  Cloud,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { format, formatDistanceToNow } from "date-fns";

interface UserWithStats {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  isActive: boolean;
  telegramConfigured: boolean;
  tigerConfigured: boolean;
  dailyScanCount: number;
  watchlistCount: number;
  openPositions: number;
  closedPositions: number;
  totalPositions: number;
  totalScans: number;
  qualifiedScans: number;
  scanSuccessRate: string;
  realizedPLCents: number;
  engagementScore: number;
  creditSpreads: number;
  ironCondors: number;
  leaps: number;
  totalTrades: number;
  winRate: string;
  winningTrades: number;
}

interface UserMetrics {
  summary: {
    totalSignups: number;
    freeUsers: number;
    proUsers: number;
    conversionRate: string;
    activeUsers7Days: number;
    activeUsers30Days: number;
    usersWithTelegram: number;
    usersWithTiger: number;
    monthlyRecurringRevenue: number;
  };
  signupsByMonth: Array<{ month: string; count: number }>;
  users: UserWithStats[];
}

interface SystemMetrics {
  overview: {
    totalUsers: number;
    activePositions: number;
    closedPositions: number;
    totalWatchlistItems: number;
    totalScanExecutions: number;
    qualifiedScans: number;
    scanSuccessRate: string;
    alertsConfigured: number;
    apiCallsEstimate: number;
  };
  positionsByStrategy: {
    creditSpreads: number;
    ironCondors: number;
    leaps: number;
  };
  tierBreakdown: {
    free: number;
    pro: number;
  };
}

interface ApiUsageMetrics {
  summary: {
    totalCalls: number;
    successRate: string;
    avgLatencyMs: number;
  };
  providerBreakdown: Array<{
    provider: string;
    totalCalls: number;
    successCount: number;
    failureCount: number;
    successRate: string;
    avgLatencyMs: number;
    endpoints: Array<{
      endpoint: string;
      totalCalls: number;
      successRate: string;
      avgLatencyMs: number;
    }>;
  }>;
  costEstimate: {
    polygon: { calls: number; estimatedCost: number };
    openai: { calls: number; estimatedCost: number };
    fred: { calls: number; estimatedCost: number };
    stripe: { calls: number; estimatedCost: number };
    telegram: { calls: number; estimatedCost: number };
    total: number;
  };
  callsByDay: Array<{
    date: string;
    totalCalls: number;
    successRate: string;
    avgLatencyMs: number;
  }>;
}

const TIER_COLORS = {
  pro: "#10b981",
  free: "#6366f1",
};

const STRATEGY_COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b"];

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
  color = "primary",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  trend?: string;
  trendUp?: boolean;
  color?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && (
              <div className={`flex items-center text-xs ${trendUp ? "text-green-500" : "text-red-500"}`}>
                {trendUp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {trend}
              </div>
            )}
          </div>
          <div
            className={`p-3 rounded-full ${
              color === "green"
                ? "bg-green-500/10 text-green-500"
                : color === "purple"
                ? "bg-purple-500/10 text-purple-500"
                : color === "orange"
                ? "bg-orange-500/10 text-orange-500"
                : color === "blue"
                ? "bg-blue-500/10 text-blue-500"
                : "bg-primary/10 text-primary"
            }`}
          >
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EngagementBadge({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 70) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (score >= 40) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-gray-500/10 text-gray-500 border-gray-500/20";
  };

  const getLabel = () => {
    if (score >= 70) return "High";
    if (score >= 40) return "Medium";
    return "Low";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-16">
        <Progress value={score} className="h-2" />
      </div>
      <Badge variant="outline" className={`text-xs ${getColor()}`}>
        {getLabel()}
      </Badge>
    </div>
  );
}

function UserRow({ user }: { user: UserWithStats }) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/50 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {user.name?.slice(0, 2).toUpperCase() || user.email.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{user.name || "No name"}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <Badge
          variant={user.subscriptionTier === "pro" ? "default" : "secondary"}
          className={user.subscriptionTier === "pro" ? "bg-gradient-to-r from-amber-500 to-orange-500" : ""}
        >
          {user.subscriptionTier === "pro" && <Crown className="w-3 h-3 mr-1" />}
          {user.subscriptionTier.toUpperCase()}
        </Badge>
      </td>
      <td className="py-3 px-4">
        <EngagementBadge score={user.engagementScore} />
      </td>
      <td className="py-3 px-4">
        <div className="flex gap-1.5">
          {user.telegramConfigured && (
            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20 px-1.5">
              <Send className="w-3 h-3" />
            </Badge>
          )}
          {user.tigerConfigured && (
            <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-500 border-orange-500/20 px-1.5">
              <Briefcase className="w-3 h-3" />
            </Badge>
          )}
          {!user.telegramConfigured && !user.tigerConfigured && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground">
        {user.lastLoginAt ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true }) : "Never"}
      </td>
      <td className="py-3 px-4 text-xs text-muted-foreground">
        {format(new Date(user.createdAt), "MMM d, yyyy")}
      </td>
    </tr>
  );
}

function TradingAnalyticsRow({ user }: { user: UserWithStats }) {
  const formatPL = (cents: number) => {
    const dollars = cents / 100;
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Math.abs(dollars));
    return cents >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  const totalStrategies = user.creditSpreads + user.ironCondors + user.leaps;
  
  return (
    <tr className="border-b border-border/50 hover:bg-muted/50 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={user.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
              {user.name?.slice(0, 2).toUpperCase() || user.email.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate max-w-[120px]">{user.name || user.email.split("@")[0]}</span>
        </div>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="text-sm">{user.watchlistCount}</span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="text-sm font-medium">{user.openPositions}</span>
        <span className="text-xs text-muted-foreground">/{user.totalPositions}</span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">{user.creditSpreads}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400">{user.ironCondors}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{user.leaps}</span>
        </div>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="text-sm">{user.totalScans}</span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="text-sm font-medium">{user.totalTrades}</span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className={`text-sm font-medium ${parseFloat(user.winRate) >= 50 ? "text-green-500" : parseFloat(user.winRate) > 0 ? "text-yellow-500" : "text-muted-foreground"}`}>
          {user.totalTrades > 0 ? user.winRate : "—"}
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        <span className={`text-sm font-medium ${user.realizedPLCents >= 0 ? "text-green-500" : "text-red-500"}`}>
          {user.totalTrades > 0 ? formatPL(user.realizedPLCents) : "—"}
        </span>
      </td>
    </tr>
  );
}

export default function Admin() {
  const [inputPassword, setInputPassword] = useState("");
  const [storedPassword, setStoredPassword] = useState("");
  const [authMode, setAuthMode] = useState<"none" | "password" | "session">("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "free" | "pro">("all");
  const [authError, setAuthError] = useState<string | null>(null);

  // Check if user is logged in with admin privileges
  const { data: currentUser, isLoading: userLoading } = useQuery<{ isAdmin?: boolean } | null>({
    queryKey: ["/api/user"],
    retry: false,
  });

  // Determine authentication status
  const isAuthenticated = authMode === "password" || authMode === "session";
  const isAdmin = currentUser?.isAdmin === true;

  // Build fetch options based on auth mode
  const getFetchOptions = () => {
    if (authMode === "password" && storedPassword) {
      return { 
        url: (endpoint: string) => {
          const separator = endpoint.includes('?') ? '&' : '?';
          return `${endpoint}${separator}adminPassword=${encodeURIComponent(storedPassword)}`;
        }
      };
    }
    return { url: (endpoint: string) => endpoint, credentials: "include" as RequestCredentials };
  };

  const { data: userMetrics, isLoading: userMetricsLoading, refetch: refetchUsers, error: userMetricsError } = useQuery<UserMetrics>({
    queryKey: ["/api/admin/metrics/users", authMode, storedPassword],
    enabled: isAuthenticated,
    retry: false,
    queryFn: async () => {
      const opts = getFetchOptions();
      const res = await fetch(opts.url("/api/admin/metrics/users"), { credentials: opts.credentials });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to fetch" }));
        throw new Error(error.message || "Failed to fetch user metrics");
      }
      return res.json();
    },
  });

  const { data: systemMetrics, isLoading: systemMetricsLoading, refetch: refetchSystem, error: systemMetricsError } = useQuery<SystemMetrics>({
    queryKey: ["/api/admin/metrics/system", authMode, storedPassword],
    enabled: isAuthenticated,
    retry: false,
    queryFn: async () => {
      const opts = getFetchOptions();
      const res = await fetch(opts.url("/api/admin/metrics/system"), { credentials: opts.credentials });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to fetch" }));
        throw new Error(error.message || "Failed to fetch system metrics");
      }
      return res.json();
    },
  });

  const { data: apiUsageMetrics, isLoading: apiUsageLoading, refetch: refetchApiUsage } = useQuery<ApiUsageMetrics>({
    queryKey: ["/api/admin/metrics/api-usage", authMode, storedPassword],
    enabled: isAuthenticated,
    retry: false,
    queryFn: async () => {
      const opts = getFetchOptions();
      const res = await fetch(opts.url("/api/admin/metrics/api-usage?days=7"), { credentials: opts.credentials });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to fetch" }));
        throw new Error(error.message || "Failed to fetch API usage metrics");
      }
      return res.json();
    },
  });

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
    // Test the password by making an API call
    try {
      const res = await fetch(`/api/admin/metrics/system?adminPassword=${encodeURIComponent(inputPassword)}`);
      if (res.ok) {
        setStoredPassword(inputPassword);
        setAuthMode("password");
        setInputPassword("");
      } else {
        const error = await res.json().catch(() => ({ message: "Invalid credentials" }));
        setAuthError(error.message || "Invalid admin password");
      }
    } catch {
      setAuthError("Failed to verify credentials");
    }
  };

  const handleSessionAuth = () => {
    if (isAdmin) {
      setAuthMode("session");
    }
  };

  const handleLogout = () => {
    setAuthMode("none");
    setStoredPassword("");
    setAuthError(null);
  };

  const handleRefresh = () => {
    refetchUsers();
    refetchSystem();
    refetchApiUsage();
  };

  // Filter users
  const filteredUsers = userMetrics?.users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesTier = tierFilter === "all" || user.subscriptionTier === tierFilter;
    return matchesSearch && matchesTier;
  });

  // Chart data
  const tierPieData = systemMetrics
    ? [
        { name: "Pro", value: systemMetrics.tierBreakdown.pro, color: TIER_COLORS.pro },
        { name: "Free", value: systemMetrics.tierBreakdown.free, color: TIER_COLORS.free },
      ]
    : [];

  const strategyPieData = systemMetrics
    ? [
        { name: "Credit Spreads", value: systemMetrics.positionsByStrategy.creditSpreads },
        { name: "Iron Condors", value: systemMetrics.positionsByStrategy.ironCondors },
        { name: "LEAPS", value: systemMetrics.positionsByStrategy.leaps },
      ]
    : [];

  // Show loading state while checking user
  if (userLoading) {
    return (
      <>
        <PageSEO title="Admin Dashboard" description="Zen Options admin portal for monitoring system metrics" />
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
          <Card className="w-full max-w-md shadow-lg border-border/50">
            <CardContent className="p-8 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">Checking authentication...</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <PageSEO title="Admin Dashboard" description="Zen Options admin portal for monitoring system metrics" />
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
          <Card className="w-full max-w-md shadow-lg border-border/50">
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">Admin Access</CardTitle>
              <CardDescription>
                {isAdmin 
                  ? "You have admin privileges. Click below to access the dashboard."
                  : "Enter admin credentials to continue"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Session-based auth for logged-in admins */}
              {isAdmin ? (
                <Button 
                  onClick={handleSessionAuth} 
                  className="w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-session-auth"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Continue as Admin
                </Button>
              ) : (
                <>
                  {/* Password-based auth */}
                  <form onSubmit={handleAdminLogin} className="space-y-4">
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="password"
                        value={inputPassword}
                        onChange={(e) => setInputPassword(e.target.value)}
                        placeholder="Enter admin password"
                        className="pl-10"
                        data-testid="input-admin-password"
                      />
                    </div>
                    {authError && (
                      <p className="text-sm text-red-500 text-center">{authError}</p>
                    )}
                    <Button type="submit" className="w-full" data-testid="button-admin-login">
                      <Shield className="w-4 h-4 mr-2" />
                      Access Dashboard
                    </Button>
                  </form>
                  <p className="text-xs text-center text-muted-foreground">
                    Contact administrator for access credentials
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const isLoading = userMetricsLoading || systemMetricsLoading;

  return (
    <>
      <PageSEO title="Admin Dashboard" description="Zen Options admin portal for monitoring system metrics" />
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Admin Dashboard</h1>
                  <p className="text-xs text-muted-foreground">Zen Options Analytics</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 space-y-8">
          {/* Key Metrics */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Key Metrics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoading ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-6">
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : (
                <>
                  <MetricCard
                    title="Total Users"
                    value={userMetrics?.summary.totalSignups || 0}
                    subtitle={`${userMetrics?.summary.activeUsers7Days || 0} active this week`}
                    icon={Users}
                    color="blue"
                  />
                  <MetricCard
                    title="Pro Subscribers"
                    value={userMetrics?.summary.proUsers || 0}
                    subtitle={userMetrics?.summary.conversionRate || "0%"}
                    icon={Crown}
                    color="orange"
                  />
                  <MetricCard
                    title="Monthly Revenue"
                    value={`$${((userMetrics?.summary.monthlyRecurringRevenue || 0) / 100).toFixed(2)}`}
                    subtitle="Estimated MRR"
                    icon={DollarSign}
                    color="green"
                  />
                  <MetricCard
                    title="Active Positions"
                    value={systemMetrics?.overview.activePositions || 0}
                    subtitle={`${systemMetrics?.overview.closedPositions || 0} closed`}
                    icon={Activity}
                    color="purple"
                  />
                </>
              )}
            </div>
          </section>

          {/* Charts Section */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Signup Trend */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  User Growth
                </CardTitle>
                <CardDescription>Monthly signups over time</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={userMetrics?.signupsByMonth || []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="month"
                        tickFormatter={(value) => format(new Date(value + "-01"), "MMM")}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                        labelFormatter={(value) => format(new Date(value + "-01"), "MMMM yyyy")}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Tier Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  User Tiers
                </CardTitle>
                <CardDescription>Free vs Pro breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={tierPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {tierPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="flex justify-center gap-4 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#10b981]" />
                    <span className="text-xs text-muted-foreground">Pro ({systemMetrics?.tierBreakdown.pro || 0})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#6366f1]" />
                    <span className="text-xs text-muted-foreground">Free ({systemMetrics?.tierBreakdown.free || 0})</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* System Stats */}
          <section>
            <h2 className="text-lg font-semibold mb-4">System Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {isLoading ? (
                <>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-12 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : (
                <>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{systemMetrics?.overview.totalWatchlistItems || 0}</p>
                      <p className="text-xs text-muted-foreground">Watchlist Items</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{systemMetrics?.overview.totalScanExecutions || 0}</p>
                      <p className="text-xs text-muted-foreground">Total Scans</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{systemMetrics?.overview.qualifiedScans || 0}</p>
                      <p className="text-xs text-muted-foreground">Qualified Scans</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-green-500">{systemMetrics?.overview.scanSuccessRate || "0%"}</p>
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{userMetrics?.summary.usersWithTelegram || 0}</p>
                      <p className="text-xs text-muted-foreground">Telegram Users</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{userMetrics?.summary.usersWithTiger || 0}</p>
                      <p className="text-xs text-muted-foreground">Tiger Connected</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </section>

          {/* Strategy Breakdown */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Positions by Strategy
                </CardTitle>
                <CardDescription>Distribution of trading strategies used</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-purple-500/10 rounded-lg">
                      <p className="text-3xl font-bold text-purple-500">{systemMetrics?.positionsByStrategy.creditSpreads || 0}</p>
                      <p className="text-sm text-muted-foreground">Credit Spreads</p>
                    </div>
                    <div className="text-center p-4 bg-cyan-500/10 rounded-lg">
                      <p className="text-3xl font-bold text-cyan-500">{systemMetrics?.positionsByStrategy.ironCondors || 0}</p>
                      <p className="text-sm text-muted-foreground">Iron Condors</p>
                    </div>
                    <div className="text-center p-4 bg-amber-500/10 rounded-lg">
                      <p className="text-3xl font-bold text-amber-500">{systemMetrics?.positionsByStrategy.leaps || 0}</p>
                      <p className="text-sm text-muted-foreground">LEAPS</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* User Details Table */}
          <section>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      User Details
                    </CardTitle>
                    <CardDescription>
                      Account info, subscription, and integrations
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 w-64"
                        data-testid="input-search-users"
                      />
                    </div>
                    <Tabs value={tierFilter} onValueChange={(v) => setTierFilter(v as any)}>
                      <TabsList className="h-9">
                        <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                        <TabsTrigger value="pro" className="text-xs">Pro</TabsTrigger>
                        <TabsTrigger value="free" className="text-xs">Free</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6">
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                      <thead className="bg-muted/50">
                        <tr className="text-left text-xs font-medium text-muted-foreground">
                          <th className="py-3 px-4 w-[280px]">User</th>
                          <th className="py-3 px-4 w-[100px]">Tier</th>
                          <th className="py-3 px-4 w-[160px]">Engagement</th>
                          <th className="py-3 px-4 w-[100px]">Integrations</th>
                          <th className="py-3 px-4 w-[140px]">Last Login</th>
                          <th className="py-3 px-4 w-[120px]">Joined</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers?.map((user) => (
                          <UserRow key={user.id} user={user} />
                        ))}
                        {filteredUsers?.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-muted-foreground">
                              No users found matching your criteria
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Trading Analytics Table */}
          <section>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Trading Analytics
                    </CardTitle>
                    <CardDescription>
                      Position breakdown, trades, and performance by user
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded bg-purple-500" />
                      <span>CS</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded bg-cyan-500" />
                      <span>IC</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded bg-amber-500" />
                      <span>LEAPS</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6">
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                      <thead className="bg-muted/50">
                        <tr className="text-xs font-medium text-muted-foreground">
                          <th className="py-3 px-4 text-left w-[180px]">User</th>
                          <th className="py-3 px-4 text-center w-[80px]">Watchlist</th>
                          <th className="py-3 px-4 text-center w-[100px]">Positions</th>
                          <th className="py-3 px-4 text-left w-[140px]">By Strategy</th>
                          <th className="py-3 px-4 text-center w-[80px]">Scans</th>
                          <th className="py-3 px-4 text-center w-[80px]">Trades</th>
                          <th className="py-3 px-4 text-center w-[80px]">Win Rate</th>
                          <th className="py-3 px-4 text-right w-[120px]">Realized P/L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers?.map((user) => (
                          <TradingAnalyticsRow key={user.id} user={user} />
                        ))}
                        {filteredUsers?.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-muted-foreground">
                              No users found matching your criteria
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* API Usage Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Cloud className="w-5 h-5" />
              API Usage & Cost Tracking
            </h2>
            
            {/* API Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {apiUsageLoading ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-16 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : (
                <>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{apiUsageMetrics?.summary?.totalCalls?.toLocaleString() || 0}</p>
                      <p className="text-xs text-muted-foreground">Total API Calls (7d)</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className={`text-2xl font-bold ${parseFloat(apiUsageMetrics?.summary?.successRate || "0") >= 95 ? "text-green-500" : parseFloat(apiUsageMetrics?.summary?.successRate || "0") >= 80 ? "text-yellow-500" : "text-red-500"}`}>
                        {apiUsageMetrics?.summary?.successRate || "0"}%
                      </p>
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{apiUsageMetrics?.summary?.avgLatencyMs || 0}ms</p>
                      <p className="text-xs text-muted-foreground">Avg Latency</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-green-500">${apiUsageMetrics?.costEstimate?.total?.toFixed(2) || "0.00"}</p>
                      <p className="text-xs text-muted-foreground">Est. Cost (7d)</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Provider Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Provider Breakdown
                  </CardTitle>
                  <CardDescription>API calls by provider with success rates</CardDescription>
                </CardHeader>
                <CardContent>
                  {apiUsageLoading ? (
                    <Skeleton className="h-48 w-full" />
                  ) : !apiUsageMetrics?.providerBreakdown || apiUsageMetrics.providerBreakdown.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Cloud className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No API usage data yet</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {apiUsageMetrics.providerBreakdown.map((provider) => (
                        <div key={provider.provider} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium capitalize">{provider.provider}</span>
                              <Badge variant="outline" className="text-xs">
                                {provider.totalCalls?.toLocaleString() || 0} calls
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm ${parseFloat(provider.successRate || "0") >= 95 ? "text-green-500" : parseFloat(provider.successRate || "0") >= 80 ? "text-yellow-500" : "text-red-500"}`}>
                                {provider.successRate || "0"}%
                              </span>
                              <span className="text-xs text-muted-foreground">{provider.avgLatencyMs || 0}ms</span>
                            </div>
                          </div>
                          <Progress value={parseFloat(provider.successRate || "0")} className="h-2" />
                          <div className="flex flex-wrap gap-1">
                            {(provider.endpoints || []).slice(0, 4).map((endpoint) => (
                              <Badge key={endpoint.endpoint} variant="secondary" className="text-[10px]">
                                {endpoint.endpoint}: {endpoint.totalCalls || 0}
                              </Badge>
                            ))}
                            {(provider.endpoints || []).length > 4 && (
                              <Badge variant="secondary" className="text-[10px]">
                                +{(provider.endpoints || []).length - 4} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Daily Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Daily API Usage Trend
                  </CardTitle>
                  <CardDescription>Calls and success rate over the past 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {apiUsageLoading ? (
                    <Skeleton className="h-[200px] w-full" />
                  ) : !apiUsageMetrics?.callsByDay || apiUsageMetrics.callsByDay.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No daily trend data yet</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={apiUsageMetrics.callsByDay}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => format(new Date(value), "MM/dd")}
                          className="text-xs"
                        />
                        <YAxis className="text-xs" />
                        <Tooltip 
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                          labelFormatter={(value) => format(new Date(value), "MMM dd, yyyy")}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="totalCalls" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={{ fill: "hsl(var(--primary))" }}
                          name="API Calls"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Cost Breakdown */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Cost Breakdown by Provider
                </CardTitle>
                <CardDescription>Estimated API costs based on usage (7-day period)</CardDescription>
              </CardHeader>
              <CardContent>
                {apiUsageLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                      <p className="text-lg font-bold text-blue-500">
                        ${apiUsageMetrics?.costEstimate?.polygon?.estimatedCost?.toFixed(4) || "0.0000"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Polygon ({apiUsageMetrics?.costEstimate?.polygon?.calls?.toLocaleString() || 0})
                      </p>
                    </div>
                    <div className="text-center p-3 bg-purple-500/10 rounded-lg">
                      <p className="text-lg font-bold text-purple-500">
                        ${apiUsageMetrics?.costEstimate?.openai?.estimatedCost?.toFixed(2) || "0.00"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        OpenAI ({apiUsageMetrics?.costEstimate?.openai?.calls?.toLocaleString() || 0})
                      </p>
                    </div>
                    <div className="text-center p-3 bg-green-500/10 rounded-lg">
                      <p className="text-lg font-bold text-green-500">
                        $0.00
                      </p>
                      <p className="text-xs text-muted-foreground">
                        FRED ({apiUsageMetrics?.costEstimate?.fred?.calls?.toLocaleString() || 0})
                      </p>
                    </div>
                    <div className="text-center p-3 bg-indigo-500/10 rounded-lg">
                      <p className="text-lg font-bold text-indigo-500">
                        $0.00
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Stripe ({apiUsageMetrics?.costEstimate?.stripe?.calls?.toLocaleString() || 0})
                      </p>
                    </div>
                    <div className="text-center p-3 bg-cyan-500/10 rounded-lg">
                      <p className="text-lg font-bold text-cyan-500">
                        $0.00
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Telegram ({apiUsageMetrics?.costEstimate?.telegram?.calls?.toLocaleString() || 0})
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </>
  );
}
