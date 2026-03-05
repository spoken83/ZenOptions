-- Backfill Production Data - Assign Legacy Data to User Account
-- 
-- PURPOSE: Assign all existing production records (userId = NULL) to a specific user account
-- 
-- USAGE:
--   psql $PRODUCTION_DATABASE_URL -v target_user_id='YOUR_USER_ID' -f scripts/backfill-production-data.sql
--
-- HOW TO FIND YOUR USER ID:
--   1. Log in to your production app
--   2. Run: SELECT id, email FROM users WHERE email = 'your@email.com';
--   3. Use the id from that query as target_user_id
--
-- SAFETY:
--   - This script only updates records where user_id IS NULL
--   - It does NOT touch records that already have a user_id
--   - All changes are within a transaction - rolls back on error
--

\set QUIET on
\set ON_ERROR_STOP on

BEGIN;

-- Create a temp table to hold the target user ID
CREATE TEMP TABLE _target_user (id VARCHAR);
INSERT INTO _target_user (id) VALUES (:'target_user_id');

-- Verify the target user exists
DO $$
DECLARE
  user_exists INTEGER;
  target_id VARCHAR;
BEGIN
  SELECT id INTO target_id FROM _target_user LIMIT 1;
  SELECT COUNT(*) INTO user_exists FROM users WHERE id = target_id;
  
  IF user_exists = 0 THEN
    RAISE EXCEPTION 'User with id % does not exist. Please check your user ID.', target_id;
  ELSE
    RAISE NOTICE 'Found target user: %', target_id;
  END IF;
END $$;

-- Show counts before backfill
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== BEFORE BACKFILL ===';
  RAISE NOTICE 'Records with NULL user_id:';
  RAISE NOTICE '  Watchlist: %', (SELECT COUNT(*) FROM watchlist WHERE user_id IS NULL);
  RAISE NOTICE '  Tickers: %', (SELECT COUNT(*) FROM tickers WHERE user_id IS NULL);
  RAISE NOTICE '  Portfolios: %', (SELECT COUNT(*) FROM portfolios WHERE user_id IS NULL);
  RAISE NOTICE '  Positions: %', (SELECT COUNT(*) FROM positions WHERE user_id IS NULL);
  RAISE NOTICE '  Indicators: %', (SELECT COUNT(*) FROM indicators WHERE user_id IS NULL);
  RAISE NOTICE '  Scan Results: %', (SELECT COUNT(*) FROM scan_results WHERE user_id IS NULL);
  RAISE NOTICE '  Alerts: %', (SELECT COUNT(*) FROM alerts WHERE user_id IS NULL);
  RAISE NOTICE '  Settings: %', (SELECT COUNT(*) FROM settings WHERE user_id IS NULL);
  RAISE NOTICE '';
END $$;

-- Backfill watchlist
UPDATE watchlist 
SET user_id = (SELECT id FROM _target_user)
WHERE user_id IS NULL;

-- Backfill tickers
UPDATE tickers 
SET user_id = (SELECT id FROM _target_user)
WHERE user_id IS NULL;

-- Backfill portfolios
UPDATE portfolios 
SET user_id = (SELECT id FROM _target_user)
WHERE user_id IS NULL;

-- Backfill positions
UPDATE positions 
SET user_id = (SELECT id FROM _target_user)
WHERE user_id IS NULL;

-- Backfill indicators
UPDATE indicators 
SET user_id = (SELECT id FROM _target_user)
WHERE user_id IS NULL;

-- Backfill scan_results
UPDATE scan_results 
SET user_id = (SELECT id FROM _target_user)
WHERE user_id IS NULL;

-- Backfill alerts
UPDATE alerts 
SET user_id = (SELECT id FROM _target_user)
WHERE user_id IS NULL;

-- Backfill settings (skip duplicates - user's existing settings take priority)
UPDATE settings 
SET user_id = (SELECT id FROM _target_user)
WHERE user_id IS NULL
  AND key NOT IN (
    SELECT key FROM settings WHERE user_id = (SELECT id FROM _target_user)
  );

-- Delete orphaned settings that couldn't be migrated (duplicates)
DELETE FROM settings WHERE user_id IS NULL;

-- Show counts after backfill
DO $$
DECLARE
  target_id VARCHAR;
BEGIN
  SELECT id INTO target_id FROM _target_user LIMIT 1;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== AFTER BACKFILL ===';
  RAISE NOTICE 'Records owned by %:', target_id;
  RAISE NOTICE '  Watchlist: %', (SELECT COUNT(*) FROM watchlist WHERE user_id = target_id);
  RAISE NOTICE '  Tickers: %', (SELECT COUNT(*) FROM tickers WHERE user_id = target_id);
  RAISE NOTICE '  Portfolios: %', (SELECT COUNT(*) FROM portfolios WHERE user_id = target_id);
  RAISE NOTICE '  Positions: %', (SELECT COUNT(*) FROM positions WHERE user_id = target_id);
  RAISE NOTICE '  Indicators: %', (SELECT COUNT(*) FROM indicators WHERE user_id = target_id);
  RAISE NOTICE '  Scan Results: %', (SELECT COUNT(*) FROM scan_results WHERE user_id = target_id);
  RAISE NOTICE '  Alerts: %', (SELECT COUNT(*) FROM alerts WHERE user_id = target_id);
  RAISE NOTICE '  Settings: %', (SELECT COUNT(*) FROM settings WHERE user_id = target_id);
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining NULL user_id records: %', (
    SELECT COUNT(*) FROM (
      SELECT user_id FROM watchlist WHERE user_id IS NULL
      UNION ALL SELECT user_id FROM tickers WHERE user_id IS NULL
      UNION ALL SELECT user_id FROM portfolios WHERE user_id IS NULL
      UNION ALL SELECT user_id FROM positions WHERE user_id IS NULL
      UNION ALL SELECT user_id FROM indicators WHERE user_id IS NULL
      UNION ALL SELECT user_id FROM scan_results WHERE user_id IS NULL
      UNION ALL SELECT user_id FROM alerts WHERE user_id IS NULL
      UNION ALL SELECT user_id FROM settings WHERE user_id IS NULL
    ) remaining
  );
  RAISE NOTICE '';
END $$;

COMMIT;

-- Success message
DO $$
DECLARE
  target_id VARCHAR;
BEGIN
  SELECT id INTO target_id FROM _target_user LIMIT 1;
  RAISE NOTICE '✅ Backfill complete! All legacy data has been assigned to user: %', target_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Refresh your production app dashboard';
  RAISE NOTICE '2. Verify all your positions, watchlist items, etc. are now visible';
  RAISE NOTICE '3. Check that the counts match your expectations';
  RAISE NOTICE '';
END $$;

DROP TABLE _target_user;

\set QUIET off
