import {
  type Watchlist,
  type InsertWatchlist,
  type Ticker,
  type InsertTicker,
  type Portfolio,
  type InsertPortfolio,
  type Position,
  type InsertPosition,
  type Indicator,
  type InsertIndicator,
  type ScanResult,
  type InsertScanResult,
  type Alert,
  type InsertAlert,
  type Setting,
  type InsertSetting,
  type User,
  type InsertUser,
  type Feedback,
  type InsertFeedback,
  type CashTransaction,
  type InsertCashTransaction,
  watchlist,
  tickers,
  portfolios,
  positions,
  indicators,
  scanResults,
  alerts,
  settings,
  users,
  feedback,
  cashTransactions,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (for Auth0)
  getUser(auth0UserId: string): Promise<User | undefined>;
  getUserById(userId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: Partial<InsertUser>): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  
  // Stripe billing operations
  updateStripeCustomer(userId: string, customerId: string): Promise<User>;
  updateStripeSubscription(userId: string, subscriptionId: string, status: string, currentPeriodEnd?: Date): Promise<User>;
  upgradeToPro(userId: string): Promise<User>;
  cancelSubscription(userId: string): Promise<User>;
  
  // Scan quota operations
  incrementScanCount(userId: string): Promise<User>;
  resetScanQuotaIfNeeded(userId: string): Promise<User>;
  
  // User queries
  getProUsers(): Promise<User[]>;
  getUsers(): Promise<User[]>;

  // Watchlist
  getWatchlist(userId: string): Promise<Watchlist[]>;
  getWatchlistItem(userId: string, symbol: string): Promise<Watchlist | undefined>;
  addToWatchlist(userId: string, item: InsertWatchlist): Promise<Watchlist>;
  removeFromWatchlist(userId: string, symbol: string): Promise<void>;
  updateWatchlistItem(userId: string, symbol: string, item: Partial<InsertWatchlist>): Promise<Watchlist>;

  // Tickers
  getTicker(userId: string, symbol: string): Promise<Ticker | undefined>;
  getAllTickers(userId: string): Promise<Ticker[]>;
  createTicker(userId: string, ticker: InsertTicker): Promise<Ticker>;
  updateTicker(userId: string, symbol: string, ticker: Partial<InsertTicker>): Promise<Ticker>;
  deleteTicker(userId: string, symbol: string): Promise<void>;

  // Portfolios
  getPortfolios(userId: string): Promise<Portfolio[]>;
  getPortfolio(userId: string, id: string): Promise<Portfolio | undefined>;
  createPortfolio(userId: string, portfolio: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(userId: string, id: string, portfolio: Partial<InsertPortfolio>): Promise<Portfolio>;
  deletePortfolio(userId: string, id: string): Promise<void>;
  ensureDefaultPortfolio(userId: string, userName?: string): Promise<Portfolio>;

  // Positions
  getPositions(userId: string, status?: string): Promise<Position[]>;
  getPosition(userId: string, id: string): Promise<Position | undefined>;
  createPosition(userId: string, position: InsertPosition): Promise<Position>;
  updatePosition(userId: string, id: string, position: Partial<InsertPosition>): Promise<Position>;
  closePosition(userId: string, id: string, exitCreditCents: number): Promise<Position>;
  deletePosition(userId: string, id: string): Promise<void>;
  linkPosition(userId: string, positionId: string, parentLeapsId: string): Promise<Position>;
  unlinkPosition(userId: string, positionId: string): Promise<Position>;
  getLinkedPositions(userId: string, parentLeapsId: string): Promise<Position[]>;

  // Indicators
  getLatestIndicators(userId: string, symbol: string): Promise<Indicator | undefined>;
  getIndicators(userId: string, symbol: string, limit?: number): Promise<Indicator[]>;
  saveIndicators(userId: string, indicator: InsertIndicator): Promise<Indicator>;

  // Scan Results
  getLatestScanResults(userId: string): Promise<ScanResult[]>;
  getRecentScanResults(userId: string, days?: number): Promise<ScanResult[]>;
  getScanResultsByDate(userId: string, date: Date): Promise<ScanResult[]>;
  saveScanResult(userId: string, result: InsertScanResult): Promise<ScanResult>;
  clearOldScanResults(userId: string, daysToKeep: number): Promise<void>;

  // Alerts
  getActiveAlerts(userId: string): Promise<Alert[]>;
  getAlertsByPosition(userId: string, positionId: string): Promise<Alert[]>;
  createAlert(userId: string, alert: InsertAlert): Promise<Alert>;
  dismissAlert(userId: string, id: string): Promise<void>;
  dismissAllAlerts(userId: string): Promise<void>;

  // Settings
  getSetting(userId: string, key: string): Promise<Setting | undefined>;
  setSetting(userId: string, setting: InsertSetting): Promise<Setting>;
  getAllSettings(userId: string): Promise<Setting[]>;

  // Feedback (global - not user-scoped)
  createFeedback(feedbackData: InsertFeedback): Promise<Feedback>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private watchlist: Map<string, Watchlist>;
  private tickers: Map<string, Ticker>;
  private positions: Map<string, Position>;
  private indicators: Map<string, Indicator[]>;
  private scanResults: ScanResult[];
  private alerts: Map<string, Alert>;
  private settings: Map<string, Setting>;

  constructor() {
    this.users = new Map();
    this.watchlist = new Map();
    this.tickers = new Map();
    this.positions = new Map();
    this.indicators = new Map();
    this.scanResults = [];
    this.alerts = new Map();
    this.settings = new Map();
  }

  // User methods (for Auth0)
  async getUser(auth0UserId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.auth0UserId === auth0UserId);
  }

  async getUserById(userId: string): Promise<User | undefined> {
    return this.users.get(userId);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.email === email);
  }

  async upsertUser(userData: Partial<InsertUser>): Promise<User> {
    const existingUser = await this.getUser(userData.auth0UserId!);
    if (existingUser) {
      const updatedUser = { ...existingUser, ...userData, updatedAt: new Date() };
      this.users.set(existingUser.id, updatedUser);
      return updatedUser;
    }
    const newUser: User = {
      id: randomUUID(),
      auth0UserId: userData.auth0UserId!,
      email: userData.email!,
      name: userData.name || null,
      avatarUrl: userData.avatarUrl || null,
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      subscriptionStartDate: null,
      subscriptionEndDate: null,
      dailyScanCount: 0,
      lastScanDate: null,
      telegramChatId: null,
      tigerAccountNumber: null,
      tigerIdEncrypted: null,
      tigerPrivateKeyEncrypted: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
      isActive: true,
    };
    this.users.set(newUser.id, newUser);
    return newUser;
  }

  // Stripe billing methods (stub for MemStorage)
  async updateStripeCustomer(userId: string, customerId: string): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    const updated = { ...user, stripeCustomerId: customerId, updatedAt: new Date() };
    this.users.set(userId, updated);
    return updated;
  }

  async updateStripeSubscription(userId: string, subscriptionId: string, status: string, currentPeriodEnd?: Date): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    const updated = { ...user, stripeSubscriptionId: subscriptionId, subscriptionStatus: status, currentPeriodEnd: currentPeriodEnd || null, updatedAt: new Date() };
    this.users.set(userId, updated);
    return updated;
  }

  async upgradeToPro(userId: string): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    const updated = { ...user, subscriptionTier: 'pro', subscriptionStatus: 'active', subscriptionStartDate: new Date(), updatedAt: new Date() };
    this.users.set(userId, updated);
    return updated;
  }

  async cancelSubscription(userId: string): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    const updated = { ...user, subscriptionTier: 'free', subscriptionStatus: 'canceled', subscriptionEndDate: new Date(), stripeSubscriptionId: null, updatedAt: new Date() };
    this.users.set(userId, updated);
    return updated;
  }

  // Scan quota methods (stub for MemStorage)
  async incrementScanCount(userId: string): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    const updated = { ...user, dailyScanCount: user.dailyScanCount + 1, lastScanDate: new Date(), updatedAt: new Date() };
    this.users.set(userId, updated);
    return updated;
  }

  async resetScanQuotaIfNeeded(userId: string): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    const today = new Date().toDateString();
    const lastScan = user.lastScanDate ? new Date(user.lastScanDate).toDateString() : null;
    if (lastScan !== today) {
      const updated = { ...user, dailyScanCount: 0, updatedAt: new Date() };
      this.users.set(userId, updated);
      return updated;
    }
    return user;
  }
  
  async getProUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(u => u.subscriptionTier === 'pro');
  }
  
  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const user = await this.getUserById(id);
    if (!user) throw new Error('User not found');
    const updated = { ...user, ...data, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  // Watchlist methods
  async getWatchlist(): Promise<Watchlist[]> {
    return Array.from(this.watchlist.values());
  }

  async getWatchlistItem(symbol: string): Promise<Watchlist | undefined> {
    return this.watchlist.get(symbol);
  }

  async addToWatchlist(item: InsertWatchlist): Promise<Watchlist> {
    const id = randomUUID();
    const watchlistItem: Watchlist = {
      id,
      symbol: item.symbol,
      active: item.active ?? true,
      addedAt: new Date(),
    };
    this.watchlist.set(item.symbol, watchlistItem);
    return watchlistItem;
  }

  async removeFromWatchlist(symbol: string): Promise<void> {
    this.watchlist.delete(symbol);
  }

  async updateWatchlistItem(symbol: string, item: Partial<InsertWatchlist>): Promise<Watchlist> {
    const existing = this.watchlist.get(symbol);
    if (!existing) throw new Error("Watchlist item not found");
    const updated = { ...existing, ...item };
    this.watchlist.set(symbol, updated);
    return updated;
  }

  // Ticker methods
  async getTicker(symbol: string): Promise<Ticker | undefined> {
    return this.tickers.get(symbol);
  }

  async getAllTickers(): Promise<Ticker[]> {
    return Array.from(this.tickers.values());
  }

  async createTicker(ticker: InsertTicker): Promise<Ticker> {
    const id = randomUUID();
    const newTicker: Ticker = {
      id,
      symbol: ticker.symbol,
      support: ticker.support ?? null,
      resistance: ticker.resistance ?? null,
      atrBuffer: ticker.atrBuffer ?? 1.0,
      minOI: ticker.minOI ?? 100,
      maxBidAskCents: ticker.maxBidAskCents ?? 15,
    };
    this.tickers.set(ticker.symbol, newTicker);
    return newTicker;
  }

  async updateTicker(symbol: string, ticker: Partial<InsertTicker>): Promise<Ticker> {
    const existing = this.tickers.get(symbol);
    if (!existing) throw new Error("Ticker not found");
    const updated = { ...existing, ...ticker };
    this.tickers.set(symbol, updated);
    return updated;
  }

  async deleteTicker(symbol: string): Promise<void> {
    this.tickers.delete(symbol);
  }

  // Portfolio stubs (MemStorage doesn't fully support portfolios - use DatabaseStorage)
  async getPortfolios(): Promise<Portfolio[]> {
    return [];
  }
  
  async getPortfolio(userId: string, id: string): Promise<Portfolio | undefined> {
    return undefined;
  }
  
  async createPortfolio(userId: string, portfolio: InsertPortfolio): Promise<Portfolio> {
    throw new Error("MemStorage does not support portfolio operations");
  }
  
  async updatePortfolio(userId: string, id: string, portfolio: Partial<InsertPortfolio>): Promise<Portfolio> {
    throw new Error("MemStorage does not support portfolio operations");
  }
  
  async deletePortfolio(userId: string, id: string): Promise<void> {
    throw new Error("MemStorage does not support portfolio operations");
  }
  
  async ensureDefaultPortfolio(userId: string, userName?: string): Promise<Portfolio> {
    throw new Error("MemStorage does not support portfolio operations");
  }

  // Position methods
  async getPositions(status?: string): Promise<Position[]> {
    const allPositions = Array.from(this.positions.values());
    if (status) {
      return allPositions.filter((p) => p.status === status);
    }
    return allPositions;
  }

  async getPosition(id: string): Promise<Position | undefined> {
    return this.positions.get(id);
  }

  async createPosition(position: InsertPosition): Promise<Position> {
    const id = randomUUID();
    const newPosition: Position = {
      id,
      symbol: position.symbol,
      shortStrike: position.shortStrike,
      longStrike: position.longStrike,
      type: position.type,
      expiry: position.expiry,
      entryDt: new Date(),
      entryCreditCents: position.entryCreditCents,
      status: position.status ?? "open",
      notes: position.notes ?? null,
      closedAt: null,
      exitCreditCents: null,
    };
    this.positions.set(id, newPosition);
    return newPosition;
  }

  async updatePosition(id: string, position: Partial<InsertPosition>): Promise<Position> {
    const existing = this.positions.get(id);
    if (!existing) throw new Error("Position not found");
    const updated = { ...existing, ...position };
    this.positions.set(id, updated);
    return updated;
  }

  async closePosition(id: string, exitCreditCents: number): Promise<Position> {
    const existing = this.positions.get(id);
    if (!existing) throw new Error("Position not found");
    const updated = {
      ...existing,
      status: "closed",
      closedAt: new Date(),
      exitCreditCents,
    };
    this.positions.set(id, updated);
    return updated;
  }

  async deletePosition(id: string): Promise<void> {
    this.positions.delete(id);
  }

  // Indicator methods
  async getLatestIndicators(symbol: string): Promise<Indicator | undefined> {
    const symbolIndicators = this.indicators.get(symbol) || [];
    return symbolIndicators[symbolIndicators.length - 1];
  }

  async getIndicators(symbol: string, limit: number = 50): Promise<Indicator[]> {
    const symbolIndicators = this.indicators.get(symbol) || [];
    return symbolIndicators.slice(-limit);
  }

  async saveIndicators(indicator: InsertIndicator): Promise<Indicator> {
    const id = randomUUID();
    const newIndicator: Indicator = {
      id,
      symbol: indicator.symbol,
      date: indicator.date,
      rsi14: indicator.rsi14 ?? null,
      stochK: indicator.stochK ?? null,
      stochD: indicator.stochD ?? null,
      atr14: indicator.atr14 ?? null,
      price: indicator.price ?? null,
    };
    const symbolIndicators = this.indicators.get(indicator.symbol) || [];
    symbolIndicators.push(newIndicator);
    this.indicators.set(indicator.symbol, symbolIndicators);
    return newIndicator;
  }

  // Scan Results methods
  async getLatestScanResults(userId: string): Promise<ScanResult[]> {
    // Filter to this user's results first
    const userResults = this.scanResults.filter((r) => r.userId === userId);
    
    if (userResults.length === 0) {
      return [];
    }

    // Find the most recent batchId for this user
    const latestBatch = userResults.reduce((latest, current) => {
      return new Date(current.asof) > new Date(latest.asof) ? current : latest;
    });

    // Return all results from that batch
    return userResults.filter((r) => r.batchId === latestBatch.batchId);
  }

  async getRecentScanResults(userId: string, days: number = 7): Promise<ScanResult[]> {
    // Get scan results from the last N days for this user
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    return this.scanResults
      .filter((r) => r.userId === userId && new Date(r.asof) >= cutoffDate)
      .sort((a, b) => new Date(b.asof).getTime() - new Date(a.asof).getTime());
  }

  async getScanResultsByDate(date: Date): Promise<ScanResult[]> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    return this.scanResults.filter((r) => {
      const resultDate = new Date(r.asof);
      resultDate.setHours(0, 0, 0, 0);
      return resultDate.getTime() === targetDate.getTime();
    });
  }

  async saveScanResult(result: InsertScanResult): Promise<ScanResult> {
    const id = randomUUID();
    const newResult: ScanResult = {
      id,
      batchId: (result as any).batchId || 'manual',
      symbol: result.symbol,
      asof: new Date(),
      status: result.status,
      reason: result.reason ?? null,
      expiry: result.expiry ?? null,
      shortStrike: result.shortStrike ?? null,
      longStrike: result.longStrike ?? null,
      width: result.width ?? null,
      delta: result.delta ?? null,
      creditMidCents: result.creditMidCents ?? null,
      dte: result.dte ?? null,
      rr: result.rr ?? null,
      maxLossCents: result.maxLossCents ?? null,
      oi: result.oi ?? null,
      baCents: result.baCents ?? null,
      score: result.score ?? null,
      signal: result.signal ?? null,
      // LEAPS-specific fields
      premiumCents: result.premiumCents ?? null,
      intrinsicCents: result.intrinsicCents ?? null,
      extrinsicCents: result.extrinsicCents ?? null,
      extrinsicPercent: result.extrinsicPercent ?? null,
      ivPercentile: result.ivPercentile ?? null,
      zlviScore: result.zlviScore ?? null,
      itmPercent: result.itmPercent ?? null,
      liquidityFlag: result.liquidityFlag ?? null,
      reasonTag: result.reasonTag ?? null,
      bidCents: result.bidCents ?? null,
      askCents: result.askCents ?? null,
    };
    this.scanResults.push(newResult);
    return newResult;
  }

  async clearOldScanResults(daysToKeep: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    this.scanResults = this.scanResults.filter((r) => new Date(r.asof) >= cutoffDate);
  }

  // Alert methods
  async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.alerts.values()).filter((a) => !a.dismissed);
  }

  async getAlertsByPosition(positionId: string): Promise<Alert[]> {
    return Array.from(this.alerts.values()).filter((a) => a.positionId === positionId);
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const id = randomUUID();
    const newAlert: Alert = {
      id,
      positionId: alert.positionId ?? null,
      type: alert.type,
      firedAt: new Date(),
      dismissed: false,
      currentMidCents: alert.currentMidCents ?? null,
    };
    this.alerts.set(id, newAlert);
    return newAlert;
  }

  async dismissAlert(id: string): Promise<void> {
    const alert = this.alerts.get(id);
    if (alert) {
      alert.dismissed = true;
      this.alerts.set(id, alert);
    }
  }

  async dismissAllAlerts(): Promise<void> {
    for (const [id, alert] of this.alerts.entries()) {
      if (!alert.dismissed) {
        alert.dismissed = true;
        this.alerts.set(id, alert);
      }
    }
  }

  // Settings methods
  async getSetting(key: string): Promise<Setting | undefined> {
    return this.settings.get(key);
  }

  async setSetting(setting: InsertSetting): Promise<Setting> {
    const id = randomUUID();
    const newSetting: Setting = { ...setting, id };
    this.settings.set(setting.key, newSetting);
    return newSetting;
  }

  async getAllSettings(): Promise<Setting[]> {
    return Array.from(this.settings.values());
  }

  // Feedback methods (MemStorage doesn't persist feedback)
  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const newFeedback: Feedback = {
      id: randomUUID(),
      name: feedbackData.name,
      email: feedbackData.email,
      type: feedbackData.type,
      message: feedbackData.message,
      userId: feedbackData.userId ?? null,
      status: 'new',
      createdAt: new Date(),
    };
    return newFeedback;
  }
}

