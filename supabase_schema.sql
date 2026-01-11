-- Create a table for journeys (tracks)
CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  end_time TIMESTAMPTZ
);

-- Create a table for location points
CREATE TABLE IF NOT EXISTS points (
  id BIGSERIAL PRIMARY KEY,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  lat FLOAT8 NOT NULL,
  lng FLOAT8 NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime for these tables
alter publication supabase_realtime add table tracks;
alter publication supabase_realtime add table points;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_points_track_id ON points(track_id);
CREATE INDEX IF NOT EXISTS idx_points_timestamp ON points(timestamp);
