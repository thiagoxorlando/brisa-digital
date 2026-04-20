-- Add is_frozen to profiles (admin freeze/unfreeze feature)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;

-- Add application_requirements to jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS application_requirements text[] NOT NULL DEFAULT '{}';

-- Add curriculum and portfolio upload URLs to submissions
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS curriculum_url text;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS portfolio_url text;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