export class DatabaseStorage implements IStorage {
  // User methods (for Auth0)
  async getUser(auth0UserId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.auth0UserId, auth0UserId));
    
    return user || undefined;
  }

  async upsertUser(userData: Partial<InsertUser>): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values({
          auth0UserId: userData.auth0UserId!,
          email: userData.email!,
          name: userData.name,
          avatarUrl: userData.avatarUrl,
        })
        .onConflictDoUpdate({
          target: users.auth0UserId,
          set: {
            email: userData.email!,
            name: userData.name,
            avatarUrl: userData.avatarUrl,
            updatedAt: sql`now()`,
            lastLoginAt: sql`now()`,
          },
        })
        .returning();
      
      return user;
    } catch (error: any) {
      if (error?.code === '23505' && error?.constraint === 'users_email_unique') {
        const [user] = await db
          .update(users)
          .set({
            auth0UserId: userData.auth0UserId!,
            name: userData.name,
            avatarUrl: userData.avatarUrl,
            updatedAt: sql`now()`,
            lastLoginAt: sql`now()`,
          })
          .where(eq(users.email, userData.email!))
          .returning();
        return user;
      }
      throw error;
    }
  }

  async getUserById(userId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    
    return user || undefined;
  }

  // Stripe billing methods
  async updateStripeCustomer(userId: string, customerId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ stripeCustomerId: customerId, updatedAt: sql`now()` })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateStripeSubscription(
    userId: string, 
    subscriptionId: string, 
    status: string, 
    currentPeriodEnd?: Date
  ): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: status,
        currentPeriodEnd: currentPeriodEnd || null,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async upgradeToPro(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
        subscriptionStartDate: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async cancelSubscription(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        subscriptionTier: 'free',
        subscriptionStatus: 'canceled',
        subscriptionEndDate: sql`now()`,
        stripeSubscriptionId: null,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Scan quota methods
  async incrementScanCount(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        dailyScanCount: sql`${users.dailyScanCount} + 1`,
        lastScanDate: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async resetScanQuotaIfNeeded(userId: string): Promise<User> {
    // Reset if last scan was on a different day
    const [user] = await db
      .update(users)
      .set({
        dailyScanCount: sql`CASE 
          WHEN DATE(${users.lastScanDate}) < CURRENT_DATE THEN 0
          ELSE ${users.dailyScanCount}
        END`,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
  
  async getProUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.subscriptionTier, 'pro'));
  }
  
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: sql`now()` })
      .where(eq(users.id, id))
      .returning();
    if (!updated) throw new Error("User not found");
    
    return updated;
  }

  // Watchlist methods
  async getWatchlist(userId: string): Promise<Watchlist[]> {
    return await db.select().from(watchlist).where(eq(watchlist.userId, userId));
  }

  async getWatchlistItem(userId: string, symbol: string): Promise<Watchlist | undefined> {
    const [item] = await db
      .select()
      .from(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.symbol, symbol)));
    return item || undefined;
  }

  async addToWatchlist(userId: string, item: InsertWatchlist): Promise<Watchlist> {
    const [newItem] = await db
      .insert(watchlist)
      .values({ ...item, userId })
      .returning();
    return newItem;
  }

  async removeFromWatchlist(userId: string, symbol: string): Promise<void> {
    await db
      .delete(watchlist)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.symbol, symbol)));
  }

  async updateWatchlistItem(userId: string, symbol: string, item: Partial<InsertWatchlist>): Promise<Watchlist> {
    const [updated] = await db
      .update(watchlist)
      .set(item)
      .where(and(eq(watchlist.userId, userId), eq(watchlist.symbol, symbol)))
      .returning();
    if (!updated) throw new Error("Watchlist item not found");
    return updated;
  }

  // Ticker methods
  async getTicker(userId: string, symbol: string): Promise<Ticker | undefined> {
    const [ticker] = await db
      .select()
      .from(tickers)
      .where(and(eq(tickers.userId, userId), eq(tickers.symbol, symbol)));
    return ticker || undefined;
  }

  async getAllTickers(userId: string): Promise<Ticker[]> {
    return await db.select().from(tickers).where(eq(tickers.userId, userId));
  }

  async createTicker(userId: string, ticker: InsertTicker): Promise<Ticker> {
    const [newTicker] = await db
      .insert(tickers)
      .values({ ...ticker, userId })
      .returning();
    return newTicker;
  }

  async updateTicker(userId: string, symbol: string, ticker: Partial<InsertTicker>): Promise<Ticker> {
    // If support or resistance is being manually updated, track it with timestamp and source
    const updateData: any = { ...ticker };
    if ('support' in ticker || 'resistance' in ticker) {
      updateData.srLastUpdated = new Date();
      updateData.srSource = 'manual';
      
      // CRITICAL: Also update the JSONB arrays so scanner uses the correct values
      // Scanner reads from supportLevels[0].value and resistanceLevels[0].value
      if ('support' in ticker && ticker.support !== undefined) {
        updateData.supportLevels = [{
          value: ticker.support,
          confidence: 100, // Manual = highest confidence
          context: 'Manually set by user',
          source: 'manual'
        }];
      }
      if ('resistance' in ticker && ticker.resistance !== undefined) {
        updateData.resistanceLevels = [{
          value: ticker.resistance,
          confidence: 100, // Manual = highest confidence
          context: 'Manually set by user',
          source: 'manual'
        }];
      }
    }
    
    const [updated] = await db
      .update(tickers)
      .set(updateData)
      .where(and(eq(tickers.userId, userId), eq(tickers.symbol, symbol)))
      .returning();
    if (!updated) throw new Error("Ticker not found");
    return updated;
  }

  async deleteTicker(userId: string, symbol: string): Promise<void> {
    await db
      .delete(tickers)
      .where(and(eq(tickers.userId, userId), eq(tickers.symbol, symbol)));
  }

  // Portfolio methods
  async getPortfolios(userId: string): Promise<Portfolio[]> {
    return await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  }

  async getPortfolio(userId: string, id: string): Promise<Portfolio | undefined> {
    const [portfolio] = await db
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.userId, userId), eq(portfolios.id, id)));
    return portfolio || undefined;
  }

  async createPortfolio(userId: string, portfolio: InsertPortfolio): Promise<Portfolio> {
    const [newPortfolio] = await db
      .insert(portfolios)
      .values({ ...portfolio, userId })
      .returning();
    return newPortfolio;
  }

  async updatePortfolio(userId: string, id: string, portfolio: Partial<InsertPortfolio>): Promise<Portfolio> {
    const [updated] = await db
      .update(portfolios)
      .set(portfolio)
      .where(and(eq(portfolios.userId, userId), eq(portfolios.id, id)))
      .returning();
    if (!updated) throw new Error("Portfolio not found");
    return updated;
  }

  async deletePortfolio(userId: string, id: string): Promise<void> {
    await db
      .delete(portfolios)
      .where(and(eq(portfolios.userId, userId), eq(portfolios.id, id)));
  }

  async ensureDefaultPortfolio(userId: string, userName?: string): Promise<Portfolio> {
    // Check if user already has any portfolios
    const existingPortfolios = await this.getPortfolios(userId);
    if (existingPortfolios.length > 0) {
      return existingPortfolios[0];
    }
    
    // Create default portfolio
    const portfolioName = "My Portfolio";
    
    try {
      const [newPortfolio] = await db
        .insert(portfolios)
        .values({ 
          userId, 
          name: portfolioName,
          description: null,
          isExternal: false,
        })
        .returning();
      
      console.log(`[Storage] Created default portfolio "${portfolioName}" for user ${userId}`);
      return newPortfolio;
    } catch (error: any) {
      // Handle race condition where portfolio was created between check and insert
      if (error?.code === '23505') {
        const existingPortfolios = await this.getPortfolios(userId);
        if (existingPortfolios.length > 0) {
          return existingPortfolios[0];
        }
      }
      throw error;
    }
  }

  // Position methods
  async getPositions(userId: string, status?: string): Promise<Position[]> {
    if (status) {
      return await db
        .select()
        .from(positions)
        .where(and(eq(positions.userId, userId), eq(positions.status, status)));
    }
    return await db.select().from(positions).where(eq(positions.userId, userId));
  }

  async getPosition(userId: string, id: string): Promise<Position | undefined> {
    const [position] = await db
      .select()
      .from(positions)
      .where(and(eq(positions.userId, userId), eq(positions.id, id)));
    return position || undefined;
  }

  async createPosition(userId: string, position: InsertPosition): Promise<Position> {
    const [newPosition] = await db
      .insert(positions)
      .values({ ...position, userId })
      .returning();
    return newPosition;
  }

  async updatePosition(userId: string, id: string, position: Partial<InsertPosition>): Promise<Position> {
    const [updated] = await db
      .update(positions)
      .set(position)
      .where(and(eq(positions.userId, userId), eq(positions.id, id)))
      .returning();
    if (!updated) throw new Error("Position not found");
    return updated;
  }

  async closePosition(userId: string, id: string, exitCreditCents: number): Promise<Position> {
    const [updated] = await db
      .update(positions)
      .set({
        status: "closed",
        closedAt: new Date(),
        exitCreditCents,
      })
      .where(and(eq(positions.userId, userId), eq(positions.id, id)))
      .returning();
    if (!updated) throw new Error("Position not found");
    return updated;
  }

  async deletePosition(userId: string, id: string): Promise<void> {
    // Remove dependent alerts first to avoid FK constraint errors
    await db.delete(alerts).where(and(eq(alerts.userId, userId), eq(alerts.positionId, id)));
    await db.delete(positions).where(and(eq(positions.userId, userId), eq(positions.id, id)));
  }

  async linkPosition(userId: string, positionId: string, parentLeapsId: string): Promise<Position> {
    // Verify parent LEAPS exists and belongs to user
    const parentLeaps = await this.getPosition(userId, parentLeapsId);
    if (!parentLeaps) throw new Error("Parent position not found");
    if (parentLeaps.strategyType !== 'LEAPS' && parentLeaps.strategyType !== 'STOCK') throw new Error("Parent position must be a LEAPS or STOCK");
    
    // Verify child position exists and is a short call
    const childPosition = await this.getPosition(userId, positionId);
    if (!childPosition) throw new Error("Position not found");
    if ((childPosition.strategyType !== 'CREDIT_SPREAD' && childPosition.strategyType !== 'COVERED_CALL') || childPosition.type !== 'CALL') {
      throw new Error("Only short call spreads can be linked to LEAPS");
    }
    if (childPosition.symbol !== parentLeaps.symbol) {
      throw new Error("Linked position must be on the same symbol");
    }
    if (childPosition.portfolioId !== parentLeaps.portfolioId) {
      throw new Error("Linked positions must be in the same account");
    }
    
    const [updated] = await db
      .update(positions)
      .set({ linkedPositionId: parentLeapsId })
      .where(and(eq(positions.userId, userId), eq(positions.id, positionId)))
      .returning();
    if (!updated) throw new Error("Failed to link position");
    return updated;
  }

  async unlinkPosition(userId: string, positionId: string): Promise<Position> {
    const [updated] = await db
      .update(positions)
      .set({ linkedPositionId: null })
      .where(and(eq(positions.userId, userId), eq(positions.id, positionId)))
      .returning();
    if (!updated) throw new Error("Position not found");
    return updated;
  }

  async getLinkedPositions(userId: string, parentLeapsId: string): Promise<Position[]> {
    return await db
      .select()
      .from(positions)
      .where(and(
        eq(positions.userId, userId),
        eq(positions.linkedPositionId, parentLeapsId),
        eq(positions.status, 'open')
      ))
      .orderBy(desc(positions.expiry));
  }

  // Indicator methods
  async getLatestIndicators(userId: string, symbol: string): Promise<Indicator | undefined> {
    const [latest] = await db
      .select()
      .from(indicators)
      .where(and(eq(indicators.userId, userId), eq(indicators.symbol, symbol)))
      .orderBy(desc(indicators.date))
      .limit(1);
    return latest || undefined;
  }

  async getIndicators(userId: string, symbol: string, limit: number = 50): Promise<Indicator[]> {
    return await db
      .select()
      .from(indicators)
      .where(and(eq(indicators.userId, userId), eq(indicators.symbol, symbol)))
      .orderBy(desc(indicators.date))
      .limit(limit);
  }

  async saveIndicators(userId: string, indicator: InsertIndicator): Promise<Indicator> {
    const [newIndicator] = await db
      .insert(indicators)
      .values({ ...indicator, userId })
      .returning();
    return newIndicator;
  }

  // Scan Results methods
  async getLatestScanResults(userId: string): Promise<ScanResult[]> {
    // Get the most recent batch regardless of date (not just today)
    // This fixes the midnight empty-result bug while keeping "latest batch" semantics
    const allResults = await db
      .select()
      .from(scanResults)
      .where(eq(scanResults.userId, userId))
      .orderBy(desc(scanResults.asof))
      .limit(1000); // Reasonable limit to find latest batch

    if (allResults.length === 0) {
      return [];
    }

    // Find the most recent batchId
    const latestBatch = allResults[0];

    // Return all results from that batch
    return allResults.filter((r) => r.batchId === latestBatch.batchId);
  }

  async getRecentScanResults(userId: string, days: number = 7): Promise<ScanResult[]> {
    // Get scan results from the last N days for historical view
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    return await db
      .select()
      .from(scanResults)
      .where(
        and(
          eq(scanResults.userId, userId),
          gte(scanResults.asof, cutoffDate)
        )
      )
      .orderBy(desc(scanResults.asof));
  }

  async getScanResultsByDate(userId: string, date: Date): Promise<ScanResult[]> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    return await db
      .select()
      .from(scanResults)
      .where(
        and(
          eq(scanResults.userId, userId),
          gte(scanResults.asof, targetDate),
          sql`${scanResults.asof} < ${nextDay}`
        )
      );
  }

  async saveScanResult(userId: string, result: InsertScanResult): Promise<ScanResult> {
    const [newResult] = await db
      .insert(scanResults)
      .values({ ...result, userId } as any)
      .returning();
    return newResult;
  }

  async clearOldScanResults(userId: string, daysToKeep: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    await db
      .delete(scanResults)
      .where(and(eq(scanResults.userId, userId), lte(scanResults.asof, cutoffDate)));
  }

  // Alert methods
  async getActiveAlerts(userId: string): Promise<Alert[]> {
    return await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.userId, userId), eq(alerts.dismissed, false)));
  }

  async getAlertsByPosition(userId: string, positionId: string): Promise<Alert[]> {
    return await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.userId, userId), eq(alerts.positionId, positionId)));
  }

  async createAlert(userId: string, alert: InsertAlert): Promise<Alert> {
    const [newAlert] = await db
      .insert(alerts)
      .values({ ...alert, userId })
      .returning();
    return newAlert;
  }

  async dismissAlert(userId: string, id: string): Promise<void> {
    await db
      .update(alerts)
      .set({ dismissed: true })
      .where(and(eq(alerts.userId, userId), eq(alerts.id, id)));
  }

  async dismissAllAlerts(userId: string): Promise<void> {
    await db
      .update(alerts)
      .set({ dismissed: true })
      .where(and(eq(alerts.userId, userId), eq(alerts.dismissed, false)));
  }

  // Settings methods
  async getSetting(userId: string, key: string): Promise<Setting | undefined> {
    const [setting] = await db
      .select()
      .from(settings)
      .where(and(eq(settings.userId, userId), eq(settings.key, key)));
    return setting || undefined;
  }

  async setSetting(userId: string, setting: InsertSetting): Promise<Setting> {
    const [result] = await db
      .insert(settings)
      .values({ ...setting, userId })
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: { value: setting.value },
      })
      .returning();
    return result;
  }

  async getAllSettings(userId: string): Promise<Setting[]> {
    return await db.select().from(settings).where(eq(settings.userId, userId));
  }

  // Cash transaction methods
  async getCashTransactions(userId: string, portfolioId?: string): Promise<CashTransaction[]> {
    if (portfolioId) {
      return await db.select().from(cashTransactions)
        .where(and(eq(cashTransactions.userId, userId), eq(cashTransactions.portfolioId, portfolioId)))
        .orderBy(cashTransactions.date);
    }
    return await db.select().from(cashTransactions)
      .where(eq(cashTransactions.userId, userId))
      .orderBy(cashTransactions.date);
  }

  async createCashTransaction(userId: string, tx: InsertCashTransaction): Promise<CashTransaction> {
    const [result] = await db
      .insert(cashTransactions)
      .values({ ...tx, userId })
      .returning();
    return result;
  }

  async deleteCashTransaction(userId: string, id: string): Promise<void> {
    await db.delete(cashTransactions)
      .where(and(eq(cashTransactions.userId, userId), eq(cashTransactions.id, id)));
  }

  // Feedback methods
  async createFeedback(feedbackData: InsertFeedback): Promise<Feedback> {
    const [result] = await db
      .insert(feedback)
      .values({
        name: feedbackData.name,
        email: feedbackData.email,
        type: feedbackData.type,
        message: feedbackData.message,
        userId: feedbackData.userId,
      })
      .returning();
    return result;
  }
}

