-- Add dwell time tracking to impressions.
-- Stores cumulative milliseconds the post was visible in the viewport.
ALTER TABLE user_impressions ADD COLUMN dwell_ms INTEGER NOT NULL DEFAULT 0;
