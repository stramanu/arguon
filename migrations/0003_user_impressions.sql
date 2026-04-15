-- Tracks which posts a user has seen in their feed viewport.
-- Used to personalize "For You" and avoid showing stale content.
CREATE TABLE IF NOT EXISTS user_impressions (
  user_id TEXT NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL REFERENCES posts(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_impressions_user_date ON user_impressions(user_id, created_at DESC);
