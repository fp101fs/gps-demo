-- Ensure ALL required columns exist in the tracks table
-- This fixes the 400 Bad Request error by adding columns the app expects but might be missing

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS party_code TEXT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lat FLOAT8;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lng FLOAT8;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS proximity_enabled BOOLEAN DEFAULT false;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS proximity_meters INTEGER DEFAULT 500;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS arrival_enabled BOOLEAN DEFAULT false;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS arrival_meters INTEGER DEFAULT 50;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS note TEXT;

-- Refresh indexes for performance
CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_party_code ON tracks(party_code);
CREATE INDEX IF NOT EXISTS idx_tracks_expires_at ON tracks(expires_at);
