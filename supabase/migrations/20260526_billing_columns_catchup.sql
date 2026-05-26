-- ============================================================
-- Catch-up: add all billing columns that may be missing from
-- production because 20260525_trial_fields.sql was applied
-- locally but not deployed.
-- Safe to run multiple times (IF NOT EXISTS is idempotent).
-- ============================================================

-- ── profiles billing columns ─────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan                  text        DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_status           text        DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS plan_expires_at       timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS asaas_customer_id     text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS trial_started_at      timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at         timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_provider text        DEFAULT 'asaas';

-- ── agencies billing column ───────────────────────────────────────────────────
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive';

-- ── wallet_transactions provider columns (plan_charge rows use these) ─────────
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS provider   text,
  ADD COLUMN IF NOT EXISTS payment_id text;

-- ── Force PostgREST to reload schema cache ────────────────────────────────────
-- Without this, newly-added columns are invisible to the API until the next
-- PostgREST restart or cache TTL expiry.
NOTIFY pgrst, 'reload schema';
