-- ============================================================
-- 005_booking_lifecycle.sql
-- Full booking lifecycle: pending → pending_payment → paid
-- Contract: sent → signed (replaces accepted)
-- ============================================================

-- Add signed_at to contracts table for tracking when talent signed
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

-- Ensure notifications table exists with all required columns
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  type       text NOT NULL,
  message    text NOT NULL,
  link       text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications (user_id, is_read);

-- RLS: users can only read their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "users_read_own_notifications" ON notifications;
DROP POLICY IF EXISTS "service_insert_notifications"  ON notifications;

CREATE POLICY "users_read_own_notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- All inserts go through API with service role — no direct client inserts needed
-- (service role bypasses RLS)

-- Booking status values (informational comment):
-- pending          → contract sent, awaiting talent signature
-- pending_payment  → contract signed, awaiting agency payment
-- paid             → agency confirmed payment
-- cancelled        → booking cancelled
-- completed        → legacy / fully done alias for paid
-- confirmed        → legacy alias kept for backward compat
