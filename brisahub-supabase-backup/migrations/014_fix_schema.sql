-- ============================================================
-- 014_fix_schema.sql
-- Fixes all schema issues found in audit:
--   • Ensures all required columns exist (idempotent)
--   • Normalises talents_needed / number_of_talents_required
--   • Adds missing indexes for sort/filter performance
--   • Ensures notifications are properly set up
-- ============================================================

-- ── JOBS ─────────────────────────────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title            text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description      text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS category         text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS budget           numeric(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deadline         date;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS agency_id        uuid;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status           text    NOT NULL DEFAULT 'open';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location         text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gender           text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS age_min          integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS age_max          integer;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_date         date;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deleted_at       timestamptz;

-- Normalise: keep both column names pointing to same concept
-- talents_needed (migration 013) is the canonical name going forward
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS talents_needed            integer NOT NULL DEFAULT 1;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS number_of_talents_required integer NOT NULL DEFAULT 1;

-- ── BOOKINGS ──────────────────────────────────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS job_id         uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agency_id      uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS talent_user_id uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS job_title      text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price          numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status         text          NOT NULL DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at     timestamptz;

-- ── CONTRACTS ─────────────────────────────────────────────────────────────────
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_at        timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS agency_signed_at timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deposit_paid_at  timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS paid_at          timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawn_at     timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at       timestamptz;

-- ── AGENCIES ──────────────────────────────────────────────────────────────────
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS company_name         text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS subscription_status  text NOT NULL DEFAULT 'active';
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS avatar_url           text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS phone                text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS address              text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS deleted_at           timestamptz;

-- ── TALENT_PROFILES ───────────────────────────────────────────────────────────
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS full_name   text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS avatar_url  text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS x_handle    text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS website     text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS imdb        text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read   boolean NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type      text    NOT NULL DEFAULT 'general';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link      text;

-- ── INDEXES (performance for sort/filter queries) ─────────────────────────────
CREATE INDEX IF NOT EXISTS jobs_agency_id_idx          ON jobs(agency_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx             ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx         ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_deleted_at_idx         ON jobs(deleted_at);

CREATE INDEX IF NOT EXISTS bookings_talent_user_id_idx ON bookings(talent_user_id);
CREATE INDEX IF NOT EXISTS bookings_agency_id_idx      ON bookings(agency_id);
CREATE INDEX IF NOT EXISTS bookings_job_id_idx         ON bookings(job_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx         ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_created_at_idx     ON bookings(created_at DESC);

CREATE INDEX IF NOT EXISTS contracts_created_at_idx    ON contracts(created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_is_read_idx   ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS notifications_created_idx   ON notifications(user_id, created_at DESC);

-- ── RLS: ensure notifications UPDATE policy exists ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'notifications'
      AND policyname = 'users_update_own_notifications'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "users_update_own_notifications"
        ON notifications FOR UPDATE
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    $policy$;
  END IF;
END $$;
