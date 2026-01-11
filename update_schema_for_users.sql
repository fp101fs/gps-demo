-- Add user_id column to tracks table to link tracks to Clerk users
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id);

-- Update RLS policies (we'll apply these later, but good to have ready)
-- For now, we are just adding the column.
