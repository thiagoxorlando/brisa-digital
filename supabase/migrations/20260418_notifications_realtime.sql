-- Enable Supabase Realtime on the notifications table so that
-- NotificationBell's postgres_changes subscription fires in real-time.
-- REPLICA IDENTITY FULL is required for row-level filter (user_id=eq.<id>).

ALTER TABLE notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
