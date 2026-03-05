# Productising Options Monitor to SaaS

**Document Version:** 2.0  
**Last Updated:** November 5, 2025  
**Status:** Phases 1-3 COMPLETE ✅ | Phases 4-5 PENDING ⏳

## 🎉 Migration Progress Update (Nov 5, 2025)

**COMPLETED:**
- ✅ Phase 1: Database Multi-Tenancy (nullable userId, user isolation)
- ✅ Phase 2: Authentication Integration (Replit Auth, session management)
- ✅ Phase 3: Frontend Authentication UI (AuthModal, protected routes)
- ✅ Production Deployment (zero data loss, 35 positions migrated)

**REMAINING:**
- ⏳ Phase 4: Subscription Tier Enforcement (free vs pro limits)
- ⏳ Phase 5: Stripe Billing Integration (payment processing)

**See SAAS-COMPLETION-STATUS.md for detailed status and next steps**

---

## Executive Summary

This document outlines the complete transformation of Options Monitor from a single-user application to a production-ready multi-tenant SaaS product with freemium business model. The approach prioritizes data safety, scalability, and zero downtime for existing production data.

### Business Model

- **Preview Mode (Unauthenticated):** Read-only access to demonstrate features
- **Free Tier:** Limited usage on signup (5 watchlist tickers, 10 positions, daily scans)
- **Pro Tier ($29/month):** Unlimited access to all features
- **Future:** Stripe subscription management (Phase 4)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema Changes](#database-schema-changes)
3. [Implementation Phases](#implementation-phases)
4. [Subscription Tiers](#subscription-tiers)
5. [Data Migration Strategy](#data-migration-strategy)
6. [Authentication Flow](#authentication-flow)
7. [API Security](#api-security)
8. [Frontend Changes](#frontend-changes)
9. [Testing Strategy](#testing-strategy)
10. [Rollback Plan](#rollback-plan)

---

## Architecture Overview

### Current State
- Single-user application
- Production data exists (watchlist, positions, portfolios, settings)
- Global settings (Telegram tokens, Tiger Brokers keys)
- No authentication or user isolation

### Target State
- Multi-tenant SaaS architecture
- User-based data isolation
- Replit Auth (email/password + Google OAuth)
- Subscription-based feature gating
- Read-only preview mode for unauthenticated users
- User-specific settings and secrets

### Core Principles

1. **Data Safety First:** Production data must be preserved with zero loss
2. **Incremental Migration:** Each phase is independently deployable and testable
3. **Backwards Compatibility:** System continues working at each step
4. **Feature Flags:** Ability to enable/disable multi-user features
5. **Comprehensive Testing:** Automated tests verify data isolation

---

## Database Schema Changes

### New Tables

#### 1. Users Table
```typescript
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  replitUserId: text("replit_user_id").unique().notNull(), // From Replit Auth
  email: text("email").unique().notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  subscriptionTier: text("subscription_tier").notNull().default("free"), // 'free' | 'pro'
  subscriptionStatus: text("subscription_status").default("active"), // 'active' | 'cancelled' | 'past_due'
  stripeCustomerId: text("stripe_customer_id").unique(), // For future Stripe integration
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  
  // User-specific secrets (encrypted at rest)
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: text("telegram_chat_id"),
  tigerAccountNumber: text("tiger_account_number"),
  tigerIdEncrypted: text("tiger_id_encrypted"),
  tigerPrivateKeyEncrypted: text("tiger_private_key_encrypted"),
  
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
```

#### 2. User Settings Table (Alternative to embedding in users)
```typescript
export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  
  // Scan Settings
  scanEnabled: boolean("scan_enabled").default(true),
  scanSchedule: jsonb("scan_schedule").$type<ScanSchedule>(), // Daily, intraday configs
  
  // Monitor Settings
  monitorEnabled: boolean("monitor_enabled").default(true),
  monitorInterval: integer("monitor_interval").default(300),
  monitorWindowStart: text("monitor_window_start").default("09:30"),
  monitorWindowEnd: text("monitor_window_end").default("16:00"),
  
  // Alert Settings
  takeProfitEnabled: boolean("take_profit_enabled").default(true),
  takeProfitPercent: integer("take_profit_percent").default(50),
  stopLossEnabled: boolean("stop_loss_enabled").default(true),
  stopLossMultiplier: integer("stop_loss_multiplier").default(2),
  dteManagementEnabled: boolean("dte_management_enabled").default(true),
  dteThreshold: integer("dte_threshold").default(21),
  
  // Scan Parameters
  deltaMin: integer("delta_min").default(20),
  deltaMax: integer("delta_max").default(35),
  minCredit: integer("min_credit").default(30),
  riskRewardRatio: integer("risk_reward_ratio").default(3),
  maxLoss: integer("max_loss").default(200),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

### Modified Tables (Add user_id)

All existing tables need `user_id` foreign key:

1. **watchlist_tickers** - User's monitored symbols
2. **ticker_configs** - User-specific ticker configurations
3. **positions** - User's open/closed positions
4. **portfolios** - User's portfolio accounts
5. **scan_results** - User's scan results
6. **alerts** - User's position alerts
7. **indicators** - User's cached indicator data
8. **scan_logs** - User's scan execution logs

#### Migration Pattern for Each Table

```typescript
// Example: positions table
export const positions = pgTable("positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(), // Added field
  
  // ... existing fields ...
  
  // Add composite index for user queries
}, (table) => ({
  userIdIdx: index("positions_user_id_idx").on(table.userId),
  userStatusIdx: index("positions_user_status_idx").on(table.userId, table.status),
}));
```

### System Owner User

**Purpose:** Owns all existing production data during migration

```typescript
const SYSTEM_OWNER = {
  email: "system@optionsmonitor.internal",
  name: "System Owner",
  replitUserId: "system-owner-migration-account",
  subscriptionTier: "pro", // Full access to existing features
  isActive: true,
};
```

---

## Implementation Phases

### Phase 0: Preparation (Before Any Code Changes)

**Objective:** Ensure safety nets are in place

#### Tasks:
1. **Complete Database Backup**
   ```bash
   # Export production database
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Create Staging Environment**
   - Clone production data to staging
   - Test all migrations on staging first
   - Verify rollback procedures

3. **Document Current Schema**
   ```bash
   npm run db:push --dry-run > schema_before_migration.sql
   ```

4. **Create Feature Flag System**
   ```typescript
   // server/featureFlags.ts
   export const featureFlags = {
     multiUserEnabled: process.env.MULTI_USER_ENABLED === 'true',
     enforceAuth: process.env.ENFORCE_AUTH === 'true',
     subscriptionGating: process.env.SUBSCRIPTION_GATING === 'true',
   };
   ```

**Duration:** 2-3 hours  
**Deliverable:** Backup verified, staging ready, rollback plan documented

---

### Phase 1: Database Multi-Tenancy Foundation

**Objective:** Add user tables and user_id columns without breaking existing functionality

#### Step 1.1: Add Users Table

```typescript
// shared/schema.ts - Add users table
export const users = pgTable("users", { /* as defined above */ });
```

```bash
npm run db:push
```

**Verification:**
- Table created successfully
- No impact on existing tables
- Can insert test users

#### Step 1.2: Create System Owner

```typescript
// server/migrations/create-system-owner.ts
async function createSystemOwner() {
  const systemOwner = await db.insert(users).values({
    email: "system@optionsmonitor.internal",
    name: "System Owner",
    replitUserId: "system-owner",
    subscriptionTier: "pro",
  }).returning();
  
  console.log("System owner created:", systemOwner[0].id);
  return systemOwner[0];
}
```

**Verification:**
- System owner user exists
- Has pro tier access
- Can be queried by email

#### Step 1.3: Add user_id to Tables (Nullable)

**Order of migration** (respecting foreign key dependencies):

1. `portfolios` (no dependencies)
2. `watchlist_tickers` (no dependencies)
3. `ticker_configs` → references `watchlist_tickers`
4. `positions` → references `portfolios`
5. `scan_results` → references `watchlist_tickers`
6. `alerts` → references `positions`
7. `indicators` → references `watchlist_tickers`
8. `scan_logs` (no dependencies)

**Migration script for each table:**

```typescript
// Example: positions table
export const positions = pgTable("positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  // Initially nullable, will become NOT NULL after backfill
  // ... rest of fields
});
```

**Drizzle command:**
```bash
npm run db:push
```

**Verification:**
- All tables have user_id column
- Columns are nullable
- Foreign keys reference users table correctly
- Existing data still accessible (user_id = null)

#### Step 1.4: Backfill Existing Data

**Script:** `server/migrations/backfill-user-data.ts`

```typescript
async function backfillUserData() {
  const systemOwner = await db.query.users.findFirst({
    where: eq(users.email, "system@optionsmonitor.internal"),
  });
  
  if (!systemOwner) {
    throw new Error("System owner not found!");
  }
  
  console.log(`Backfilling with system owner: ${systemOwner.id}`);
  
  // Backfill each table
  const tables = [
    { name: 'portfolios', table: portfolios },
    { name: 'watchlist_tickers', table: watchlistTickers },
    { name: 'ticker_configs', table: tickerConfigs },
    { name: 'positions', table: positions },
    { name: 'scan_results', table: scanResults },
    { name: 'alerts', table: alerts },
    { name: 'indicators', table: indicators },
    { name: 'scan_logs', table: scanLogs },
  ];
  
  for (const { name, table } of tables) {
    const nullCount = await db
      .select({ count: sql`count(*)` })
      .from(table)
      .where(sql`user_id IS NULL`);
    
    console.log(`${name}: ${nullCount[0].count} records to backfill`);
    
    await db
      .update(table)
      .set({ userId: systemOwner.id })
      .where(sql`user_id IS NULL`);
    
    const remainingNulls = await db
      .select({ count: sql`count(*)` })
      .from(table)
      .where(sql`user_id IS NULL`);
    
    if (remainingNulls[0].count > 0) {
      throw new Error(`${name} still has ${remainingNulls[0].count} null user_id records!`);
    }
    
    console.log(`✅ ${name}: All records assigned to system owner`);
  }
  
  console.log("✅ Backfill complete!");
}
```

**Execution:**
```bash
tsx server/migrations/backfill-user-data.ts
```

**Verification:**
- No records have null user_id
- All records assigned to system owner
- Application still functions normally
- Can query existing data

#### Step 1.5: Make user_id NOT NULL

**Update schema:**

```typescript
export const positions = pgTable("positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(), // Now required
  // ... rest
});
```

**Apply to all tables, then:**
```bash
npm run db:push
```

**Verification:**
- All user_id columns are NOT NULL
- Cannot insert records without user_id
- Database enforces referential integrity

#### Step 1.6: Add Performance Indexes

```typescript
// Add to each table definition
(table) => ({
  userIdIdx: index(`${tableName}_user_id_idx`).on(table.userId),
  // Composite indexes for common queries
  userStatusIdx: index(`${tableName}_user_status_idx`)
    .on(table.userId, table.status), // for positions, alerts
  userSymbolIdx: index(`${tableName}_user_symbol_idx`)
    .on(table.userId, table.symbol), // for positions, watchlist
})
```

**Verification:**
- Indexes created on all user_id columns
- Query performance acceptable (< 100ms for user data queries)

**Duration:** 4-6 hours  
**Deliverable:** Multi-tenant database schema with all production data safely migrated

---

### Phase 2: Authentication Integration

**Objective:** Implement Replit Auth with read-only preview mode

#### Step 2.1: Install Replit Auth Blueprint

```bash
# Use integration tool to add Replit Auth
```

**Blueprint includes:**
- Login UI components
- Session management
- OAuth providers (Google, GitHub, etc.)
- User profile management

**Key files added:**
- `client/src/lib/auth.ts` - Auth utilities
- `client/src/components/LoginButton.tsx`
- `server/middleware/auth.ts` - Session middleware
- `server/routes/auth.ts` - Auth endpoints

#### Step 2.2: Configure Session Middleware

```typescript
// server/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    replitUserId: string;
  };
  isAuthenticated: boolean;
}

export async function sessionMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  // Get user from Replit Auth session
  const replitUser = req.session?.user; // Provided by Replit Auth
  
  if (replitUser) {
    // Find or create user in our database
    let user = await db.query.users.findFirst({
      where: eq(users.replitUserId, replitUser.id),
    });
    
    if (!user) {
      // Auto-create user on first login (Free tier)
      user = await db.insert(users).values({
        replitUserId: replitUser.id,
        email: replitUser.email,
        name: replitUser.name,
        avatarUrl: replitUser.profileImage,
        subscriptionTier: 'free',
        lastLoginAt: new Date(),
      }).returning();
    } else {
      // Update last login
      await db.update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));
    }
    
    req.user = {
      id: user.id,
      email: user.email,
      replitUserId: user.replitUserId,
    };
    req.isAuthenticated = true;
  } else {
    req.isAuthenticated = false;
  }
  
  next();
}

// Optional authentication - allows read-only access
export function optionalAuth() {
  return sessionMiddleware; // Just sets req.user if logged in
}

// Required authentication - returns 401 if not logged in
export function requireAuth() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    await sessionMiddleware(req, res, () => {});
    
    if (!req.isAuthenticated) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please sign in to access this feature',
      });
    }
    
    next();
  };
}
```

#### Step 2.3: Update API Routes for Authentication

**Read-only routes** (no auth required):
- `GET /api/market-ticker` - Public market data
- `GET /api/settings` - Public default settings (no user secrets)
- `GET /api/scan-results` - Public scan results (demo data)

**Read routes** (optional auth - show user's data if logged in):
- `GET /api/tickers` - Watchlist tickers
- `GET /api/positions` - Positions
- `GET /api/portfolios` - Portfolios
- `GET /api/alerts` - Alerts
- `GET /api/watchlist-market-data` - Market data for watchlist

**Write routes** (require auth):
- `POST /api/tickers` - Add ticker
- `PUT /api/tickers/:symbol` - Update ticker
- `DELETE /api/tickers/:symbol` - Delete ticker
- `POST /api/positions` - Add position
- `PATCH /api/positions/:id` - Update position
- `DELETE /api/positions/:id` - Delete position
- All other POST/PUT/PATCH/DELETE operations

**Example implementation:**

```typescript
// server/routes.ts

// Public read - no auth
app.get('/api/market-ticker', async (req, res) => {
  const tickers = await marketDataService.getMarketTicker();
  res.json(tickers);
});

// User data - optional auth
app.get('/api/tickers', optionalAuth(), async (req: AuthRequest, res) => {
  let tickers;
  
  if (req.isAuthenticated) {
    // Show user's watchlist
    tickers = await storage.getWatchlistTickers(req.user!.id);
  } else {
    // Show demo/empty watchlist for preview
    tickers = [];
  }
  
  res.json(tickers);
});

// Write operation - require auth
app.post('/api/tickers', requireAuth(), async (req: AuthRequest, res) => {
  const validated = insertWatchlistTickerSchema.parse(req.body);
  
  // Check tier limits
  const user = await storage.getUserById(req.user!.id);
  if (user.subscriptionTier === 'free') {
    const currentCount = await storage.getWatchlistTickersCount(req.user!.id);
    if (currentCount >= 5) {
      return res.status(403).json({
        error: 'Limit exceeded',
        message: 'Free tier allows up to 5 watchlist tickers. Upgrade to Pro for unlimited.',
      });
    }
  }
  
  const ticker = await storage.addWatchlistTicker({
    ...validated,
    userId: req.user!.id,
  });
  
  res.json(ticker);
});
```

#### Step 2.4: Add Storage Layer User Filtering

```typescript
// server/storage.ts - Update IStorage interface

export interface IStorage {
  // User management
  getUserById(userId: string): Promise<User | null>;
  getUserByReplitId(replitUserId: string): Promise<User | null>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(userId: string, data: Partial<User>): Promise<User>;
  
  // All methods now require userId parameter
  getWatchlistTickers(userId: string): Promise<Ticker[]>;
  getWatchlistTickersCount(userId: string): Promise<number>;
  addWatchlistTicker(data: InsertTicker & { userId: string }): Promise<Ticker>;
  
  getPositions(userId: string, status?: string): Promise<Position[]>;
  getPositionsCount(userId: string, status?: string): Promise<number>;
  addPosition(data: InsertPosition & { userId: string }): Promise<Position>;
  
  // ... all other methods updated similarly
}

// Implementation example
class DbStorage implements IStorage {
  async getWatchlistTickers(userId: string): Promise<Ticker[]> {
    return db.query.watchlistTickers.findMany({
      where: eq(watchlistTickers.userId, userId),
      orderBy: [asc(watchlistTickers.symbol)],
    });
  }
  
  async getWatchlistTickersCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(watchlistTickers)
      .where(eq(watchlistTickers.userId, userId));
    return Number(result[0].count);
  }
  
  // ... similar updates for all methods
}
```

#### Step 2.5: Frontend Authentication Context

```typescript
// client/src/lib/auth-context.tsx
import { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  subscriptionTier: 'free' | 'pro';
}

interface AuthContext {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Check auth status on mount
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setUser(data);
        setIsLoading(false);
      })
      .catch(() => {
        setUser(null);
        setIsLoading(false);
      });
  }, []);
  
  const login = () => {
    window.location.href = '/api/auth/login';
  };
  
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.href = '/';
  };
  
  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

**Duration:** 4-5 hours  
**Deliverable:** Full authentication system with auto-user creation on signup

---

### Phase 3: Frontend UI & Feature Gating

**Objective:** Implement read-only preview mode and subscription tier limits

#### Step 3.1: Add Authentication UI

```typescript
// client/src/components/layout/navbar.tsx - Update navigation

import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogIn, User, Settings, LogOut } from 'lucide-react';

export function UserMenu() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  
  if (isLoading) {
    return <div className="w-8 h-8 bg-secondary rounded-full animate-pulse" />;
  }
  
  if (!isAuthenticated) {
    return (
      <Button onClick={login} variant="default">
        <LogIn className="mr-2" size={16} />
        Sign In
      </Button>
    );
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback>
              {user.name?.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            <p className="text-xs font-semibold text-primary">
              {user.subscriptionTier === 'pro' ? '⭐ Pro' : '🆓 Free'}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.location.href = '/settings'}>
          <Settings className="mr-2" size={16} />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.location.href = '/account'}>
          <User className="mr-2" size={16} />
          Account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut className="mr-2" size={16} />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

#### Step 3.2: Feature Gating Hook

```typescript
// client/src/hooks/use-feature-gate.ts

import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';

interface FeatureLimits {
  free: {
    watchlistTickers: 5;
    openPositions: 10;
    scansPerDay: 1; // Daily scan only
    telegramAlerts: false;
    tigerBrokers: false;
  };
  pro: {
    watchlistTickers: Infinity;
    openPositions: Infinity;
    scansPerDay: Infinity;
    telegramAlerts: true;
    tigerBrokers: true;
  };
}

export function useFeatureGate() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const limits: FeatureLimits = {
    free: {
      watchlistTickers: 5,
      openPositions: 10,
      scansPerDay: 1,
      telegramAlerts: false,
      tigerBrokers: false,
    },
    pro: {
      watchlistTickers: Infinity,
      openPositions: Infinity,
      scansPerDay: Infinity,
      telegramAlerts: true,
      tigerBrokers: true,
    },
  };
  
  const tier = user?.subscriptionTier || 'free';
  const currentLimits = limits[tier];
  
  const canAddWatchlistTicker = (currentCount: number) => {
    if (!isAuthenticated) return false;
    return currentCount < currentLimits.watchlistTickers;
  };
  
  const canAddPosition = (currentCount: number) => {
    if (!isAuthenticated) return false;
    return currentCount < currentLimits.openPositions;
  };
  
  const canUseTelegram = () => {
    if (!isAuthenticated) return false;
    return currentLimits.telegramAlerts;
  };
  
  const canUseTigerBrokers = () => {
    if (!isAuthenticated) return false;
    return currentLimits.tigerBrokers;
  };
  
  const showUpgradePrompt = (feature: string) => {
    toast({
      title: "Upgrade to Pro",
      description: `${feature} is available on Pro plan ($29/month)`,
      action: (
        <Button
          variant="default"
          size="sm"
          onClick={() => window.location.href = '/pricing'}
        >
          Upgrade
        </Button>
      ),
    });
  };
  
  const showLoginPrompt = (action: string) => {
    toast({
      title: "Sign in required",
      description: `Please sign in to ${action}`,
      action: (
        <Button
          variant="default"
          size="sm"
          onClick={() => window.location.href = '/api/auth/login'}
        >
          Sign In
        </Button>
      ),
    });
  };
  
  return {
    isAuthenticated,
    tier,
    limits: currentLimits,
    canAddWatchlistTicker,
    canAddPosition,
    canUseTelegram,
    canUseTigerBrokers,
    showUpgradePrompt,
    showLoginPrompt,
  };
}
```

#### Step 3.3: Update Add Buttons to Respect Auth

```typescript
// client/src/pages/watchlist.tsx - Example update

import { useFeatureGate } from '@/hooks/use-feature-gate';

export default function Watchlist() {
  const { isAuthenticated, canAddWatchlistTicker, showLoginPrompt, showUpgradePrompt } = useFeatureGate();
  const { data: tickers } = useQuery({ queryKey: ['/api/tickers'] });
  
  const handleAddClick = () => {
    if (!isAuthenticated) {
      showLoginPrompt('add tickers to your watchlist');
      return;
    }
    
    const currentCount = tickers?.length || 0;
    if (!canAddWatchlistTicker(currentCount)) {
      showUpgradePrompt('Unlimited watchlist tickers');
      return;
    }
    
    setIsAddOpen(true);
  };
  
  return (
    <div>
      {/* ... */}
      <Button 
        onClick={handleAddClick}
        data-testid="button-add-ticker"
      >
        <Plus className="mr-2" size={16} />
        Ticker
      </Button>
      
      {!isAuthenticated && (
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6">
          <p className="text-sm text-muted-foreground">
            👀 You're viewing in <strong>preview mode</strong>. 
            <Button variant="link" className="px-1" onClick={() => showLoginPrompt('save your watchlist')}>
              Sign in
            </Button>
            to add tickers and track positions.
          </p>
        </div>
      )}
      {/* ... */}
    </div>
  );
}
```

#### Step 3.4: Disable Actions for Unauthenticated Users

**Pattern for all action buttons:**

```typescript
// Example: Edit button
<button
  onClick={() => handleEdit(ticker)}
  disabled={!isAuthenticated}
  className={`text-primary hover:text-primary/80 ${
    !isAuthenticated ? 'opacity-50 cursor-not-allowed' : ''
  }`}
  data-testid={`button-edit-${ticker.symbol}`}
>
  <Edit size={16} />
</button>
```

**Apply to all action buttons:**
- Edit buttons
- Delete buttons
- Close position buttons
- Execute order buttons
- Sync Tiger Brokers button
- Run scan buttons (unless daily scan already completed)

#### Step 3.5: Create Account/Settings Page

```typescript
// client/src/pages/account.tsx

export default function Account() {
  const { user } = useAuth();
  const { canUseTelegram, canUseTigerBrokers } = useFeatureGate();
  
  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-6">Account Settings</h2>
      
      {/* Subscription Tier */}
      <div className="bg-card border rounded-lg p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">Subscription</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {user?.subscriptionTier === 'pro' ? 'Pro Plan' : 'Free Plan'}
            </p>
            <p className="text-sm text-muted-foreground">
              {user?.subscriptionTier === 'pro' 
                ? 'Unlimited access to all features'
                : '5 tickers, 10 positions, daily scans'
              }
            </p>
          </div>
          {user?.subscriptionTier === 'free' && (
            <Button onClick={() => window.location.href = '/pricing'}>
              Upgrade to Pro
            </Button>
          )}
        </div>
      </div>
      
      {/* Telegram Integration */}
      <div className="bg-card border rounded-lg p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">Telegram Alerts</h3>
        {canUseTelegram() ? (
          <TelegramSettings />
        ) : (
          <div className="text-sm text-muted-foreground">
            Available on Pro plan. 
            <Button variant="link" onClick={() => window.location.href = '/pricing'}>
              Upgrade to enable
            </Button>
          </div>
        )}
      </div>
      
      {/* Tiger Brokers Integration */}
      <div className="bg-card border rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">Tiger Brokers Sync</h3>
        {canUseTigerBrokers() ? (
          <TigerBrokersSettings />
        ) : (
          <div className="text-sm text-muted-foreground">
            Available on Pro plan.
            <Button variant="link" onClick={() => window.location.href = '/pricing'}>
              Upgrade to enable
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Duration:** 5-6 hours  
**Deliverable:** Full preview mode + Free/Pro tier gating

---

### Phase 4: Stripe Integration (Future)

**Objective:** Monetize with subscription billing

**Note:** This phase is documented for future implementation and should only be started after Phases 1-3 are fully tested and stable.

#### Step 4.1: Install Stripe Blueprint

Use Replit's Stripe integration blueprint which includes:
- Stripe SDK setup
- Checkout session creation
- Webhook handlers
- Customer portal integration

#### Step 4.2: Create Stripe Products

**In Stripe Dashboard:**

1. **Pro Monthly Subscription**
   - Name: "Options Monitor Pro"
   - Price: $29/month
   - Billing: Recurring monthly
   - Features: Unlimited watchlist, positions, scans, Telegram, Tiger Brokers

2. **Pro Annual Subscription** (Optional - 17% discount)
   - Name: "Options Monitor Pro (Annual)"
   - Price: $290/year ($24.17/month)
   - Billing: Recurring yearly

#### Step 4.3: Subscription Flow

```typescript
// server/routes/stripe.ts

app.post('/api/stripe/create-checkout', requireAuth(), async (req: AuthRequest, res) => {
  const user = await storage.getUserById(req.user!.id);
  
  // Create or retrieve Stripe customer
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userId: user.id,
      },
    });
    customerId = customer.id;
    
    await storage.updateUser(user.id, {
      stripeCustomerId: customerId,
    });
  }
  
  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price: process.env.STRIPE_PRO_PRICE_ID, // From Stripe dashboard
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: `${process.env.APP_URL}/account?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/pricing`,
    metadata: {
      userId: user.id,
    },
  });
  
  res.json({ url: session.url });
});

// Webhook handler for subscription events
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
  }
  
  res.json({ received: true });
});

