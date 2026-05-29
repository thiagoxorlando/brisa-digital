-- Fix bookings that were incorrectly set to status = 'signed'.
-- 'signed' is a contract-only status. The correct booking equivalent is 'pending_payment'.
-- This was caused by syncBooking being called with "signed" in an older version of sign/route.ts.

UPDATE bookings
SET status = 'pending_payment'
WHERE status = 'signed';

-- Add a check constraint so the DB itself rejects invalid values going forward.
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_valid;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_valid
  CHECK (status IN ('pending', 'pending_payment', 'confirmed', 'paid', 'cancelled'));
