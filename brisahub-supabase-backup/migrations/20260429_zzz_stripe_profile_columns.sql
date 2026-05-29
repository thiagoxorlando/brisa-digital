-- Stripe subscription + contract session columns.
-- These were defined in 20260429_stripe_primary_money_rail.sql which was never applied to production.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text,
  ADD COLUMN IF NOT EXISTS stripe_price_id            text;

CREATE INDEX IF NOT EXISTS profiles_stripe_subscription_id_idx
  ON profiles (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

CREATE INDEX IF NOT EXISTS contracts_stripe_checkout_session_idx
  ON contracts (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS status              text,
  ADD COLUMN IF NOT EXISTS processed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS provider            text,
  ADD COLUMN IF NOT EXISTS provider_transfer_id text,
  ADD COLUMN IF NOT EXISTS provider_status     text,
  ADD COLUMN IF NOT EXISTS idempotency_key     text,
  ADD COLUMN IF NOT EXISTS reference_id        text;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_idempotency_key_idx
  ON wallet_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
