# Zen Options - Product Backlog

Last Updated: December 1, 2025 (API Usage Tracking completed)

## Backlog Overview

This document contains planned features, fixes, and improvements for Zen Options. Items are categorized by priority and include complexity and impact assessments to aid in sprint planning and grooming sessions.

---

## Priority: Medium-High

### Epic #9: MooMoo and WeBull Broker Integration
**Type:** Feature  
**Complexity:** High (8 story points)  
**Impact:** Medium  
**Status:** Planned

**Description:**  
Similar to Tiger Brokers integration, enable automatic position syncing with MooMoo brokerage accounts. This allows Pro users to automatically import positions instead of manual entry.

**Acceptance Criteria:**
- [ ] Research MooMoo API capabilities and authentication
- [ ] Implement MooMoo API client
- [ ] Map MooMoo position data to Zen Options schema
- [ ] Support Credit Spreads, Iron Condors, and LEAPS
- [ ] Auto-sync positions on schedule (similar to Tiger)
- [ ] Handle position updates and closures
- [ ] Add MooMoo account configuration in settings
- [ ] Support multiple broker accounts per user

**Dependencies:**
- MooMoo API access and documentation
- User authentication with MooMoo
- API key management (use Replit secrets integration)

**Technical Notes:**
- Follow same pattern as Tiger Brokers integration
- May need Python SDK or REST API client
- Consider rate limits and API quotas

---

## Priority: Medium

### Epic #8: User-Configurable Rules Engine
**Type:** Feature  
**Complexity:** High (8 story points)  
**Impact:** Medium  
**Status:** Planned

**Description:**  
Currently scan parameters, monitoring rules, and ZenStatus thresholds are hardcoded. Allow users to configure their own trading rules and methodology to match their risk tolerance and trading style.

**Acceptance Criteria:**
- [ ] **Scan Configuration UI:**
  - [ ] Min/max DTE ranges
  - [ ] Min credit amount
  - [ ] Risk:reward ratio range
  - [ ] Delta range preferences
  - [ ] Max bid-ask spread tolerance
- [ ] **Position Monitoring Configuration:**
  - [ ] Profit target percentages
  - [ ] Stop-loss thresholds
  - [ ] DTE exit points
  - [ ] Strike breach behavior
- [ ] **ZenStatus Rules Configuration:**
  - [ ] Customizable DTE thresholds per status
  - [ ] Profit target adjustments
  - [ ] Monitor trigger conditions
- [ ] Save multiple rule presets (Conservative, Moderate, Aggressive)
- [ ] Apply different rules to different positions

**Dependencies:**
- Settings infrastructure (already exists)
- Scanner service refactoring
- Monitor service refactoring
- ZenStatus service refactoring

**Technical Notes:**
- Store rules in database per user
- Validate rules for logical consistency
- Provide sensible defaults based on proven strategies

---

## Priority: Low

### Epic #5: Support/Resistance Chart Visualization
**Type:** Feature  
**Complexity:** Low-Medium (3 story points)  
**Impact:** Low  
**Status:** Planned

**Description:**  
Add small snapshot chart to watchlist and scanner results showing S/R lines overlaid on recent price action. This provides visual context for support and resistance levels.

**Acceptance Criteria:**
- [ ] Mini chart component showing 30-day price action
- [ ] Horizontal lines for support and resistance levels
- [ ] Color-coded zones (support = green, resistance = red)
- [ ] Current price indicator
- [ ] Display in watchlist table (optional column)
- [ ] Display in scanner result cards
- [ ] Mobile-responsive chart sizing

**Dependencies:**
- Historical price data (already available)
- S/R levels (already in database)
- Chart library (recharts already installed)

**Technical Notes:**
- Keep chart simple and lightweight
- Cache chart data to avoid excessive API calls

---

## Backlog Management

**Legend:**
- **Complexity:** Story point estimation (1-13 scale, Fibonacci)
  - 1-2: Simple fix or small feature
  - 3-5: Medium feature requiring some design
  - 8: Large feature requiring significant effort
  - 13: Epic that should be broken down further
- **Impact:** Expected business/user value
  - Low: Nice to have, improves UX
  - Medium: Valuable feature, competitive advantage
  - High: Critical capability, major differentiation
