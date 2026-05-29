-- Talent withdrawals: no minimum amount.
--
-- Agencies keep using request_agency_withdrawal and its existing minimum.
-- This talent-only RPC validates PIX, locks the profile wallet row, deducts
-- the requested amount, and creates a pending withdrawal transaction.

CREATE OR REPLACE FUNCTION request_talent_withdrawal(
  p_user_id uuid,
  p_amount  numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       text;
  v_balance    numeric(12,2);
  v_amount     numeric(12,2);
  v_remaining  numeric(12,2);
  v_pix_type   text;
  v_pix_value  text;
  v_idem_key   text;
  v_tx_id      uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_user');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  v_amount := round(p_amount, 2);

  SELECT role, wallet_balance
  INTO v_role, v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_role <> 'talent' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_talent');
  END IF;

  SELECT pix_key_type, pix_key_value
  INTO v_pix_type, v_pix_value
  FROM talent_profiles
  WHERE id = p_user_id;

  IF v_pix_type IS NULL OR v_pix_value IS NULL OR trim(v_pix_value) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pix_not_configured');
  END IF;

  IF COALESCE(v_balance, 0) < v_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'available', COALESCE(v_balance, 0)
    );
  END IF;

  v_remaining := round((COALESCE(v_balance, 0) - v_amount)::numeric, 2);

  UPDATE profiles
  SET wallet_balance = v_remaining
  WHERE id = p_user_id;

  v_idem_key := 'talent_withdrawal:' || p_user_id::text || ':'
                || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO wallet_transactions
    (user_id, type, amount, description, idempotency_key, status, fee_amount, net_amount)
  VALUES
    (p_user_id, 'withdrawal', v_amount, 'Saque solicitado por talento', v_idem_key, 'pending', 0, v_amount)
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'ok', true,
    'tx_id', v_tx_id,
    'amount', v_amount,
    'net_amount', v_amount,
    'remaining_balance', v_remaining
  );
END;
$$;
