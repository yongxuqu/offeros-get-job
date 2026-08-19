#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/offeros}"
BACKUP_DIR="${BACKUP_DIR:-/opt/offeros/backups}"
DB_PATH="${DB_PATH:-$APP_DIR/data/zhixu.db}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "database not found: $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required" >&2
  exit 1
fi

sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/offeros-$STAMP.db'"
sqlite3 "$BACKUP_DIR/offeros-$STAMP.db" "PRAGMA integrity_check;" | grep -qx "ok"
find "$BACKUP_DIR" -name "offeros-*.db" -mtime +"$RETENTION_DAYS" -delete
echo "$BACKUP_DIR/offeros-$STAMP.db"