async function handleCheckoutCompleted(session: any) {
  const userId = session.metadata.userId;
  const subscriptionId = session.subscription;
  
  await storage.updateUser(userId, {
    subscriptionTier: 'pro',
    subscriptionStatus: 'active',
    stripeSubscriptionId: subscriptionId,
    subscriptionStartDate: new Date(),
  });
  
  console.log(`User ${userId} upgraded to Pro`);
}

async function handleSubscriptionUpdated(subscription: any) {
  const user = await storage.getUserByStripeSubscriptionId(subscription.id);
  if (!user) return;
  
  const status = subscription.status; // active, past_due, canceled, etc.
  
  await storage.updateUser(user.id, {
    subscriptionStatus: status,
    subscriptionTier: status === 'active' ? 'pro' : 'free',
  });
}

async function handleSubscriptionDeleted(subscription: any) {
  const user = await storage.getUserByStripeSubscriptionId(subscription.id);
  if (!user) return;
  
  await storage.updateUser(user.id, {
    subscriptionTier: 'free',
    subscriptionStatus: 'cancelled',
    subscriptionEndDate: new Date(),
  });
  
  console.log(`User ${user.id} downgraded to Free`);
}
```

#### Step 4.4: Customer Portal

```typescript
// Allow users to manage their subscription

