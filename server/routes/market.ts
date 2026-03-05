import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated, optionalAuth, requireUser, getEffectiveUserId } from "../auth0";
import { marketDataService } from "../services/marketData";
import { priceCacheService } from "../services/priceCache";
import { indicatorService } from "../services/indicators";
import { yahooFinanceService } from "../services/yahooFinance";
import { sectorAnalysisService } from "../services/sectorAnalysis";
import { regimeDetectionService } from "../services/regimeDetection";
import { opportunityScannerService } from "../services/opportunityScanner";
import { advancedVixAnalysisService } from "../services/advancedVixAnalysis";
import { marketContextService } from "../services/marketContext";
import { optionsFlowService } from "../services/optionsFlow";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

const router = Router();

// Watchlist market data route (pre-login preview enabled)
router.get("/api/watchlist-market-data", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const tickers = await storage.getAllTickers(userId);
    const marketData = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          // Get current quote
          const quote = await marketDataService.getQuote(ticker.symbol);

          // Get historical data for price change and RSI calculation
          // Need at least 15 data points for RSI (14 periods + 1), so fetch 30 days to ensure enough trading days
          const historical = await marketDataService.getHistoricalData(ticker.symbol, 30);

          // Guard against null/missing historical data
          let change: number | null = null;
          if (historical && historical.length >= 2 && quote.price) {
            const previousClose = historical[historical.length - 2]?.close;
            if (previousClose && previousClose > 0) {
              change = ((quote.price - previousClose) / previousClose) * 100;
            }
          }

          // Get indicators (RSI, StochRSI, SMA 50/200, MACD)
          let stochRSIStatus = 'unknown';
          let rsiStatus = 'unknown';
          let rsiValue: number | null = null;
          let stochK: number | null = null;
          let stochD: number | null = null;
          let sma50: number | null = null;
          let sma200: number | null = null;
          let macdLine: number | null = null;
          let macdSignal: number | null = null;
          let macdHistogram: number | null = null;
          let smaTrend: string = 'unknown';

          try {
            // First try to get from stored indicators
            const latestIndicator = await storage.getLatestIndicators(userId, ticker.symbol);
            if (latestIndicator) {
              // RSI
              if (latestIndicator.rsi14 !== null && latestIndicator.rsi14 !== 0) {
                rsiValue = latestIndicator.rsi14;
                rsiStatus = rsiValue > 70 ? 'overbought' : rsiValue < 30 ? 'oversold' : 'neutral';
              }
              // StochRSI
              if (latestIndicator.stochK !== null && latestIndicator.stochK !== 0) {
                stochK = latestIndicator.stochK;
                stochD = latestIndicator.stochD;
                stochRSIStatus = stochK > 80 ? 'overbought' : stochK < 20 ? 'oversold' : 'neutral';
              }
              // SMA / MACD (new columns — may be null for older records before schema update)
              sma50 = (latestIndicator as any).sma50 ?? null;
              sma200 = (latestIndicator as any).sma200 ?? null;
              macdLine = (latestIndicator as any).macdLine ?? null;
              macdSignal = (latestIndicator as any).macdSignal ?? null;
              macdHistogram = (latestIndicator as any).macdHistogram ?? null;
              if (sma50 !== null || sma200 !== null) {
                smaTrend = indicatorService.getSMATrend(quote.price, sma50, sma200);
              }
            }

            // Fallback to live RSI calculation if no stored indicators
            if (rsiStatus === 'unknown' && historical && historical.length >= 15) {
              const closePrices = historical.map(d => d.close);
              const calculatedRsi = indicatorService.calculateRSI(closePrices);
              if (calculatedRsi && calculatedRsi > 0) {
                rsiValue = calculatedRsi;
                rsiStatus = calculatedRsi > 70 ? 'overbought' : calculatedRsi < 30 ? 'oversold' : 'neutral';
              }
            }

            // Fallback to unified StochRSI calculation if no stored indicators
            if (stochRSIStatus === 'unknown') {
              const stochResult = await indicatorService.calculateUnifiedStochRSI(ticker.symbol);
              stochRSIStatus = stochResult.status;
              stochK = stochResult.k;
              stochD = stochResult.d;
            }
          } catch (error) {
            console.error(`Error getting indicators for ${ticker.symbol}:`, error);
          }

          return {
            symbol: ticker.symbol,
            price: quote.price,
            change,
            stochRSIStatus,
            rsiStatus,
            rsiValue,
            stochK,
            stochD,
            sma50,
            sma200,
            macdLine,
            macdSignal,
            macdHistogram,
            smaTrend,
            supportLevels: ticker.supportLevels || [],
            resistanceLevels: ticker.resistanceLevels || [],
            srLastUpdated: ticker.srLastUpdated,
            srSource: ticker.srSource,
            support: ticker.support,
            resistance: ticker.resistance,
          };
        } catch (error) {
          console.error(`Error fetching market data for ${ticker.symbol}:`, error);
          return {
            symbol: ticker.symbol,
            price: null,
            change: null,
            stochRSIStatus: 'unknown',
            rsiStatus: 'unknown',
            rsiValue: null,
            stochK: null,
            stochD: null,
            sma50: null,
            sma200: null,
            macdLine: null,
            macdSignal: null,
            macdHistogram: null,
            smaTrend: 'unknown',
            supportLevels: ticker.supportLevels || [],
            resistanceLevels: ticker.resistanceLevels || [],
            srLastUpdated: ticker.srLastUpdated,
            srSource: ticker.srSource,
            support: ticker.support,
            resistance: ticker.resistance,
          };
        }
      })
    );

    res.json(marketData);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Watchlist ATM IV data endpoint - get IV and 30-day expected move for all watchlist tickers
