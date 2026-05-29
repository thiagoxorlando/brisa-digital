-- ============================================================
-- 012_soft_delete.sql
-- Add soft-delete support (deleted_at) to main entities.
-- Items with deleted_at set are moved to Trash.
-- ============================================================

ALTER TABLE jobs            ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE bookings        ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE contracts       ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE agencies        ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
