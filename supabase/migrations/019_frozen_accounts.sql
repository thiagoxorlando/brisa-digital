-- Add freeze flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;

-- Ensure commission/net columns exist on contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commission_amount numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS net_amount        numeric(12,2);

-- Index for frozen lookups in middleware
CREATE INDEX IF NOT EXISTS idx_profiles_is_frozen ON profiles (id) WHERE is_frozen = true;
