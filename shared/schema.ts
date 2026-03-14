import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (for Replit Auth) - MUST BE FIRST
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  })
);

// Users table (for multi-tenant SaaS) - MUST BE FIRST since other tables reference it
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auth0UserId: text("auth0_user_id").unique().notNull(),
  email: text("email").unique().notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  subscriptionStatus: text("subscription_status").default("active"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  dailyScanCount: integer("daily_scan_count").notNull().default(0),
  lastScanDate: timestamp("last_scan_date"),
  telegramChatId: text("telegram_chat_id"),
  tigerAccountNumber: text("tiger_account_number"),
  tigerIdEncrypted: text("tiger_id_encrypted"),
  tigerPrivateKeyEncrypted: text("tiger_private_key_encrypted"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  lastLoginAt: timestamp("last_login_at"),
  isActive: boolean("is_active").notNull().default(true),
  isAdmin: boolean("is_admin").notNull().default(false),
}, (table) => ({
  auth0UserIdIdx: index("users_auth0_user_id_idx").on(table.auth0UserId),
  emailIdx: index("users_email_idx").on(table.email),
  stripeCustomerIdx: index("users_stripe_customer_idx").on(table.stripeCustomerId),
}));

// Watchlist table
export const watchlist = pgTable("watchlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  type: text("type").notNull().default("stock"), // 'stock' or 'index'
  active: boolean("active").notNull().default(true),
  addedAt: timestamp("added_at").notNull().default(sql`now()`),
}, (table) => ({
  userIdIdx: index("watchlist_user_id_idx").on(table.userId),
  userSymbolUnique: uniqueIndex("watchlist_user_symbol_unique").on(table.userId, table.symbol),
}));

// Ticker configuration table
export const tickers = pgTable("tickers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  support: real("support"), // Legacy - will be removed after migration
  resistance: real("resistance"), // Legacy - will be removed after migration
  supportLevels: jsonb("support_levels").default([]), // Array of detected support levels
  resistanceLevels: jsonb("resistance_levels").default([]), // Array of detected resistance levels
  srLastUpdated: timestamp("sr_last_updated"), // Last time S/R was auto-detected
  srAutoDetected: boolean("sr_auto_detected").default(true), // Whether S/R is auto-detected
  srSource: text("sr_source").default('auto'), // 'auto', 'manual', or 'mixed'
  atrBuffer: real("atr_buffer").default(1.0),
  minOI: integer("min_oi").notNull().default(100),
  maxBidAskCents: integer("max_bid_ask_cents").notNull().default(15), // $0.15 in cents
}, (table) => ({
  userIdIdx: index("tickers_user_id_idx").on(table.userId),
  userSymbolUnique: uniqueIndex("tickers_user_symbol_unique").on(table.userId, table.symbol),
}));

// Portfolios table
export const portfolios = pgTable("portfolios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  accountNumber: text("account_number"), // Optional account number (e.g., Tiger account ID)
  isExternal: boolean("is_external").notNull().default(false), // True if imported from external broker
  cashBalance: real("cash_balance"), // Cash balance from broker
  totalValue: real("total_value"), // Total account value from broker
  accountType: text("account_type"), // 'Margin' or 'Cash'
  buyingPower: real("buying_power"), // Buying power (for margin accounts)
  lastSyncedAt: timestamp("last_synced_at"), // Last sync timestamp from external broker
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  userIdIdx: index("portfolios_user_id_idx").on(table.userId),
  userNameUnique: uniqueIndex("portfolios_user_name_unique").on(table.userId, table.name),
}));

