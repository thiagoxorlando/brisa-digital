-- Add provider tracking columns to wallet_transactions.
-- Used by withdrawal send-pix route to record which payment provider
-- handled the transfer and the external transfer reference.
-- Safe to run multiple times (idempotent).

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS provider             text,
  ADD COLUMN IF NOT EXISTS provider_transfer_id text,
  ADD COLUMN IF NOT EXISTS provider_status      text;
