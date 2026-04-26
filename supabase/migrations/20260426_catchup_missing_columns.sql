-- ============================================================
-- Catch-up: apply migrations that were never pushed to prod
-- Safe to run multiple times (idempotent).
-- ============================================================

-- ── 1. agency_talent_history missing columns ─────────────────────────────────
ALTER TABLE agency_talent_history
  ADD COLUMN IF NOT EXISTS jobs_completed  int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jobs_cancelled  int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_job_status text,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

-- Backfill: existing jobs_count was all paid, so jobs_completed = jobs_count
UPDATE agency_talent_history
SET jobs_completed = jobs_count
WHERE jobs_completed = 0 AND jobs_count > 0;

-- ── 2. bookings.cancelled_by (from 20260418_reliability.sql) ─────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_by text; -- 'agency' | 'talent' | null

-- ── 3. Recreate sync_agency_talent_history trigger (clean version) ────────────
CREATE OR REPLACE FUNCTION sync_agency_talent_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.talent_user_id IS NULL OR NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    INSERT INTO agency_talent_history (agency_id, talent_id, jobs_count, jobs_completed, last_worked_at, last_job_status)
    VALUES (NEW.agency_id, NEW.talent_user_id, 1, 1, now(), 'paid')
    ON CONFLICT (agency_id, talent_id) DO UPDATE SET
      jobs_count      = agency_talent_history.jobs_count + 1,
      jobs_completed  = agency_talent_history.jobs_completed + 1,
      last_worked_at  = now(),
      last_job_status = 'paid';
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled'
     AND NEW.cancelled_by = 'talent'
     AND (OLD.cancelled_by IS NULL OR OLD.cancelled_by != 'talent') THEN
    INSERT INTO agency_talent_history (agency_id, talent_id, jobs_count, jobs_cancelled, last_worked_at, last_job_status)
    VALUES (NEW.agency_id, NEW.talent_user_id, 0, 1, now(), 'cancelled')
    ON CONFLICT (agency_id, talent_id) DO UPDATE SET
      jobs_cancelled  = agency_talent_history.jobs_cancelled + 1,
      last_worked_at  = now(),
      last_job_status = 'cancelled';
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agency_talent_history ON bookings;

CREATE TRIGGER trg_sync_agency_talent_history
  AFTER UPDATE ON bookings
  FOR EACH ROW
  WHEN (
    (OLD.status IS DISTINCT FROM NEW.status)
    OR (OLD.cancelled_by IS DISTINCT FROM NEW.cancelled_by)
  )
  EXECUTE FUNCTION sync_agency_talent_history();

-- ── 4. Normalize agencies.subscription_status to match profiles.plan_status ──
-- Agencies on a paid plan should show 'active', not 'cancelling'
UPDATE agencies a
SET subscription_status = p.plan_status
FROM profiles p
WHERE a.id = p.id
  AND p.role = 'agency'
  AND p.plan != 'free'
  AND p.plan_status IS NOT NULL
  AND a.subscription_status != p.plan_status;

-- ── 5. Ensure agency_talent_history counters are backfilled ──────────────────
INSERT INTO agency_talent_history (
  agency_id, talent_id, jobs_count, jobs_completed, jobs_cancelled, last_worked_at, last_job_status
)
SELECT
  b.agency_id,
  b.talent_user_id,
  COUNT(*) FILTER (WHERE b.status = 'paid')     AS jobs_count,
  COUNT(*) FILTER (WHERE b.status = 'paid')     AS jobs_completed,
  COUNT(*) FILTER (WHERE b.status = 'cancelled') AS jobs_cancelled,
  MAX(b.created_at)                              AS last_worked_at,
  (ARRAY_AGG(b.status ORDER BY b.created_at DESC))[1] AS last_job_status
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
