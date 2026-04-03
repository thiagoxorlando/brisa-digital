-- ============================================================
-- 004_notifications_link_jobs_talents.sql
-- Adds navigation link to notifications and talent count to jobs.
-- ============================================================

-- Allow notifications to carry a client-side navigation URL
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link text;

-- How many talents the agency wants to cast for a job
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS number_of_talents_required integer NOT NULL DEFAULT 1;
