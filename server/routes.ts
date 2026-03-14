import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, initializeGlobalSettings, initializeUserSettings } from "./storage";
import { setupAuth, isAuthenticated, optionalAuth, requireUser, getSessionUser, getEffectiveUserId } from "./auth0";
import { SYSTEM_OWNER_ID } from "./storage";
import {
  insertPositionSchema,
} from "@shared/schema";
import { schedulerService } from "./services/scheduler";
import { marketDataService } from "./services/marketData";
import { priceCacheService } from "./services/priceCache";
import { zenStatusService } from "./services/zenStatus";
import type { PositionWithPnL } from "./services/zenStatus";
import { tigerBrokersService } from "./services/tigerBrokers";
import { tigerPositionMapper } from "./services/tigerPositionMapper";
import { trackApiCall, apiUsageTracker } from "./services/api-usage-tracker";
import Stripe from "stripe";
import {
  checkPositionLimit,
  type SubscriptionTier
} from "./tierLimits";

// Domain routers
import watchlistRouter from "./routes/watchlist";
import marketRouter from "./routes/market";
import portfoliosRouter from "./routes/portfolios";
import scannerRouter from "./routes/scanner";
import alertsRouter from "./routes/alerts";
import settingsRouter from "./routes/settings";
import adminRouter from "./routes/admin";

// Use test key in development, production key in production
const stripeSecretKey = process.env.NODE_ENV === 'development'
  ? process.env.TESTING_STRIPE_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error('Missing required Stripe secret key');
}
const stripe = new Stripe(stripeSecretKey);

