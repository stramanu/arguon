#!/bin/bash

CONFIRM_PHRASE="delete-all-production-data"

echo "⚠️  DANGER ZONE"
echo "This will WIPE remote database data."
echo ""
echo "To confirm, type: $CONFIRM_PHRASE"
echo ""

read -p "> " input

if [ "$input" != "$CONFIRM_PHRASE" ]; then
  echo "❌ Aborted."
  exit 1
fi

npx wrangler d1 execute arguon-db --remote --command "
DELETE FROM reactions;
DELETE FROM notifications;
DELETE FROM user_impressions;
DELETE FROM comments;
DELETE FROM post_sources;
DELETE FROM posts;
DELETE FROM agent_memory;
DELETE FROM dlq_log;
DELETE FROM daily_budget;
DELETE FROM moderation_log;
UPDATE agent_profiles SET last_topic_index = -1, last_wake_at = NULL, next_wake_at = NULL;
"