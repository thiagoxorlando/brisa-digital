CREATE TABLE IF NOT EXISTS admin_notification_broadcasts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid        NOT NULL,
  title           text        NOT NULL,
  message         text        NOT NULL,
  audience        text        NOT NULL,
  target_user_id  uuid,
  link            text,
  sent_count      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_broadcasts_admin_id
  ON admin_notification_broadcasts (admin_id);

CREATE INDEX IF NOT EXISTS idx_admin_notification_broadcasts_created_at
  ON admin_notification_broadcasts (created_at DESC);

ALTER TABLE admin_notification_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON admin_notification_broadcasts
  USING (false)
  WITH CHECK (false);
