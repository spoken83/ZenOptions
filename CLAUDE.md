# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server (tsx server/index.ts) on port 5000
npm run build      # Vite client build + esbuild server bundle → dist/
npm run start      # Production server (NODE_ENV=production node dist/index.js)
npm run deploy     # Build + restart launchd service
npm run check      # TypeScript type check (tsc)
npm run db:push    # Push Drizzle schema changes to Neon PostgreSQL
```

No test framework is configured. Use `npm run check` for type validation.

## Architecture

**Full-stack TypeScript SaaS** — Vite + React frontend, Express backend, Drizzle ORM on Neon PostgreSQL.

### Server (`server/`)

- **Entry:** `server/index.ts` — Express app setup, middleware, Vite dev integration
- **Routes:** `server/routes.ts` — Top-level routes (auth, Stripe webhook, positions CRUD, scan endpoints). Domain routers in `server/routes/` (watchlist, scanner, portfolios, market, alerts, settings, admin, reconciliation)
- **Storage:** `server/storage.ts` — `IStorage` interface + `DatabaseStorage` implementation. All queries scoped by `userId`
- **Auth:** `server/auth0.ts` — Auth0 + Passport.js, PostgreSQL session store. Key middleware: `isAuthenticated`, `optionalAuth`, `requireUser`, `getEffectiveUserId`
- **Tiers:** `server/tierLimits.ts` — Free vs Pro enforcement functions (`checkWatchlistLimit`, `checkScanQuota`, etc.)

### Services (`server/services/`)

~10K LOC across 23 services. The critical ones:

- **scanner.ts** (74KB) — Core Credit Spread / Iron Condor scanning engine. Candidate filtering, delta/RR scoring
- **leapsScanner.ts** (28KB) — LEAPS option analysis with UQS (Underlying Quality Score)
- **zenStatus.ts** (28KB) — Position guidance engine. Computes ZenStatus ('zen'/'profit'/'monitor'/'action') with rules per strategy type
- **scheduler.ts** (15KB) — node-cron background jobs: per-user monitoring, auto-scanning, timezone-aware (ET)
- **monitor.ts** (11KB) — Position monitoring, alert generation (tp50/stop2x/dte21), Telegram notifications
- **marketData.ts** (22KB) — Polygon API integration with Yahoo Finance fallback, caching
- **priceCache.ts** (14KB) — In-memory TTL price cache
- **marketContext.ts** (18KB) — VIX/regime analysis + OpenAI-powered market sentiment
- **supportResistance.ts** (26KB) — Auto-detection of S/R levels
- **reconciliation.ts** (29KB) — PDF/CSV statement import and trade matching
- **telegramService.ts** (17KB) — Telegram alert delivery (Pro-only)
- **tigerBrokers.ts** + **tigerPositionMapper.ts** — Tiger Brokers position sync

### Client (`client/src/`)

- **Routing:** Wouter (lightweight). 22 pages defined in `App.tsx`
- **State:** TanStack React Query. Query keys match API paths: `["/api/..."]`
- **Auth hook:** `useAuth()` — fetches `/api/auth/user`, returns `{user, isLoading, isAuthenticated}`
- **Protected routes:** `<ProtectedRoute>` component wraps authenticated pages
- **UI:** shadcn/ui (new-york style) + Tailwind CSS + Framer Motion + Recharts

### Shared (`shared/`)

- **schema.ts** — Drizzle schema with 14+ tables: users, watchlist, tickers, portfolios, positions, indicators, scan_results, alerts, settings, feedback, marketContextAnalysis, apiUsage, sessions
- All tables multi-tenant via `userId` foreign key

## Key Patterns

- **Multi-tenancy:** Every DB table has `userId`. All storage queries filter by userId. Use `requireUser()` in routes to get the authenticated user
- **Strategy types:** `CREDIT_SPREAD`, `IRON_CONDOR`, `LEAPS`, `COVERED_CALL` — used in positions, scan results, and zenStatus logic
- **Monetary values in cents:** Fields like `entryCreditCents`, `exitDebitCents`, `creditMidCents` store money as integers
- **Stripe webhooks:** `POST /api/stripe/webhook` uses `rawBody` for signature verification — the `express.json()` middleware captures this
- **Domain routers:** Mounted from `server/routes/*.ts` and registered in `routes.ts`
- **Path aliases:** `@/*` → `client/src/*`, `@shared/*` → `shared/*`, `@assets/*` → `attached_assets/*`

## Deployment

Self-hosted on Mac mini: Cloudflare Tunnel → Caddy (:8081) → Node.js (:5001)
Managed via launchd (`com.zenoptions.plist`). Use `npm run deploy` to build and restart.
