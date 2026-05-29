-- Stripe foundation — parallel payment provider columns and webhook dedup table.
--
-- Does NOT touch Efí logic or change any existing columns/constraints.
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS).
--
-- Tables affected:
--   profiles        — stripe_customer_id  (agency paying via Stripe Checkout/Payment Intents)
--   talent_profiles — stripe_account_id   (talent receiving via Stripe Connect Express)
--   contracts       — stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id,
--                     payment_provider
--   stripe_events   — new table for webhook idempotency (mirrors wallet_transactions pattern)

-- ── 1. profiles.stripe_customer_id ───────────────────────────────────────────
-- Used when an agency pays a contract deposit via Stripe instead of Efí.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_uniq
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ── 2. talent_profiles.stripe_account_id ─────────────────────────────────────
-- Stripe Connect Express account for talent payouts.
ALTER TABLE talent_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

CREATE UNIQUE INDEX IF NOT EXISTS talent_profiles_stripe_account_id_uniq
  ON talent_profiles (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- ── 3. contracts — Stripe payment tracking columns ───────────────────────────
-- Mirrors the existing pix_payment_id / mp_payment_id pattern; parallel columns
-- so Efí flows are not altered.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id         text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id       text,
  ADD COLUMN IF NOT EXISTS payment_provider         text
    CHECK (payment_provider IN ('efi', 'stripe', 'asaas'));

-- Lookup index: find contracts by Stripe IDs without full scans.
CREATE INDEX IF NOT EXISTS contracts_stripe_payment_intent_idx
  ON contracts (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contracts_stripe_charge_idx
  ON contracts (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

-- ── 4. stripe_events — webhook deduplication ─────────────────────────────────
-- Store each processed Stripe event ID so the webhook handler can skip retries.
-- Stripe guarantees event IDs are globally unique per account.
CREATE TABLE IF NOT EXISTS stripe_events (
  id            text        PRIMARY KEY,          -- evt_xxx (Stripe event ID)
  type          text        NOT NULL,             -- e.g. payment_intent.succeeded
  livemode      boolean     NOT NULL DEFAULT false,
  processed_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: service role only — webhook handler uses service role key.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- No user-facing policy; all access goes through service role (bypasses RLS).
-- Admins may query directly via Supabase dashboard.
