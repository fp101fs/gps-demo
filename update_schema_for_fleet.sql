-- Add fleet management columns to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS party_code TEXT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lat FLOAT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lng FLOAT;

-- Index for faster fleet lookups
CREATE INDEX IF NOT EXISTS idx_tracks_party_code ON tracks(party_code);
