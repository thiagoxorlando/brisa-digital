-- ============================================================
-- 024_complete_schema.sql
-- Ensures every column referenced in application code exists.
-- 100% idempotent — safe to run multiple times.
-- ============================================================

-- ── TALENT_PROFILES ──────────────────────────────────────────
-- Base personal info (may already exist on older projects)
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS user_id    uuid;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS full_name  text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS phone      text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS country    text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS city       text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS bio        text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';

-- Physical / demographic attributes
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS age        integer;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS gender     text;
-- Allowed values: male | female | other
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS ethnicity  text;
-- Allowed values: white | black | brown | yellow | indigenous | (empty = prefer not to say)

-- Social links
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS instagram  text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS tiktok     text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS youtube    text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS x_handle   text;   -- X / Twitter
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS linkedin   text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS website    text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS imdb       text;

-- Payment / financial
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS pix_key_type  text;
-- Allowed values: cpf | cnpj | email | phone | random
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS pix_key_value text;

-- Soft-delete
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ── CONTRACTS ────────────────────────────────────────────────
-- Core fields (should exist from migration 002, kept for safety)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS job_id           uuid;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS talent_id        uuid;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS agency_id        uuid;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS job_date         date;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS job_time         text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS location         text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS job_description  text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_amount   numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_method   text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS additional_notes text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'sent';

-- Financial split
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commission_amount numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS net_amount        numeric(12,2);

-- Signing timestamps
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_at        timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS agency_signed_at timestamptz;

-- Payment tracking
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_status   text DEFAULT 'pending';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pix_payment_id   text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deposit_paid_at  timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS paid_at          timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS withdrawn_at     timestamptz;

-- Uploaded contract document (PDF/image uploaded by agency)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_file_url text;

-- Soft-delete
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at       timestamptz;

-- ── INDEXES (safe to re-run) ──────────────────────────────────
CREATE INDEX IF NOT EXISTS talent_profiles_deleted_at_idx ON talent_profiles (deleted_at);
CREATE INDEX IF NOT EXISTS talent_profiles_instagram_idx  ON talent_profiles (instagram);
CREATE INDEX IF NOT EXISTS talent_profiles_gender_idx     ON talent_profiles (gender);
CREATE INDEX IF NOT EXISTS talent_profiles_age_idx        ON talent_profiles (age);

CREATE INDEX IF NOT EXISTS contracts_talent_id_idx        ON contracts (talent_id);
CREATE INDEX IF NOT EXISTS contracts_agency_id_idx        ON contracts (agency_id);
CREATE INDEX IF NOT EXISTS contracts_job_id_idx           ON contracts (job_id);
CREATE INDEX IF NOT EXISTS contracts_status_idx           ON contracts (status);
CREATE INDEX IF NOT EXISTS contracts_created_at_idx       ON contracts (created_at DESC);
CREATE INDEX IF NOT EXISTS contracts_deleted_at_idx       ON contracts (deleted_at);
