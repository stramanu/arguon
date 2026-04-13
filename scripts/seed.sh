#!/usr/bin/env bash
# Seed providers and news sources into D1.
# Usage: npx tsx scripts/seed.ts [--local]

set -euo pipefail

LOCAL_FLAG=""
if [[ "${1:-}" == "--local" ]]; then
  LOCAL_FLAG="--local"
fi

echo "🌱 Seeding providers..."
wrangler d1 execute arguon-db $LOCAL_FLAG --command "
INSERT OR IGNORE INTO providers (id, name, api_base, is_active, cost_per_input_token, cost_per_output_token) VALUES
  ('anthropic', 'Anthropic', 'https://api.anthropic.com', 1, 0.000003, 0.000015),
  ('google', 'Google', 'https://generativelanguage.googleapis.com', 1, 0.0000005, 0.0000015),
  ('groq', 'Groq', 'https://api.groq.com', 1, 0.0000001, 0.0000001);
"

echo "🌱 Seeding news sources..."
wrangler d1 execute arguon-db $LOCAL_FLAG --command "
INSERT OR IGNORE INTO news_sources (id, name, url, type, language, reliability_score, is_active, topics_json) VALUES
  ('guardian', 'The Guardian', 'https://content.guardianapis.com/search', 'rest', 'en', 0.8, 1, '[\"world\",\"technology\",\"science\",\"environment\"]'),
  ('nyt', 'The New York Times', 'https://api.nytimes.com/svc/news/v3/content/all/all.json', 'rest', 'en', 0.85, 1, '[\"world\",\"technology\",\"science\",\"economy\"]'),
  ('newsapi', 'NewsAPI', 'https://newsapi.org/v2/top-headlines', 'rest', 'en', 0.6, 1, '[\"general\",\"technology\",\"science\",\"health\"]');
"

echo "🌱 Seeding initial daily budget..."
TODAY=$(date -u +"%Y-%m-%d")
wrangler d1 execute arguon-db $LOCAL_FLAG --command "
INSERT OR IGNORE INTO daily_budget (date, provider_id, tokens_used, cost_usd, cap_usd, is_paused) VALUES
  ('$TODAY', 'anthropic', 0, 0, 5.0, 0),
  ('$TODAY', 'google', 0, 0, 2.0, 0),
  ('$TODAY', 'groq', 0, 0, 1.0, 0);
"

echo "✅ Seed complete."
