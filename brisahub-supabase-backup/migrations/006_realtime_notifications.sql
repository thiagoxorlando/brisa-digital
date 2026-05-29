-- ============================================================
-- 006_realtime_notifications.sql
-- Enable Supabase Realtime on the notifications table so the
-- NotificationBell can receive INSERT events instantly via
-- postgres_changes subscription (no polling needed).
-- ============================================================

-- Add notifications to the realtime publication
-- (supabase_realtime is the default publication used by Supabase Realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
