# Zen Options - Pricing Strategy

**Last Updated:** December 2, 2025  
**Status:** Active

---

## Pricing Overview

Zen Options uses a freemium model with two tiers: **Free** and **Pro**.

### Core Pricing

| Tier | Regular Price | Promo Price | Billing |
|------|---------------|-------------|---------|
| Free | $0 | - | - |
| Pro | $20/month | $9/month | Monthly recurring |

**Note:** The $20 is the core price point and should remain visible. The promotional pricing shows $20 slashed to $9.

---

## Feature Comparison

| Feature | Free | Pro |
|---------|------|-----|
| **Watchlist** | 3 tickers | Unlimited |
| **Positions** | 3 positions | Unlimited |
| **Automated Scans** | 1x daily (market open) | 4x daily* |
| **Manual Scans** | 2 per day | Unlimited |
| **ZenStatus Updates** | Once daily | Real-time (every minute) |
| **Telegram Alerts** | ❌ No | ✅ Yes |
| **Tiger Brokers Sync** | ❌ No | ✅ Yes (coming soon) |
| **MooMoo Integration** | ❌ No | ✅ Yes (coming soon) |
| **Priority Scanning Engine** | ❌ No | ✅ Yes (coming soon) |

*Pro automated scans: Pre-market, market open, intraday, and market close

---

## Tier Details

### Free Tier

**Target Users:** New traders exploring systematic options trading, users evaluating the platform

**Included Features:**
- 3 watchlist tickers
- 3 open positions
- 1 automated scan daily (market open at 9:30 AM ET)
- 2 manual scans per day
- ZenStatus guidance updated once daily
- Credit Spread, Iron Condor, and LEAPS scanner access
- Support/Resistance levels display
- Position P/L tracking

**Limitations:**
- Limited to 2 manual scans per day (Pro has unlimited)
- No Telegram alert notifications
- No broker integration for auto-sync
- Limited watchlist and position capacity
- ZenStatus updates only once daily

### Pro Tier ($20/month → $9/month promotional)

**Target Users:** Active options traders who want full automation and unlimited capacity

**Included Features:**
- Unlimited watchlist tickers
- Unlimited open positions
- 4 automated scans daily (pre-market, market open, intraday, market close)
- Unlimited manual scans
- Real-time ZenStatus updates (every minute during market hours)
- Telegram alert notifications for all position events
- Tiger Brokers integration for automatic position sync (coming soon)
- MooMoo integration for automatic position sync (coming soon)
- Priority scanning engine (coming soon)

---

## Implementation Notes

### Feature Gating

Feature limits are enforced in the backend storage layer. Each operation checks the user's subscription tier before allowing the action.

**Watchlist Limit Check:**
```typescript
// Free tier: max 3 watchlist tickers
if (user.subscriptionTier === 'free' && currentCount >= 3) {
  throw new Error('Free tier limit: 3 watchlist tickers max');
}
```

**Position Limit Check:**
```typescript
// Free tier: max 3 positions
if (user.subscriptionTier === 'free' && currentCount >= 3) {
  throw new Error('Free tier limit: 3 positions max');
}
```

**Manual Scan Limit Check:**
```typescript
// Free tier: 2 manual scans per day, quota resets daily
if (user.subscriptionTier === 'free' && dailyScanCount >= 2) {
  throw new Error('Free tier limit: 2 manual scans per day');
}
```

**Telegram Alerts:**
```typescript
// Pro tier only
if (user.subscriptionTier !== 'pro') {
  // Skip telegram notification
  return;
}
```

### Stripe Configuration

- **Product Name:** Zen Options Pro
- **Price ID:** Stored in `STRIPE_PRO_PRICE_ID` environment variable
- **Regular Price:** $20/month
- **Promotional Price:** $9/month (requires separate Stripe coupon or promotional price)

### Database Fields

User subscription data stored in `users` table:
- `subscriptionTier`: 'free' | 'pro'
- `subscriptionStatus`: 'active' | 'cancelled' | 'past_due'
- `stripeCustomerId`: Stripe customer ID
- `stripeSubscriptionId`: Stripe subscription ID
- `subscriptionStartDate`: When subscription began
- `subscriptionEndDate`: When subscription expires (for cancelled)

---

## Upgrade Flow

1. User hits a limit (watchlist, positions, or manual scans)
2. Toast notification appears with "Upgrade to Pro" button
3. User clicks → redirected to /pricing page
4. User clicks "Get Pro" → Stripe Checkout
5. After payment → webhook updates user to Pro tier
6. User redirected back to app with Pro access

---

## Promotional Strategy

**Launch Promotion:**
- Regular price: $20/month (always visible, struck through)
- Promotional price: $9/month (highlighted)
- Creates urgency and shows value

**Display Format:**
```
~~$20~~ $9/month
```

---

## Future Considerations

- Annual billing option ($99/year = ~$8.25/month)
- Team/Family plans
- Lifetime deal for early adopters
- Enterprise tier for financial advisors