- **Priority:** Order of implementation
  - High: Should be in next 1-2 sprints
  - Medium-High: Next 2-4 sprints
  - Medium: Next 3-6 months
  - Low: Future consideration

**Grooming Notes:**
- Review and re-prioritize quarterly
- Break down 8+ point stories before sprint planning
- Consider dependencies when scheduling
- Reassess impact/complexity based on learnings

----------------------------------------------------------------------------------------------------

## Completed Features
*(Moved here after implementation)*

### Epic #7: Alert System Refactoring ✅
**Type:** Enhancement  
**Complexity:** Medium (5 story points)  
**Impact:** Medium  
**Status:** Completed  
**Completed:** December 16, 2025

**Description:**  
Review and improve the alert system to align with new ZenStatus logic and scanning mechanisms. Ensure alerts are actionable, timely, and not overwhelming.

**Acceptance Criteria:**
- [x] Audit current alert types and triggers
- [x] Align alerts with ZenStatus states:
  - [x] ZEN: No alerts (position on track)
  - [x] PROFIT READY: Alert to take profit
  - [x] MONITOR: Informational alert with recommended actions
  - [x] ACTION NEEDED: Urgent alert requiring decision
- [x] Implement alert deduplication improvements (cooldown-based)
- [x] Allow users to configure alert sensitivity
- [N/A] Add alert priority levels (deferred - not needed)
- [N/A] Group related alerts (deferred - not needed)
- [N/A] Add snooze/remind later functionality (not needed per user)

**Implementation Highlights:**
- **ZenStatus Guidance Settings Card:** Redesigned settings page with clear separation between ZenStatus configuration (available to all users) and Telegram alert toggles (Pro feature)
- **Per-Trigger Telegram Control:** Users can enable/disable Telegram alerts for each alert type independently (Profit Ready, Action Needed, Monitor)
- **Configurable Action Triggers:** Granular control over what conditions trigger ACTION NEEDED alerts (B/E breached, Strike breached, DTE thresholds per strategy, Loss zone %)
- **Profit Threshold Slider:** Users can set profit target (50-70%) for PROFIT READY alerts
- **Alert Cooldown:** Configurable cooldown period (1-24 hours) to prevent alert fatigue
- **Removed Master Toggle:** No global on/off switch - each alert type has its own independent toggle

**Technical Files:**
- Settings UI: `client/src/pages/settings.tsx` - ZenStatus Guidance card
- Monitor Service: `server/services/monitor.ts` - Per-trigger alert generation
- ZenStatus Service: `server/services/zenStatus.ts` - Status calculation logic

**Dependencies:**
- ZenStatus service (already exists)
- Alert storage (already exists)
- Telegram integration (already exists)

---

### Epic #1: Empty State UX Improvement ✅
**Type:** Fix  
**Complexity:** Low (2 story points)  
**Impact:** Medium  
**Status:** Completed  
**Completed:** December 1, 2025

**Description:**  
Fixed confusing empty state messaging when filtering positions by status. Created a shared EmptyState component with contextual messages and CTAs for each position tab.

**Acceptance Criteria:**
- [x] Keep Portfolio Status section visible always
- [x] Show appropriate empty state messages per tab:
  - [x] Open tab: "No open positions yet"
  - [x] Pending tab: "No pending orders"
  - [x] Closed tab: "No closed positions in history"
- [x] First-time users: Show onboarding message with helpful guidance
- [x] Add contextual CTAs per tab (e.g., "Run Scanner" vs "Add Position")
- [x] Maintain visual consistency across all empty states

**Implementation Highlights:**
- **Shared Component:** `client/src/components/empty-state.tsx` - Reusable EmptyState component
- **Contextual CTAs:** Different action buttons per tab (Add Position, Run Scanner)
- **Visual Consistency:** Centered layout with consistent typography and spacing

**Technical Files:**
- Component: `client/src/components/empty-state.tsx`
- Usage: `positions-open.tsx`, `positions-pending.tsx`, `positions-closed.tsx`

---

### Epic #6: Admin Dashboard ✅
**Type:** Feature  
**Complexity:** Medium (5 story points)  
**Impact:** Medium  
**Status:** Completed  
**Completed:** December 1, 2025

**Description:**  
Created a comprehensive admin dashboard for monitoring user signups, subscription status, system health, and usage metrics. The dashboard features two focused tables separating User Details from Trading Analytics.

