-- Strengthen job-specific referral tracking without touching payment or wallet RPC logic.
-- Commission payout should be finalized after a referred job is completed/paid:
-- commission_amount = paid_job_amount * commission_rate (default 2%).

ALTER TABLE referral_invites
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,4) NOT NULL DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS commission_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS signed_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS hired_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_contract_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'referral_invites_status_check'
      AND conrelid = 'referral_invites'::regclass
  ) THEN
    ALTER TABLE referral_invites
      ADD CONSTRAINT referral_invites_status_check
      CHECK (
        status IN (
          'pending',
          'signed_up',
          'applied',
          'hired',
          'completed',
          'commission_due',
          'paid',
          'commission_paid',
          'fraud_reported'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS referral_invites_job_email_idx
  ON referral_invites (job_id, lower(referred_email))
  WHERE job_id IS NOT NULL AND referred_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS referral_invites_job_user_idx
  ON referral_invites (job_id, referred_user_id)
  WHERE job_id IS NOT NULL AND referred_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS referral_invites_token_job_idx
  ON referral_invites (token, job_id);

CREATE OR REPLACE FUNCTION set_referral_invites_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referral_invites_set_updated_at ON referral_invites;
CREATE TRIGGER referral_invites_set_updated_at
  BEFORE UPDATE ON referral_invites
  FOR EACH ROW
  EXECUTE FUNCTION set_referral_invites_updated_at();
