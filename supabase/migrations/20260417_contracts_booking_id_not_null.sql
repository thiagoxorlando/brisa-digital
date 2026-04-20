-- Enforce that every contract has a booking_id.
--
-- Step 1: Attempt composite-key backfill (agency_id + talent_id + job_id).
--         This covers contracts created before the API was fixed to set booking_id.
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
    (c.job_id IS NULL AND b.job_id IS NULL)
    OR c.job_id = b.job_id
  );

-- Step 2: For any contract still unmatched, create a synthetic booking so the
--         NOT NULL constraint below never fails. These are legacy rows that had
--         no booking counterpart at all.
DO $$
DECLARE
  r   RECORD;
  bid uuid;
BEGIN
  FOR r IN SELECT * FROM contracts WHERE booking_id IS NULL LOOP
    INSERT INTO bookings (
      talent_user_id, agency_id, job_id,
      job_title, price, status, created_at
    )
    VALUES (
      r.talent_id,
      r.agency_id,
      r.job_id,
      COALESCE(LEFT(r.job_description, 100), 'Legacy Contract'),
      COALESCE(r.payment_amount, 0),
      CASE r.status
        WHEN 'paid'      THEN 'paid'
        WHEN 'confirmed' THEN 'confirmed'
        WHEN 'signed'    THEN 'pending_payment'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'rejected'  THEN 'cancelled'
        ELSE 'pending'
      END,
      r.created_at
    )
    RETURNING id INTO bid;

    UPDATE contracts SET booking_id = bid WHERE id = r.id;
  END LOOP;
END;
$$;

-- Step 3: Verify — this should return 0 rows before we add the constraint.
-- SELECT count(*) FROM contracts WHERE booking_id IS NULL;

-- Step 4: Drop the old FK (had ON DELETE SET NULL, which is incompatible with NOT NULL).
ALTER TABLE contracts
  DROP CONSTRAINT IF EXISTS contracts_booking_id_fkey;

-- Step 5: Enforce NOT NULL.
ALTER TABLE contracts
  ALTER COLUMN booking_id SET NOT NULL;

-- Step 6: Re-add the FK with ON DELETE RESTRICT.
--         Bookings are soft-deleted (deleted_at), never hard-deleted, so this is safe.
ALTER TABLE contracts
  ADD CONSTRAINT contracts_booking_id_fkey
    FOREIGN KEY (booking_id)
    REFERENCES bookings(id)
    ON DELETE RESTRICT;
