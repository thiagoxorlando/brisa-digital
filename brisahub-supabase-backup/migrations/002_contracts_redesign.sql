-- ============================================================
-- 002_contracts_redesign.sql
-- Replaces the original contracts table with the simplified
-- in-platform contract workflow schema.
-- Run AFTER 001_business_logic.sql.
-- ============================================================

-- Drop old table if it was created by migration 001
DROP TABLE IF EXISTS contracts;

-- ─── contracts ───────────────────────────────────────────────
CREATE TABLE contracts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid REFERENCES jobs(id) ON DELETE SET NULL,
  talent_id         uuid,   -- auth.users.id of the talent
  agency_id         uuid,   -- auth.users.id of the agency user
  job_date          date,
  job_time          text,
  location          text,
  job_description   text,
  payment_amount    numeric(12, 2) NOT NULL DEFAULT 0,
  payment_method    text,
  additional_notes  text,
  status            text NOT NULL DEFAULT 'sent',
  -- Allowed values: sent | accepted | rejected
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contracts_agency_id_idx  ON contracts (agency_id);
CREATE INDEX IF NOT EXISTS contracts_talent_id_idx  ON contracts (talent_id);
CREATE INDEX IF NOT EXISTS contracts_job_id_idx     ON contracts (job_id);
CREATE INDEX IF NOT EXISTS contracts_status_idx     ON contracts (status);

-- RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agencies_read_own_contracts"
  ON contracts FOR SELECT
  USING (agency_id = auth.uid());

CREATE POLICY "talent_read_own_contracts"
  ON contracts FOR SELECT
  USING (talent_id = auth.uid());

-- All writes go through the API with service role — no direct client mutations
