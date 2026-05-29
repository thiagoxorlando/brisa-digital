-- Add signed_at timestamp to contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_at timestamptz;
