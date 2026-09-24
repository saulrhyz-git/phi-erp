#!/usr/bin/env bash
# Dumps the database to ./backups (keeps the last 14). Also good as a daily cron job.
set -euo pipefail
cd "$(dirname "$0")/.."
DB_URL=$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)
mkdir -p backups
FILE="backups/phi_blueprint_$(date +%Y%m%d_%H%M%S).sql.gz"
pg_dump "$DB_URL" --no-owner | gzip > "$FILE"
echo "Backup written to $FILE"
ls -1t backups/*.sql.gz | tail -n +15 | xargs -r rm --
