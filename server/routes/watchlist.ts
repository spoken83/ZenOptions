import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, optionalAuth, requireUser, getEffectiveUserId } from "../auth0";
import { insertWatchlistSchema, insertTickerSchema } from "@shared/schema";
import { supportResistanceService } from "../services/supportResistance";
import { checkWatchlistLimit, type SubscriptionTier } from "../tierLimits";

const router = Router();

// Common index ETF symbols
const INDEX_ETFS = new Set([
  'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO', 'IVV', 'VEA',
  'VWO', 'EEM', 'AGG', 'BND', 'LQD', 'HYG', 'TLT', 'IEF',
  'GLD', 'SLV', 'USO', 'XLE', 'XLF', 'XLK', 'XLV', 'XLI',
  'XLP', 'XLY', 'XLB', 'XLU', 'XLRE'
]);

function detectTickerType(symbol: string): 'stock' | 'index' {
  return INDEX_ETFS.has(symbol.toUpperCase()) ? 'index' : 'stock';
}

// Watchlist routes (pre-login preview enabled)
router.get("/api/watchlist", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const watchlist = await storage.getWatchlist(userId);
    res.json(watchlist);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/watchlist", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    // Check tier limits
    const currentWatchlist = await storage.getWatchlist(user.id);
    const limitCheck = checkWatchlistLimit(user.subscriptionTier as SubscriptionTier, currentWatchlist.length);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        message: limitCheck.reason,
        limit: limitCheck.limit,
        current: limitCheck.current,
      });
    }

    const data = insertWatchlistSchema.parse(req.body);
    // Auto-detect ticker type if not provided
    if (!data.type) {
      data.type = detectTickerType(data.symbol);
    }
    const item = await storage.addToWatchlist(user.id, data);
    res.json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/api/watchlist/:symbol", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await storage.removeFromWatchlist(user.id, req.params.symbol);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Support/Resistance endpoints
router.get("/api/tickers/:tickerId/sr-levels", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    // Get ticker with S/R levels
    const ticker = await storage.getTicker(user.id, req.params.tickerId);

    if (!ticker) {
      return res.status(404).json({ message: "Ticker not found" });
    }

    // Return S/R levels data
    res.json({
      tickerId: ticker.id,
      symbol: ticker.symbol,
      supportLevels: ticker.supportLevels || [],
      resistanceLevels: ticker.resistanceLevels || [],
      srLastUpdated: ticker.srLastUpdated,
      srSource: ticker.srSource,
      // Backward compatibility
      support: ticker.support,
      resistance: ticker.resistance
    });
  } catch (error: any) {
    console.error(`Error fetching S/R levels:`, error);
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/tickers/:tickerId/refresh-sr", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    // Call service method that returns structured response (never throws)
    const result = await supportResistanceService.refreshTicker(req.params.tickerId, user.id);

    // Handle structured response
    if (!result.success) {
      // Rate limit or other error - return structured error with metadata
      const statusCode = result.retryAfterSeconds ? 429 : 400;
      return res.status(statusCode).json({
        success: false,
        error: result.error,
        retryAfterSeconds: result.retryAfterSeconds
      });
    }

    // Success - return the levels
    res.json({
      success: true,
      levels: result.levels
    });
  } catch (error: any) {
    // Unexpected error (shouldn't happen as service catches all)
    console.error(`Unexpected error in S/R refresh:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unexpected error during S/R refresh'
    });
  }
});

// Ticker search (for autocomplete in add ticker modal)
router.get("/api/tickers/search", optionalAuth, async (req: any, res) => {
  try {
    const query = req.query.q as string;
    if (!query || query.length < 1) {
      return res.json([]);
    }

    const { marketDataService } = await import("../services/marketData");
    const results = await marketDataService.searchTickers(query, 8);
    res.json(results);
  } catch (error: any) {
    console.error('Error searching tickers:', error);
    res.status(500).json({ message: error.message });
  }
});

// Ticker configuration routes (GET is public for demo, mutations are protected)
router.get("/api/tickers", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const tickers = await storage.getAllTickers(userId);
    res.json(tickers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/api/tickers/:symbol", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const ticker = await storage.getTicker(user.id, req.params.symbol);
    if (!ticker) {
      return res.status(404).json({ message: "Ticker not found" });
    }
    res.json(ticker);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/api/tickers", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    // Check tier limits before creating ticker
    // Since tickers are typically added with watchlist entries, we check watchlist limits here too
    const currentWatchlist = await storage.getWatchlist(user.id);
    const limitCheck = checkWatchlistLimit(user.subscriptionTier as SubscriptionTier, currentWatchlist.length);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        message: limitCheck.reason,
        limit: limitCheck.limit,
        current: limitCheck.current,
      });
    }

    const data = insertTickerSchema.parse(req.body);
    const ticker = await storage.createTicker(user.id, data);
    res.json(ticker);
  } catch (error: any) {
    // Provide user-friendly error messages
    if (error.message.includes("duplicate key value")) {
      return res.status(400).json({
        message: `Ticker ${req.body.symbol || 'this symbol'} already exists in your watchlist.`
      });
    }
    res.status(400).json({ message: error.message });
  }
});

router.patch("/api/tickers/:symbol", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const ticker = await storage.updateTicker(user.id, req.params.symbol, req.body);
    res.json(ticker);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/api/tickers/:symbol", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    await storage.deleteTicker(user.id, req.params.symbol);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
