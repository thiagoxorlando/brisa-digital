-- ============================================================
-- PRO intro pricing columns on plan_settings
-- Adds fields for trial period and promotional intro price.
-- Safe to run multiple times (IF NOT EXISTS is idempotent).
-- ============================================================

ALTER TABLE plan_settings
  ADD COLUMN IF NOT EXISTS trial_days      integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intro_price     numeric  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intro_cycles    integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_price numeric  NOT NULL DEFAULT 0;

COMMENT ON COLUMN plan_settings.trial_days      IS 'Free trial length in days (0 = no trial)';
COMMENT ON COLUMN plan_settings.intro_price     IS 'Promotional first-cycle price in BRL (0 = no intro offer)';
COMMENT ON COLUMN plan_settings.intro_cycles    IS 'Number of billing cycles at intro_price before switching to recurring_price';
COMMENT ON COLUMN plan_settings.recurring_price IS 'Regular monthly price in BRL after intro period';

-- Seed defaults for existing plan rows
UPDATE plan_settings SET
  trial_days      = 7,
  intro_price     = 97,
  intro_cycles    = 1,
  recurring_price = 147
WHERE plan_key = 'pro';

UPDATE plan_settings SET
  trial_days      = 0,
  intro_price     = 0,
  intro_cycles    = 0,
  recurring_price = 0
WHERE plan_key = 'free';

-- premium: leave at 0s unless already set — no upsert needed because ADD COLUMN DEFAULT 0 handles it

NOTIFY pgrst, 'reload schema';
