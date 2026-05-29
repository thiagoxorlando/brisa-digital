-- Add 'paused' to the jobs_status_check constraint.
-- The constraint was created outside migrations; we drop and recreate it
-- including every value currently in use by the codebase and seed data.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'open',
    'active',
    'draft',
    'paused',
    'closed',
    'inactive',
    'cancelled',
    'expired',
    'completed'
  ));
