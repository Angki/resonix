#!/bin/sh
set -eu

DB_URL="${DATABASE_URL:-file:/data/library.db}"
DB_PATH="${DB_URL#file:}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-7}"

if [ -f "$DB_PATH" ] && [ "${SKIP_BACKUP:-0}" != "1" ]; then
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/library-$(date +%Y%m%d-%H%M%S).db"
  echo "[Resonix] Creating pre-migration backup: $BACKUP_FILE"
  if ! sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"; then
    echo "[Resonix] FATAL: database backup failed; refusing to run migrations." >&2
    exit 1
  fi
  if [ "$BACKUP_RETENTION" -gt 0 ] 2>/dev/null; then
    ls -1t "$BACKUP_DIR"/library-*.db 2>/dev/null | tail -n +"$((BACKUP_RETENTION + 1))" | xargs -r rm --
  fi
fi

echo "[Resonix] Applying database migrations..."
npx prisma migrate deploy --schema=server/prisma/schema.prisma

exec "$@"