**Acceptance Criteria:**
- [x] Protected admin route (role-based access)
  - Environment variable password (ADMIN_PASSWORD)
  - Session-based auth with isAdmin flag on users table
- [x] User metrics:
  - [x] Total signups (free vs pro) - Summary cards + pie chart
  - [x] Daily/weekly/monthly signup trends - Bar chart with monthly signups
  - [x] Subscription conversion rate - Displayed in Pro Subscribers card
  - [x] Active users (last 7/30 days) - Weekly active count in Total Users card
- [x] System metrics:
  - [x] API usage - Full tracking with Epic #7 implementation
  - [x] Scan execution statistics - Total scans, qualified scans, success rate
  - [x] Position monitoring statistics - Active/closed positions, strategy breakdown
  - [x] Alert delivery success rate - Telegram message tracking implemented
- [x] User list with search and filters - Two tables with search + tier filter
- [x] User detail visibility - Detailed per-user stats in table rows

**Implementation Highlights:**
- **Two-Table Design:** User Details table (administrative info) + Trading Analytics table (usage patterns)
- **Visual Analytics:** Bar chart for signup trends, pie chart for tier breakdown, color-coded strategy breakdown
- **Engagement Scoring:** 0-100 score based on watchlist, positions, scans, integrations, and login recency
- **Trading Stats:** Per-user strategy breakdown (CS/IC/LEAPS), total trades, win rate, realized P/L
- **Security:** Environment variable password, session-based isAdmin flag, no hardcoded credentials
- **MRR Tracking:** Monthly Recurring Revenue calculation based on Pro subscribers
- **API Usage Section:** Added with Epic #7 - comprehensive tracking and cost monitoring

**Technical Files:**
- Frontend: `client/src/pages/admin.tsx` - Dashboard UI with charts and tables
- Backend: `server/routes.ts` - `/api/admin/metrics/users`, `/api/admin/metrics/system` endpoints
- Schema: `shared/schema.ts` - isAdmin field on users table

---

### Epic #11: API Usage Tracking & Cost Monitoring ✅
**Type:** Feature  
**Complexity:** Medium (5 story points)  
**Impact:** Medium  
**Status:** Completed  
**Completed:** December 1, 2025

**Description:**  
Implemented comprehensive API usage tracking across all external service providers to monitor costs, success rates, and latency. This enables cost management and system health visibility for the admin dashboard.

**Tracked Providers:**
- **Polygon API:** getQuote, getHistoricalData, getOptionChain, getAvailableExpiries, marketContextSnapshot
- **OpenAI API:** marketContext, supportResistance (GPT-4o calls)
- **FRED API:** getVIX (VIX data fetching)
- **Stripe API:** createCheckoutSession, createPortalSession, getSubscription, webhookEvents
- **Telegram API:** sendMessage (alert delivery)

**Acceptance Criteria:**
- [x] Create api_usage database table for persistent tracking
- [x] Build ApiUsageTracker service with in-memory buffering and daily aggregation
- [x] Instrument all Polygon API calls (5 endpoints)
- [x] Instrument OpenAI API calls (market context + S/R detection)
- [x] Instrument FRED API calls (VIX data)
- [x] Instrument Stripe API calls (4 operations)
- [x] Instrument Telegram API calls (message sending with delivery status)
- [x] Create /api/admin/metrics/api-usage endpoint with 7-day rolling stats
- [x] Build admin UI with summary cards, provider breakdown, daily trend chart, and cost estimates

**Cost Estimates:**
- Polygon: $0.00001/call (minimal)
- OpenAI: $0.01/call (GPT-4o pricing)
- FRED/Stripe/Telegram: Free tier

**Implementation Highlights:**
- **In-Memory Buffer:** Reduces database writes by aggregating calls before flushing
- **Daily Aggregation:** Groups calls by provider, endpoint, and date for efficient queries
- **Success Rate Tracking:** Monitors API health with success/failure counts
- **Latency Monitoring:** Tracks average response times per endpoint
- **Visual Dashboard:** Summary cards, provider breakdown with progress bars, line chart for trends

