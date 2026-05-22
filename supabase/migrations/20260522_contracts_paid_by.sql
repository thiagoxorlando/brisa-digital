-- Add paid_by_user_id to contracts table.
-- Records which authenticated user (owner, agent, or admin) released the payment.
-- NULL on legacy rows — UI falls back to "Pago".
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS paid_by_user_id uuid;
