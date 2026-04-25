-- Add status tracking to wallet_transactions for withdrawal auditing.
-- Existing rows keep status = NULL; only withdrawal rows use pending/paid/rejected.

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS status        text,
  ADD COLUMN IF NOT EXISTS processed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by  uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS admin_note    text;

-- Backfill existing withdrawal rows as paid (they were already processed manually)
UPDATE wallet_transactions
SET status = 'paid'
WHERE type = 'withdrawal' AND status IS NULL;

-- Replace request_agency_withdrawal to set status = 'pending' on new records
CREATE OR REPLACE FUNCTION request_agency_withdrawal(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance  numeric(12,2);
  v_idem_key text;
BEGIN
  SELECT wallet_balance INTO v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_balance <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  END IF;

  UPDATE profiles
  SET wallet_balance = 0
  WHERE id = p_user_id;

  v_idem_key := 'withdraw_' || p_user_id::text || '_'
                || extract(epoch from clock_timestamp())::bigint::text;

  INSERT INTO wallet_transactions (user_id, type, amount, description, idempotency_key, status)
  VALUES (p_user_id, 'withdrawal', v_balance, 'Saque solicitado', v_idem_key, 'pending');

  RETURN jsonb_build_object('ok', true, 'amount', v_balance);
END;
$$;
