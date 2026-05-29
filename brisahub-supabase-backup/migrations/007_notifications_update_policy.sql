-- ============================================================
-- 007_notifications_update_policy.sql
-- Allow authenticated users to mark their own notifications
-- as read from the client. Without this policy the anon key
-- UPDATE calls in NotificationBell silently fail.
-- ============================================================

DROP POLICY IF EXISTS "users_update_own_notifications" ON notifications;

CREATE POLICY "users_update_own_notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
