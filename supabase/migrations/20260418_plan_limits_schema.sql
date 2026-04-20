-- Add talent profile fields
ALTER TABLE talent_profiles
  ADD COLUMN IF NOT EXISTS cpf_or_id  text,
  ADD COLUMN IF NOT EXISTS main_role  text;

-- Add job structure fields
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_time  text,
  ADD COLUMN IF NOT EXISTS job_role  text;
