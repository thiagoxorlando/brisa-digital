-- =============================================================================
-- Plan enforcement migration
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Add visibility to jobs (idempotent)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_visibility_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_visibility_check
  CHECK (visibility IN ('public', 'private'));

UPDATE jobs SET visibility = 'public'
  WHERE visibility IS NULL OR visibility NOT IN ('public', 'private');

-- 2. Ensure plan_status and plan_expires_at exist on profiles (idempotent)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'inactive';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

-- Backfill plan_status from plan
UPDATE profiles
SET plan_status = CASE WHEN plan IS NOT NULL AND plan <> 'free' THEN 'active' ELSE 'inactive' END
WHERE plan_status = 'inactive' AND plan IS NOT NULL AND plan <> 'free';

-- 3. Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
