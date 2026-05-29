-- Fix sync_agency_talent_history trigger: remove broken updated_at references
-- and backfill existing paid bookings.

-- 1. Drop and recreate the trigger function without the non-existent updated_at column
CREATE OR REPLACE FUNCTION sync_agency_talent_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Paid booking: increment completed count
  IF NEW.status = 'paid' AND NEW.talent_user_id IS NOT NULL AND NEW.agency_id IS NOT NULL THEN
    INSERT INTO agency_talent_history (agency_id, talent_id, jobs_count, jobs_completed, last_worked_at, last_job_status)
    VALUES (NEW.agency_id, NEW.talent_user_id, 1, 1, now(), 'paid')
    ON CONFLICT (agency_id, talent_id) DO UPDATE SET
      jobs_count      = agency_talent_history.jobs_count + 1,
      jobs_completed  = agency_talent_history.jobs_completed + 1,
      last_worked_at  = now(),
      last_job_status = 'paid';
  END IF;

  -- Cancelled booking: increment cancelled count
  IF NEW.status = 'cancelled' AND NEW.talent_user_id IS NOT NULL AND NEW.agency_id IS NOT NULL THEN
    INSERT INTO agency_talent_history (agency_id, talent_id, jobs_count, jobs_cancelled, last_worked_at, last_job_status)
    VALUES (NEW.agency_id, NEW.talent_user_id, 0, 1, now(), 'cancelled')
    ON CONFLICT (agency_id, talent_id) DO UPDATE SET
      jobs_cancelled  = agency_talent_history.jobs_cancelled + 1,
      last_worked_at  = now(),
      last_job_status = 'cancelled';
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Ensure trigger is attached (drop first to avoid duplicates)
DROP TRIGGER IF EXISTS trg_sync_agency_talent_history ON bookings;

CREATE TRIGGER trg_sync_agency_talent_history
AFTER UPDATE ON bookings
FOR EACH ROW
WHEN (
  (OLD.status IS DISTINCT FROM NEW.status)
  OR (OLD.cancelled_by IS DISTINCT FROM NEW.cancelled_by)
)
EXECUTE FUNCTION sync_agency_talent_history();

-- 3. Backfill from existing paid bookings
INSERT INTO agency_talent_history (
  agency_id,
  talent_id,
  jobs_count,
  jobs_completed,
  jobs_cancelled,
  last_worked_at,
  last_job_status
)
SELECT
  b.agency_id,
  b.talent_user_id,
  COUNT(*) FILTER (WHERE b.status = 'paid')                                    AS jobs_count,
  COUNT(*) FILTER (WHERE b.status = 'paid')                                    AS jobs_completed,
  COUNT(*) FILTER (WHERE b.status = 'cancelled')                               AS jobs_cancelled,
  MAX(b.created_at)                                                             AS last_worked_at,
  (ARRAY_AGG(b.status ORDER BY b.created_at DESC))[1]                          AS last_job_status
FROM bookings b
WHERE b.talent_user_id IS NOT NULL
  AND b.agency_id IS NOT NULL
  AND b.status IN ('paid', 'cancelled')
GROUP BY b.agency_id, b.talent_user_id
ON CONFLICT (agency_id, talent_id) DO UPDATE SET
  jobs_count      = EXCLUDED.jobs_count,
  jobs_completed  = EXCLUDED.jobs_completed,
  jobs_cancelled  = EXCLUDED.jobs_cancelled,
  last_worked_at  = EXCLUDED.last_worked_at,
  last_job_status = EXCLUDED.last_job_status;