app.post('/api/stripe/create-portal-session', requireAuth(), async (req: AuthRequest, res) => {
  const user = await storage.getUserById(req.user!.id);
  
  if (!user.stripeCustomerId) {
    return res.status(400).json({ error: 'No subscription found' });
  }
  
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.APP_URL}/account`,
  });
  
  res.json({ url: session.url });
});
```

#### Step 4.5: Pricing Page

```typescript
// client/src/pages/pricing.tsx

export default function Pricing() {
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  const handleUpgrade = async () => {
    setIsLoading(true);
    const res = await fetch('/api/stripe/create-checkout', { method: 'POST' });
    const { url } = await res.json();
    window.location.href = url;
  };
  
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h2 className="text-4xl font-bold text-center mb-4">Choose Your Plan</h2>
      <p className="text-center text-muted-foreground mb-12">
        Start free, upgrade when you're ready
      </p>
      
      <div className="grid md:grid-cols-2 gap-8">
        {/* Free Tier */}
        <div className="bg-card border border-border rounded-lg p-8">
          <h3 className="text-2xl font-bold mb-2">Free</h3>
          <p className="text-4xl font-bold mb-6">$0<span className="text-xl text-muted-foreground">/month</span></p>
          
          <ul className="space-y-3 mb-8">
            <li className="flex items-center">
              <Check className="mr-2 text-success" size={20} />
              5 watchlist tickers
            </li>
            <li className="flex items-center">
              <Check className="mr-2 text-success" size={20} />
              10 open positions
            </li>
            <li className="flex items-center">
              <Check className="mr-2 text-success" size={20} />
              Daily scans
            </li>
            <li className="flex items-center">
              <Check className="mr-2 text-success" size={20} />
              Basic alerts
            </li>
          </ul>
          
          <Button variant="outline" className="w-full" disabled>
            Current Plan
          </Button>
        </div>
        
        {/* Pro Tier */}
        <div className="bg-primary/5 border-2 border-primary rounded-lg p-8 relative">
          <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 rounded-bl-lg rounded-tr-lg text-sm font-semibold">
            POPULAR
          </div>
          
          <h3 className="text-2xl font-bold mb-2">Pro</h3>
          <p className="text-4xl font-bold mb-6">$29<span className="text-xl text-muted-foreground">/month</span></p>
          
          <ul className="space-y-3 mb-8">
            <li className="flex items-center">
              <Check className="mr-2 text-primary" size={20} />
              <strong>Unlimited</strong>&nbsp;watchlist tickers
            </li>
            <li className="flex items-center">
              <Check className="mr-2 text-primary" size={20} />
              <strong>Unlimited</strong>&nbsp;positions
            </li>
            <li className="flex items-center">
              <Check className="mr-2 text-primary" size={20} />
              <strong>Intraday</strong>&nbsp;scans (configurable)
            </li>
            <li className="flex items-center">
              <Check className="mr-2 text-primary" size={20} />
              Telegram alerts
            </li>
            <li className="flex items-center">
              <Check className="mr-2 text-primary" size={20} />
              Tiger Brokers integration
            </li>
            <li className="flex items-center">
              <Check className="mr-2 text-primary" size={20} />
              Priority support
            </li>
          </ul>
          
          <Button 
            className="w-full" 
            onClick={handleUpgrade}
            disabled={isLoading || user?.subscriptionTier === 'pro'}
          >
            {isLoading ? 'Processing...' : 'Upgrade to Pro'}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Duration:** 4-6 hours  
**Deliverable:** Full subscription billing with Stripe

---

## Subscription Tiers

### Free Tier (Default on Signup)

**Limits:**
- **Watchlist:** 5 tickers maximum
- **Positions:** 10 open positions maximum
- **Scans:** Daily scan only (1 per day at 08:00 ET)
- **Alerts:** Basic email alerts only
- **Integrations:** None (no Telegram, no Tiger Brokers)

**Purpose:** Allow users to try the platform and experience core value

### Pro Tier ($29/month)

**Features:**
- **Watchlist:** Unlimited tickers
- **Positions:** Unlimited open positions
- **Scans:** Configurable intraday scans (pre-open, market open, market close)
- **Alerts:** Telegram alerts with full customization
- **Integrations:** Tiger Brokers auto-sync
- **Settings:** Full control over scan parameters, monitor settings
- **Priority:** Faster scan execution and support

**Purpose:** Power users who actively trade options and need automation

---

## Data Migration Strategy

### Critical Success Factors

1. **Zero Data Loss:** Every existing record must be preserved
2. **Zero Downtime:** Application continues running during migration
3. **Reversibility:** Ability to roll back at any step
4. **Verification:** Automated checks confirm data integrity

### Migration Checklist

**Before Each Step:**
- [ ] Staging database matches production
- [ ] Migration script tested on staging
- [ ] Backup created and verified
- [ ] Rollback script prepared
- [ ] Monitoring alerts configured

**After Each Step:**
- [ ] Row counts match expected values
- [ ] No null values in required columns
- [ ] Foreign key constraints verified
- [ ] Application queries working
- [ ] Performance acceptable (< 100ms queries)

### Automated Verification Script

```typescript
// server/migrations/verify-migration.ts

async function verifyMigration() {
  console.log("🔍 Starting migration verification...\n");
  
  // 1. Check all tables have user_id
  const tables = [
    'portfolios',
    'watchlist_tickers',
    'ticker_configs',
    'positions',
    'scan_results',
    'alerts',
    'indicators',
    'scan_logs',
  ];
  
  for (const table of tables) {
    // Check column exists
    const columnExists = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ${table} 
      AND column_name = 'user_id'
    `);
    
    if (columnExists.rows.length === 0) {
      throw new Error(`❌ Table ${table} missing user_id column`);
    }
    
    // Check no nulls
    const nullCount = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM ${sql.identifier(table)} 
      WHERE user_id IS NULL
    `);
    
    if (Number(nullCount.rows[0].count) > 0) {
      throw new Error(`❌ Table ${table} has ${nullCount.rows[0].count} null user_id values`);
    }
    
    // Check foreign key
    const fkExists = await db.execute(sql`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = ${table} 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%user_id%'
    `);
    
    if (fkExists.rows.length === 0) {
      throw new Error(`❌ Table ${table} missing user_id foreign key`);
    }
    
    console.log(`✅ ${table}: OK`);
  }
  
  // 2. Verify system owner has all data
  const systemOwner = await db.query.users.findFirst({
    where: eq(users.email, 'system@optionsmonitor.internal'),
  });
  
  if (!systemOwner) {
    throw new Error("❌ System owner user not found");
  }
  
  console.log(`\n✅ System owner: ${systemOwner.id}`);
  
  for (const table of tables) {
    const count = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM ${sql.identifier(table)} 
      WHERE user_id = ${systemOwner.id}
    `);
    console.log(`  ${table}: ${count.rows[0].count} records`);
  }
  
  // 3. Verify indexes exist
  for (const table of tables) {
    const indexExists = await db.execute(sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = ${table} 
      AND indexname LIKE '%user_id%'
    `);
    
    if (indexExists.rows.length === 0) {
      console.warn(`⚠️  Table ${table} missing user_id index (performance issue)`);
    } else {
      console.log(`✅ ${table}: Index OK`);
    }
  }
  
  console.log("\n✅ Migration verification complete!");
}
```

### Rollback Procedures

**If migration fails at any step:**

1. **Stop application**
   ```bash
   # Stop workflow
   ```

2. **Restore from backup**
   ```bash
   psql $DATABASE_URL < backup_TIMESTAMP.sql
   ```

3. **Verify restoration**
   ```bash
   tsx server/migrations/verify-restoration.ts
   ```

4. **Restart application**
   ```bash
   # Restart workflow
   ```

5. **Review failure logs**
   - Identify what went wrong
   - Fix migration script
   - Re-test on staging
   - Try again

---

## Authentication Flow

### User Journey

#### 1. First Visit (Unauthenticated)

```
User visits site
  → No session cookie
  → req.isAuthenticated = false
  → Frontend shows:
      - "Sign In" button in navbar
      - Read-only data (empty watchlist/positions)
      - Preview banner: "Sign in to save your data"
      - All action buttons disabled
  → User can browse, see examples, understand features
