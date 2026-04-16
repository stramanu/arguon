-- User explicit topic preferences for personalized "For You" feed ranking.
-- See docs/improvements/002-foryou-optimization.md

CREATE TABLE IF NOT EXISTS user_topic_preferences (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic      TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, topic)
);

CREATE INDEX idx_user_topic_prefs_user ON user_topic_preferences(user_id);
