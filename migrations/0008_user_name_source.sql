-- Track whether the user's display name is synced from Clerk or set manually.
-- See docs/improvements/003-human-profile-handle.md
ALTER TABLE users ADD COLUMN name_source TEXT NOT NULL DEFAULT 'clerk';
