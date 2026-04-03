-- ============================================================
-- 001_business_logic.sql
-- Run once against your Supabase project via the SQL editor
-- or `supabase db push`.
-- ============================================================

-- ------------------------------------------------------------
-- jobs: add status column (default open)
-- ------------------------------------------------------------
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

-- ------------------------------------------------------------
-- agencies: add subscription_status column
-- ------------------------------------------------------------
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active';

-- ------------------------------------------------------------
-- contracts table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid REFERENCES bookings(id) ON DELETE SET NULL,
  agency_id        uuid,
  talent_user_id   uuid,
  job_title        text,
  deal_value       numeric(12, 2) NOT NULL DEFAULT 0,
  talent_earnings  numeric(12, 2) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'sent',
    -- Allowed values: sent | talent_signed | completed | cancelled
  notes            text,
  talent_signed_at timestamptz,
  agency_signed_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for quick agency / talent lookups
CREATE INDEX IF NOT EXISTS contracts_agency_id_idx        ON contracts (agency_id);
CREATE INDEX IF NOT EXISTS contracts_talent_user_id_idx   ON contracts (talent_user_id);
CREATE INDEX IF NOT EXISTS contracts_booking_id_idx       ON contracts (booking_id);
CREATE INDEX IF NOT EXISTS contracts_status_idx           ON contracts (status);

-- RLS: enable but allow service-role to bypass (all API routes use service role)
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Agencies can read their own contracts
CREATE POLICY IF NOT EXISTS "agencies_read_own_contracts"
  ON contracts FOR SELECT
  USING (agency_id = auth.uid());

-- Talent can read their own contracts
CREATE POLICY IF NOT EXISTS "talent_read_own_contracts"
  ON contracts FOR SELECT
  USING (talent_user_id = auth.uid());

-- All mutations go through the API (service role) — no client-side inserts/updates