**Technical Files:**
- Service: `server/services/api-usage-tracker.ts` - Core tracking logic with buffer and flush
- Schema: `shared/schema.ts` - api_usage table definition
- Storage: `server/storage.ts` - Database operations for API usage
- Backend: `server/routes.ts` - `/api/admin/metrics/api-usage` endpoint
- Frontend: `client/src/pages/admin.tsx` - API Usage & Cost Tracking section
- Instrumented: `server/services/marketData.ts`, `server/services/marketContext.ts`, `server/services/supportResistance.ts`, `server/services/telegram.ts`, `server/routes.ts` (Stripe)

---

### Epic #10: Onboarding Tutorial (Quick Start) ✅
**Type:** Feature  
**Complexity:** Low-Medium (3 story points)  
**Impact:** Medium  
**Status:** Completed  
**Completed:** November 30, 2025

**Description:**  
Created a focused "Quick Start" onboarding flow that guides new users through the core features: adding a ticker, understanding auto S/R, running a scan, interpreting results, and adding their first position with ZenStatus.

**Quick Start Tutorial Flow (9 Steps):**
1. **Welcome Modal** → "Let's set up your first trade in 2 minutes"
2. **Add Ticker** → Guide to watchlist, use autocomplete search (📋 Watchlist page)
3. **Auto S/R** → Show refresh button for Support/Resistance detection (📋 Watchlist page)
4. **Select Strategy** → Navigate sub-menu between CS & IC, LEAPS, Market Context (🔍 Scanner page)
5. **Run Scan** → Highlight Scanner button, explain what happens (🔍 Scanner page)
6. **Scan Results** → Walk through candidates and ready trades (🔍 Scanner page)
7. **Manage Positions** → Navigate sub-menu between Open, Pending, Closed (💼 Positions page)
8. **Add Position** → Show how to add positions manually (💼 Positions page)
9. **ZenStatus** → Introduce the guidance system (💼 Positions page)
10. **Celebration** → "You're All Set!" with workflow summary

**Acceptance Criteria:**
- [x] Welcome modal on first login (only when `onboardingCompleted = false`)
- [x] Step-by-step tutorial covering all key features
- [x] Interactive tooltips on key UI elements using driver.js
- [x] Skip/dismiss option for experienced users
- [x] Progress tracking with resume capability (stored in user settings)
- [x] "Tutorial" menu item in Profile dropdown to restart anytime
- [x] Video tutorial link placeholders (to be populated later)
- [x] KIV: Telegram alerts configuration (separate optional flow later)

**Implementation Highlights:**
- **driver.js Integration:** Lightweight (~4KB) step-by-step highlight library
- **Cross-Page Navigation:** Uses window.history.pushState + PopStateEvent for reliable routing with wouter
- **Resume Capability:** Welcome modal shows "Continue Where I Left Off" if user has progress
- **Page Labels:** Each step displays page context (📋 Watchlist, 🔍 Scanner, 💼 Positions)
- **Celebration Step:** Final step congratulates user and summarizes the workflow
- **Video Placeholder:** "Watch the tutorial (coming soon)" link ready for future content

**Technical Files:**
- Provider: `client/src/components/onboarding/OnboardingProvider.tsx` - Context, driver.js configuration, navigation logic
- Modal: `client/src/components/onboarding/WelcomeModal.tsx` - Welcome/resume modal
- Navigation: `client/src/components/layout/main-navigation.tsx` - Tutorial menu item in profile dropdown
- Styles: `client/src/index.css` - Custom popover styles

---

### Epic #12: LEAPS Scanner ✅
**Type:** Feature  
**Complexity:** Medium (5 story points)  
**Impact:** Medium  
**Status:** Completed  
**Completed:** November 29, 2025

**Description:**  
Add LEAPS (Long-term Equity Anticipation Securities) scanning capability to identify long-term bullish opportunities. This is separate from the Credit Spread and Iron Condor scanners.

**Acceptance Criteria:**
- [x] Identify undervalued long-term options (>180 DTE) - minDTE: 365 days
- [x] Good intrinsic vs extrinsic value ratio - extrinsicCents, extrinsicPercent, extrinsicRating, extrinsicInsight
- [x] Strong technical setup on underlying (uptrend) - uqsScore with trendStrength component (25% weight)
- [x] Delta-based selection criteria (0.70-0.80 for deep ITM) - Delta range 0.80-0.85 implementation
- [x] Add LEAPS results to scanner UI - Dedicated LEAPS tab in scanner.tsx with full results display

