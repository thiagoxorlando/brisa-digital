-- ============================================================
-- Phase 3 — USD pricing for US launch
-- Adds a currency column to plan_settings and seeds PRO with
-- USD launch values ($29 first month → $79/month).
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT).
-- ============================================================

ALTER TABLE plan_settings
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

COMMENT ON COLUMN plan_settings.currency IS 'Pricing currency code: USD or BRL';

-- PRO — primary US launch offer
UPDATE plan_settings SET
  currency        = 'USD',
  price           = 79,        -- base recurring price (used as fallback)
  intro_price     = 29,        -- $29 first month
  intro_cycles    = 1,
  recurring_price = 79,        -- $79/month after promo
  trial_days      = 7,
  is_available    = true
WHERE plan_key = 'pro';

-- Free — keep as BRL for internal / Brazil testing; not promoted on US landing
UPDATE plan_settings SET
  currency     = 'BRL',
  is_available = true
WHERE plan_key = 'free';

-- Premium — mark USD but not yet available publicly
UPDATE plan_settings SET
  currency     = 'USD',
  is_available = false
WHERE plan_key = 'premium';

NOTIFY pgrst, 'reload schema';
