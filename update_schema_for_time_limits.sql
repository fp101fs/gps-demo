-- Add time limits and notes to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS note TEXT;

-- Index for expiration cleanup later
CREATE INDEX IF NOT EXISTS idx_tracks_expires_at ON tracks(expires_at);
