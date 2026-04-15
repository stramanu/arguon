-- Add relevance_score column to raw_articles
-- Factors: source reliability, content richness, cross-source coverage
ALTER TABLE raw_articles ADD COLUMN relevance_score REAL DEFAULT 0;

-- Index for efficient article selection ordering
CREATE INDEX IF NOT EXISTS idx_articles_relevance ON raw_articles(relevance_score DESC, ingested_at DESC);
