-- Add PIX withdrawal fields to agencies (agencies had no PIX fields at all).
-- Add fee/net columns to wallet_transactions for withdrawal auditing.
-- Replace request_agency_withdrawal RPC to validate PIX, calculate fee, and record both.

-- ── Agency PIX key for manual payouts ────────────────────────────────────────
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS pix_key_type    text,
  ADD COLUMN IF NOT EXISTS pix_key_value   text,
  ADD COLUMN IF NOT EXISTS pix_holder_name text;

-- ── Wallet transaction fee tracking ──────────────────────────────────────────
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS fee_amount  numeric(12,2),
  ADD COLUMN IF NOT EXISTS net_amount  numeric(12,2);

-- ── Updated RPC ───────────────────────────────────────────────────────────────
-- p_fee_rate: passed from server env (WITHDRAWAL_FEE_RATE), default 0.03.
-- Returns: { ok, amount, fee, net_amount } or { ok: false, error: string }.
CREATE OR REPLACE FUNCTION request_agency_withdrawal(p_user_id uuid, p_fee_rate numeric DEFAULT 0.03)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance    numeric(12,2);
  v_fee        numeric(12,2);
  v_net        numeric(12,2);
  v_idem_key   text;
  v_pix_type   text;
  v_pix_value  text;
BEGIN
  -- Verify agency has configured PIX key before allowing withdrawal
  SELECT pix_key_type, pix_key_value
  INTO   v_pix_type, v_pix_value
  FROM   agencies
  WHERE  id = p_user_id;

  IF v_pix_type IS NULL OR v_pix_value IS NULL OR trim(v_pix_value) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pix_not_configured');
  END IF;

  -- Lock profile row — blocks concurrent withdrawal attempts
  SELECT wallet_balance INTO v_balance
  FROM   profiles
  WHERE  id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_balance <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  END IF;

  -- Fee: round to 2 decimal places; net is what admin sends to agency
  v_fee := round(v_balance * p_fee_rate, 2);
  v_net := v_balance - v_fee;

  -- Zero balance in same transaction that holds the lock
  UPDATE profiles SET wallet_balance = 0 WHERE id = p_user_id;

  v_idem_key := 'withdraw_' || p_user_id::text || '_'
                || extract(epoch from clock_timestamp())::bigint::text;

  INSERT INTO wallet_transactions
    (user_id, type, amount, description, idempotency_key, status, fee_amount, net_amount)
  VALUES
    (p_user_id, 'withdrawal', v_balance, 'Saque solicitado', v_idem_key, 'pending', v_fee, v_net);

  RETURN jsonb_build_object('ok', true, 'amount', v_balance, 'fee', v_fee, 'net_amount', v_net);
END;
$$;