export const storage = new DatabaseStorage();

// System owner ID for backward compatibility and system-level operations
export const SYSTEM_OWNER_ID = "c9c31f9a-f659-475b-97e5-a5bc18a8a724";

// Default settings that are created for each new user
export const DEFAULT_SETTINGS = [
  // Scan Schedule Times (in ET, HH:MM format)
  { key: 'pre_opening_scan_time', value: '08:00' },
  { key: 'market_open_scan_time', value: '10:00' },
  { key: 'market_close_scan_time', value: '16:00' },
  { key: 'daily_scan_time', value: '06:00' },
  // Position Monitoring Settings
  { key: 'monitor_interval_minutes', value: '30' },
  { key: 'monitor_start_time', value: '09:30' },
  { key: 'monitor_end_time', value: '12:00' },
  { key: 'monitor_enabled', value: 'true' },
  // Auto Scanner Settings
  { key: 'auto_scan_enabled', value: 'false' },
  { key: 'auto_scan_interval_minutes', value: '30' },
  { key: 'auto_scan_start_time', value: '09:30' },
  { key: 'auto_scan_end_time', value: '16:00' },
  // Scan Parameters - Credit Spreads
  { key: 'scan_delta_min', value: '0.25' },
  { key: 'scan_delta_max', value: '0.30' },
  { key: 'scan_min_credit', value: '1.20' },
  { key: 'scan_rr_min', value: '1.5' },
  { key: 'scan_rr_max', value: '3.5' },
  { key: 'scan_max_loss', value: '500' },
  { key: 'scan_max_loss_buffer', value: '0.25' }, // 25%
  // Scan Parameters - DTE
  { key: 'scan_dte_target', value: '45' },
  { key: 'scan_dte_buffer', value: '5' }, // ±5 days = 40-50 DTE
  // Scan Parameters - Iron Condors
  { key: 'scan_ic_delta_min', value: '0.15' },
  { key: 'scan_ic_delta_max', value: '0.20' },
  { key: 'scan_ic_width', value: '10' }, // $10 wide spreads
  // Scan Parameters - Global
  { key: 'scan_min_oi', value: '50' }, // Global min open interest (does NOT apply to LEAPs)
  // Onboarding Settings
  { key: 'onboarding_completed', value: 'false' },
  { key: 'onboarding_step', value: '0' },
  // Alert Settings
  { key: 'alert_telegram_enabled', value: 'true' },
  { key: 'alert_on_profit_ready', value: 'true' },
  { key: 'alert_on_action_needed', value: 'true' },
  { key: 'alert_on_monitor', value: 'false' },
  { key: 'alert_profit_threshold', value: '60' },
  { key: 'alert_cooldown_hours', value: '4' },
  // Action Needed Alert Triggers (granular control)
  { key: 'alert_action_be_breached', value: 'true' },
  { key: 'alert_action_strike_breached', value: 'true' },
  { key: 'alert_action_cs_dte', value: 'true' },
  { key: 'alert_action_cs_dte_threshold', value: '21' },
  { key: 'alert_action_ic_dte', value: 'true' },
  { key: 'alert_action_ic_dte_threshold', value: '21' },
  { key: 'alert_action_loss_zone', value: 'true' },
  { key: 'alert_action_loss_zone_threshold', value: '40' },
];

