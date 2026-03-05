import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, optionalAuth, requireUser, getEffectiveUserId } from "../auth0";
import { scannerService } from "../services/scanner";
import { leapsScannerService } from "../services/leapsScanner";
import { telegramService } from "../services/telegram";
import { marketDataService } from "../services/marketData";
import { checkScanQuota, type SubscriptionTier } from "../tierLimits";

const router = Router();

// Scan status tracking — in-memory for speed, persisted to DB settings for restart safety
const activeScanStatus = new Map<string, { isScanning: boolean; startedAt: number | null }>();

const SCAN_STATUS_KEY = 'scan_status_json';
const SCAN_STALE_MS = 10 * 60 * 1000; // 10 minutes — consider any scan stale after this

function getScanStatus(userId: string): { isScanning: boolean; startedAt: number | null } {
  return activeScanStatus.get(userId) || { isScanning: false, startedAt: null };
}

function setScanStatus(userId: string, isScanning: boolean): void {
  const status = { isScanning, startedAt: isScanning ? Date.now() : null };
  activeScanStatus.set(userId, status);
  // Persist async — don't block the caller
  storage.setSetting(userId, { key: SCAN_STATUS_KEY, value: JSON.stringify(status) }).catch(() => {});
}

async function loadScanStatusFromDb(userId: string): Promise<void> {
  try {
    const setting = await storage.getSetting(userId, SCAN_STATUS_KEY);
    if (!setting?.value) return;
    const stored = JSON.parse(setting.value) as { isScanning: boolean; startedAt: number | null };
    // Clear stale "scanning" states (server may have crashed mid-scan)
    if (stored.isScanning && stored.startedAt && Date.now() - stored.startedAt > SCAN_STALE_MS) {
      stored.isScanning = false;
      stored.startedAt = null;
    }
    activeScanStatus.set(userId, stored);
  } catch {
    // Non-fatal — default to not scanning
  }
}

// LEAPS scan status tracking (per user)
const leapsScanStatus = new Map<string, { isScanning: boolean; startedAt: number | null }>();

function getLeapsScanStatus(userId: string): { isScanning: boolean; startedAt: number | null } {
  return leapsScanStatus.get(userId) || { isScanning: false, startedAt: null };
}

function setLeapsScanStatus(userId: string, isScanning: boolean): void {
  leapsScanStatus.set(userId, { isScanning, startedAt: isScanning ? Date.now() : null });
}

