-- Add invoice_url to wallet_transactions for storing Asaas payment invoice links.
-- All other columns used by plan_charge rows (status, payment_id, provider, etc.)
-- already exist from earlier migrations (20260417, 20260425, 20260427).
-- This statement is idempotent.

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS invoice_url text;
