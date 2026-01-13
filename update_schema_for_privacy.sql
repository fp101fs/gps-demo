-- Add privacy and security columns to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS privacy_mode TEXT DEFAULT 'link'; -- 'link', 'private'
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS allowed_emails TEXT[] DEFAULT '{}';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS password TEXT; -- Plain text for simple demo security

-- Index for email lookups if needed
CREATE INDEX IF NOT EXISTS idx_tracks_privacy_mode ON tracks(privacy_mode);
