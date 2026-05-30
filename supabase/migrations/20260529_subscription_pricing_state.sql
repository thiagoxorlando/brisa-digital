-- ============================================================
-- Per-agency subscription pricing state columns on profiles.
-- Tracks which billing cycle the agency is on so the webhook
-- can decrement intro_cycles_remaining and flip the Asaas
-- subscription value to recurring_price at the right moment.
-- Safe to run multiple times (IF NOT EXISTS is idempotent).
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS intro_cycles_remaining      integer,
  ADD COLUMN IF NOT EXISTS intro_completed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS current_subscription_price  numeric,
  ADD COLUMN IF NOT EXISTS last_processed_payment_id   text;

COMMENT ON COLUMN profiles.intro_cycles_remaining     IS 'How many intro-price billing cycles remain (NULL = no intro, 0 = intro complete)';
COMMENT ON COLUMN profiles.intro_completed_at         IS 'When intro_cycles_remaining reached 0 and recurring price took effect';
COMMENT ON COLUMN profiles.current_subscription_price IS 'Current Asaas subscription value — mirrors what was last set on the Asaas subscription';
COMMENT ON COLUMN profiles.last_processed_payment_id  IS 'Idempotency guard: Asaas payment ID of the last successfully processed payment webhook';

NOTIFY pgrst, 'reload schema';