**Implementation Highlights:**
- **LEAPS-Specific Tab:** Separate LEAPS tab displays all suitable long-dated options in the scanner
- **Zen LEAPS Value Index (ZLVI):** Proprietary 50/30/20 scoring: 50% extrinsic efficiency, 30% IV rank, 20% delta
- **Underlying Quality Score (UQS):** 25% trend strength (52-week position), 25% cash flow health, 25% stability (market cap + beta), 25% earnings (EPS growth + ROE + P/E)
- **ETF Handling:** Detects 30+ index/sector/leveraged ETFs (SPY, QQQ, IWM, etc.) with separate scoring: 20pts stability (inherent diversification), 15pts cash flow, 15pts earnings, trend strength 0-25pts. Never WEAK rating.
- **Data Transparency:** Raw fundamentals displayed with Finnhub API attribution and fetch timestamps
- **Contract Metrics:** Extrinsic %, IV Rank, IV Percentile, Liquidity, Open Interest with interactive tooltips
- **Market Context Integration:** LEAPS confidence score boosted/reduced based on market sentiment alignment
- **AI-Powered Fundamentals:** Fallback chain for data sources (FCF + margins → net-margin only → market cap tier) ensuring robust calculations

**Technical Files:**
- Service: `server/services/leapsScanner.ts` - Core LEAPS scanning logic
- Fundamentals: `server/services/fundamentals.ts` - UQS calculations, ETF detection
- UI: `client/src/pages/scanner.tsx` - LEAPS tab and card display
- Schema: `shared/schema.ts` - ScanResult extended with LEAPS fields

**Dependencies:**
- [x] Option chain data with long-dated expirations
- [x] Trend detection logic
- [x] Underlying quality scoring (fundamentals)
- [x] Market context analysis

---

### Epic #3: Iron Condor Scanner ✅
**Type:** Feature  
**Complexity:** Medium (5 story points)  
**Impact:** High  
**Status:** Completed  
**Completed:** November 27, 2025