```

#### 2. User Clicks "Sign In"

```
User clicks "Sign In"
  → Redirects to /api/auth/login
  → Replit Auth screen appears
  → Options: Email/Password, Google, GitHub, etc.
```

#### 3. User Signs In with Google

```
User chooses Google
  → OAuth flow with Google
  → Returns to /api/auth/callback
  → Replit Auth creates session
  → Application middleware checks for user in DB
  → If not exists: Create new user (Free tier)
  → If exists: Update lastLoginAt
  → Redirect to /dashboard
```

#### 4. Authenticated Experience

```
User is logged in
  → req.isAuthenticated = true
  → req.user contains { id, email, replitUserId }
  → Frontend shows:
      - User avatar + dropdown menu
      - User's watchlist and positions
      - All action buttons enabled (within tier limits)
      - "Upgrade to Pro" if on Free tier
```

#### 5. User Tries to Add 6th Ticker (Free Tier)

```
User clicks "Add Ticker"
  → Frontend checks canAddWatchlistTicker(5)
  → Returns false (limit is 5)
  → Shows toast: "Upgrade to Pro for unlimited tickers"
  → Button in toast links to /pricing
```

#### 6. User Upgrades to Pro (Phase 4)

```
User clicks "Upgrade to Pro"
  → Redirects to /api/stripe/create-checkout
  → Stripe Checkout screen
  → User enters payment
  → Stripe webhook: checkout.session.completed
  → Update user: subscriptionTier = 'pro'
  → Redirect to /account
  → User now has unlimited access
