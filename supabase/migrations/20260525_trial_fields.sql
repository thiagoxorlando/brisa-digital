-- Trial and subscription provider fields on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_started_at      timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at         timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_provider text DEFAULT 'asaas';

-- subscription_provider: 'asaas' | 'stripe' | 'manual' — future-proof for multi-provider
COMMENT ON COLUMN profiles.trial_started_at      IS 'When the agency started their free trial (null = never trialed)';
COMMENT ON COLUMN profiles.trial_ends_at         IS 'When the trial period ends (null = not in trial)';
COMMENT ON COLUMN profiles.subscription_provider IS 'Payment provider managing the subscription';
