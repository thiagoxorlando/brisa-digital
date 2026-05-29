-- Agency can now withdraw a chosen amount (not forced full-balance).
-- New cancel_agency_withdrawal RPC restores balance atomically.

-- ── Updated request_agency_withdrawal ────────────────────────────────────────
-- Added p_amount: only deducts the requested amount, returns remaining_balance.
CREATE OR REPLACE FUNCTION request_agency_withdrawal(
  p_user_id  uuid,
  p_amount   numeric,
  p_fee_rate numeric DEFAULT 0.03
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance    numeric(12,2);
  v_fee        numeric(12,2);
  v_net        numeric(12,2);
  v_remaining  numeric(12,2);
  v_idem_key   text;
  v_pix_type   text;
  v_pix_value  text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  SELECT pix_key_type, pix_key_value INTO v_pix_type, v_pix_value
  FROM agencies WHERE id = p_user_id;

  IF v_pix_type IS NULL OR v_pix_value IS NULL OR trim(v_pix_value) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pix_not_configured');
  END IF;

  -- Lock profile row — blocks concurrent withdrawal attempts
  SELECT wallet_balance INTO v_balance
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  END IF;

  v_fee       := round(p_amount * p_fee_rate, 2);
  v_net       := p_amount - v_fee;
  v_remaining := v_balance - p_amount;

  -- Deduct only the requested amount (not full balance)
  UPDATE profiles SET wallet_balance = v_remaining WHERE id = p_user_id;

  v_idem_key := 'withdraw_' || p_user_id::text || '_'
                || extract(epoch from clock_timestamp())::bigint::text;

  INSERT INTO wallet_transactions
    (user_id, type, amount, description, idempotency_key, status, fee_amount, net_amount)
  VALUES
    (p_user_id, 'withdrawal', p_amount, 'Saque solicitado', v_idem_key, 'pending', v_fee, v_net);

  RETURN jsonb_build_object(
    'ok',                true,
    'amount',            p_amount,
    'fee',               v_fee,
    'net_amount',        v_net,
    'remaining_balance', v_remaining
  );
END;
$$;

-- ── cancel_agency_withdrawal ──────────────────────────────────────────────────
-- Atomically marks the transaction as rejected AND restores the full amount
-- back to the agency wallet. Both operations share the same transaction so
-- a partial failure is impossible.
CREATE OR REPLACE FUNCTION cancel_agency_withdrawal(
  p_tx_id    uuid,
  p_admin_id uuid,
  p_note     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_amount  numeric(12,2);
  v_user_id uuid;
  v_status  text;
BEGIN
  -- Lock the transaction row to prevent concurrent mark-paid + cancel race
  SELECT user_id, amount, status
  INTO   v_user_id, v_amount, v_status
  FROM   wallet_transactions
  WHERE  id = p_tx_id AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'current_status', v_status);
  END IF;

  UPDATE wallet_transactions SET
    status       = 'rejected',
    admin_note   = p_note,
    processed_at = now(),
    processed_by = p_admin_id
  WHERE id = p_tx_id;

  -- Restore full withdrawn amount to agency wallet (no fee returned — fee was never taken externally)
  UPDATE profiles
  SET wallet_balance = wallet_balance + v_amount
  WHERE id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'amount_restored', v_amount);
END;
$$;
