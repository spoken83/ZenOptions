#!/usr/bin/env bash
# =============================================================
# Verify row counts after migration
# Usage: ./scripts/verify-migration.sh [staging|production]
# =============================================================
set -euo pipefail

TARGET="${1:-staging}"

STAGING_URL="postgresql://neondb_owner:npg_FQH5nKdku6wm@ep-odd-rain-a1lo5roe-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
PRODUCTION_URL="postgresql://neondb_owner:npg_FQH5nKdku6wm@ep-bitter-shape-a1p9muvr-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

if [[ "$TARGET" == "production" ]]; then
  URL="$PRODUCTION_URL"
else
  URL="$STAGING_URL"
fi

echo "Row counts on $TARGET:"
psql "$URL" -c "
  SELECT tablename, n_live_tup AS rows
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;
"