/**
 * Initialize default settings for a user
 * Called when a user first logs in or when explicitly needed
 */
export async function initializeUserSettings(userId: string) {
  console.log(`🔧 Initializing default settings for user: ${userId}`);
  
  for (const setting of DEFAULT_SETTINGS) {
    const existing = await storage.getSetting(userId, setting.key);
    if (!existing) {
      await storage.setSetting(userId, setting);
    }
  }
  
  console.log(`✅ Default settings initialized for user: ${userId}`);
}

/**
 * Initialize global settings - only if system owner exists
 * This is safe to call at startup and won't fail on fresh databases
 */
export async function initializeGlobalSettings() {
  try {
    // Check if system owner exists in the database
    const systemUser = await db
      .select()
      .from(users)
      .where(eq(users.id, SYSTEM_OWNER_ID))
      .limit(1);
    
    if (systemUser.length === 0) {
      console.log(`ℹ️  System owner not found - skipping global settings initialization`);
      console.log(`   Settings will be created when users log in`);
      return;
    }
    
    // System owner exists, initialize their settings
    await initializeUserSettings(SYSTEM_OWNER_ID);
    console.log(`✅ Global settings initialized for system owner`);
  } catch (error: any) {
    console.error(`⚠️  Error initializing global settings:`, error.message);
    console.log(`   This is non-fatal - settings will be created when users log in`);
  }
}
