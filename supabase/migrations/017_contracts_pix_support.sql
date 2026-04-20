-- Migration 017: Ensure contracts table supports PIX payments
-- Safe to run multiple times (IF NOT EXISTS on all columns)

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS pix_payment_id text,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paid_at        timestamptz;
