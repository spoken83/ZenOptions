import { Router } from "express";
import { storage } from "../storage";
import { getSessionUser } from "../auth0";
import { apiUsageTracker } from "../services/api-usage-tracker";

const router = Router();

// Admin authentication check helper
const requireAdmin = async (req: any, res: any): Promise<any | null> => {
  // Check for admin password from environment variable (secure configuration)
  const adminPassword = req.query.adminPassword || req.headers['x-admin-password'];
  const envPassword = process.env.ADMIN_PASSWORD;

  if (envPassword && adminPassword === envPassword) {
    return { isAdmin: true };
  }

  // Check authenticated user's isAdmin flag
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  if (!user.isAdmin) {
    res.status(403).json({ message: "Admin access only" });
    return null;
  }
  return user;
};

// Admin metrics endpoints
router.get("/api/admin/metrics/users", async (req: any, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const allUsers = await storage.getUsers();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get detailed per-user stats
    const usersWithStats = await Promise.all(allUsers.map(async (u: any) => {
      const watchlist = await storage.getWatchlist(u.id);
      const positions = await storage.getPositions(u.id);
      const scans = await storage.getRecentScanResults(u.id, 365);

      const openPositions = positions.filter((p: any) => p.status === 'open');
      const closedPositions = positions.filter((p: any) => p.status === 'closed');
      const qualifiedScans = scans.filter((s: any) => s.status === 'qualified');

      // Count positions by strategy type
      const creditSpreadPositions = positions.filter((p: any) => p.strategyType === 'CREDIT_SPREAD');
      const ironCondorPositions = positions.filter((p: any) => p.strategyType === 'IRON_CONDOR');
      const leapsPositions = positions.filter((p: any) => p.strategyType === 'LEAPS');

      // Calculate total P/L and win rate for closed positions
      let totalRealizedPL = 0;
      let winningTrades = 0;
      for (const pos of closedPositions) {
        if (pos.entryCreditCents && pos.exitCreditCents !== null) {
          const tradePL = (pos.entryCreditCents - pos.exitCreditCents) * (pos.contracts || 1);
          totalRealizedPL += tradePL;
          if (tradePL > 0) winningTrades++;
        }
      }

      const winRate = closedPositions.length > 0 ? ((winningTrades / closedPositions.length) * 100).toFixed(1) : '0';

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        subscriptionTier: u.subscriptionTier,
        subscriptionStatus: u.subscriptionStatus,
        stripeCustomerId: u.stripeCustomerId,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        isActive: u.isActive,
        telegramConfigured: !!u.telegramChatId,
        tigerConfigured: !!u.tigerAccountNumber,
        dailyScanCount: u.dailyScanCount || 0,
        watchlistCount: watchlist.length,
        openPositions: openPositions.length,
        closedPositions: closedPositions.length,
        totalPositions: positions.length,
        totalScans: scans.length,
        qualifiedScans: qualifiedScans.length,
        scanSuccessRate: scans.length > 0 ? ((qualifiedScans.length / scans.length) * 100).toFixed(1) : '0',
        realizedPLCents: totalRealizedPL,
        // Strategy breakdown
        creditSpreads: creditSpreadPositions.length,
        ironCondors: ironCondorPositions.length,
        leaps: leapsPositions.length,
        // Trading stats
        totalTrades: closedPositions.length,
        winRate: `${winRate}%`,
        winningTrades,
        // Engagement score (0-100)
        engagementScore: Math.min(100, Math.round(
          (watchlist.length * 5) +
          (openPositions.length * 10) +
          (scans.length * 0.5) +
          (u.telegramChatId ? 15 : 0) +
          (u.lastLoginAt && new Date(u.lastLoginAt) > sevenDaysAgo ? 20 : 0)
        )),
      };
    }));

    // Sort users by engagement score (most engaged first)
    usersWithStats.sort((a, b) => b.engagementScore - a.engagementScore);

    const totalSignups = allUsers.length;
    const freeUsers = allUsers.filter((u: any) => u.subscriptionTier === 'free').length;
    const proUsers = allUsers.filter((u: any) => u.subscriptionTier === 'pro').length;
    const conversionRate = totalSignups > 0 ? ((proUsers / totalSignups) * 100).toFixed(2) : '0';
    const activeUsers7Days = allUsers.filter((u: any) => u.lastLoginAt && new Date(u.lastLoginAt) > sevenDaysAgo).length;
    const activeUsers30Days = allUsers.filter((u: any) => u.lastLoginAt && new Date(u.lastLoginAt) > thirtyDaysAgo).length;
    const usersWithTelegram = allUsers.filter((u: any) => u.telegramChatId).length;
    const usersWithTiger = allUsers.filter((u: any) => u.tigerAccountNumber).length;

    // Calculate signups by month for chart
    const signupsByMonth: Record<string, number> = {};
    allUsers.forEach((u: any) => {
      if (u.createdAt) {
        const month = new Date(u.createdAt).toISOString().slice(0, 7);
        signupsByMonth[month] = (signupsByMonth[month] || 0) + 1;
      }
    });

    // MRR calculation (Pro users × $9 promo price)
    const monthlyRecurringRevenue = proUsers * 900; // In cents

    res.json({
      summary: {
        totalSignups,
        freeUsers,
        proUsers,
        conversionRate: `${conversionRate}%`,
        activeUsers7Days,
        activeUsers30Days,
        usersWithTelegram,
        usersWithTiger,
        monthlyRecurringRevenue,
      },
      signupsByMonth: Object.entries(signupsByMonth)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      users: usersWithStats,
    });
  } catch (error: any) {
    console.error("Admin users metrics error:", error);
    res.status(500).json({ message: error.message });
  }
});