```

### Session Management

**Session cookie:**
- Name: `connect.sid` (Express session)
- HttpOnly: true
- Secure: true (production)
- SameSite: lax
- MaxAge: 7 days

**Session storage:**
- Replit Auth handles session storage
- User info stored in `req.session.user`
- Application maps to database user via `replitUserId`

### Logout Flow

```
User clicks "Sign Out"
  → POST /api/auth/logout
  → Destroy session
  → Clear cookie
  → Redirect to /
  → User now unauthenticated (preview mode)
```

---

## API Security

### Endpoint Protection Levels

**Level 1: Public (No Auth)**
- Market ticker data
- Public scan results (demo)
- Health check endpoints

**Level 2: Optional Auth (User Data If Logged In)**
- GET /api/tickers
- GET /api/positions
- GET /api/portfolios
- GET /api/alerts

**Level 3: Required Auth (Must Be Logged In)**
- All POST/PUT/PATCH/DELETE operations
- User settings
- Telegram/Tiger Brokers configuration

### Data Isolation

**Every query must filter by userId:**

```typescript
// ❌ WRONG - Returns all users' data
const positions = await db.query.positions.findMany();

// ✅ CORRECT - Returns only current user's data
const positions = await db.query.positions.findMany({
  where: eq(positions.userId, req.user!.id),
});
```

### Rate Limiting

```typescript
// server/middleware/rate-limit.ts

