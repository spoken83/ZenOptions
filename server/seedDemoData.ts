import { db } from "./db";
import { users, portfolios, watchlist, positions, scanResults, tickers } from "@shared/schema";
import { 
  DEMO_USER_ID, 
  DEMO_USER_AUTH0_ID, 
  DEMO_USER_EMAIL, 
  DEMO_USER_NAME,
  DEMO_PORTFOLIO_NAME,
  DEMO_PORTFOLIO_INITIAL_VALUE,
  DEMO_WATCHLIST_STOCKS,
  DEMO_WATCHLIST_INDEXES 
} from "@shared/constants";
import demoPositionsData from "./demo-positions.json";
import { eq, sql } from "drizzle-orm";

export async function seedDemoUser() {
  console.log("🌱 Seeding demo user...");
  
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.id, DEMO_USER_ID));

  if (existingUser.length > 0) {
    console.log("✅ Demo user already exists");
    return existingUser[0];
  }

  const [demoUser] = await db
    .insert(users)
    .values({
      id: DEMO_USER_ID,
      auth0UserId: DEMO_USER_AUTH0_ID,
      email: DEMO_USER_EMAIL,
      name: DEMO_USER_NAME,
      subscriptionTier: "pro",
      subscriptionStatus: "active",
      isActive: true,
    })
    .returning();

  console.log(`✅ Demo user created: ${demoUser.email}`);
  return demoUser;
}

export async function seedDemoPortfolio() {
  console.log("🌱 Seeding demo portfolio...");
  
  const existingPortfolio = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, DEMO_USER_ID));

  if (existingPortfolio.length > 0) {
    console.log("✅ Demo portfolio already exists");
    return existingPortfolio[0];
  }

  const [demoPortfolio] = await db
    .insert(portfolios)
    .values({
      userId: DEMO_USER_ID,
      name: DEMO_PORTFOLIO_NAME,
      description: "Demo portfolio showcasing Zen Options capabilities",
      cashBalance: DEMO_PORTFOLIO_INITIAL_VALUE,
      totalValue: DEMO_PORTFOLIO_INITIAL_VALUE,
      isExternal: false,
    })
    .returning();

  console.log(`✅ Demo portfolio created: ${demoPortfolio.name}`);
  return demoPortfolio;
}

export async function seedDemoWatchlist() {
  console.log("🌱 Seeding demo watchlist...");
  
  const existingWatchlist = await db
    .select()
    .from(watchlist)
    .where(eq(watchlist.userId, DEMO_USER_ID));

  if (existingWatchlist.length > 0) {
    console.log(`✅ Demo watchlist already exists (${existingWatchlist.length} tickers)`);
    return;
  }

  const stockTickers = DEMO_WATCHLIST_STOCKS.map(symbol => ({
    userId: DEMO_USER_ID,
    symbol,
    type: "stock" as const,
    active: true,
  }));

  const indexTickers = DEMO_WATCHLIST_INDEXES.map(symbol => ({
    userId: DEMO_USER_ID,
    symbol,
    type: "index" as const,
    active: true,
  }));

  const allTickers = [...stockTickers, ...indexTickers];
  
  await db.insert(watchlist).values(allTickers);

  console.log(`✅ Demo watchlist created (${allTickers.length} tickers)`);
}

export async function seedDemoTickers() {
  console.log("🌱 Seeding demo ticker configurations...");
  
  const existingTickers = await db
    .select()
    .from(tickers)
    .where(eq(tickers.userId, DEMO_USER_ID));

  if (existingTickers.length > 0) {
    console.log(`✅ Demo tickers already exist (${existingTickers.length} tickers)`);
    return;
  }

  const tickerConfigs = [
    { symbol: "AAPL", support: 220, resistance: 245 },
    { symbol: "MSFT", support: 410, resistance: 440 },
    { symbol: "AMZN", support: 185, resistance: 210 },
    { symbol: "META", support: 560, resistance: 620 },
    { symbol: "GOOG", support: 165, resistance: 185 },
    { symbol: "UNH", support: 580, resistance: 630 },
    { symbol: "JPM", support: 210, resistance: 235 },
    { symbol: "COST", support: 890, resistance: 950 },
    { symbol: "SPY", support: null, resistance: null },
    { symbol: "QQQ", support: null, resistance: null },
    { symbol: "IWM", support: null, resistance: null },
  ];

  const tickerValues = tickerConfigs.map(config => ({
    userId: DEMO_USER_ID,
    symbol: config.symbol,
    deltaMin: 0.20,
    deltaMax: 0.35,
    supportLevel: config.support,
    resistanceLevel: config.resistance,
  }));
  
  await db.insert(tickers).values(tickerValues);

  console.log(`✅ Demo ticker configurations created (${tickerValues.length} tickers)`);
}

