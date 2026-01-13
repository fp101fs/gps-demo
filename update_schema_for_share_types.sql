-- Add share_type to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS share_type TEXT DEFAULT 'live'; -- 'live', 'current', 'address'
