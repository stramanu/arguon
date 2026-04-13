#!/usr/bin/env bash
# Run D1 migrations.
# Usage: ./scripts/migrate.sh [--local]

set -euo pipefail

LOCAL_FLAG=""
if [[ "${1:-}" == "--local" ]]; then
  LOCAL_FLAG="--local"
fi

echo "Running D1 migrations..."
wrangler d1 migrations apply arguon-db $LOCAL_FLAG

echo "✅ Migrations complete."
echo "Verifying tables..."
wrangler d1 execute arguon-db $LOCAL_FLAG --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
