-- Migration 013: Full contract signing flow + talents_needed on jobs

-- Contracts: agency signing + deposit + payment timestamps
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS agency_signed_at  timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deposit_paid_at   timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS paid_at           timestamptz;

-- Jobs: how many talents are needed for the job
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS talents_needed integer;
