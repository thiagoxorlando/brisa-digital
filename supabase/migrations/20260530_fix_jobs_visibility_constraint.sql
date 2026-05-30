-- ============================================================
-- Fix jobs.visibility check constraint (Phase 4B / launch prep)
--
-- Root cause: 20260419_plan_enforcement.sql tried to add
-- CHECK (visibility IN ('public', 'private')) but the table
-- already has rows with 'private_invite' and 'workspace_only',
-- both of which are valid app values defined in lib/jobVisibility.ts.
--
-- The failed migration left the table with NO constraint at all
-- (DROP succeeded, ADD failed). This migration adds the correct
-- constraint covering all five canonical visibility values.
--
-- Canonical values (from lib/jobVisibility.ts JobVisibilityValue):
--   public         – open space, visible to all talents
--   private        – invited talents only (legacy)
--   private_invite – premium workspace, invite/link only
--   private_portal – premium portal visible
--   workspace_only – premium workspace visible (portal + agents)
--
-- Data inspection (run before this migration):
--   public: 45 rows | private_invite: 6 | workspace_only: 3
--   No NULLs, no other values — nothing needs normalisation.
-- ============================================================

-- Step 1: Remove any stale version of the constraint (idempotent).
ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_visibility_check;

-- Step 2: Normalise any rows that might have arrived since the
-- failed migration (belt-and-suspenders).
UPDATE jobs
SET visibility = 'public'
WHERE visibility IS NULL OR visibility = '';

-- Step 3: Add the correct constraint covering all app values.
ALTER TABLE jobs
  ADD CONSTRAINT jobs_visibility_check
  CHECK (visibility IN ('public', 'private', 'private_invite', 'private_portal', 'workspace_only'));

-- Step 4: Ensure plan_status and plan_expires_at exist on profiles
-- (from the original failing migration — idempotent, safe to re-run).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'inactive';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

-- Backfill plan_status where it was missed.
UPDATE profiles
SET plan_status = CASE
  WHEN plan IS NOT NULL AND plan <> 'free' THEN 'active'
  ELSE 'inactive'
END
WHERE plan_status = 'inactive'
  AND plan IS NOT NULL
  AND plan <> 'free';

-- Step 5: Validation queries (informational — will appear in migration output).
-- Run these manually to confirm:
--
-- SELECT visibility, count(*) FROM jobs GROUP BY visibility ORDER BY visibility;
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.jobs'::regclass
--     AND conname = 'jobs_visibility_check';
-- SELECT count(*) FROM stripe_webhook_events;

NOTIFY pgrst, 'reload schema';