// Positions table
export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  portfolioId: varchar("portfolio_id").references(() => portfolios.id),
  symbol: text("symbol").notNull(),
  contracts: integer("contracts").notNull().default(1), // Number of contracts
  strategyType: text("strategy_type").notNull().default("CREDIT_SPREAD"), // 'CREDIT_SPREAD', 'IRON_CONDOR', 'LEAPS', or 'COVERED_CALL'
  shortStrike: real("short_strike").notNull(), // For credit spread, this is the short strike. For IC, this is the PUT short strike. For LEAPS, this is the strike
  longStrike: real("long_strike"), // For credit spread, this is the long strike. For IC, this is the PUT long strike. NULL for LEAPS
  type: text("type").notNull(), // For CREDIT_SPREAD: 'PUT' or 'CALL'. For IRON_CONDOR: always 'PUT' (but has call strikes too). For LEAPS: 'CALL'
  callShortStrike: real("call_short_strike"), // For IRON_CONDOR only
  callLongStrike: real("call_long_strike"), // For IRON_CONDOR only
  expiry: timestamp("expiry").notNull(),
  entryDt: timestamp("entry_dt").notNull().default(sql`now()`),
  entryCreditCents: integer("entry_credit_cents"), // in cents per contract - for CREDIT_SPREAD and IRON_CONDOR
  entryDebitCents: integer("entry_debit_cents"), // in cents per contract - for LEAPS
  entryDelta: real("entry_delta"), // For LEAPS only - delta at entry
  status: text("status").notNull().default("open"), // 'order', 'open', 'closed'
  notes: text("notes"),
  closedAt: timestamp("closed_at"),
  exitCreditCents: integer("exit_credit_cents"), // in cents per contract - for spreads
  exitDebitCents: integer("exit_debit_cents"), // in cents per contract - for LEAPS (what we sold it for)
  tigerUnrealizedPlCents: integer("tiger_unrealized_pl_cents"), // Unrealized P&L from Tiger Brokers (total for all contracts)
  tigerMarketValueCents: integer("tiger_market_value_cents"), // Market value from Tiger Brokers (total for all contracts)
  dataSource: text("data_source"), // 'tiger' or 'manual' - indicates where position data came from
  zenStatus: text("zen_status"), // 'zen', 'profit', 'monitor', 'action' - calculated ZenStatus
  guidanceText: text("guidance_text"), // Brief guidance text (1-2 sentences)
  guidanceDetails: jsonb("guidance_details"), // Detailed guidance breakdown {situation, rule, decisionPoints}
  linkedPositionId: varchar("linked_position_id"), // For PMCC: links short calls to parent LEAPS position
}, (table) => ({
  userIdIdx: index("positions_user_id_idx").on(table.userId),
  statusIdx: index("positions_status_idx").on(table.status),
  portfolioIdx: index("positions_portfolio_idx").on(table.portfolioId),
  userStatusIdx: index("positions_user_status_idx").on(table.userId, table.status),
}));

// Indicators table
export const indicators = pgTable("indicators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  date: timestamp("date").notNull(),
  rsi14: real("rsi14"),
  stochK: real("stoch_k"),
  stochD: real("stoch_d"),
  atr14: real("atr14"),
  price: real("price"),
  sma50: real("sma50"),
  sma200: real("sma200"),
  macdLine: real("macd_line"),
  macdSignal: real("macd_signal"),
  macdHistogram: real("macd_histogram"),
}, (table) => ({
  userIdIdx: index("indicators_user_id_idx").on(table.userId),
  symbolDateIdx: index("indicators_symbol_date_idx").on(table.symbol, table.date),
}));

// Scan results table
export const scanResults = pgTable("scan_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  batchId: varchar("batch_id").notNull(),
  symbol: text("symbol").notNull(),
  strategyType: text("strategy_type").notNull().default("CREDIT_SPREAD"), // 'CREDIT_SPREAD' or 'IRON_CONDOR'
  asof: timestamp("asof").notNull().default(sql`now()`),
  status: text("status").notNull(), // 'qualified', 'no_qualified_spread', 'no_signal', 'error'
  reason: text("reason"),
  expiry: timestamp("expiry"),
  shortStrike: real("short_strike"),
  longStrike: real("long_strike"),
  width: real("width"),
  delta: real("delta"),
  creditMidCents: integer("credit_mid_cents"),
  dte: integer("dte"),
  rr: real("rr"), // risk:reward ratio
  maxLossCents: integer("max_loss_cents"),
  oi: integer("oi"),
  baCents: integer("ba_cents"),
  iv: real("iv"), // Implied Volatility from short strike option (0-1 decimal, e.g., 0.32 = 32%)
  expectedMove: real("expected_move"), // Expected Move in dollars based on IV and DTE
  score: real("score"),
  signal: text("signal"),
  analysisLog: text("analysis_log"), // Detailed console output from scanner analysis
  // Iron Condor specific fields
  callShortStrike: real("call_short_strike"), // For IC: CALL side short strike
  callLongStrike: real("call_long_strike"), // For IC: CALL side long strike
  callDelta: real("call_delta"), // For IC: CALL side delta
  putDelta: real("put_delta"), // For IC: PUT side delta (shortStrike/longStrike are PUT side)
  // LEAPS specific fields
  premiumCents: integer("premium_cents"), // Option premium in cents
  intrinsicCents: integer("intrinsic_cents"), // Intrinsic value in cents
  extrinsicCents: integer("extrinsic_cents"), // Extrinsic value in cents
  extrinsicPercent: real("extrinsic_percent"), // Extrinsic % of premium (0-100)
  ivPercentile: real("iv_percentile"), // 1-year IV percentile (0-100)
  zlviScore: real("zlvi_score"), // Zen LEAP Value Index (0-100)
  itmPercent: real("itm_percent"), // How deep ITM (negative = OTM)
  liquidityFlag: text("liquidity_flag"), // 'excellent', 'good', 'caution', 'illiquid'
  reasonTag: text("reason_tag"), // Quick reason: "High intrinsic value", "Low IV environment", etc.
  bidCents: integer("bid_cents"), // Bid price in cents
  askCents: integer("ask_cents"), // Ask price in cents
  // LEAPS Interpretive Insights (plain language explanations)
  extrinsicInsight: text("extrinsic_insight"), // User-friendly explanation of extrinsic %
  ivInsight: text("iv_insight"), // User-friendly explanation of IV percentile
  liquidityInsight: text("liquidity_insight"), // User-friendly explanation of OI/spread
  overallGuidance: text("overall_guidance"), // Overall recommendation for this option
  whyThisOption: text("why_this_option"), // Why this was selected as the best option
  // Underlying Quality Score (UQS) - fundamental analysis for LEAPS
  uqsScore: real("uqs_score"), // 0-100 composite score
  uqsRating: text("uqs_rating"), // 'STRONG', 'FAIR', 'WEAK'
  uqsInsight: text("uqs_insight"), // Overall quality insight text
  uqsComponents: jsonb("uqs_components"), // {trendStrength, cashFlowHealth, stability, earnings}
  uqsRawData: jsonb("uqs_raw_data"), // Raw fundamental data for transparency {marketCap, freeCashFlow, netMargin, etc.}
  // Market Context from AI analysis
  marketSentiment: text("market_sentiment"), // 'bullish', 'bearish', 'neutral'
  leapsConfidence: real("leaps_confidence"), // AI confidence in LEAPS (0-100)
  marketInsight: text("market_insight"), // AI reasoning for LEAPS recommendation
}, (table) => ({
  userIdIdx: index("scan_results_user_id_idx").on(table.userId),
  asofIdx: index("scan_results_asof_idx").on(table.asof),
  batchIdx: index("scan_results_batch_idx").on(table.batchId),
  strategyTypeIdx: index("scan_results_strategy_type_idx").on(table.strategyType),
}));

