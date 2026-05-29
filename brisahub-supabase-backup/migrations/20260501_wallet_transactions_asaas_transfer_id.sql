ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS asaas_transfer_id text;
