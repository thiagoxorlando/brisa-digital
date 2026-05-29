-- Premium workspace onboarding tracking
-- Shows the setup wizard to new Premium owners until dismissed

ALTER TABLE premium_workspaces
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Backfill: existing workspaces are already set up — skip the wizard for them
UPDATE premium_workspaces
SET onboarding_completed = true
WHERE onboarding_completed = false;
