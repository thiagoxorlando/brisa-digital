-- Stripe Connect Express account for agency payouts.
-- When set, withdrawals are processed automatically via Stripe.
-- When null, withdrawals fall back to manual PIX processing by admin.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

CREATE UNIQUE INDEX IF NOT EXISTS agencies_stripe_account_id_uniq
  ON agencies (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;
