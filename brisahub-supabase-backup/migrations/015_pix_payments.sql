-- Migration 015: Add PIX payment columns to contracts
-- Stores Mercado Pago payment data for both deposit and final payment phases

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS payment_gateway        text,             -- e.g. 'mercado_pago'

  -- Deposit (agency → platform, when agency signs)
  ADD COLUMN IF NOT EXISTS deposit_payment_id     text,             -- MP payment ID
  ADD COLUMN IF NOT EXISTS deposit_pix_qr_code    text,             -- copy-paste PIX code
  ADD COLUMN IF NOT EXISTS deposit_pix_qr_base64  text,             -- base64 QR image
  ADD COLUMN IF NOT EXISTS deposit_pix_expires_at timestamptz,      -- QR expiration

  -- Final payment (agency → platform → talent, after job)
  ADD COLUMN IF NOT EXISTS final_payment_id       text,
  ADD COLUMN IF NOT EXISTS final_pix_qr_code      text,
  ADD COLUMN IF NOT EXISTS final_pix_qr_base64    text,
  ADD COLUMN IF NOT EXISTS final_pix_expires_at   timestamptz;