router.get("/api/admin/metrics/system", async (req: any, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const allUsers = await storage.getUsers();
    let totalScans = 0;
    let qualifiedScans = 0;
    let openPositions = 0;
    let closedPositions = 0;
    let totalWatchlistItems = 0;
    let creditSpreads = 0;
    let ironCondors = 0;
    let leaps = 0;

    // Aggregate data from all users
    for (const u of allUsers) {
      const userPositions = await storage.getPositions(u.id);
      const userScans = await storage.getRecentScanResults(u.id, 365);
      const userWatchlist = await storage.getWatchlist(u.id);

      openPositions += userPositions.filter((p: any) => p.status === 'open').length;
      closedPositions += userPositions.filter((p: any) => p.status === 'closed').length;
      totalScans += userScans.length;
      qualifiedScans += userScans.filter((s: any) => s.status === 'qualified').length;
      totalWatchlistItems += userWatchlist.length;

      // Count by strategy type
      for (const p of userPositions) {
        if (p.strategyType === 'CREDIT_SPREAD') creditSpreads++;
        else if (p.strategyType === 'IRON_CONDOR') ironCondors++;
        else if (p.strategyType === 'LEAPS') leaps++;
      }
    }

    const scanSuccessRate = totalScans > 0 ? ((qualifiedScans / totalScans) * 100).toFixed(2) : '0';
    const usersWithTelegram = allUsers.filter((u: any) => u.telegramChatId).length;

    res.json({
      overview: {
        totalUsers: allUsers.length,
        activePositions: openPositions,
        closedPositions,
        totalWatchlistItems,
        totalScanExecutions: totalScans,
        qualifiedScans,
        scanSuccessRate: `${scanSuccessRate}%`,
        alertsConfigured: usersWithTelegram,
        apiCallsEstimate: totalScans * 2,
      },
      positionsByStrategy: {
        creditSpreads,
        ironCondors,
        leaps,
      },
      tierBreakdown: {
        free: allUsers.filter((u: any) => u.subscriptionTier === 'free').length,
        pro: allUsers.filter((u: any) => u.subscriptionTier === 'pro').length,
      },
    });
  } catch (error: any) {
    console.error("Admin system metrics error:", error);
    res.status(500).json({ message: error.message });
  }
});

router.get("/api/admin/metrics/api-usage", async (req: any, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const days = parseInt(req.query.days as string) || 7;

    const [providerSummary, dailyStats, costEstimate] = await Promise.all([
      apiUsageTracker.getProviderSummary(days),
      apiUsageTracker.getDailyStats(days),
      apiUsageTracker.getTotalCostEstimate(days),
    ]);

    const dailyTotals = new Map<string, { date: string; calls: number; successes: number; failures: number; latency: number }>();
    for (const stat of dailyStats) {
      const existing = dailyTotals.get(stat.date) || {
        date: stat.date,
        calls: 0,
        successes: 0,
        failures: 0,
        latency: 0
      };
      existing.calls += stat.totalCalls;
      existing.successes += stat.successCount;
      existing.failures += stat.failureCount;
      existing.latency += stat.avgLatencyMs * stat.totalCalls;
      dailyTotals.set(stat.date, existing);
    }

    const callsByDay = Array.from(dailyTotals.values())
      .map(d => ({
        date: d.date,
        totalCalls: d.calls,
        successRate: d.calls > 0 ? ((d.successes / d.calls) * 100).toFixed(1) : '0',
        avgLatencyMs: d.calls > 0 ? Math.round(d.latency / d.calls) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      summary: {
        totalCalls: providerSummary.reduce((sum, p) => sum + p.totalCalls, 0),
        successRate: providerSummary.length > 0
          ? (providerSummary.reduce((sum, p) => sum + p.successRate * p.totalCalls, 0) /
             providerSummary.reduce((sum, p) => sum + p.totalCalls, 0) || 0).toFixed(1)
          : '0',
        avgLatencyMs: providerSummary.length > 0
          ? Math.round(providerSummary.reduce((sum, p) => sum + p.avgLatencyMs * p.totalCalls, 0) /
             providerSummary.reduce((sum, p) => sum + p.totalCalls, 0) || 0)
          : 0,
      },
      providerBreakdown: providerSummary.map(p => ({
        provider: p.provider,
        totalCalls: p.totalCalls,
        successCount: p.successCount,
        failureCount: p.failureCount,
        successRate: p.successRate.toFixed(1),
        avgLatencyMs: Math.round(p.avgLatencyMs),
        endpoints: p.endpoints.map(e => ({
          endpoint: e.endpoint,
          totalCalls: e.totalCalls,
          successRate: e.successRate.toFixed(1),
          avgLatencyMs: Math.round(e.avgLatencyMs),
        })),
      })),
      costEstimate,
      callsByDay,
    });
  } catch (error: any) {
    console.error("Admin API usage metrics error:", error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
