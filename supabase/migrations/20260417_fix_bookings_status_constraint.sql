-- Drop ALL existing status check constraints on bookings (regardless of how they were named).
-- The live DB may have a 'bookings_status_check' created via the Supabase dashboard
-- or a prior migration that does NOT include 'confirmed', causing:
--   ERROR: new row violates check constraint "bookings_status_check"
--
-- We replace them all with a single canonical constraint.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_valid;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_valid
  CHECK (status IN ('pending', 'pending_payment', 'confirmed', 'paid', 'cancelled'));
