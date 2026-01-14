-- Add nickname to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS nickname TEXT;
