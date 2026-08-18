#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/offeros}"
BACKUP_DIR="${BACKUP_DIR:-/opt/offeros/backups}"
DB_PATH="${DB_PATH:-$APP_DIR/data/zhixu.db}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/offeros-$STAMP.db'"
find "$BACKUP_DIR" -name "offeros-*.db" -mtime +14 -delete
