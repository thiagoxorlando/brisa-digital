ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text;

UPDATE profiles
SET plan = 'free'
WHERE plan IS NULL;

ALTER TABLE profiles
  ALTER COLUMN plan SET DEFAULT 'free';

ALTER TABLE profiles
  ALTER COLUMN plan SET NOT NULL;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'pro', 'premium'));

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_role text,
  ADD COLUMN IF NOT EXISTS job_time text;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_by text;

UPDATE bookings
SET status = 'pending_payment'
WHERE status = 'signed';

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'pending_payment', 'confirmed', 'paid', 'cancelled'));

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DROP INDEX IF EXISTS wallet_idempotency_key_idx;
DROP INDEX IF EXISTS wallet_transactions_idempotency_key_idx;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_idempotency_key_idx
  ON wallet_transactions (idempotency_key);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DROP INDEX IF EXISTS notifications_idempotency_key_idx;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_idempotency_key_idx
  ON notifications (idempotency_key);

CREATE TABLE IF NOT EXISTS agency_talent_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  talent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jobs_count integer NOT NULL DEFAULT 0,
  jobs_completed integer NOT NULL DEFAULT 0,
  jobs_cancelled integer NOT NULL DEFAULT 0,
  last_worked_at timestamptz NOT NULL DEFAULT now(),
  last_job_status text,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, talent_id)
);

ALTER TABLE agency_talent_history
  ADD COLUMN IF NOT EXISTS jobs_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jobs_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jobs_cancelled integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_worked_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_job_status text,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE agency_talent_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_talent_history'
      AND policyname = 'ath_agency_select'
  ) THEN
    CREATE POLICY ath_agency_select
      ON agency_talent_history
      FOR SELECT
      USING (agency_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agency_talent_history'
      AND policyname = 'ath_service_all'
  ) THEN
    CREATE POLICY ath_service_all
      ON agency_talent_history
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sync_agency_talent_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.talent_user_id IS NULL OR NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    INSERT INTO agency_talent_history (
      agency_id,
      talent_id,
      jobs_count,
      jobs_completed,
      last_worked_at,
      last_job_status,
      updated_at
    )
    VALUES (
      NEW.agency_id,
      NEW.talent_user_id,
      1,
      1,
      now(),
      'paid',
      now()
    )
    ON CONFLICT (agency_id, talent_id) DO UPDATE
      SET jobs_count = agency_talent_history.jobs_count + 1,
          jobs_completed = agency_talent_history.jobs_completed + 1,
          last_worked_at = now(),
          last_job_status = 'paid',
          updated_at = now();

    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled'
     AND NEW.cancelled_by = 'talent'
     AND (OLD.cancelled_by IS NULL OR OLD.cancelled_by <> 'talent') THEN
    INSERT INTO agency_talent_history (
      agency_id,
      talent_id,
      jobs_cancelled,
      last_job_status,
      updated_at
    )
    VALUES (
      NEW.agency_id,
      NEW.talent_user_id,
      1,
      'cancelled',
      now()
    )
    ON CONFLICT (agency_id, talent_id) DO UPDATE
      SET jobs_cancelled = agency_talent_history.jobs_cancelled + 1,
          last_job_status = 'cancelled',
          updated_at = now();

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agency_talent_history ON bookings;

CREATE TRIGGER trg_sync_agency_talent_history
  AFTER UPDATE OF status, cancelled_by
  ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION sync_agency_talent_history();

INSERT INTO agency_talent_history (
  agency_id,
  talent_id,
  jobs_count,
  jobs_completed,
  last_worked_at,
  last_job_status,
  updated_at
)
SELECT
  b.agency_id,
  b.talent_user_id,
  COUNT(*)::integer,
  COUNT(*)::integer,
  COALESCE(MAX(b.updated_at), MAX(b.created_at), now()),
  'paid',
  now()
FROM bookings b
WHERE b.status = 'paid'
  AND b.agency_id IS NOT NULL
  AND b.talent_user_id IS NOT NULL
GROUP BY b.agency_id, b.talent_user_id
ON CONFLICT (agency_id, talent_id) DO UPDATE
  SET jobs_count = GREATEST(agency_talent_history.jobs_count, EXCLUDED.jobs_count),
      jobs_completed = GREATEST(agency_talent_history.jobs_completed, EXCLUDED.jobs_completed),
      last_worked_at = GREATEST(agency_talent_history.last_worked_at, EXCLUDED.last_worked_at),
      last_job_status = 'paid',
      updated_at = now();