router.get("/api/watchlist-iv-data", optionalAuth, async (req: any, res) => {
  try {
    const userId = await getEffectiveUserId(req);
    const tickers = await storage.getAllTickers(userId);

    console.log(`\n📊 Fetching ATM IV for ${tickers.length} watchlist tickers...`);

    // Get IV data for all symbols using batch method
    const symbols = tickers.map(t => t.symbol);
    const ivDataMap = await priceCacheService.getAtmIVBatch(symbols);

    // Convert to array format for response
    const ivData = symbols.map(symbol => {
      const data = ivDataMap.get(symbol);
      return {
        symbol,
        atmIv: data?.atmIv ?? null,
        expectedMove30d: data?.expectedMove30d ?? null,
      };
    });

    res.json(ivData);
  } catch (error: any) {
    console.error('Error fetching watchlist IV data:', error);
    res.status(500).json({ message: error.message });
  }
});

// VIX data endpoint - Yahoo Finance (for homepage) (public preview)
router.get("/api/vix-data", optionalAuth, async (_req, res) => {
  try {
    const vixData = await yahooFinanceService.getVixData();
    res.json(vixData);
  } catch (error: any) {
    console.error('Error fetching VIX data:', error);
    res.status(500).json({
      message: error.message,
      vix: null,
      vixChange: null,
      vixChangePercent: null,
      vvix: null,
      vvixChange: null,
      vvixChangePercent: null
    });
  }
});

// Sector rotation endpoint (Phase 2) (public preview)
router.get("/api/sector-rotation/:vix", optionalAuth, async (req, res) => {
  try {
    const vix = parseFloat(req.params.vix) || 16;
    const sectorData = await sectorAnalysisService.getSectorRotation(vix);
    res.json(sectorData);
  } catch (error: any) {
    console.error('Error fetching sector rotation:', error);
    res.status(500).json({ message: error.message, sectors: [] });
  }
});

// Market regime endpoint (Phase 2) (public preview)
router.get("/api/market-regime/:vix", optionalAuth, async (req, res) => {
  try {
    const vix = parseFloat(req.params.vix) || 16;
    const regimeData = await regimeDetectionService.detectRegime(vix);
    res.json(regimeData);
  } catch (error: any) {
    console.error('Error detecting market regime:', error);
    res.status(500).json({
      message: error.message,
      regime: 'TRANSITIONING',
      confidence: 0,
      score: 0,
      signals: {},
      leaders: [],
      laggards: [],
      duration: 0,
      vixContext: 'Data unavailable'
    });
  }
});

