-- Safety migration for older setups.
-- Tables are already included in 0001 if following spec v0.7+.

CREATE TABLE IF NOT EXISTS dlq_log (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  error TEXT,
  failed_at TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dlq_failed ON dlq_log(queue_name, failed_at DESC);
