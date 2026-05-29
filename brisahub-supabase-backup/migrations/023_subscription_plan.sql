-- Subscription plan columns on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan            text        NOT NULL DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_status     text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

-- Add reference_id to wallet_transactions (contract_id or payment_id)
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reference_id text;

-- Backfill existing agency rows: keep plan = 'free' (no change needed)
-- Active subscription_status in agencies table remains the source of truth for legacy check

-- Index for plan expiry sweeps
CREATE INDEX IF NOT EXISTS profiles_plan_expires_at_idx ON profiles(plan_expires_at)
  WHERE plan = 'pro';
