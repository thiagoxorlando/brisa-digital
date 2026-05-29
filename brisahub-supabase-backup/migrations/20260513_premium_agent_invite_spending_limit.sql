-- Add spending_limit to premium_agent_invites so the invite carries
-- the spending cap to apply when the member row is created on acceptance.
ALTER TABLE premium_agent_invites
  ADD COLUMN IF NOT EXISTS spending_limit numeric NULL;
