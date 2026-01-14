-- Create safe zones table
CREATE TABLE IF NOT EXISTS safe_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- The host who owns these zones
  name TEXT NOT NULL,
  lat FLOAT8 NOT NULL,
  lng FLOAT8 NOT NULL,
  radius_meters INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_safe_zones_user_id ON safe_zones(user_id);