// Alerts table
export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  positionId: varchar("position_id").references(() => positions.id),
  type: text("type").notNull(), // 'tp50', 'stop2x', 'dte21'
  firedAt: timestamp("fired_at").notNull().default(sql`now()`),
  dismissed: boolean("dismissed").notNull().default(false),
  currentMidCents: integer("current_mid_cents"),
}, (table) => ({
  userIdIdx: index("alerts_user_id_idx").on(table.userId),
  positionIdIdx: index("alerts_position_id_idx").on(table.positionId),
  dismissedIdx: index("alerts_dismissed_idx").on(table.dismissed),
}));

// Settings table
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
}, (table) => ({
  userIdIdx: index("settings_user_id_idx").on(table.userId),
  userKeyUnique: uniqueIndex("settings_user_key_unique").on(table.userId, table.key),
}));

// Feedback/Contact form submissions
export const feedback = pgTable("feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  type: text("type").notNull(), // 'feedback', 'suggestion', 'bug', 'question', 'other'
  message: text("message").notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }), // Optional - if user is logged in
  status: text("status").notNull().default("new"), // 'new', 'read', 'responded', 'closed'
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  statusIdx: index("feedback_status_idx").on(table.status),
  createdAtIdx: index("feedback_created_at_idx").on(table.createdAt),
}));

// Market Context Analysis table (global, shared across all users)
export const marketContextAnalysis = pgTable("market_context_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timestamp: timestamp("timestamp").notNull().default(sql`now()`),
  analysisType: text("analysis_type").notNull(), // 'pre-market', 'intra-day', 'eod'
  marketRegime: text("market_regime").notNull(), // 'bearish', 'neutral', 'bullish'
  vixLevel: real("vix_level"),
  vixAssessment: text("vix_assessment"), // 'low', 'normal', 'elevated', 'high'
  summary: text("summary").notNull(), // Brief summary for UI display
  recommendations: jsonb("recommendations").notNull(), // Strategy recommendations (creditSpreads, ironCondor, leaps)
  tickerAnalysis: jsonb("ticker_analysis").notNull(), // Per-ticker sentiment and news analysis
  rawData: jsonb("raw_data"), // Full LLM response for debugging
  expiresAt: timestamp("expires_at").notNull(), // Auto-cleanup after 30 days
}, (table) => ({
  timestampIdx: index("market_context_timestamp_idx").on(table.timestamp),
  analysisTypeIdx: index("market_context_analysis_type_idx").on(table.analysisType),
  expiresAtIdx: index("market_context_expires_at_idx").on(table.expiresAt),
}));

