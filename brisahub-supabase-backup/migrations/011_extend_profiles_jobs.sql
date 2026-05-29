-- ============================================================
-- 011_extend_profiles_jobs.sql
-- Add social links to talent_profiles, phone/address to agencies,
-- and job_date to jobs.
-- ============================================================

-- talent_profiles: extended social links
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS x_handle  text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS website   text;
ALTER TABLE talent_profiles ADD COLUMN IF NOT EXISTS imdb      text;

-- agencies: contact info
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS phone   text;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS address text;

-- jobs: actual job date (separate from application deadline)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_date date;
