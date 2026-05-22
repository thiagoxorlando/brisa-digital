-- Admin nav seen-state tracking.
-- Stores the timestamp when each admin last "saw" a given sidebar section,
-- enabling the sidebar to show badges only for genuinely new activity.

CREATE TABLE IF NOT EXISTS admin_nav_seen (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id   uuid        NOT NULL,
  nav_key         text        NOT NULL,
  seen_at         timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_nav_seen_user_key_unique UNIQUE (admin_user_id, nav_key)
);

CREATE INDEX IF NOT EXISTS admin_nav_seen_user_idx ON admin_nav_seen (admin_user_id);

-- Only the service role (used by all server-side admin routes) accesses this table.
ALTER TABLE admin_nav_seen ENABLE ROW LEVEL SECURITY;