// Opportunity scanner endpoint (Phase 3) (public preview)
router.get("/api/opportunity-scanner/:vix/:vvix", optionalAuth, async (req, res) => {
  try {
    const vix = parseFloat(req.params.vix) || 16;
    const vvix = parseFloat(req.params.vvix) || 85;
    const setups = await opportunityScannerService.getTopSetups(vix, vvix, 4);
    res.json(setups);
  } catch (error: any) {
    console.error('Error in opportunity scanner:', error);
    res.status(500).json({ message: error.message, setups: [] });
  }
});

// Advanced VIX analysis endpoint (Phase 3) (public preview)
router.get("/api/vix-analysis/:vix", optionalAuth, async (req, res) => {
  try {
    const vix = parseFloat(req.params.vix) || 16;
    const analysis = await advancedVixAnalysisService.getVixAnalysis(vix);
    res.json(analysis);
  } catch (error: any) {
    console.error('Error in VIX analysis:', error);
    res.status(500).json({ message: error.message });
  }
});

// Market ticker bar - SPY, QQQ, DIA, VIX, GLD, IWM, XLK, XLV, XLF with live prices (public preview)
router.get("/api/market-ticker", optionalAuth, async (_req, res) => {
  try {
    // Use cached market data (refreshed every 60s with proper % change)
    const marketData = priceCacheService.getCachedMarketData();

    if (marketData.length > 0) {
      res.json(marketData);
      return;
    }

    // Fallback if cache not ready yet
    const symbols = ['SPY', 'QQQ', 'DIA', 'VIX', 'GLD', 'IWM', 'XLK', 'XLV', 'XLF'];
    const fallbackData = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const quote = await marketDataService.getQuote(symbol);
          return {
            symbol,
            price: quote.price,
            changePercent: null,
          };
        } catch (error) {
          console.error(`Error fetching market data for ${symbol}:`, error);
          return {
            symbol,
            price: null,
            changePercent: null,
          };
        }
      })
    );

    res.json(fallbackData);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Market Context Analysis endpoints
// Get latest market context analysis (public for Free tier users to see market conditions)
router.get("/api/market-context/latest", optionalAuth, async (_req, res) => {
  try {
    const analysis = await marketContextService.getLatestAnalysis();

    if (!analysis) {
      return res.status(404).json({ message: "No market context available yet. Run a manual refresh to generate the first analysis." });
    }

    res.json(analysis);
  } catch (error: any) {
    console.error('Error fetching market context:', error);
    res.status(500).json({ message: error.message });
  }
});

// Manually trigger market context analysis refresh (authenticated users only)
router.post("/api/market-context/refresh", isAuthenticated, async (req: any, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    console.log(`🔄 Manual market context refresh triggered by user: ${user.email}`);

    const analysis = await marketContextService.performAnalysis();
    res.json(analysis);
  } catch (error: any) {
    console.error('Error refreshing market context:', error);

    // Check if service is disabled due to missing API keys
    if (error.message && error.message.includes('not available')) {
      return res.status(503).json({
        message: 'Market context analysis is currently unavailable. Please configure OPENAI_API_KEY to enable this feature.',
        available: false
      });
    }

    res.status(500).json({ message: error.message });
  }
});

