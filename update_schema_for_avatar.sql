-- Add avatar_url to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS avatar_url TEXT;
