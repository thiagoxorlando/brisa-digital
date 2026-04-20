-- Fix PostgREST ambiguity error:
-- "more than one relationship was found for 'bookings' and 'contracts'"
--
-- Root cause: two FKs exist between the tables.
--   (1) contracts.booking_id → bookings.id  ← CORRECT, keep this
--   (2) bookings.contract_id → contracts.id ← WRONG, drop this
--
-- PostgREST requires exactly one FK per pair of tables to resolve
-- an embedded resource without an explicit hint. Even with a hint
-- like !contracts_booking_id_fkey, having two FKs causes the error.

-- ── Step 1: Drop the spurious FK on bookings ─────────────────────────────────
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_contract_id_fkey;

-- ── Step 2: Drop the column entirely (it was never used by any API route) ────
ALTER TABLE bookings
  DROP COLUMN IF EXISTS contract_id;

-- ── Step 3: Ensure the correct FK exists on contracts ────────────────────────
-- (idempotent — no-op if already present with the right definition)

-- First add the column if somehow missing (002_contracts_redesign dropped it)
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS booking_id uuid;

-- Drop whatever FK constraint may exist (handles both the original auto-named
-- constraint from 001 and the named one from 20260417_contracts_booking_id_not_null)
ALTER TABLE contracts
  DROP CONSTRAINT IF EXISTS contracts_booking_id_fkey;

-- Re-add with the canonical name and ON DELETE RESTRICT
-- (bookings use soft-delete so hard DELETE on a booking with a contract is wrong)
ALTER TABLE contracts
  ADD CONSTRAINT contracts_booking_id_fkey
    FOREIGN KEY (booking_id)
    REFERENCES bookings(id)
    ON DELETE RESTRICT;

-- ── Step 4: Ensure index exists (no-op if already present) ───────────────────
CREATE INDEX IF NOT EXISTS contracts_booking_id_idx ON contracts (booking_id);

-- ── Step 5: Backfill any null booking_ids before enforcing NOT NULL ───────────
-- Composite-key match (agency_id + talent_id + job_id)
UPDATE contracts c
SET booking_id = b.id
FROM (
  SELECT DISTINCT ON (agency_id, talent_user_id, job_id)
    id, agency_id, talent_user_id, job_id
  FROM bookings
  ORDER BY agency_id, talent_user_id, job_id, created_at DESC
) b
WHERE c.booking_id IS NULL
  AND c.agency_id = b.agency_id
  AND c.talent_id = b.talent_user_id
  AND (
    (c.job_id IS NULL AND b.job_id IS NULL)
    OR c.job_id = b.job_id
  );

-- Synthetic booking for any contract still unmatched
DO $$
DECLARE
  r   RECORD;
  bid uuid;
BEGIN
  FOR r IN SELECT * FROM contracts WHERE booking_id IS NULL LOOP
    INSERT INTO bookings (
      talent_user_id, agency_id, job_id,
      job_title, price, status, created_at
    ) VALUES (
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

-- ── Step 6: Enforce NOT NULL now that every row has a value ──────────────────
ALTER TABLE contracts
  ALTER COLUMN booking_id SET NOT NULL;
