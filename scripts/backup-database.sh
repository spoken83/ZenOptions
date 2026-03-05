#!/bin/bash
# Database Backup Script
# Creates a timestamped backup of the PostgreSQL database

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "🔄 Creating database backup..."
echo "Timestamp: $TIMESTAMP"

# Create backup using pg_dump
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  exit 1
fi

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

# Check if backup was successful
if [ -f "$BACKUP_FILE" ]; then
  FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✅ Backup completed successfully!"
  echo "   File: $BACKUP_FILE"
  echo "   Size: $FILE_SIZE"
  
  # List all backups
  echo ""
  echo "📁 All backups:"
  ls -lh "$BACKUP_DIR"/*.sql 2>/dev/null || echo "No backups found"
else
  echo "❌ Backup failed!"
  exit 1
fi

# Optional: Keep only last 10 backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.sql 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 10 ]; then
  echo ""
  echo "🗑️  Cleaning up old backups (keeping last 10)..."
  ls -1t "$BACKUP_DIR"/backup_*.sql | tail -n +11 | xargs rm -f
  echo "✅ Cleanup completed"
fi