import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each user to 100 requests per window
  keyGenerator: (req: AuthRequest) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please slow down and try again later',
    });
  },
});

// Apply to all API routes
app.use('/api', apiLimiter);

// Stricter limit for write operations
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 writes per minute
  keyGenerator: (req: AuthRequest) => req.user?.id || req.ip,
});

app.use('/api/tickers', writeLimiter);
app.use('/api/positions', writeLimiter);
```

---

## Frontend Changes

### Major Component Updates

#### 1. App Root - Add Auth Provider

```typescript
// client/src/App.tsx

import { AuthProvider } from '@/lib/auth-context';

function App() {
  return (
    <AuthProvider>
      <Router>
        {/* Existing routes */}
      </Router>
    </AuthProvider>
  );
}
```

#### 2. Navbar - Add User Menu

- Replace placeholder with UserMenu component
- Show "Sign In" for unauthenticated
- Show avatar + dropdown for authenticated

#### 3. All Pages - Add Preview Banner

```typescript
// Show at top of each page if unauthenticated
{!isAuthenticated && (
  <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6">
    <p className="text-sm text-muted-foreground">
      👀 Preview mode. 
      <Button variant="link" onClick={login}>Sign in</Button>
      to save your data.
    </p>
  </div>
)}
```

#### 4. Action Buttons - Disable When Not Authenticated

**Pattern:**
```typescript
<Button
  onClick={handleAction}
  disabled={!isAuthenticated || isLoading}
  data-testid="button-action"
