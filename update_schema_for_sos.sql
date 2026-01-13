-- Add SOS flag to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_sos BOOLEAN DEFAULT false;

-- Index for SOS filtering
CREATE INDEX IF NOT EXISTS idx_tracks_is_sos ON tracks(is_sos) WHERE is_sos = true;
