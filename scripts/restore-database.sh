#!/bin/bash
# Database Restore Script
# Restores database from a backup file

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/restore-database.sh <backup-file>"
  echo ""
  echo "Available backups:"
  ls -lh backups/*.sql 2>/dev/null || echo "No backups found"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  exit 1
fi

echo "⚠️  WARNING: This will replace ALL data in the database!"
echo "Database: $DATABASE_URL"
echo "Backup file: $BACKUP_FILE"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Restore cancelled"
  exit 0
fi

echo ""
echo "🔄 Creating safety backup before restore..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SAFETY_BACKUP="./backups/pre_restore_${TIMESTAMP}.sql"
pg_dump "$DATABASE_URL" > "$SAFETY_BACKUP"
echo "✅ Safety backup created: $SAFETY_BACKUP"

echo ""
echo "🔄 Restoring database from backup..."

# Drop all tables and restore
psql "$DATABASE_URL" << 'EOF'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
EOF

psql "$DATABASE_URL" < "$BACKUP_FILE"

echo ""
echo "✅ Database restored successfully!"
echo ""
echo "Verify the restore:"
psql "$DATABASE_URL" -c "\dt" -c "SELECT COUNT(*) as user_count FROM users;" -c "SELECT COUNT(*) as position_count FROM positions;"
