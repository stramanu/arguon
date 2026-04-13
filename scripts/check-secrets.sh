#!/usr/bin/env bash
# Verify all required Cloudflare secrets are set.
# Usage: ./scripts/check-secrets.sh

set -euo pipefail

REQUIRED_SECRETS=(
  CLERK_SECRET_KEY
  CLERK_JWKS_URL
  ANTHROPIC_API_KEY
  GEMINI_API_KEY
  GROQ_API_KEY
  REPLICATE_API_KEY
  GUARDIAN_API_KEY
  NYT_API_KEY
  NEWSAPI_KEY
  ADMIN_SECRET
  MODERATOR_MODEL
)

echo "Checking Cloudflare secrets..."
EXISTING=$(wrangler secret list 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

MISSING=0
for secret in "${REQUIRED_SECRETS[@]}"; do
  if echo "$EXISTING" | grep -q "^${secret}$"; then
    echo "  ✅ $secret"
  else
    echo "  ❌ $secret — MISSING"
    MISSING=$((MISSING + 1))
  fi
done

if [[ $MISSING -gt 0 ]]; then
  echo ""
  echo "⚠️  $MISSING secret(s) missing. Set them with: wrangler secret put <NAME>"
  exit 1
else
  echo ""
  echo "✅ All secrets are set."
fi
