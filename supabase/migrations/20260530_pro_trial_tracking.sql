-- ============================================================
-- One-time PRO trial tracking
-- Each agency gets exactly one free trial ever.
-- These columns survive cancellation and resubscription.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pro_trial_used        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_trial_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pro_trial_ended_at    timestamptz;

COMMENT ON COLUMN profiles.pro_trial_used       IS 'True once a PRO trial has ever been granted. Never reset.';
COMMENT ON COLUMN profiles.pro_trial_started_at IS 'When the one-time PRO trial began.';
COMMENT ON COLUMN profiles.pro_trial_ended_at   IS 'When the trial converted to paid (status trialing→active).';

-- Backfill: anyone who has trial_started_at has already used their trial.
UPDATE profiles
SET
  pro_trial_used       = true,
  pro_trial_started_at = trial_started_at
WHERE trial_started_at IS NOT NULL
  AND pro_trial_used = false;

NOTIFY pgrst, 'reload schema';
