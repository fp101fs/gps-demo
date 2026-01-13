-- Add proximity settings to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS proximity_enabled BOOLEAN DEFAULT false;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS proximity_meters INTEGER DEFAULT 500;
