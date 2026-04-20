-- ── Extend agency_talent_history with reliability counters ────────────────────
ALTER TABLE agency_talent_history
  ADD COLUMN IF NOT EXISTS jobs_completed  int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jobs_cancelled  int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_job_status text;

-- Backfill: existing jobs_count was incremented on 'paid', so it equals completed
UPDATE agency_talent_history
SET jobs_completed = jobs_count
WHERE jobs_completed = 0 AND jobs_count > 0;

-- ── Add cancelled_by to bookings ───────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_by text; -- 'agency' | 'talent' | null

-- ── Replace trigger function ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_agency_talent_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.talent_user_id IS NULL OR NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- booking paid → increment jobs_count + jobs_completed
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    INSERT INTO agency_talent_history (
      agency_id, talent_id, jobs_count, jobs_completed, last_worked_at, last_job_status
    ) VALUES (
      NEW.agency_id, NEW.talent_user_id, 1, 1, now(), 'paid'
    )
    ON CONFLICT (agency_id, talent_id) DO UPDATE SET
      jobs_count      = agency_talent_history.jobs_count     + 1,
      jobs_completed  = agency_talent_history.jobs_completed + 1,
      last_worked_at  = now(),
      last_job_status = 'paid',
      updated_at      = now();
    RETURN NEW;
  END IF;

  -- booking cancelled by talent → increment jobs_cancelled
  -- Fires when cancelled_by is set to 'talent' (second update after syncBooking)
  IF NEW.status = 'cancelled'
     AND NEW.cancelled_by = 'talent'
     AND (OLD.cancelled_by IS NULL OR OLD.cancelled_by != 'talent') THEN
    INSERT INTO agency_talent_history (
      agency_id, talent_id, jobs_count, jobs_cancelled, last_job_status
    ) VALUES (
      NEW.agency_id, NEW.talent_user_id, 0, 1, 'cancelled'
    )
    ON CONFLICT (agency_id, talent_id) DO UPDATE SET
      jobs_cancelled  = agency_talent_history.jobs_cancelled + 1,
      last_job_status = 'cancelled',
      updated_at      = now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-create trigger to also fire on cancelled_by updates
DROP TRIGGER IF EXISTS trg_sync_agency_talent_history ON bookings;

CREATE TRIGGER trg_sync_agency_talent_history
  AFTER UPDATE OF status, cancelled_by
  ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION sync_agency_talent_history();