**Description:**  
Added Iron Condor scanning to identify neutral/range-bound setups. The scanner runs alongside Credit Spreads with a single "Scan" button, using conflict resolution logic (IC evaluated first, CS only if IC doesn't qualify).

**Iron Condor Specifications:**
- **DTE Target:** 45 days (same as Credit Spreads, 38-52 range)
- **Short Strike Delta:** 0.15 - 0.21 (both PUT and CALL sides)
- **Spread Width:** $10 wide for the long strike on each side
- **Risk:Reward Target:** 1:2.5
- **Structure:** Simultaneous PUT spread + CALL spread

**Entry Signal Criteria:**
1. **Neutral RSI:** RSI between 40-60 (not oversold/overbought)
2. **StochRSI Momentum Filter:** StochRSI K between 20-80 (extremes = directional bias, CS priority)
3. **Price Mid-Range:** Current price in 30-70% of S/R range
4. **Ranging Price History:** 90-day trend analysis with ranging score calculation

**Acceptance Criteria:**
- [x] Implement Iron Condor entry signal detection (neutral, mid-range, ranging)
- [x] Find both PUT spread and CALL spread simultaneously
- [x] Short strikes at 0.15-0.21 delta on both sides
- [x] $10 wide spreads (short + $10 = long strike)
- [x] Calculate combined premium and R:R (target 1:2.5)
- [x] PUT short strike must be below Support
- [x] CALL short strike must be above Resistance
- [x] Score Iron Condor opportunities similar to Credit Spreads
- [x] Display IC results alongside CS results (Candidates, Setup, No Signal grouping)
- [x] Single "Scan" button triggers both CS and IC scans

**Technical Implementation:**
- Service: `server/services/scanner.ts` - `scanTickerForIC()`, `checkIronCondorSignal()`, `findBestIronCondor()`, `detectRangingPrice()`
- Conflict Resolution: IC evaluated first in `runDailyScan()`, CS skipped if IC qualifies
- Scoring: R:R score (40%) + premium balance (30%) + delta score (30%)
- UI: Strategy filter dropdown, "Iron Condor" / "IC SETUP" labels, same grouping as CS

**Additional Features:**
- Scan status persistence across page navigation
- Active scan progress banner
- Old scan indicator (>24 hours)
- 5-day batch filter in dropdown

---

### Recent Bug Fixes & Refinements (November 26, 2025) ✅
**Type:** Maintenance  
**Status:** Completed

**Changes:**
- Fixed Pending Orders page display - removed "Unrealised P/L" and "Entered" columns (not applicable for unexecuted orders)
- Updated Pending Orders subtotal row to display "Total Orders: X" instead of total P/L
- Verified Market Context Service uses FRED API for VIX data (consistent with market ticker header)
- Confirmed market context analysis can be refreshed on-demand to get latest market regime assessment

---

### Epic #4: Automated Support/Resistance Detection ✅
**Type:** Feature  
**Complexity:** Medium (5 story points)  
**Impact:** High  
**Status:** Completed  
**Completed:** November 24, 2025

**Description:**  
Implemented AI-powered S/R level detection combining technical analysis algorithms with GPT-4o validation. The system automatically detects and ranks support/resistance levels, refreshing weekly for all watchlist tickers.

**Implementation Highlights:**
- Hybrid technical + LLM approach: Pivot points, consolidation zones, volume clusters, round numbers detection using 6 months of daily OHLC data from Polygon API
- GPT-4o validation ranks detected levels, adds context (e.g., "200-day MA", "earnings high"), and assigns 0-100 confidence scores
- Weekly auto-refresh via cron job (Sunday 2:30 AM ET)
- Manual per-ticker refresh with rate-limit handling
- Timestamp-based priority allows users to override AI suggestions
- Scanner integration reads highest-confidence levels for strike selection

**Acceptance Criteria:**
- [x] Fetch historical price data for analysis (6 months via Polygon)
- [x] Use LLM to identify key S/R levels from price action (GPT-4o with structured outputs)
- [x] Auto-update S/R levels in database on weekly schedule (Sunday 2:30 AM ET cron)
- [x] Provide confidence scores for each level (0-100 scale with context)
- [x] Allow manual override/adjustment if needed (timestamp-based priority system)
- [x] Display last updated timestamp for S/R levels (srLastUpdated field)

**Technical Implementation:**
- Service: `server/services/supportResistance.ts`
- Database: `supportLevels` and `resistanceLevels` JSONB arrays in tickers table
- API Endpoints: `GET /api/tickers/:tickerId/sr-levels`, `POST /api/tickers/:tickerId/refresh-sr`
- Frontend: Watchlist displays multi-level S/R with confidence tooltips, per-ticker refresh button

---

### Epic #2: AI-Powered Market Context Analysis ✅
**Type:** Feature  
**Complexity:** High (8 story points)  
**Impact:** High  
**Status:** Completed  
**Completed:** November 20, 2025

**Description:**  
Implemented LLM-based market analysis using GPT-4o to interpret macro and micro market conditions. The system runs 4 times daily (pre-market, after-open, intraday, EOD) and adjusts scanner confidence scores based on sentiment alignment.

**Implementation Highlights:**
- 4-schedule automated analysis system (8:00 AM, 10:30 AM, 12:30 PM, 4:15 PM ET)
- Context-aware LLM prompts customized for each analysis type
- Integration with FRED API for VIX data and Polygon API for SPY/QQQ
- Per-ticker sentiment analysis with news headlines
- Scanner integration: +15% boost for aligned trades, -30% reduction for misaligned
- Full AI transparency with expandable analysis panels in UI
- 30-day data retention with automatic cleanup

**Acceptance Criteria:**
- [x] Integrate LLM API for market analysis (GPT-4o with structured outputs)
- [x] Analyze current VIX levels and market regime before scanning
- [x] Filter or adjust scan recommendations based on market context
- [x] Include market context explanation in scan results
- [x] Prevent/adjust bullish strategies when misaligned with market sentiment
- [x] Add configuration for market context sensitivity (sentiment alignment system)

**Technical Implementation:**
- Service: `server/services/marketContext.ts`
- Database: `marketContextAnalysis` table with JSON storage
- Scheduler: 4 cron jobs in `server/services/scheduler.ts`
- Frontend: Expandable market context panels in scanner results
- API Endpoints: `/api/market-context/latest`, `/api/market-context/history`

---