// DEV: Tiger vs Polygon market data comparison (protected, temporary diagnostic endpoint)
router.get("/api/dev/tiger-data-test", isAuthenticated, async (req: any, res) => {
  try {
    const symbol = ((req.query.symbol as string) || 'AAPL').toUpperCase();
    const scriptPath = path.join(process.cwd(), 'server', 'integrations', 'tiger', 'test_market_data.py');

    // Run Tiger test and Polygon fetches in parallel
    const [tigerResult, polygonQuote, polygonHistory, polygonExpiries] = await Promise.allSettled([
      // Tiger test script
      execAsync(`python3 ${scriptPath} ${symbol}`, {
        env: { ...process.env },
        timeout: 60000,
      }).then(({ stdout }) => JSON.parse(stdout))
        .catch((e: any) => {
          // When script exits with code 1, stdout contains the error JSON
          if (e.stdout) {
            try { return JSON.parse(e.stdout); } catch {}
          }
          return { success: false, error: e.message };
        }),

      // Polygon: stock quote
      marketDataService.getQuote(symbol).catch((e: Error) => ({ error: e.message })),

      // Polygon: historical data (252 days)
      marketDataService.getHistoricalData(symbol, 252).catch((e: Error) => ({ error: e.message })),

      // Polygon: option expiries
      marketDataService.getAvailableExpiries(symbol).catch((e: Error) => ({ error: e.message })),
    ]);

    // Polygon option chain (nearest ~35 DTE)
    let polygonChain: any = null;
    try {
      const expiries = polygonExpiries.status === 'fulfilled' ? polygonExpiries.value as Date[] : [];
      if (Array.isArray(expiries) && expiries.length > 0) {
        const today = Date.now();
        const target35dte = today + 35 * 86400000;
        const nearest = expiries.reduce((best: Date, e: Date) =>
          Math.abs(e.getTime() - target35dte) < Math.abs(best.getTime() - target35dte) ? e : best
        );
        polygonChain = await marketDataService.getOptionChain(symbol, nearest);
      }
    } catch (e: any) {
      polygonChain = { error: e.message };
    }

    const tiger = tigerResult.status === 'fulfilled' ? tigerResult.value : { success: false, error: (tigerResult as PromiseRejectedResult).reason?.message };
    const quote = polygonQuote.status === 'fulfilled' ? polygonQuote.value : null;
    const history = polygonHistory.status === 'fulfilled' ? polygonHistory.value as any[] : [];
    const expiriesArr = polygonExpiries.status === 'fulfilled' ? polygonExpiries.value as Date[] : [];

    // Build Polygon summary for comparison
    const polygonSummary = {
      stockQuote: {
        available: !!quote && !('error' in (quote as any)),
        fields: quote && !('error' in (quote as any)) ? { price: (quote as any).price, volume: (quote as any).volume } : null,
        error: (quote as any)?.error || null,
      },
      historicalData: {
        available: Array.isArray(history) && history.length > 0,
        daysReturned: Array.isArray(history) ? history.length : 0,
        sampleBar: Array.isArray(history) && history.length > 0 ? history[history.length - 1] : null,
        error: !Array.isArray(history) ? (history as any)?.error : null,
      },
      optionExpiries: {
        available: Array.isArray(expiriesArr) && expiriesArr.length > 0,
        totalExpiries: Array.isArray(expiriesArr) ? expiriesArr.length : 0,
        nearestExpiry: Array.isArray(expiriesArr) && expiriesArr.length > 0 ? expiriesArr[0].toISOString().split('T')[0] : null,
        farthestExpiry: Array.isArray(expiriesArr) && expiriesArr.length > 0 ? expiriesArr[expiriesArr.length - 1].toISOString().split('T')[0] : null,
        hasLeapsExpiries: Array.isArray(expiriesArr) && expiriesArr.some((d: Date) => d.getTime() - Date.now() > 365 * 86400000),
      },
      optionChain: polygonChain && !('error' in polygonChain) ? {
        available: Array.isArray(polygonChain) && polygonChain.length > 0,
        totalContracts: Array.isArray(polygonChain) ? polygonChain.length : 0,
        callCount: Array.isArray(polygonChain) ? polygonChain.filter((c: any) => c.type === 'call').length : 0,
        putCount: Array.isArray(polygonChain) ? polygonChain.filter((c: any) => c.type === 'put').length : 0,
        ivAvailable: Array.isArray(polygonChain) && polygonChain.some((c: any) => c.iv != null && c.iv > 0),
        deltaAvailable: Array.isArray(polygonChain) && polygonChain.some((c: any) => c.delta != null),
        bidAskAvailable: Array.isArray(polygonChain) && polygonChain.some((c: any) => c.bid > 0),
        sampleCall: Array.isArray(polygonChain) ? polygonChain.find((c: any) => c.type === 'call') : null,
      } : { available: false, error: (polygonChain as any)?.error },
    };

    res.json({ symbol, tiger, polygon: polygonSummary });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Options flow / unusual activity (protected)
router.get("/api/options-flow/:symbol", isAuthenticated, async (req: any, res) => {
  try {
    const { symbol } = req.params;
    if (!symbol) return res.status(400).json({ message: 'Symbol required' });
    const result = await optionsFlowService.getUnusualActivity(symbol.toUpperCase());
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
