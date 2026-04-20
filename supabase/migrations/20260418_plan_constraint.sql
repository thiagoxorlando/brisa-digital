-- Ensure profiles.plan column exists with correct constraint
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'pro', 'premium'));

-- Backfill nulls
UPDATE profiles SET plan = 'free' WHERE plan IS NULL;
