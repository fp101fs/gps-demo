-- Add battery tracking columns to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS battery_level INTEGER; -- 0 to 100
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS battery_state TEXT; -- 'unplugged', 'charging', 'full', 'unknown'
