-- Migration 003: Add extra fields to jobs table
-- location, gender, age_min, age_max

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS location   text,
  ADD COLUMN IF NOT EXISTS gender     text,
  ADD COLUMN IF NOT EXISTS age_min    integer,
  ADD COLUMN IF NOT EXISTS age_max    integer;
