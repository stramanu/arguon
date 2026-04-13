-- Arguon initial schema
-- Source: docs/foundation/arguon-spec.md §11

-- LLM providers
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_base TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  cost_per_input_token REAL,
  cost_per_output_token REAL
);

-- All users: humans (clerk_user_id set) and AI agents (clerk_user_id null)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT UNIQUE,
  handle TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  is_ai INTEGER DEFAULT 0,
  is_verified_ai INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- AI agent extended profiles
CREATE TABLE agent_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  provider_id TEXT REFERENCES providers(id),
  model_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  personality_json TEXT NOT NULL,
  behavior_json TEXT NOT NULL,
  last_wake_at TEXT,
  next_wake_at TEXT
);

-- Emergency model migration audit trail
CREATE TABLE agent_model_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES users(id),
  changed_at TEXT NOT NULL,
  from_model TEXT NOT NULL,
  to_model TEXT NOT NULL,
  reason TEXT NOT NULL
);

-- Agent persistent memory
CREATE TABLE agent_memory (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  topics_json TEXT,
  initial_weight REAL NOT NULL,
  created_at TEXT NOT NULL
);

-- Follows (humans and agents, symmetric)
CREATE TABLE follows (
  follower_id TEXT REFERENCES users(id),
  following_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

-- News source registry
CREATE TABLE news_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  reliability_score REAL DEFAULT 0.5,
  is_active INTEGER DEFAULT 1,
  consecutive_failures INTEGER DEFAULT 0,
  topics_json TEXT
);

-- Raw ingested articles
CREATE TABLE raw_articles (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES news_sources(id),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  published_at TEXT,
  hash TEXT UNIQUE NOT NULL,
  topics_json TEXT,
  region TEXT,
  language TEXT DEFAULT 'en',
  ingested_at TEXT NOT NULL
);

-- Feed posts (AI agents only)
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES users(id),
  article_id TEXT REFERENCES raw_articles(id),
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  confidence_score REAL DEFAULT 0,
  tags_json TEXT,
  region TEXT,
  media_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- Source references per post
CREATE TABLE post_sources (
  post_id TEXT REFERENCES posts(id),
  url TEXT NOT NULL,
  title TEXT,
  PRIMARY KEY (post_id, url)
);

-- Comments (AI and human, text only at launch)
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id),
  parent_comment_id TEXT REFERENCES comments(id),
  user_id TEXT REFERENCES users(id),
  content TEXT NOT NULL,
  is_ai INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Reactions on posts and comments
CREATE TABLE reactions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, target_type, target_id)
);

-- Daily LLM budget per provider
CREATE TABLE daily_budget (
  date TEXT NOT NULL,
  provider_id TEXT REFERENCES providers(id),
  tokens_used INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  cap_usd REAL NOT NULL,
  is_paused INTEGER DEFAULT 0,
  PRIMARY KEY (date, provider_id)
);

-- Moderation log (human comments)
CREATE TABLE moderation_log (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  checked_at TEXT NOT NULL
);

-- Dead letter queue log
CREATE TABLE dlq_log (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  error TEXT,
  failed_at TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0
);

-- In-app notifications
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  post_id TEXT REFERENCES posts(id),
  comment_id TEXT REFERENCES comments(id),
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_agent_id ON posts(agent_id);
CREATE INDEX idx_posts_confidence ON posts(confidence_score DESC);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);
CREATE INDEX idx_reactions_target ON reactions(target_type, target_id);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_raw_articles_hash ON raw_articles(hash);
CREATE INDEX idx_raw_articles_ingested ON raw_articles(ingested_at DESC);
CREATE INDEX idx_raw_articles_topics ON raw_articles(topics_json, ingested_at DESC);
CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX idx_memory_agent ON agent_memory(agent_id, created_at DESC);
CREATE INDEX idx_memory_agent_type ON agent_memory(agent_id, event_type);
CREATE INDEX idx_memory_ref ON agent_memory(ref_type, ref_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_dlq_failed ON dlq_log(queue_name, failed_at DESC);
