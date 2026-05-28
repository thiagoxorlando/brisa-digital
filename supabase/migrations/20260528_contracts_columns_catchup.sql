-- Catch-up: add contract columns that may be missing in production.
-- Every statement uses IF NOT EXISTS so this is safe to rerun.
-- Covers columns added in:
--   20260518_contracts_add_workspace_id.sql
--   20260522_contracts_paid_by.sql
--   20260525_internal_payment_fields.sql

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS workspace_id               uuid        REFERENCES premium_workspaces(id),
  ADD COLUMN IF NOT EXISTS created_by_user_id         uuid        REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS paid_by_user_id            uuid,
  ADD COLUMN IF NOT EXISTS agency_payment_sent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS talent_payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_receipt_url        text;

-- Reload PostgREST schema cache so new columns are immediately queryable.
NOTIFY pgrst, 'reload schema';
