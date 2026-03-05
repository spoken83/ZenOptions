# Production Deployment Checklist

Complete this checklist before deploying to production.

## Pre-Deployment Steps

### 1. Backup Current Production Database ✅
```bash
# Connect to production database
export DATABASE_URL="your-production-database-url"

# Create backup
./scripts/backup-database.sh
```

**Expected Output:**
- Backup file created in `./backups/` directory
- File size should be > 0 KB

---

### 2. Verify Schema Changes ✅
```bash
# Review the schema file
cat shared/schema.ts

# Test schema push (dry run on development first)
npm run db:push
```

**Critical Schema Components:**
- ✅ `sessions` table (for Replit Auth)
- ✅ `users` table with multi-tenant fields
- ✅ All tables have `user_id` foreign key with CASCADE delete
- ✅ Composite unique indexes on (user_id, field)
- ✅ All indexes created properly

---

### 3. Apply Schema to Production ✅
```bash
# Set production DATABASE_URL
export DATABASE_URL="your-production-database-url"

# Push schema changes
npm run db:push

# If there are warnings about data loss, review carefully
# Use --force only if you're certain
# npm run db:push --force
```

**Verify:**
```sql
-- Check all tables exist
\dt

-- Verify user_id columns and foreign keys
SELECT 
  table_name, 
  column_name 
FROM information_schema.columns 
WHERE column_name = 'user_id';

-- Check indexes
SELECT 
  tablename, 
  indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;
```

---

### 4. Transfer Existing Data to Your Account ✅

**First, log in to production app with your Replit account**

```bash
# Find your user ID
psql $DATABASE_URL -c "SELECT id, email FROM users ORDER BY created_at DESC LIMIT 5;"

# Copy your user ID, then run transfer
psql $DATABASE_URL -v target_user_id='YOUR_USER_ID' -f scripts/transfer-data.sql
```

**Expected Results:**
- 27 positions
- 17 watchlist items
- 4 portfolios
- 58 alerts
- 1049 scan results
- Your account upgraded to 'pro' tier

---

### 5. Verify Application Secrets ✅

Ensure all environment variables are set in production:

**Required Secrets:**
- [ ] `DATABASE_URL` - Production database
- [ ] `SESSION_SECRET` - For session encryption
- [ ] `POLYGON_API_KEY` - Market data
- [ ] `TELEGRAM_BOT_TOKEN` - Alerts (optional per user)
- [ ] `TELEGRAM_CHAT_ID` - Alerts (optional per user)
- [ ] `TIGER_ID` - Tiger Brokers (optional per user)
- [ ] `TIGER_PRIVATE_KEY` - Tiger Brokers (optional per user)
- [ ] `TIGER_ACCOUNT` - Tiger Brokers (optional per user)

**Note:** User-specific secrets (Telegram, Tiger) can now be stored per-user in the database.

---

### 6. Test Authentication Flow ✅

**Login Test:**
1. [ ] Navigate to production URL
2. [ ] Click "LOG IN" button
3. [ ] Enter email in modal
4. [ ] Redirected to Replit Auth with email pre-filled
5. [ ] Complete authentication
6. [ ] Redirected back to dashboard as authenticated user

**Signup Test:**
1. [ ] Click "JOIN FOR FREE" button
2. [ ] Enter email in signup form
3. [ ] Complete Replit Auth flow
4. [ ] New user created with 'free' tier
5. [ ] Dashboard shows free tier limits

---

### 7. Test Core Functionality ✅

**Dashboard:**
- [ ] VIX data loads
- [ ] Market intelligence displays
- [ ] Performance metrics visible
- [ ] Alerts displayed

**Positions:**
- [ ] View all positions
- [ ] Add new position (respects tier limits)
- [ ] Edit position
- [ ] Close position
- [ ] P/L calculations correct

**Watchlist:**
- [ ] View watchlist
- [ ] Add ticker (respects tier limits for free users)
- [ ] Remove ticker
- [ ] Scan triggers work

**Portfolios:**
- [ ] View portfolios
- [ ] Portfolio details load
- [ ] Tiger sync works (if configured)

**Scanner:**
- [ ] Manual scan runs
- [ ] Results displayed
- [ ] Automated scans scheduled (check cron)

**Alerts:**
- [ ] Alerts generated for positions
- [ ] Alert types correct (50% profit, 2x loss, DTE)
- [ ] Telegram delivery (if configured)

---

### 8. Monitor Scheduled Jobs ✅

Check that cron jobs are running:

```bash
# Check server logs for cron jobs
# Look for:
# - Scanner jobs
# - Monitor jobs
# - Tiger sync jobs
```

**Expected Cron Jobs:**
- [ ] Pre-opening scan (if enabled)
- [ ] Market open scan (if enabled)
- [ ] Market close scan (if enabled)
- [ ] Daily scan
- [ ] Position monitoring (every N minutes)
- [ ] Tiger Brokers sync (if enabled)

---

### 9. Verify Multi-Tenant Isolation ✅

**Test with two accounts:**

Account 1 (Your account):
```sql
SELECT COUNT(*) FROM positions WHERE user_id = 'your-user-id';
-- Should show 27 positions
```

Account 2 (Test account):
```sql
SELECT COUNT(*) FROM positions WHERE user_id = 'test-user-id';
-- Should show 0 positions (isolated)
```

**Verify:**
- [ ] Each user sees only their own data
- [ ] Free tier limits enforced
- [ ] Pro tier has unlimited access
- [ ] No cross-user data leakage

---

### 10. Performance Check ✅

**Monitor:**
- [ ] Page load times < 3s
- [ ] API response times < 1s
- [ ] Database query performance
- [ ] No memory leaks
- [ ] No excessive API calls to Polygon

---

## Post-Deployment Steps

### 1. Create Post-Deployment Backup ✅
```bash
./scripts/backup-database.sh
```

### 2. Monitor Error Logs ✅
Watch for:
- Authentication errors
- Database connection issues
- API rate limits
- Cron job failures

### 3. User Communication ✅
- [ ] Notify users of new multi-tenant features
- [ ] Explain tier system (Free vs Pro)
- [ ] Provide upgrade instructions
- [ ] Document any changes to workflow

---

## Rollback Plan

If something goes wrong:

### Option 1: Rollback Database
```bash
# Restore from pre-deployment backup
./scripts/restore-database.sh backups/backup_YYYYMMDD_HHMMSS.sql
```

### Option 2: Revert Code
```bash
# Use Replit's built-in rollback feature
# Or revert to previous git commit
git revert <commit-hash>
git push
```

### Option 3: Emergency Hotfix
```bash
# Fix the issue
# Create backup first
./scripts/backup-database.sh

# Apply fix
npm run db:push

# Verify fix
# Test critical paths
```

---

## Success Criteria

✅ All pre-deployment checks passed
✅ Schema applied without errors
✅ Data transferred successfully
✅ Authentication working
✅ Core features functional
✅ Multi-tenant isolation verified
✅ Scheduled jobs running
✅ No errors in logs
✅ Performance acceptable
✅ Post-deployment backup created

---

## Emergency Contacts

**Issues to watch for:**
- Database connection failures
- Authentication loops
- Missing data
- Tier limit enforcement failures
- Cron job failures
- Tiger Brokers sync errors

**Monitoring:**
- Server logs via Replit
- Database metrics
- Error tracking
- User feedback

---

## Notes

- Keep backups for at least 30 days
- Monitor first 24 hours closely
- Test with real users if possible
- Document any issues encountered
- Update this checklist based on experience
