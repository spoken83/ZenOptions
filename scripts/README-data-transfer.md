# Data Transfer Guide

This guide helps you transfer all existing data from the system owner account to your personal Replit account.

## Prerequisites

1. Log in to the app with your real Replit account
2. Access to the database (via Replit Database pane or psql)

## Steps for Development Database

### Option A: Automated Transfer (I can do this for you)

1. **Log in** to the app with your Replit account
2. **Tell me your email address** (the one you used to log in)
3. I'll run the transfer automatically

### Option B: Manual Transfer

1. **Find your user ID:**
   ```sql
   SELECT id, email FROM users WHERE email = 'your@email.com';
   ```
   Copy your user ID (looks like: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

2. **Run the transfer script:**
   ```sql
   -- Replace YOUR_USER_ID with your actual ID
   \set target_user_id 'YOUR_USER_ID'
   \i scripts/transfer-data.sql
   ```

## Steps for Production Database

⚠️ **Important**: I cannot access your production database. You must do this yourself.

1. **Access your production database** via Replit's Database pane
2. **Switch to "Production" mode** in the database viewer
3. **Find your user ID** (same query as above)
4. **Run these commands** (replace `YOUR_USER_ID`):

```sql
BEGIN;

UPDATE positions SET user_id = 'YOUR_USER_ID' 
WHERE user_id = 'c9c31f9a-f659-475b-97e5-a5bc18a8a724';

UPDATE watchlist SET user_id = 'YOUR_USER_ID' 
WHERE user_id = 'c9c31f9a-f659-475b-97e5-a5bc18a8a724';

UPDATE portfolios SET user_id = 'YOUR_USER_ID' 
WHERE user_id = 'c9c31f9a-f659-475b-97e5-a5bc18a8a724';

UPDATE alerts SET user_id = 'YOUR_USER_ID' 
WHERE user_id = 'c9c31f9a-f659-475b-97e5-a5bc18a8a724';

UPDATE scan_results SET user_id = 'YOUR_USER_ID' 
WHERE user_id = 'c9c31f9a-f659-475b-97e5-a5bc18a8a724';

UPDATE tickers SET user_id = 'YOUR_USER_ID' 
WHERE user_id = 'c9c31f9a-f659-475b-97e5-a5bc18a8a724';

UPDATE indicators SET user_id = 'YOUR_USER_ID' 
WHERE user_id = 'c9c31f9a-f659-475b-97e5-a5bc18a8a724';

UPDATE settings SET user_id = 'YOUR_USER_ID' 
WHERE user_id = 'c9c31f9a-f659-475b-97e5-a5bc18a8a724';

UPDATE users SET subscription_tier = 'pro' 
WHERE id = 'YOUR_USER_ID';

COMMIT;
```

5. **Verify the transfer:**
```sql
SELECT 
  'positions' as table_name, 
  COUNT(*) as records
FROM positions WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'watchlist', COUNT(*) FROM watchlist WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'portfolios', COUNT(*) FROM portfolios WHERE user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts WHERE user_id = 'YOUR_USER_ID';
```

You should see:
- 27 positions
- 17 watchlist items
- 4 portfolios  
- 58 alerts
- 1049 scan results

## What Gets Transferred

✅ All positions (including P/L data)
✅ Watchlist tickers
✅ Portfolios (including Tiger Brokers sync)
✅ Historical alerts
✅ Scan results and history
✅ Ticker configurations
✅ Historical indicators
✅ App settings
✅ Pro tier subscription

## After Transfer

- Log in with your Replit account
- All your data will be visible
- Tiger Brokers integration will continue working
- Telegram alerts will continue working (if configured)
- You'll have Pro tier access to all features

## Safety Notes

- The transfer is wrapped in a transaction (BEGIN/COMMIT)
- If anything fails, it will rollback automatically
- The system owner account remains but will be empty
- Your original data is never deleted, only reassigned
