-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT DEFAULT 'info', -- 'info', 'alert', 'success', 'warning'
  is_read BOOLEAN DEFAULT false,
  metadata JSONB, -- For future flexibility (e.g. linking to a specific track_id)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime
alter publication supabase_realtime add table notifications;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