>
  Action
</Button>
```

#### 5. Add Account Page

- Subscription info
- Telegram settings (Pro only)
- Tiger Brokers settings (Pro only)
- User profile
- Danger zone (delete account)

#### 6. Add Pricing Page

- Free vs Pro comparison
- Upgrade button (creates Stripe checkout)
- FAQ section

---

## Testing Strategy

### Unit Tests

**Focus areas:**
1. Storage layer user filtering
2. Feature gate logic
3. Subscription tier limits
4. Data isolation

```typescript
// Example test
describe('Storage.getWatchlistTickers', () => {
  it('returns only current user tickers', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    
    await storage.addWatchlistTicker({ symbol: 'AAPL', userId: user1.id });
    await storage.addWatchlistTicker({ symbol: 'TSLA', userId: user2.id });
    
    const user1Tickers = await storage.getWatchlistTickers(user1.id);
    expect(user1Tickers).toHaveLength(1);
    expect(user1Tickers[0].symbol).toBe('AAPL');
  });
});
```

### Integration Tests

**Test flows:**
1. Signup → Auto-create user → Free tier
2. Add ticker → Check limit → Block at 6th
3. Upgrade to Pro → Remove limits
4. Logout → Preview mode
5. Multi-user data isolation

### Manual Testing Checklist

**Before Production:**
- [ ] Can sign up with email/password
- [ ] Can sign in with Google OAuth
- [ ] Free tier enforces 5 ticker limit
- [ ] Free tier enforces 10 position limit
- [ ] Pro tier has no limits
- [ ] Unauthenticated users see empty data
- [ ] Unauthenticated users cannot add/edit
- [ ] User A cannot see User B's data
- [ ] Logout works and returns to preview
- [ ] Session persists across page refreshes
- [ ] System owner still has all original data
- [ ] Migration verification passes

---

## Rollback Plan

### Pre-Migration Checkpoint

**Backup Creation:**
```bash
# Full database dump
pg_dump $DATABASE_URL > backup_pre_saas_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
psql $DATABASE_URL < backup_pre_saas_TIMESTAMP.sql --dry-run
```

### Phase Rollback Points

Each phase has a rollback script:

**Phase 1 Rollback:** Remove user tables and user_id columns
```sql
-- Drop foreign keys
ALTER TABLE positions DROP CONSTRAINT positions_user_id_fkey;
-- Repeat for all tables

