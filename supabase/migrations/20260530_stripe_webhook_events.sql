-- ============================================================
-- Stripe webhook idempotency table (Phase 4B)
-- Mirrors the existing asaas_webhook_events pattern so the
-- same reconciliation queries work across both providers.
-- ============================================================

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  -- Stripe event ID (evt_xxx) — primary key guarantees idempotency
  id            text        PRIMARY KEY,
  event_type    text        NOT NULL,
  -- NULL until the handler succeeds; non-null means fully processed
  processed_at  timestamptz,
  -- Populated when processing fails so ops can inspect and replay
  error         text,
  -- Raw event stored for debugging / replay without re-fetching from Stripe
  payload       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  stripe_webhook_events IS
  'Idempotency log for Stripe webhook events. One row per event ID.';
COMMENT ON COLUMN stripe_webhook_events.id IS
  'Stripe event ID (evt_xxx). Used as idempotency key — INSERT fails on duplicate.';
COMMENT ON COLUMN stripe_webhook_events.processed_at IS
  'Timestamp of successful processing. NULL = pending / failed.';
COMMENT ON COLUMN stripe_webhook_events.error IS
  'Last processing error, if any. Populated for observability; handler still returns 200.';

-- Index for ops queries: "show me unprocessed events"
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_unprocessed
  ON stripe_webhook_events (created_at)
  WHERE processed_at IS NULL;

-- Index for type-based filtering in reconciliation views
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type
  ON stripe_webhook_events (event_type, created_at DESC);

-- ── Stripe columns on profiles (subscription state) ──────────────────────────
-- These coexist with asaas_customer_id / asaas_subscription_id.
-- subscription_provider distinguishes which billing system is active.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text;

-- subscription_provider already added by previous migration
-- (20260525_trial_fields.sql); this is a no-op guard.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_provider text DEFAULT 'asaas';

COMMENT ON COLUMN profiles.stripe_customer_id     IS 'Stripe Customer ID (cus_xxx). Null for agencies on Asaas.';
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'Active Stripe Subscription ID (sub_xxx). Null for agencies on Asaas.';
COMMENT ON COLUMN profiles.subscription_provider  IS 'Active billing provider: stripe | asaas | manual';

-- Fast lookup: find profile by Stripe customer ID (used in webhook handler)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