export async function seedDemoPositions(portfolioId: string) {
  console.log("🌱 Seeding demo positions...");
  
  const existingPositions = await db
    .select()
    .from(positions)
    .where(eq(positions.userId, DEMO_USER_ID));

  if (existingPositions.length > 0) {
    console.log(`✅ Demo positions already exist (${existingPositions.length} positions)`);
    return;
  }

  const allPositions = [
    ...demoPositionsData.openPositions.map(pos => ({
      ...pos,
      userId: DEMO_USER_ID,
      portfolioId,
      status: "open" as const,
      expiry: new Date(pos.expiry),
      entryDt: new Date(pos.entryDt),
      closedAt: null,
      exitCreditCents: null,
      exitDebitCents: null,
    })),
    ...demoPositionsData.pendingOrders.map(pos => ({
      ...pos,
      userId: DEMO_USER_ID,
      portfolioId,
      expiry: new Date(pos.expiry),
      entryDt: new Date(pos.entryDt),
      closedAt: null,
      exitCreditCents: null,
      exitDebitCents: null,
    })),
    ...demoPositionsData.closedPositions.map(pos => ({
      ...pos,
      userId: DEMO_USER_ID,
      portfolioId,
      expiry: new Date(pos.expiry),
      entryDt: new Date(pos.entryDt),
      closedAt: pos.closedAt ? new Date(pos.closedAt) : null,
    })),
  ];

  await db.insert(positions).values(allPositions);

  console.log(`✅ Demo positions created (${allPositions.length} positions)`);
  console.log(`   - Open: ${demoPositionsData.openPositions.length}`);
  console.log(`   - Pending: ${demoPositionsData.pendingOrders.length}`);
  console.log(`   - Closed: ${demoPositionsData.closedPositions.length}`);
}

export async function seedDemoScanResults() {
  console.log("🌱 Seeding demo scan results...");
  
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Delete old demo scan results (older than 7 days) to keep data fresh
  const deletedOld = await db
    .delete(scanResults)
    .where(
      sql`${scanResults.userId} = ${DEMO_USER_ID} AND ${scanResults.asof} < ${sevenDaysAgo}`
    );
  
  if (deletedOld.rowCount && deletedOld.rowCount > 0) {
    console.log(`🗑️  Deleted ${deletedOld.rowCount} old demo scan results`);
  }
  
  const existingRecent = await db
    .select()
    .from(scanResults)
    .where(
      sql`${scanResults.userId} = ${DEMO_USER_ID} AND ${scanResults.asof} >= ${sevenDaysAgo}`
    );

  if (existingRecent.length > 0) {
    console.log(`✅ Demo scan results already exist (${existingRecent.length} recent results)`);
    return;
  }

  const batchId = `demo-scan-${Date.now()}`;
  const today = new Date();

  const demoScanData = [
    {
      userId: DEMO_USER_ID,
      batchId,
      symbol: "AAPL",
      asof: today,
      status: "qualified" as const,
      reason: null,
      expiry: new Date("2025-11-21"),
      shortStrike: 225,
      longStrike: 220,
      width: 5,
      delta: 0.28,
      creditMidCents: 125,
      dte: 45,
      rr: 2.5,
      maxLossCents: 375,
      oi: 850,
      baCents: 8,
      score: 92,
      signal: "BULLISH_SUPPORT",
    },
    {
      userId: DEMO_USER_ID,
      batchId,
      symbol: "MSFT",
      asof: today,
      status: "qualified" as const,
      reason: null,
      expiry: new Date("2025-12-19"),
      shortStrike: 415,
      longStrike: 410,
      width: 5,
      delta: 0.25,
      creditMidCents: 135,
      dte: 73,
      rr: 2.7,
      maxLossCents: 365,
      oi: 1200,
      baCents: 10,
      score: 88,
      signal: "BULLISH_SUPPORT",
    },
    {
      userId: DEMO_USER_ID,
      batchId,
      symbol: "SPY",
      asof: today,
      status: "qualified" as const,
      reason: null,
      expiry: new Date("2025-11-14"),
      shortStrike: 585,
      longStrike: 580,
      width: 5,
      delta: 0.30,
      creditMidCents: 115,
      dte: 38,
      rr: 2.3,
      maxLossCents: 385,
      oi: 5500,
      baCents: 5,
      score: 95,
      signal: "NEUTRAL_RANGE",
    },
    {
      userId: DEMO_USER_ID,
      batchId,
      symbol: "META",
      asof: today,
      status: "no_qualified_spread" as const,
      reason: "Signal detected but no qualifying spread met criteria",
      expiry: null,
      shortStrike: null,
      longStrike: null,
      width: null,
      delta: null,
      creditMidCents: null,
      dte: null,
      rr: null,
      maxLossCents: null,
      oi: null,
      baCents: null,
      score: null,
      signal: "BEARISH_RESISTANCE",
    },
    {
      userId: DEMO_USER_ID,
      batchId,
      symbol: "GOOG",
      asof: today,
      status: "qualified" as const,
      reason: null,
      expiry: new Date("2025-12-05"),
      shortStrike: 175,
      longStrike: 170,
      width: 5,
      delta: 0.27,
      creditMidCents: 120,
      dte: 59,
      rr: 2.4,
      maxLossCents: 380,
      oi: 920,
      baCents: 12,
      score: 85,
      signal: "BEARISH_RESISTANCE",
    },
    {
      userId: DEMO_USER_ID,
      batchId,
      symbol: "QQQ",
      asof: today,
      status: "qualified" as const,
      reason: null,
      expiry: new Date("2025-11-28"),
      shortStrike: 495,
      longStrike: 490,
      width: 5,
      delta: 0.29,
      creditMidCents: 130,
      dte: 52,
      rr: 2.6,
      maxLossCents: 370,
      oi: 8200,
      baCents: 6,
      score: 90,
      signal: "NEUTRAL_RANGE",
    },
  ];

  await db.insert(scanResults).values(demoScanData);

  console.log(`✅ Demo scan results created (${demoScanData.length} results)`);
}

export async function seedAllDemoData() {
  console.log("\n🚀 Starting demo data seeding...\n");
  
  try {
    await seedDemoUser();
    const portfolio = await seedDemoPortfolio();
    await seedDemoWatchlist();
    await seedDemoTickers();
    await seedDemoPositions(portfolio.id);
    await seedDemoScanResults();
    
    console.log("\n✅ Demo data seeding completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Error seeding demo data:", error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAllDemoData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