-- Drop user_id columns
ALTER TABLE positions DROP COLUMN user_id;
-- Repeat for all tables

-- Drop users table
DROP TABLE users CASCADE;
```

**Phase 2 Rollback:** Remove auth middleware
- Revert to no authentication
- Remove session checks
- Deploy previous version

**Phase 3 Rollback:** Remove frontend auth
- Remove AuthProvider
- Remove feature gating
- Show all buttons as enabled

### Emergency Rollback (Full Restore)

**If catastrophic failure:**
```bash
# 1. Stop application
systemctl stop app

# 2. Drop current database
dropdb options_monitor

# 3. Restore from backup
createdb options_monitor
psql options_monitor < backup_pre_saas_TIMESTAMP.sql

# 4. Revert code to previous commit
git revert HEAD~5  # Or specific commit

# 5. Rebuild
npm install
npm run db:push

# 6. Restart
systemctl start app
```

---

## Success Metrics

### Technical Metrics

- **Migration Success:** 100% of data migrated to system owner
- **Data Isolation:** 0 cross-user data leaks
- **Query Performance:** < 100ms for user data queries
- **Uptime:** 99.9% during migration phases

### Business Metrics (Post-Launch)

- **Signup Conversion:** % of visitors who sign up
- **Free to Pro Conversion:** % of Free users who upgrade
- **Monthly Recurring Revenue (MRR):** $29 × Pro subscribers
- **Churn Rate:** % of Pro users who cancel
- **Net Promoter Score (NPS):** User satisfaction

### User Experience Metrics

- **Time to First Value:** < 2 minutes (signup → first watchlist ticker)
- **Preview Engagement:** % of unauthenticated users who explore features
- **Feature Adoption:** % of Pro users using Telegram/Tiger Brokers

---

## Next Steps

### Immediate Actions (This Week)

1. **Review this document** with stakeholders
2. **Create staging environment** with production data copy
3. **Set up monitoring** (error tracking, performance)
4. **Test Replit Auth** integration on staging
5. **Create Phase 1 migration scripts**

### Phase 1 Start (Next Week)

1. Run Phase 0 preparation tasks
2. Execute Phase 1 migrations on staging
3. Verify data integrity
4. Get approval to proceed to production
5. Execute Phase 1 on production (off-hours)

### Long-term Roadmap

**Month 1:** Phases 1-2 (Multi-user + Auth)  
**Month 2:** Phase 3 (Frontend + Feature Gating)  
**Month 3:** Testing + Soft Launch  
**Month 4:** Phase 4 (Stripe Integration)  
**Month 5:** Marketing + Growth

---

## Appendix

### Environment Variables

**New variables needed:**

```bash
# Replit Auth (provided by blueprint)
REPLIT_AUTH_CLIENT_ID=xxx
REPLIT_AUTH_CLIENT_SECRET=xxx

# Session
SESSION_SECRET=xxx  # Already exists

# Feature Flags
MULTI_USER_ENABLED=true
ENFORCE_AUTH=true
SUBSCRIPTION_GATING=true

# Stripe (Phase 4)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRO_PRICE_ID=price_xxx

# Application
APP_URL=https://your-app.replit.app
```

### Database Indexes

**Performance indexes to add:**

```sql
-- User lookups
CREATE INDEX idx_users_replit_user_id ON users(replit_user_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id);

-- User data queries
CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_positions_user_status ON positions(user_id, status);
CREATE INDEX idx_watchlist_tickers_user_id ON watchlist_tickers(user_id);
CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_scan_results_user_id ON scan_results(user_id);
```

### Monitoring & Alerts

**Set up monitoring for:**

- API response times (alert if > 500ms avg)
- Error rates (alert if > 1% of requests)
- Database connection pool (alert if exhausted)
- Failed login attempts (alert if > 10/min)
- Subscription webhook failures (alert immediately)
- Daily active users (track growth)

### Support & Documentation

**Create user documentation:**

1. **Getting Started Guide**
   - How to sign up
   - Adding your first watchlist ticker
   - Understanding scan results

2. **Free vs Pro Comparison**
   - What you get with each tier
   - How to upgrade
   - How to cancel

3. **Integration Guides**
   - Setting up Telegram alerts
   - Connecting Tiger Brokers
   - Configuring scan schedules

4. **FAQ**
   - Billing questions
   - Technical issues
   - Feature requests

---

## Conclusion

This transformation from single-user to multi-tenant SaaS is a significant undertaking, but with careful planning and execution, it can be done safely while preserving all production data. The key is to proceed incrementally, test thoroughly, and always maintain the ability to roll back.

**Core principles to remember:**

1. **Data safety above all else** - Never risk production data
2. **Test on staging first** - Every change proven before production
3. **One phase at a time** - Complete and verify before moving on
4. **User experience matters** - Preview mode should delight, not frustrate
5. **Scalability from day one** - Multi-tenant architecture done right

Good luck with your SaaS transformation! 🚀

---

**Document End**
