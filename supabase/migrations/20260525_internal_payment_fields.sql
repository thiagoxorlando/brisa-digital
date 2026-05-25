-- Two-sided payment confirmation for internal-mode contracts.
-- In internal mode the platform never holds money: agency pays talent directly,
-- then both parties confirm the transaction through these timestamps.
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS agency_payment_sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS talent_payment_confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS payment_receipt_url          text;

COMMENT ON COLUMN contracts.agency_payment_sent_at      IS 'Agency confirmed external payment was sent (internal mode only)';
COMMENT ON COLUMN contracts.talent_payment_confirmed_at IS 'Talent confirmed they received payment — triggers status=paid (internal mode only)';
COMMENT ON COLUMN contracts.payment_receipt_url         IS 'Optional URL to uploaded payment receipt/proof file';
