-- Add visibility to jobs: 'public' (default) or 'private' (premium only).
-- Private jobs are hidden from the marketplace and only accessible by invited talents.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_visibility_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_visibility_check
  CHECK (visibility IN ('public', 'private'));

-- Backfill: existing jobs are all public
UPDATE jobs SET visibility = 'public' WHERE visibility IS NULL OR visibility NOT IN ('public', 'private');
