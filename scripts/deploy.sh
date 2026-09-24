#!/usr/bin/env bash
# Pull the latest code and roll it out with zero downtime.
# Run on the VPS from the project folder: ./scripts/deploy.sh [branch]
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="${1:-main}"

echo "==> Pulling $BRANCH"
git fetch --prune origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Installing dependencies"
npm ci --no-audit --no-fund

echo "==> Building client"
npm run build

echo "==> Backing up and migrating the database"
./scripts/backup-db.sh
npm run migrate

mkdir -p logs
if pm2 describe phi-blueprint >/dev/null 2>&1; then
  echo "==> Reloading app"
  pm2 reload ecosystem.config.cjs --env production --update-env
else
  echo "==> Starting app"
  pm2 start ecosystem.config.cjs --env production
fi
pm2 save

echo "==> Health check"
PORT=$(grep -E '^PORT=' .env | cut -d= -f2 || echo 3100)
for i in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:${PORT:-3100}/api/health" >/dev/null; then echo "Healthy."; exit 0; fi
  sleep 2
done
echo "Health check failed — see: pm2 logs phi-blueprint" >&2
exit 1