// API Usage Tracking table (global, for admin monitoring)
export const apiUsage = pgTable("api_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(), // Date for daily aggregation (truncated to day)
  provider: text("provider").notNull(), // 'polygon', 'openai', 'fred', 'stripe', 'telegram'
  endpoint: text("endpoint").notNull(), // e.g., 'getQuote', 'getOptionChain', 'chat.completions', 'sendMessage'
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  totalLatencyMs: integer("total_latency_ms").notNull().default(0), // Sum of all response times
  lastCalledAt: timestamp("last_called_at").notNull().default(sql`now()`),
}, (table) => ({
  dateIdx: index("api_usage_date_idx").on(table.date),
  providerIdx: index("api_usage_provider_idx").on(table.provider),
  dateProviderEndpointUnique: uniqueIndex("api_usage_date_provider_endpoint_unique").on(table.date, table.provider, table.endpoint),
}));

// Insert schemas
export const insertWatchlistSchema = createInsertSchema(watchlist).omit({
  id: true,
  addedAt: true,
});

export const insertTickerSchema = createInsertSchema(tickers).omit({
  id: true,
});

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({
  id: true,
  createdAt: true,
});

export const insertPositionSchema = createInsertSchema(positions).omit({
  id: true,
  entryDt: true,
  closedAt: true,
}).extend({
  entryCreditCents: z.number().int().positive().nullable().optional(),
  entryDebitCents: z.number().int().positive().nullable().optional(),
  longStrike: z.number().positive().nullable().optional(),
  entryDelta: z.number().nullable().optional(),
  expiry: z.coerce.date(),
});

export const insertIndicatorSchema = createInsertSchema(indicators).omit({
  id: true,
});

export const insertScanResultSchema = createInsertSchema(scanResults).omit({
  id: true,
  asof: true,
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  firedAt: true,
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMarketContextAnalysisSchema = createInsertSchema(marketContextAnalysis).omit({
  id: true,
  timestamp: true,
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertApiUsageSchema = createInsertSchema(apiUsage).omit({
  id: true,
  lastCalledAt: true,
});

// Types
export type Watchlist = typeof watchlist.$inferSelect;
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;

export type Ticker = typeof tickers.$inferSelect;
export type InsertTicker = z.infer<typeof insertTickerSchema>;

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;

export type Position = typeof positions.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;

export type Indicator = typeof indicators.$inferSelect;
export type InsertIndicator = z.infer<typeof insertIndicatorSchema>;

export type ScanResult = typeof scanResults.$inferSelect;
export type InsertScanResult = z.infer<typeof insertScanResultSchema>;

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type MarketContextAnalysis = typeof marketContextAnalysis.$inferSelect;
export type InsertMarketContextAnalysis = z.infer<typeof insertMarketContextAnalysisSchema>;

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;

export type ApiUsage = typeof apiUsage.$inferSelect;
export type InsertApiUsage = z.infer<typeof insertApiUsageSchema>;

// Market Context shared types for frontend/backend
export interface MarketContextTickerSentiment {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  keyNews: string[];
}

export interface MarketContextStrategyRecommendation {
  enabled: boolean;
  direction?: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}

export interface MarketContextResult {
  id?: string;
  timestamp: Date;
  analysisType: 'pre-market' | 'intra-day' | 'eod';
  marketRegime: 'bearish' | 'neutral' | 'bullish';
  vixLevel: number;
  vixAssessment: 'low' | 'normal' | 'elevated' | 'high';
  summary: string;
  recommendations: {
    creditSpreads: MarketContextStrategyRecommendation;
    ironCondor: MarketContextStrategyRecommendation;
    leaps: MarketContextStrategyRecommendation;
  };
  tickerAnalysis: Record<string, MarketContextTickerSentiment>;
  keyRisks: string[];
  rawData?: any; // Full LLM response for debugging and additional data
  // Market data inputs for UI display
  spy?: number;
  qqq?: number;
  spyChange?: number;
  qqqChange?: number;
}

// Support/Resistance Level types
export interface SRLevel {
  value: number; // Price level
  confidence: number; // 0-100 score
  method: 'pivot' | 'consolidation' | 'volume' | 'round' | 'manual' | 'llm'; // Detection method
  touches?: number; // How many times price touched this level
  lastTouched?: string; // Most recent interaction date (ISO string)
  context?: string; // Optional LLM insight (e.g., "200-day MA support")
  source?: 'auto' | 'manual'; // Origin of this level
}

export interface SRMetadata {
  atAllTimeHigh?: boolean;
  atAllTimeLow?: boolean;
  historicalHigh?: number;
  historicalLow?: number;
  dataRangeMonths?: number;
  note?: string;
}
