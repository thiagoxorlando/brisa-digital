-- ============================================================
-- 018_rls_policies.sql
-- Comprehensive RLS policies for all user-facing tables.
--
-- Design rules:
--   • All writes go through service-role API routes (bypass RLS).
--   • SELECT policies restrict what authenticated users can read
--     directly via client-side Supabase (e.g. Realtime subscriptions).
--   • Admins use service role — no admin-specific policies needed.
-- ============================================================

-- ── JOBS ─────────────────────────────────────────────────────────────────────

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Agencies can read their own jobs
DROP POLICY IF EXISTS "agencies_read_own_jobs" ON jobs;
CREATE POLICY "agencies_read_own_jobs"
  ON jobs FOR SELECT
  USING (agency_id = auth.uid());

-- Talents can read all open, non-deleted jobs (job browsing)
DROP POLICY IF EXISTS "talent_read_open_jobs" ON jobs;
CREATE POLICY "talent_read_open_jobs"
  ON jobs FOR SELECT
  USING (
    status = 'open'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM talent_profiles WHERE id = auth.uid()
    )
  );

-- ── CONTRACTS ────────────────────────────────────────────────────────────────

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Agencies can read their own contracts
DROP POLICY IF EXISTS "agencies_read_own_contracts" ON contracts;
CREATE POLICY "agencies_read_own_contracts"
  ON contracts FOR SELECT
  USING (agency_id = auth.uid() AND deleted_at IS NULL);

-- Talents can read their own contracts
DROP POLICY IF EXISTS "talent_read_own_contracts" ON contracts;
CREATE POLICY "talent_read_own_contracts"
  ON contracts FOR SELECT
  USING (talent_id = auth.uid() AND deleted_at IS NULL);

-- ── BOOKINGS ─────────────────────────────────────────────────────────────────

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Agencies can read their own bookings
DROP POLICY IF EXISTS "agencies_read_own_bookings" ON bookings;
CREATE POLICY "agencies_read_own_bookings"
  ON bookings FOR SELECT
  USING (agency_id = auth.uid() AND deleted_at IS NULL);

-- Talents can read their own bookings
DROP POLICY IF EXISTS "talent_read_own_bookings" ON bookings;
CREATE POLICY "talent_read_own_bookings"
  ON bookings FOR SELECT
  USING (talent_user_id = auth.uid() AND deleted_at IS NULL);

-- ── SUBMISSIONS ──────────────────────────────────────────────────────────────

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Talents can read their own submissions
DROP POLICY IF EXISTS "talent_read_own_submissions" ON submissions;
CREATE POLICY "talent_read_own_submissions"
  ON submissions FOR SELECT
  USING (talent_user_id = auth.uid());

-- Agencies can read submissions for their jobs
DROP POLICY IF EXISTS "agencies_read_job_submissions" ON submissions;
CREATE POLICY "agencies_read_job_submissions"
  ON submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = submissions.job_id
        AND jobs.agency_id = auth.uid()
    )
  );

-- ── TALENT_PROFILES ───────────────────────────────────────────────────────────

ALTER TABLE talent_profiles ENABLE ROW LEVEL SECURITY;

-- Talents can read and update their own profile
DROP POLICY IF EXISTS "talent_read_own_profile" ON talent_profiles;
CREATE POLICY "talent_read_own_profile"
  ON talent_profiles FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "talent_update_own_profile" ON talent_profiles;
CREATE POLICY "talent_update_own_profile"
  ON talent_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Agencies can read all talent profiles (for browsing/casting)
DROP POLICY IF EXISTS "agencies_read_talent_profiles" ON talent_profiles;
CREATE POLICY "agencies_read_talent_profiles"
  ON talent_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agencies WHERE id = auth.uid()
    )
  );

-- ── AGENCIES ─────────────────────────────────────────────────────────────────

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

-- Agencies can read and update their own record
DROP POLICY IF EXISTS "agencies_read_own_record" ON agencies;
CREATE POLICY "agencies_read_own_record"
  ON agencies FOR SELECT
  USING (id = auth.uid() OR user_id = auth.uid());

DROP POLICY IF EXISTS "agencies_update_own_record" ON agencies;
CREATE POLICY "agencies_update_own_record"
  ON agencies FOR UPDATE
  USING (id = auth.uid() OR user_id = auth.uid())
  WITH CHECK (id = auth.uid() OR user_id = auth.uid());

-- Talents can read basic agency info (to display agency names on their contracts/bookings)
DROP POLICY IF EXISTS "talent_read_agency_info" ON agencies;
CREATE POLICY "talent_read_agency_info"
  ON agencies FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM talent_profiles WHERE id = auth.uid()
    )
  );

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
-- (already handled in migrations 005–008, ensured here for completeness)

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_notifications" ON notifications;
CREATE POLICY "users_read_own_notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_notifications" ON notifications;
CREATE POLICY "users_update_own_notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
