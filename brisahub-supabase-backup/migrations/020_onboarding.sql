-- Add onboarding tracking to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Backfill: existing agency users have already completed onboarding
UPDATE profiles SET onboarding_completed = true WHERE role = 'agency';

-- Talents don't have the job-creation onboarding; mark them complete too
UPDATE profiles SET onboarding_completed = true WHERE role = 'talent';
