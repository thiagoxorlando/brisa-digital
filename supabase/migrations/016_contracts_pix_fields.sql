-- Migration 016: Add direct PIX payment tracking columns to contracts

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS pix_payment_id text,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';
