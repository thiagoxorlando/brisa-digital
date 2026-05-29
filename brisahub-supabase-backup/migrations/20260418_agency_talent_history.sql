-- Agency talent history: tracks every talent who completed at least 1 job
CREATE TABLE IF NOT EXISTS agency_talent_history (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  talent_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jobs_count     integer     NOT NULL DEFAULT 1,
  last_worked_at timestamptz NOT NULL DEFAULT now(),
  is_favorite    boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, talent_id)
);

ALTER TABLE agency_talent_history ENABLE ROW LEVEL SECURITY;

-- Agencies see only their own history
CREATE POLICY "ath_agency_select"
  ON agency_talent_history FOR SELECT
  USING (agency_id = auth.uid());

-- Service role has full access (used from API routes)
CREATE POLICY "ath_service_all"
  ON agency_talent_history FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Trigger: upsert history when booking transitions to 'paid' ──────────────

CREATE OR REPLACE FUNCTION sync_agency_talent_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    IF NEW.agency_id IS NOT NULL AND NEW.talent_user_id IS NOT NULL THEN
      INSERT INTO agency_talent_history (agency_id, talent_id, jobs_count, last_worked_at)
      VALUES (NEW.agency_id, NEW.talent_user_id, 1, now())
      ON CONFLICT (agency_id, talent_id) DO UPDATE
        SET jobs_count     = agency_talent_history.jobs_count + 1,
            last_worked_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agency_talent_history ON bookings;

CREATE TRIGGER trg_sync_agency_talent_history
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION sync_agency_talent_history();
