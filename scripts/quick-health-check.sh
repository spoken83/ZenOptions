#!/bin/bash
# Quick Health Check Script
# Fast verification of critical system components

set -e

echo "🏥 Quick Health Check"
echo "===================="
echo ""

# Check database connection
echo "1. Database Connection..."
if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
  echo "   ✅ Database connected"
else
  echo "   ❌ Database connection failed"
  exit 1
fi

# Check users table
echo "2. Users Table..."
USER_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM users;")
echo "   ✅ $USER_COUNT users"

# Check positions
echo "3. Positions..."
POSITION_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM positions;")
echo "   ✅ $POSITION_COUNT positions"

# Check watchlist
echo "4. Watchlist..."
WATCHLIST_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM watchlist;")
echo "   ✅ $WATCHLIST_COUNT tickers"

# Check recent activity
echo "5. Recent Activity..."
RECENT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM users WHERE last_login_at > NOW() - INTERVAL '24 hours';")
echo "   ✅ $RECENT users logged in (last 24h)"

# Check alerts
echo "6. Active Alerts..."
ALERT_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM alerts;")
echo "   ✅ $ALERT_COUNT alerts"

# Check tier distribution
echo "7. Subscription Tiers..."
psql "$DATABASE_URL" -t << 'EOF'
SELECT 
  subscription_tier || ': ' || COUNT(*) 
FROM users 
GROUP BY subscription_tier;
EOF

echo ""
echo "✅ Health check passed!"
