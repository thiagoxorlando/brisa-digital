-- Add soft-delete column to profiles so account deletion can be tracked
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