// Indicators routes (protected)
router.get("/api/indicators/:symbol", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const indicators = await storage.getIndicators(user.id, req.params.symbol, 10);
    res.json(indicators);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/api/indicators/:symbol/latest", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const indicator = await storage.getLatestIndicators(user.id, req.params.symbol);
    res.json(indicator);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Scan results routes (pre-login preview enabled)
router.get("/api/scan-results/latest", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const results = await storage.getLatestScanResults(userId);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Grouped scan results by batch (pre-login preview enabled) - shows last 7 days
router.get("/api/scan-results/batches", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const results = await storage.getRecentScanResults(userId, 7);
    const grouped: Record<string, any[]> = {};
    for (const r of results as any[]) {
      const key = r.batchId || 'unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }
    // Return batches sorted by asof desc within each batch
    const batches = Object.entries(grouped).map(([batchId, items]) => ({
      batchId,
      startedAt: items.reduce((min, it) => Math.min(min, new Date(it.asof).getTime()), Infinity),
      items: items.sort((a, b) => new Date(b.asof).getTime() - new Date(a.asof).getTime()),
    })).sort((a, b) => b.startedAt - a.startedAt);
    res.json(batches);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Grouped scan results by symbol with status categories (pre-login preview enabled) - shows last 7 days
router.get("/api/scan-results/grouped-by-symbol", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const results = await storage.getRecentScanResults(userId, 7);

    // Group by symbol (take latest result per symbol within last 7 days)
    const bySymbol = new Map<string, any>();
    for (const r of results as any[]) {
      const existing = bySymbol.get(r.symbol);
      if (!existing || new Date(r.asof) > new Date(existing.asof)) {
        bySymbol.set(r.symbol, r);
      }
    }

    // Categorize by status
    const qualified = [] as any[];
    const setupNoSpread = [] as any[];
    const others = [] as any[];

    for (const result of Array.from(bySymbol.values())) {
      if (result.status === 'qualified') {
        qualified.push(result);
      } else if (result.status === 'no_qualified_spread') {
        setupNoSpread.push(result);
      } else {
        others.push(result);
      }
    }

    res.json({
      qualified,
      setupNoSpread,
      others,
      summary: {
        totalSymbols: bySymbol.size,
        qualified: qualified.length,
        setupNoSpread: setupNoSpread.length,
        others: others.length,
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Candidate states endpoint (two-stage model) (protected)
router.get("/api/scan-candidates", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const watch = await storage.getWatchlist(user.id);
    const active = watch.filter(w => w.active).map(w => w.symbol);
    const results = [] as any[];
    for (const sym of active) {
      try {
        const cand = await scannerService.evaluateCandidate(user.id, sym);
        results.push(cand);
      } catch (e: any) {
        results.push({ symbol: sym, state: 'NONE', side: null, reason: e?.message || 'Error' });
      }
    }
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/api/scan-results/:date", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const date = new Date(req.params.date);
    const results = await storage.getScanResultsByDate(userId, date);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Check scan status endpoint
router.get("/api/scan/status", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    // Load from DB on first check after restart (in-memory Map is empty)
    if (!activeScanStatus.has(user.id)) {
      await loadScanStatusFromDb(user.id);
    }

    const status = getScanStatus(user.id);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/scan/run", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    // Check if scan is already running
    const currentStatus = getScanStatus(user.id);
    if (currentStatus.isScanning) {
      return res.status(409).json({ message: "A scan is already in progress" });
    }

    // Reset scan quota if needed and check limit
    await storage.resetScanQuotaIfNeeded(user.id);
    const updatedUser = await storage.getUserById(user.id);
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const quotaCheck = checkScanQuota(
      updatedUser.subscriptionTier as SubscriptionTier,
      updatedUser.dailyScanCount,
      updatedUser.lastScanDate
    );
    if (!quotaCheck.allowed) {
      return res.status(403).json({
        message: quotaCheck.reason,
        limit: quotaCheck.limit,
        current: quotaCheck.current,
      });
    }

    // Increment scan count
    await storage.incrementScanCount(user.id);

    // Set scan status to running
    setScanStatus(user.id, true);

    try {
      await scannerService.runDailyScan(user.id);
      // Send Telegram notification with scan results only
      await telegramService.sendScanResultsOnly(user.id);
      res.json({ success: true, message: "Scan completed and notification sent" });
    } finally {
      // Always clear scan status when done
      setScanStatus(user.id, false);
    }
  } catch (error: any) {
    // Clear scan status on error
    const user = req.user?.dbUser;
    if (user?.id) {
      setScanStatus(user.id, false);
    }
    res.status(500).json({ message: error.message });
  }
});

// ==================== LEAPS SCANNER ENDPOINTS ====================

// Trigger LEAPS scan (protected)
router.post("/api/scan/leaps", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    // Check if scan is already running
    const currentStatus = getLeapsScanStatus(user.id);
    if (currentStatus.isScanning) {
      return res.status(409).json({ message: "A LEAPS scan is already in progress" });
    }

    // Reset scan quota if needed and check limit
    await storage.resetScanQuotaIfNeeded(user.id);
    const updatedUser = await storage.getUserById(user.id);
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const quotaCheck = checkScanQuota(
      updatedUser.subscriptionTier as SubscriptionTier,
      updatedUser.dailyScanCount,
      updatedUser.lastScanDate
    );
    if (!quotaCheck.allowed) {
      return res.status(403).json({
        message: quotaCheck.reason,
        limit: quotaCheck.limit,
        current: quotaCheck.current,
      });
    }

    // Get filter options from request body
    const filters = {
      minDTE: req.body.minDTE || 365,
      maxDTE: req.body.maxDTE || 900,
      minDelta: req.body.minDelta || 0.70,
      maxDelta: req.body.maxDelta || 0.90,
      minITM: req.body.minITM || 10,
      maxITM: req.body.maxITM || 20,
    };

    // Get watchlist symbols
    const watchlist = await storage.getWatchlist(user.id);
    const symbols = watchlist.filter(w => w.active).map(w => w.symbol);

    if (symbols.length === 0) {
      return res.status(400).json({ message: "No active symbols in watchlist" });
    }

    // Increment scan count
    await storage.incrementScanCount(user.id);

    // Set scan status to running
    setLeapsScanStatus(user.id, true);

    try {
      await leapsScannerService.runScan(user.id, symbols, filters);
      res.json({ success: true, message: "LEAPS scan completed" });
    } finally {
      // Always clear scan status when done
      setLeapsScanStatus(user.id, false);
    }
  } catch (error: any) {
    // Clear scan status on error
    const user = req.user?.dbUser;
    if (user?.id) {
      setLeapsScanStatus(user.id, false);
    }
    res.status(500).json({ message: error.message });
  }
});

// Get LEAPS scan results (protected)
router.get("/api/scan/leaps/results", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const limit = parseInt(req.query.limit as string) || 50;
    const results = await leapsScannerService.getLatestResults(userId, limit);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Get LEAPS scan status (protected)
router.get("/api/scan/leaps/status", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    res.json(getLeapsScanStatus(user.id));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Calculate IV Percentile for a symbol (protected - Pro users only)
router.get("/api/leaps/iv-percentile/:symbol", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    // Pro tier check for expensive market data calls
    if (user.subscriptionTier !== 'pro') {
      return res.status(403).json({ message: "IV Percentile requires Pro subscription" });
    }

    const symbol = req.params.symbol.toUpperCase();
    const ivPercentile = await leapsScannerService.calculateIVPercentile(symbol);
    res.json({ symbol, ivPercentile });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== END LEAPS SCANNER ENDPOINTS ====================

// On-demand analysis details: technical checklist + summarized options analysis (protected)
router.get("/api/scan-analysis/:symbol", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const symbol = req.params.symbol;
    const ticker = await storage.getTicker(user.id, symbol);
    const indicator = await storage.getLatestIndicators(user.id, symbol);
    if (!ticker || !indicator) {
      return res.status(404).json({
        message: "Missing ticker config or indicators",
      });
    }

    // Technical checklist (mirror server logic)
    const rsi = Number(indicator.rsi14 || 0);
    const stochK = Number(indicator.stochK || 0);
    const stochD = Number(indicator.stochD || 0);
    const price = Number(indicator.price || 0);
    const support = ticker.support;
    const resistance = ticker.resistance;

    const rsiOversold = rsi < 30;
    const rsiBounce = rsi > 30;
    const stochOversold = stochK < 20;
    const stochCrossUp = stochK > 20 && stochK > stochD;
    const putSetup = (rsiOversold || rsiBounce) && (stochOversold || stochCrossUp);
    const priceAboveSupport = !!support && price > support;

    const rsiOverbought = rsi > 70;
    const rsiReversal = rsi < 70;
    const stochOverbought = stochK > 80;
    const stochCrossDown = stochK < 80 && stochK < stochD;
    const callSetup = (rsiOverbought || rsiReversal) && (stochOverbought || stochCrossDown);
    const priceBelowResistance = !!resistance && price < resistance;

    let type: 'PUT' | 'CALL' = 'PUT';
    let triggered = false;
    let reason = 'No entry signal';
    if (putSetup && priceAboveSupport) {
      type = 'PUT';
      triggered = true;
      reason = 'Oversold setup with reversal trigger and price above support';
    } else if (callSetup && priceBelowResistance) {
      type = 'CALL';
      triggered = true;
      reason = 'Overbought setup with reversal trigger and price below resistance';
    } else if (putSetup) {
      type = 'PUT';
      reason = 'Oversold setup present, waiting for price above support';
    } else if (callSetup) {
      type = 'CALL';
      reason = 'Overbought setup present, waiting for price below resistance';
    }

    // Options analysis summary (best of sampled spreads)
    const analysis: any = {
      technical: {
        type,
        triggered,
        reason,
        values: { rsi, stochK, stochD, price },
        checks: {
          rsiOversold,
          rsiBounce,
          stochOversold,
          stochCrossUp,
          priceAboveSupport,
          rsiOverbought,
          rsiReversal,
          stochOverbought,
          stochCrossDown,
          priceBelowResistance,
        },
      },
    };

    // If no setup, skip options phase
    if (!triggered) {
      return res.json(analysis);
    }

    // Find a ~45DTE expiry and evaluate spreads similarly to scanner
    const expiry = await marketDataService.findNearestExpiry(symbol, 45, 2);
    if (!expiry) {
      return res.json({ ...analysis, options: { reason: 'NO_45_DTE' } });
    }

    const chain = await marketDataService.getOptionChain(symbol, expiry);
    const options = chain.filter((c) => c.type === type.toLowerCase());
    const shorts = options.filter((opt) => Math.abs(opt.delta || 0) >= 0.20 && Math.abs(opt.delta || 0) <= 0.35);
    const dte = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    type Spread = { shortStrike: number; longStrike: number; width: number; credit: number; rr: number; ba: number; oi: number };
    const tested: Spread[] = [] as any;
    for (const s of shorts.slice(0, 12)) {
      for (let width = 5; width <= 10; width++) {
        const longStrike = type === 'PUT' ? s.strike - width : s.strike + width;
        const l = options.find((o) => o.strike === longStrike);
        if (!l) continue;
        const credit = ((s.bid + s.ask) / 2) - ((l.bid + l.ask) / 2);
        const maxGain = credit * 100;
        const maxLoss = (width * 100) - maxGain;
        const rr = maxGain > 0 ? maxLoss / maxGain : Infinity;
        const ba = (s.ask - s.bid) + (l.ask - l.bid);
        tested.push({ shortStrike: s.strike, longStrike, width, credit, rr, ba, oi: s.openInterest || 0 });
      }
    }

    const passed = tested.filter((t) => (
      t.credit >= 1.50 && t.rr >= 1.8 && t.rr <= 2.5 && t.ba <= 0.15
    ));
    const best = passed.sort((a, b) => (Math.abs((b.rr ?? 0) - 2) - Math.abs((a.rr ?? 0) - 2)) || ((b.credit ?? 0) - (a.credit ?? 0)))[0];
    analysis.options = {
      expiry,
      dte,
      tested: tested.slice(0, 20),
      best: best || null,
      summary: {
        totalTested: tested.length,
        passed: passed.length,
        constraints: { minCredit: 1.50, rr: '1.8-2.5', maxBidAsk: 0.15, deltaRange: '0.20-0.35' },
      },
    };

    return res.json(analysis);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
