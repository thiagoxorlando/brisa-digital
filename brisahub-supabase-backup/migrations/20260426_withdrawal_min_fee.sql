-- Enforce minimum withdrawal amount and fee floor — 2026-04-26
-- Minimum withdrawal: R$100.00 (prevents net loss when Asaas R$5 fee > 3%)
-- Fee floor: GREATEST(amount × fee_rate, R$5.00)

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

  IF p_amount < 100.00 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'below_minimum', 'minimum', 100.00);
  END IF;

  IF p_fee_rate IS NULL OR p_fee_rate < 0 OR p_fee_rate > 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_fee_rate');
  END IF;

  SELECT pix_key_type, pix_key_value INTO v_pix_type, v_pix_value
  FROM agencies WHERE id = p_user_id;

  IF v_pix_type IS NULL OR v_pix_value IS NULL OR trim(v_pix_value) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pix_not_configured');
  END IF;

  SELECT wallet_balance INTO v_balance
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  END IF;

  v_fee       := GREATEST(round(p_amount * p_fee_rate, 2), 5.00);
  v_net       := p_amount - v_fee;
  v_remaining := v_balance - p_amount;

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
