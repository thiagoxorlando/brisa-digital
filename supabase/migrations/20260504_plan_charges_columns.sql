-- Add columns needed to track Asaas plan-subscription charges in wallet_transactions.
-- All statements are idempotent.

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_status     text,
  ADD COLUMN IF NOT EXISTS status           text,
  ADD COLUMN IF NOT EXISTS invoice_url      text;

-- Unique index so we never double-insert for the same Asaas payment id.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_asaas_payment_id_uniq
  ON wallet_transactions(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;
