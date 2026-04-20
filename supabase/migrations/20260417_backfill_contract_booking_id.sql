-- Backfill booking_id on contracts that were created before booking_id was populated.
-- Matches on agency_id + talent_id + job_id (or NULL job_id) — the same composite key
-- used by the old syncBooking fallback path.
-- Each contract is matched to the most recent qualifying booking.

UPDATE contracts c
SET booking_id = b.id
FROM (
  SELECT DISTINCT ON (agency_id, talent_user_id, job_id)
    id, agency_id, talent_user_id, job_id
  FROM bookings
  ORDER BY agency_id, talent_user_id, job_id, created_at DESC
) b
WHERE c.booking_id IS NULL
  AND c.agency_id  = b.agency_id
  AND c.talent_id  = b.talent_user_id
  AND (
    (c.job_id IS NULL     AND b.job_id IS NULL)
    OR c.job_id = b.job_id
  );
