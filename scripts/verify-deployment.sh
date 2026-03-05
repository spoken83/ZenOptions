#!/bin/bash
# Deployment Verification Script
# Verifies database schema and data integrity

set -e

echo "🔍 Verifying Database Deployment"
echo "================================="
echo ""

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL not set"
  exit 1
fi

echo "✅ DATABASE_URL configured"
echo ""

# Check all tables exist
echo "📋 Checking tables..."
TABLES=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "   Found $TABLES tables"

# Verify critical tables
echo ""
echo "🔍 Verifying critical tables..."
REQUIRED_TABLES=("sessions" "users" "watchlist" "tickers" "portfolios" "positions" "indicators" "scan_results" "alerts" "settings")

for table in "${REQUIRED_TABLES[@]}"; do
  EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '$table';")
  if [ "$EXISTS" -eq 1 ]; then
    echo "   ✅ $table"
  else
    echo "   ❌ $table - MISSING!"
    exit 1
  fi
done

# Check user_id foreign keys
echo ""
echo "🔗 Verifying user_id foreign keys..."
USER_ID_COLUMNS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE column_name = 'user_id';")
echo "   Found $USER_ID_COLUMNS tables with user_id column"

# Check indexes
echo ""
echo "📇 Verifying indexes..."
INDEXES=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';")
echo "   Found $INDEXES indexes"

# Check data counts
echo ""
echo "📊 Data Summary:"
psql "$DATABASE_URL" << 'EOF'
SELECT 
  'users' as table_name, 
  COUNT(*) as record_count
FROM users
UNION ALL
SELECT 'positions', COUNT(*) FROM positions
UNION ALL
SELECT 'watchlist', COUNT(*) FROM watchlist
UNION ALL
SELECT 'portfolios', COUNT(*) FROM portfolios
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts
UNION ALL
SELECT 'scan_results', COUNT(*) FROM scan_results
ORDER BY table_name;
EOF

# Check system owner
echo ""
echo "👤 System Owner Status:"
psql "$DATABASE_URL" -c "SELECT email, subscription_tier, created_at FROM users WHERE email = 'system@optionsmonitor.internal';"

# Check multi-tenant setup
echo ""
echo "🏢 Multi-Tenant Setup:"
psql "$DATABASE_URL" << 'EOF'
SELECT 
  subscription_tier,
  COUNT(*) as user_count
FROM users
GROUP BY subscription_tier
ORDER BY subscription_tier;
EOF

# Verify constraints
echo ""
echo "🔒 Checking constraints..."
CONSTRAINTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY';")
echo "   Found $CONSTRAINTS foreign key constraints"

UNIQUE=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = 'UNIQUE';")
echo "   Found $UNIQUE unique constraints"

echo ""
echo "✅ Deployment verification completed!"
echo ""
echo "Summary:"
echo "  Tables: $TABLES"
echo "  Indexes: $INDEXES"
echo "  Foreign Keys: $CONSTRAINTS"
echo "  Unique Constraints: $UNIQUE"
echo "  User ID Columns: $USER_ID_COLUMNS"
