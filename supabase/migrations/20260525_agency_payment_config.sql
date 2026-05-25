-- Agency-level payment mode and commission configuration
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS payment_mode               text    NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS commission_percent_override numeric,
  ADD COLUMN IF NOT EXISTS escrow_enabled              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_uploads_enabled     boolean NOT NULL DEFAULT true;

-- Backfill: all agencies that existed before this migration keep escrow behaviour.
-- The DEFAULT 'internal' only applies to rows created after this migration.
UPDATE agencies
SET
  payment_mode  = 'escrow',
  escrow_enabled = true
WHERE payment_mode = 'internal';

ALTER TABLE agencies
  ADD CONSTRAINT agencies_payment_mode_check
  CHECK (payment_mode IN ('internal', 'escrow'));

COMMENT ON COLUMN agencies.payment_mode               IS 'internal = SaaS-only (agency pays talent directly); escrow = platform holds funds';
COMMENT ON COLUMN agencies.commission_percent_override IS 'NULL means use the plan_settings.commission_percent for this agency''s plan';
COMMENT ON COLUMN agencies.escrow_enabled              IS 'Whether escrow functionality is active for this agency (only meaningful when payment_mode = escrow)';
COMMENT ON COLUMN agencies.receipt_uploads_enabled     IS 'Whether agency can upload payment receipts/proof (used in internal mode)';