export async function registerRoutes(app: Express): Promise<Server> {
  // Fast health check endpoint (must be FIRST - no auth, no DB)
  app.get('/health', (_req, res) => {
    res.sendStatus(200);
  });

  // Setup authentication
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return; // requireUser already sent 401

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user Telegram chat ID
  app.patch("/api/user/telegram", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      // Only Pro users can configure Telegram
      if (user.subscriptionTier !== 'pro') {
        return res.status(403).json({ message: "Telegram alerts are only available for Pro users" });
      }

      const { telegramChatId } = req.body;

      // Allow null/empty to clear the Telegram Chat ID
      await storage.updateUser(user.id, {
        telegramChatId: telegramChatId || null,
      });

      // Clear the session cache so next request fetches fresh data
      if (req.user && (req.user as any).dbUser) {
        delete (req.user as any).dbUser;
      }

      const updatedUser = await storage.getUserById(user.id);
      res.json(updatedUser);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Stripe subscription routes (from blueprint:javascript_stripe)
  app.post("/api/stripe/create-checkout-session", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      // Create or get Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await trackApiCall('stripe', 'customers.create', async () => {
          return stripe.customers.create({
            email: user.email,
            metadata: { userId: user.id },
          });
        });
        await storage.updateStripeCustomer(user.id, customer.id);
        customerId = customer.id;
      }

      // Create checkout session for Pro subscription
      // Use test Price ID in development, live Price ID in production
      const priceId = process.env.NODE_ENV === 'development'
        ? process.env.TESTING_STRIPE_PRO_PRICE_ID
        : process.env.STRIPE_PRO_PRICE_ID;
      if (!priceId) {
        throw new Error(`${process.env.NODE_ENV === 'development' ? 'TESTING_STRIPE_PRO_PRICE_ID' : 'STRIPE_PRO_PRICE_ID'} environment variable is not set`);
      }

      const session = await trackApiCall('stripe', 'checkout.sessions.create', async () => {
        return stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{
            price: priceId,
            quantity: 1,
          }],
          mode: 'subscription',
          success_url: `${req.headers.origin || 'http://localhost:5000'}/subscription?success=true`,
          cancel_url: `${req.headers.origin || 'http://localhost:5000'}/subscription?canceled=true`,
          metadata: {
            userId: user.id,
          },
        });
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe checkout error:", error);
      res.status(500).json({ message: "Failed to create checkout session: " + error.message });
    }
  });

  app.post("/api/stripe/create-portal-session", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      if (!user.stripeCustomerId) {
        return res.status(400).json({ message: "No Stripe customer found" });
      }

      const session = await trackApiCall('stripe', 'billingPortal.sessions.create', async () => {
        return stripe.billingPortal.sessions.create({
          customer: user.stripeCustomerId!,
          return_url: `${req.headers.origin || 'http://localhost:5000'}/subscription`,
        });
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe portal error:", error);
      res.status(500).json({ message: "Failed to create portal session: " + error.message });
    }
  });

  app.post("/api/stripe/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      return res.status(400).send('No signature');
    }

    let event: Stripe.Event;
    try {
      // For webhook validation, you'll need STRIPE_WEBHOOK_SECRET in production
      // For now, we'll trust the event in dev
      event = req.body;
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          if (userId && session.subscription) {
            await storage.updateStripeSubscription(
              userId,
              session.subscription as string,
              'active'
            );
            await storage.upgradeToPro(userId);
          }
          break;
        }
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const customer = await trackApiCall('stripe', 'customers.retrieve', async () => {
            return stripe.customers.retrieve(subscription.customer as string);
          });
          if ('metadata' in customer && customer.metadata?.userId) {
            const currentPeriodEnd = (subscription as any).current_period_end
              ? new Date((subscription as any).current_period_end * 1000)
              : undefined;
            await storage.updateStripeSubscription(
              customer.metadata.userId,
              subscription.id,
              subscription.status,
              currentPeriodEnd
            );
            if (subscription.status === 'active') {
              await storage.upgradeToPro(customer.metadata.userId);
            }
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customer = await trackApiCall('stripe', 'customers.retrieve', async () => {
            return stripe.customers.retrieve(subscription.customer as string);
          });
          if ('metadata' in customer && customer.metadata?.userId) {
            await storage.cancelSubscription(customer.metadata.userId);
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook handler error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Scheduler and global settings now initialized in startBackgroundTasks() after server.listen()

  // Mount domain routers
  app.use(watchlistRouter);
  app.use(marketRouter);
  app.use(portfoliosRouter);
  app.use(scannerRouter);
  app.use(alertsRouter);
  app.use(settingsRouter);
  app.use(adminRouter);

  // Position routes (pre-login preview enabled)
  app.get("/api/positions", optionalAuth, async (req: any, res) => {
    try {
      const userId = await getEffectiveUserId(req);
      const status = req.query.status as string | undefined;
      const positions = await storage.getPositions(userId, status);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json(positions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PnL calculation endpoint - MUST come before /api/positions/:id to avoid route conflicts
  // Get ticker prices for positions (pre-login preview enabled)
  // Accepts status query parameter: ?status=open or ?status=order or both (default: both)
  app.get("/api/positions/ticker-prices", optionalAuth, async (req: any, res) => {
    try {
      const userId = await getEffectiveUserId(req);

      // Parse status parameter - can be array or single value
      // Default: both open and pending orders
      const statusParam = req.query.status;
      let statuses: ('open' | 'order' | 'closed')[] = ['open', 'order'];

      if (statusParam) {
        if (Array.isArray(statusParam)) {
          statuses = statusParam;
        } else if (statusParam === 'both') {
          statuses = ['open', 'order'];
        } else {
          statuses = [statusParam as 'open' | 'order' | 'closed'];
        }
      }

      // Fetch positions for all requested statuses
      const positionsPromises = statuses.map(status =>
        storage.getPositions(userId, status)
      );
      const positionsArrays = await Promise.all(positionsPromises);
      const positions = positionsArrays.flat();

      if (positions.length === 0) {
        return res.json({ prices: {}, lastUpdated: new Date().toISOString() });
      }

      // Get unique symbols
      const symbols = Array.from(new Set(positions.map(p => p.symbol)));

      // Fetch prices using cache (60s TTL)
      const pricesMap = await priceCacheService.getPrices(symbols, 60 * 1000);

      // Convert to object map
      const prices: Record<string, number | null> = {};
      pricesMap.forEach((price, symbol) => {
        prices[symbol] = price;
      });

      res.json({
        prices,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error fetching ticker prices:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/positions/pnl", optionalAuth, async (req: any, res) => {
    try {
      const userId = await getEffectiveUserId(req);
      const status = (req.query.status as string) || 'open';
      const positions = await storage.getPositions(userId, status);

      if (positions.length === 0) {
        return res.json({ positions: [], lastUpdated: new Date().toISOString() });
      }

      // Separate Tiger positions from manual positions
      const tigerPositions = positions.filter(p => p.dataSource === 'tiger');
      const manualPositions = positions.filter(p => p.dataSource !== 'tiger');

      // For Tiger positions, use their stored data directly
      const tigerPnlResults = tigerPositions.map(pos => {
        // For Tiger positions, use their unrealized PL and market value
        const pnlCents = pos.tigerUnrealizedPlCents || 0;

        // Tiger's marketValue is total position value across all contracts (e.g., -$2008 for 4 contracts)
        // Convert to per-contract price: divide by 100 (shares per contract) and by number of contracts
        const contracts = pos.contracts || 1;
        const currentCostCents = pos.tigerMarketValueCents !== null
          ? Math.round(Math.abs(pos.tigerMarketValueCents) / 100 / contracts)
          : null;

        // Calculate percentage based on strategy type
        // Tiger's pnlCents is for the TOTAL position (all contracts)
        // Entry credit/debit is per contract, so multiply by contracts
        let pnlPercent = 0;
        if (pos.strategyType === 'LEAPS') {
          const totalEntryDebitCents = (pos.entryDebitCents || 0) * contracts;
          // Both values are in cents, so the ratio is already the percentage
          pnlPercent = totalEntryDebitCents > 0 ? (pnlCents / totalEntryDebitCents) : 0;
        } else {
          const totalEntryCreditCents = (pos.entryCreditCents || 0) * contracts;
          // Both values are in cents, so the ratio is already the percentage
          pnlPercent = totalEntryCreditCents > 0 ? (pnlCents / totalEntryCreditCents) : 0;
        }

        return {
          positionId: pos.id,
          symbol: pos.symbol,
          entryCreditCents: pos.entryCreditCents,
          currentCostCents,
          pnlCents,
          pnlPercent: parseFloat(pnlPercent.toFixed(1)),
          dataSource: 'tiger'
        };
      });

      // Group manual positions by (symbol, expiry) to batch API calls
      const positionGroups: Record<string, typeof manualPositions> = {};
      for (const pos of manualPositions) {
        const key = `${pos.symbol}_${pos.expiry}`;
        if (!positionGroups[key]) positionGroups[key] = [];
        positionGroups[key].push(pos);
      }

      // Fetch option chains for each unique (symbol, expiry) in parallel
      const optionChainCache: Record<string, any[]> = {};
      await Promise.all(
        Object.keys(positionGroups).map(async (key) => {
          const [symbol, expiryStr] = key.split('_');
          try {
            const expiryDate = new Date(expiryStr);
            const chain = await priceCacheService.getOptionChain(symbol, expiryDate);
            optionChainCache[key] = chain;
          } catch (error) {
            console.error(`Error fetching option chain for ${symbol} ${expiryStr}:`, error);
            optionChainCache[key] = [];
          }
        })
      );

      // Calculate PnL for each manual position using Polygon data
      const manualPnlResults = manualPositions.map(pos => {
        const key = `${pos.symbol}_${pos.expiry}`;
        const chain = optionChainCache[key] || [];

        if (pos.strategyType === 'LEAPS') {
          // For LEAPS, just get the single option price
          const option = chain.find(opt =>
            opt.type === pos.type.toLowerCase() &&
            Math.abs(opt.strike - pos.shortStrike) < 0.01
          );

          if (!option) {
            return {
              positionId: pos.id,
              symbol: pos.symbol,
              entryCreditCents: pos.entryCreditCents,
              currentCostCents: null,
              pnlCents: null,
              pnlPercent: null,
              error: 'Option price not found for LEAPS'
            };
          }

          const currentMid = (option.bid + option.ask) / 2;
          if (currentMid === 0) {
            return {
              positionId: pos.id,
              symbol: pos.symbol,
              entryCreditCents: pos.entryCreditCents,
              currentCostCents: null,
              pnlCents: null,
              pnlPercent: null,
              error: 'Current quotes unavailable for LEAPS'
            };
          }

          const currentValueCents = Math.round(currentMid * 100);
          const entryDebitCents = pos.entryDebitCents || 0;

          // P&L for LEAPS = Current Value - Entry Debit
          const pnlCents = currentValueCents - entryDebitCents;
          const pnlPercent = entryDebitCents > 0
            ? ((pnlCents / entryDebitCents) * 100).toFixed(1)
            : '0.0';

          return {
            positionId: pos.id,
            symbol: pos.symbol,
            entryCreditCents: pos.entryCreditCents,
            currentCostCents: currentValueCents,
            pnlCents,
            pnlPercent: parseFloat(pnlPercent),
          };
        } else if (pos.strategyType === 'IRON_CONDOR') {
          // For Iron Condor, calculate both PUT and CALL spreads
          const putShortLeg = chain.find(opt =>
            opt.type === 'put' && Math.abs(opt.strike - pos.shortStrike) < 0.01
          );
          const putLongLeg = chain.find(opt =>
            opt.type === 'put' && Math.abs(opt.strike - (pos.longStrike || 0)) < 0.01
          );
          const callShortLeg = chain.find(opt =>
            opt.type === 'call' && Math.abs(opt.strike - (pos.callShortStrike || 0)) < 0.01
          );
          const callLongLeg = chain.find(opt =>
            opt.type === 'call' && Math.abs(opt.strike - (pos.callLongStrike || 0)) < 0.01
          );

          if (!putShortLeg || !putLongLeg || !callShortLeg || !callLongLeg) {
            return {
              positionId: pos.id,
              symbol: pos.symbol,
              entryCreditCents: pos.entryCreditCents,
              currentCostCents: null,
              pnlCents: null,
              pnlPercent: null,
              error: 'Option prices not found for Iron Condor'
            };
          }

          // Calculate mid-prices for all four legs
          const putShortMid = (putShortLeg.bid + putShortLeg.ask) / 2;
          const putLongMid = (putLongLeg.bid + putLongLeg.ask) / 2;
          const callShortMid = (callShortLeg.bid + callShortLeg.ask) / 2;
          const callLongMid = (callLongLeg.bid + callLongLeg.ask) / 2;

          // Validate quotes
          if (putShortMid === 0 || putLongMid === 0 || callShortMid === 0 || callLongMid === 0) {
            return {
              positionId: pos.id,
              symbol: pos.symbol,
              entryCreditCents: pos.entryCreditCents,
              currentCostCents: null,
              pnlCents: null,
              pnlPercent: null,
              error: 'Current quotes unavailable for Iron Condor'
            };
          }

          // Current cost to buy back both spreads - use signed differences like credit spread logic
          // For credit spreads, we sold short and bought long, so cost = shortMid - longMid
          const putSpreadCost = putShortMid - putLongMid;
          const callSpreadCost = callShortMid - callLongMid;
          const currentCostPerShare = putSpreadCost + callSpreadCost;
          const currentCostCents = Math.round(currentCostPerShare * 100);

          // P&L = Entry Credit - Current Cost
          const entryCreditCents = pos.entryCreditCents || 0;
          const pnlCents = entryCreditCents - currentCostCents;
          const pnlPercent = entryCreditCents > 0
            ? ((pnlCents / entryCreditCents) * 100).toFixed(1)
            : '0.0';

          return {
            positionId: pos.id,
            symbol: pos.symbol,
            entryCreditCents: pos.entryCreditCents,
            currentCostCents,
            pnlCents,
            pnlPercent: parseFloat(pnlPercent),
          };
        } else {
          // Covered call: single-leg short call linked to a LEAPS (no long leg)
          const isCoveredCall = pos.strategyType === 'COVERED_CALL' || (!!pos.linkedPositionId && (!pos.longStrike || pos.longStrike === pos.shortStrike));
          if (isCoveredCall) {
            const shortLeg = chain.find(opt =>
              opt.type === 'call' &&
              Math.abs(opt.strike - pos.shortStrike) < 0.01
            );
            if (!shortLeg || (shortLeg.bid === 0 && shortLeg.ask === 0)) {
              return {
                positionId: pos.id,
                symbol: pos.symbol,
                entryCreditCents: pos.entryCreditCents,
                currentCostCents: null,
                pnlCents: null,
                pnlPercent: null,
                error: 'Short call price not found in chain'
              };
            }
            const shortMid = (shortLeg.bid + shortLeg.ask) / 2;
            const currentMidCents = Math.round(shortMid * 100);
            const entryCreditCents = pos.entryCreditCents || 0;
            // Short call: P&L per share = credit received - current cost to buy back
            // Positive when call price drops (good for seller), negative when it rises
            const pnlCents = entryCreditCents - currentMidCents;
            const pnlPercent = entryCreditCents > 0
              ? ((pnlCents / entryCreditCents) * 100)
              : 0;
            return {
              positionId: pos.id,
              symbol: pos.symbol,
              entryCreditCents: pos.entryCreditCents,
              currentCostCents: currentMidCents,
              pnlCents,
              pnlPercent: parseFloat(pnlPercent.toFixed(1)),
              dataSource: 'polygon'
            };
          }

          // Regular two-legged credit spread logic
          const shortLeg = chain.find(opt =>
            opt.type === pos.type.toLowerCase() &&
            Math.abs(opt.strike - pos.shortStrike) < 0.01
          );
          const longLeg = chain.find(opt =>
            opt.type === pos.type.toLowerCase() &&
            Math.abs(opt.strike - (pos.longStrike || 0)) < 0.01
          );

          if (!shortLeg || !longLeg) {
            return {
              positionId: pos.id,
              symbol: pos.symbol,
              entryCreditCents: pos.entryCreditCents,
              currentCostCents: null,
              pnlCents: null,
              pnlPercent: null,
              error: 'Option prices not found in chain'
            };
          }

          // Calculate mid-prices from bid/ask
          const shortMid = (shortLeg.bid + shortLeg.ask) / 2;
          const longMid = (longLeg.bid + longLeg.ask) / 2;

          // Validate that we have real quotes (not defaulted to 0)
          if (shortMid === 0 || longMid === 0) {
            return {
              positionId: pos.id,
              symbol: pos.symbol,
              entryCreditCents: pos.entryCreditCents,
              currentCostCents: null,
              pnlCents: null,
              pnlPercent: null,
              error: 'Current quotes unavailable'
            };
          }

          // Current spread cost (per share): what it costs to buy back the spread
          // For credit spread: cost = longLeg - shortLeg (we're long the further strike, short the closer)
          const currentCostPerShare = Math.abs(longMid - shortMid);
          const currentCostCents = Math.round(currentCostPerShare * 100);

          // P&L = Entry Credit - Current Cost (both per contract)
          const entryCreditCents = pos.entryCreditCents || 0;
          const pnlCents = entryCreditCents - currentCostCents;
          const pnlPercent = entryCreditCents > 0
            ? ((pnlCents / entryCreditCents) * 100).toFixed(1)
            : '0.0';

          return {
            positionId: pos.id,
            symbol: pos.symbol,
            entryCreditCents: pos.entryCreditCents,
            currentCostCents,
            pnlCents,
            pnlPercent: parseFloat(pnlPercent),
            dataSource: 'polygon'
          };
        }
      });

      // Combine Tiger and manual results
      const allResults = [...tigerPnlResults, ...manualPnlResults];

      // Build PMCC premium map: for each LEAPS id, track live P&L of its open covered calls
      // ECB = LEAPS entry cost - CC current P&L (mark-to-market, not just entry credit)
      // ECB only exists while a CC is open; disappears when no CC is linked
      const pmccPremiumMap = new Map<string, number>();
      const pnlByPositionId = new Map(allResults.map((r: any) => [r.positionId, r]));
      for (const pos of positions) {
        if (pos.strategyType === 'COVERED_CALL') {
          const pnlResult = pnlByPositionId.get(pos.id);
          if (pnlResult?.pnlCents !== null && pnlResult?.pnlCents !== undefined) {
            // Tiger: pnlCents is already the total across all contracts
            // Manual/Polygon: pnlCents is per share, multiply by contracts
            const totalPnl = pnlResult.dataSource === 'tiger'
              ? pnlResult.pnlCents
              : pnlResult.pnlCents * (pos.contracts ?? 1);
            pmccPremiumMap.set(
              pos.linkedPositionId,
              (pmccPremiumMap.get(pos.linkedPositionId) ?? 0) + totalPnl
            );
          }
        }
      }

      // Enrich with ZenStatus for each position
      const enrichedResults = await Promise.all(allResults.map(async (pnlResult: any) => {
        try {
          // Find the corresponding position object
          const position = positions.find(p => p.id === pnlResult.positionId);
          if (!position) return pnlResult;

          // Get current price for the ticker
          const prices = await priceCacheService.getPrices([position.symbol]);
          const currentPrice = prices.get(position.symbol) || null;

          // Create PositionWithPnL object — include PMCC premium context if applicable
          const positionWithPnL: PositionWithPnL = {
            ...position,
            currentPrice,
            pnlCents: pnlResult.pnlCents,
            pnlPercent: pnlResult.pnlPercent,
            ...(pmccPremiumMap.has(position.id) && {
              pmccPremiumCollectedCents: pmccPremiumMap.get(position.id)
            })
          };

          // Calculate ZenStatus
          const zenAnalysis = zenStatusService.calculateZenStatus(positionWithPnL);

          return {
            ...pnlResult,
            zenStatus: zenAnalysis.zenStatus,
            guidanceText: zenAnalysis.guidanceText,
            guidanceDetails: zenAnalysis.guidanceDetails,
            ...(pmccPremiumMap.has(position.id) && {
              pmccPremiumCollectedCents: pmccPremiumMap.get(position.id)
            })
          };
        } catch (error) {
          console.error(`Error calculating ZenStatus for position ${pnlResult.positionId}:`, error);
          // Return original result without ZenStatus if calculation fails
          return pnlResult;
        }
      }));

      res.json({
        positions: enrichedResults,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error calculating PnL:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // LEAPS option data endpoint - fetch current option price, greeks, and calculate extrinsic value (protected)
  app.get("/api/positions/:id/leaps-data", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const position = await storage.getPosition(user.id, req.params.id);
      if (!position) {
        return res.status(404).json({ message: "Position not found" });
      }

      if (position.strategyType !== 'LEAPS') {
        return res.status(400).json({ message: "Position is not a LEAPS position" });
      }

      // Fetch current stock price
      const quote = await marketDataService.getQuote(position.symbol);
      const stockPrice = quote.price;

      // Fetch option chain for the expiry date to get current option data
      const chain = await marketDataService.getOptionChain(position.symbol, position.expiry);

      // Find the specific option (CALL with matching strike)
      const option = chain.find(opt =>
        opt.type === position.type.toLowerCase() &&
        Math.abs(opt.strike - position.shortStrike) < 0.01
      );

      if (!option) {
        return res.status(404).json({
          message: 'Option data not found in chain',
          symbol: position.symbol,
          strike: position.shortStrike,
          expiry: position.expiry
        });
      }

      // Calculate mid-price from bid/ask
      const optionPrice = (option.bid + option.ask) / 2;

      // Calculate intrinsic value: max(0, Stock Price - Strike Price) for CALL
      const intrinsicValue = Math.max(0, stockPrice - position.shortStrike);

      // Calculate extrinsic value: Option Price - Intrinsic Value
      const extrinsicValue = optionPrice - intrinsicValue;

      // Get delta if available
      const currentDelta = option.delta || null;

      res.json({
        positionId: position.id,
        symbol: position.symbol,
        stockPrice,
        optionPrice,
        intrinsicValue,
        extrinsicValue,
        currentDelta,
        entryDelta: position.entryDelta,
        greeks: option.delta ? { delta: option.delta } : null,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error fetching LEAPS data:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/positions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const position = await storage.getPosition(user.id, req.params.id);
      if (!position) {
        return res.status(404).json({ message: "Position not found" });
      }
      res.json(position);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/positions", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;

      // Check tier limits for positions (count both 'open' and 'order' status)
      const openPositions = await storage.getPositions(user.id, 'open');
      const orderPositions = await storage.getPositions(user.id, 'order');
      const totalActivePositions = openPositions.length + orderPositions.length;
      const limitCheck = checkPositionLimit(user.subscriptionTier as SubscriptionTier, totalActivePositions);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.reason,
          limit: limitCheck.limit,
          current: limitCheck.current,
        });
      }

      const data = insertPositionSchema.parse(req.body);
      const position = await storage.createPosition(user.id, data);
      res.json(position);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/positions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const data = insertPositionSchema.partial().parse(req.body);
      const position = await storage.updatePosition(user.id, req.params.id, data);
      res.json(position);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/positions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      await storage.deletePosition(user.id, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Mirrors for environments that block DELETE (protected)
  app.post("/api/positions/:id/delete", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      await storage.deletePosition(user.id, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/positions/:id/delete", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      await storage.deletePosition(user.id, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/positions/:id/close", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const { exitCreditCents } = req.body;
      const position = await storage.closePosition(user.id, req.params.id, exitCreditCents);
      res.json(position);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // PMCC: Link a short call to a parent LEAPS position
  app.post("/api/positions/:id/link", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const { parentLeapsId } = req.body;
      if (!parentLeapsId) {
        return res.status(400).json({ message: "parentLeapsId is required" });
      }
      const position = await storage.linkPosition(user.id, req.params.id, parentLeapsId);
      res.json(position);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // PMCC: Unlink a short call from its parent LEAPS
  app.post("/api/positions/:id/unlink", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const position = await storage.unlinkPosition(user.id, req.params.id);
      res.json(position);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get positions linked to a LEAPS
  app.get("/api/positions/:id/linked", optionalAuth, async (req: any, res) => {
    try {
      const userId = await getEffectiveUserId(req);
      const linkedPositions = await storage.getLinkedPositions(userId, req.params.id);
      res.json(linkedPositions);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Tiger Brokers integration (protected)
  app.post("/api/positions/sync-tiger", isAuthenticated, async (req: any, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      console.log('🐯 Starting Tiger Brokers position sync...');

      // Get Tiger account number from external portfolio
      const portfolios = await storage.getPortfolios(user.id);
      const externalPortfolios = portfolios.filter(p => p.isExternal && p.accountNumber);

      if (externalPortfolios.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No external portfolio with account number found. Please add an external portfolio with your Tiger account number in the Profile page.'
        });
      }

      // Prefer "Annabels tiger" portfolio, otherwise use the first external portfolio
      const tigerPortfolio = externalPortfolios.find(p => p.name.toLowerCase().includes('annabel')) || externalPortfolios[0];
      const tigerAccountNumber = tigerPortfolio.accountNumber || undefined;

      console.log(`📋 Using account ${tigerAccountNumber} from portfolio "${tigerPortfolio.name}"`);

      // Check if credentials are configured
      if (!tigerBrokersService.isConfigured(tigerAccountNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Tiger Brokers API credentials not configured. Please add TIGER_ID and TIGER_PRIVATE_KEY to your secrets.'
        });
      }

      // Fetch positions from Tiger
      const tigerResponse = await tigerBrokersService.fetchPositions(tigerAccountNumber!);

      if (!tigerResponse.success) {
        return res.status(500).json({
          success: false,
          message: tigerResponse.error || 'Failed to fetch positions from Tiger Brokers'
        });
      }

      // Update portfolio with account information if available
      if (tigerResponse.accountInfo) {
        await storage.updatePortfolio(user.id, tigerPortfolio.id, {
          cashBalance: tigerResponse.accountInfo.cashBalance,
          totalValue: tigerResponse.accountInfo.totalValue,
          buyingPower: tigerResponse.accountInfo.buyingPower,
          accountType: tigerResponse.accountInfo.accountType,
          lastSyncedAt: new Date(),
        });
        const totalValue = tigerResponse.accountInfo.totalValue ?? 0;
        console.log(`💰 Updated portfolio with account info: $${totalValue.toFixed(2)} total value`);
      }

      // Use the external portfolio we found earlier for syncing
      // (already has the tigerPortfolio variable from above)

      // Map positions to our schema
      const mappedPositions = tigerPositionMapper.mapPositions(tigerResponse.positions || []);

      // Get ALL open positions to match against (not just Tiger-sourced ones)
      // This prevents duplicates when a position was manually created before syncing
      const allPositions = await storage.getPositions(user.id, 'open');
      const tigerPositions = allPositions;

      console.log(`📊 Found ${tigerPositions.length} existing Tiger positions in DB`);
      if (tigerPositions.length > 0) {
        console.log(`   First existing: ${tigerPositions[0].symbol} ${tigerPositions[0].strategyType} strikes: ${tigerPositions[0].shortStrike}/${tigerPositions[0].longStrike}`);
      }

      // Import/update positions
      const imported = [];
      const updated = [];
      const errors = [];

      for (const mappedPos of mappedPositions) {
        try {
          console.log(`🔍 Matching ${mappedPos.symbol} ${mappedPos.strategyType} strikes: ${mappedPos.shortStrike}/${mappedPos.longStrike} expiry: ${mappedPos.expiry?.toISOString().split('T')[0]}`);

          // Find existing Tiger position matching this position
          // Only match against positions that were previously imported from Tiger
          const existingPosition = tigerPositions.find(existing => {
            console.log(`   Comparing against DB: ${existing.symbol} ${existing.strategyType} strikes: ${existing.shortStrike}/${existing.longStrike} expiry: ${existing.expiry?.toISOString().split('T')[0]}`);

            if (existing.symbol !== mappedPos.symbol) {
              console.log(`   ❌ Symbol mismatch: ${existing.symbol} !== ${mappedPos.symbol}`);
              return false;
            }
            if (existing.expiry?.toISOString().split('T')[0] !== mappedPos.expiry?.toISOString().split('T')[0]) {
              console.log(`   ❌ Expiry mismatch: ${existing.expiry?.toISOString().split('T')[0]} !== ${mappedPos.expiry?.toISOString().split('T')[0]}`);
              return false;
            }
            if (existing.strategyType !== mappedPos.strategyType) {
              console.log(`   ❌ Strategy mismatch: ${existing.strategyType} !== ${mappedPos.strategyType}`);
              return false;
            }

            // Check strikes based on strategy type
            // Use Number() to handle integer vs float comparison (e.g., 885 vs 885.0)
            if (mappedPos.strategyType === 'IRON_CONDOR') {
              const matches = Number(existing.shortStrike) === Number(mappedPos.shortStrike) &&
                     Number(existing.longStrike) === Number(mappedPos.longStrike) &&
                     Number(existing.callShortStrike) === Number(mappedPos.callShortStrike) &&
                     Number(existing.callLongStrike) === Number(mappedPos.callLongStrike);
              console.log(`   IC strikes match? ${matches} (${existing.shortStrike}/${existing.longStrike}/${existing.callShortStrike}/${existing.callLongStrike} vs ${mappedPos.shortStrike}/${mappedPos.longStrike}/${mappedPos.callShortStrike}/${mappedPos.callLongStrike})`);
              return matches;
            } else if (mappedPos.strategyType === 'CREDIT_SPREAD') {
              const strikesMatch = Number(existing.shortStrike) === Number(mappedPos.shortStrike) &&
                     Number(existing.longStrike) === Number(mappedPos.longStrike);
              const typeMatch = existing.type === mappedPos.type;
              console.log(`   CS strikes match? ${strikesMatch} (${existing.shortStrike}/${existing.longStrike} vs ${mappedPos.shortStrike}/${mappedPos.longStrike}), type match? ${typeMatch} (${existing.type} vs ${mappedPos.type})`);
              return strikesMatch && typeMatch;
            } else if (mappedPos.strategyType === 'LEAPS') {
              const strikesMatch = Number(existing.shortStrike) === Number(mappedPos.shortStrike);
              const typeMatch = existing.type === mappedPos.type;
              console.log(`   LEAPS strike match? ${strikesMatch} (${existing.shortStrike} vs ${mappedPos.shortStrike}), type match? ${typeMatch} (${existing.type} vs ${mappedPos.type})`);
              return strikesMatch && typeMatch;
            }

            console.log(`   ❌ Unknown strategy type: ${mappedPos.strategyType}`);
            return false;
          });

          if (existingPosition) {
            console.log(`   ✅ MATCH FOUND! Updating position ${existingPosition.id}`);
            // Update existing position with Tiger data
            const updateData: any = {
              portfolioId: tigerPortfolio.id, // Move to Tiger portfolio if it wasn't already
              tigerUnrealizedPlCents: mappedPos.tigerUnrealizedPlCents,
              tigerMarketValueCents: mappedPos.tigerMarketValueCents,
              dataSource: 'tiger',
              // Update contracts if Tiger has different quantity
              ...(mappedPos.contracts && { contracts: mappedPos.contracts }),
            };

            const position = await storage.updatePosition(user.id, existingPosition.id, updateData);
            updated.push(position);
            console.log(`🔄 Updated ${position.symbol} ${position.strategyType} with Tiger data`);
          } else {
            console.log(`   ❌ NO MATCH - Creating new position`);

            // Create new position
            const positionData = {
              ...mappedPos,
              portfolioId: tigerPortfolio.id,
            };

            // Remove tigerData before inserting (not part of schema)
            const { tigerData, ...insertData } = positionData as any;

            const position = await storage.createPosition(user.id, insertData);
            imported.push(position);
            console.log(`✅ Imported new ${position.symbol} ${position.strategyType}`);
          }
        } catch (error: any) {
          console.error(`❌ Error importing/updating position:`, error);
          errors.push({
            symbol: mappedPos.symbol,
            error: error.message
          });
        }
      }

      // Detect positions that were closed in Tiger (no longer in response but still open in DB)
      const closedInTiger = [];
      for (const existingPos of tigerPositions) {
        // Check if this position was updated in this sync
        const wasUpdated = updated.some(u => u.id === existingPos.id);
        if (!wasUpdated) {
          // Position exists in DB but not in Tiger response - it was closed
          console.log(`📕 Position closed in Tiger: ${existingPos.symbol} ${existingPos.strategyType}`);
          closedInTiger.push(existingPos);
        }
      }

      console.log(`🎉 Tiger sync complete: ${imported.length} new, ${updated.length} updated, ${closedInTiger.length} closed in Tiger, ${errors.length} errors`);

      res.json({
        success: true,
        imported: imported.length,
        updated: updated.length,
        closedInTiger: closedInTiger.length,
        closedPositions: closedInTiger.map(p => ({ id: p.id, symbol: p.symbol, strategyType: p.strategyType })),
        errors: errors.length,
        errorDetails: errors.length > 0 ? errors : undefined,
        positions: [...imported, ...updated]
      });

    } catch (error: any) {
      console.error('Tiger sync error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to sync positions from Tiger Brokers'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Background tasks that should run after server starts (non-blocking)
export function startBackgroundTasks() {
  setImmediate(async () => {
    try {
      // 1. Initialize global settings first
      console.log("🚀 Initializing global settings...");
      await initializeGlobalSettings();

      // 2. Start price cache service
      console.log("🚀 Starting price cache service...");
      priceCacheService.start();

      // 3. Start scheduler (needs settings to be initialized)
      console.log("🚀 Starting scheduler service...");
      await schedulerService.startScheduler();

      // 4. Seed demo data for pre-login preview (development only for now)
      if (process.env.NODE_ENV === 'development') {
        console.log("🚀 Seeding demo data for pre-login preview...");
        const { seedAllDemoData } = await import("./seedDemoData");
        await seedAllDemoData();
      } else {
        console.log("⏭️  Skipping demo data seeding in production (will enable after testing)");
      }

      console.log("✅ All background tasks completed successfully");
    } catch (error) {
      console.error("⚠️  Background tasks failed:", error);
      // Non-fatal - app can still run for authenticated users
    }
  });
}
