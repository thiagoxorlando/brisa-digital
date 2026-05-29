-- ============================================================
-- 009_agency_avatar.sql
-- Add avatar_url to agencies table for profile photos.
-- ============================================================

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS avatar_url text;
