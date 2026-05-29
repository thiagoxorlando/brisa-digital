-- Ensure plan_status and plan_expires_at columns exist on profiles.
-- These may be missing from the PostgREST schema cache if earlier migrations
-- did not run cleanly. Running ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_status    text         DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz DEFAULT NULL;

-- Backfill plan_status to match current plan
UPDATE profiles
SET plan_status = CASE WHEN plan = 'free' THEN 'inactive' ELSE 'active' END
WHERE plan_status IS NULL
   OR (plan != 'free' AND plan_status = 'inactive')
   OR (plan = 'free'  AND plan_status = 'active');

-- Reload PostgREST schema cache so the columns become queryable immediately
NOTIFY pgrst, 'reload schema';
