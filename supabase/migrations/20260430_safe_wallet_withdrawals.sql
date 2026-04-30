-- Safe wallet withdrawals for agencies and talents.
-- Manual PIX fallback first; automatic providers can mark rows paid later.

ALTER TABLE talent_profiles
  ADD COLUMN IF NOT EXISTS pix_holder_name text;

UPDATE wallet_transactions
SET status = 'cancelled'
WHERE type = 'withdrawal'
  AND status = 'rejected';

CREATE OR REPLACE FUNCTION request_wallet_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_kind text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_balance numeric(12,2);
  v_amount numeric(12,2);
  v_tx_id uuid;
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_pix_type text;
  v_pix_value text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user_id';
  END IF;

  IF v_kind NOT IN ('agency', 'talent') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  v_amount := round(p_amount::numeric, 2);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT role, coalesce(wallet_balance, 0)
  INTO v_role, v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_role IS DISTINCT FROM v_kind THEN
    RAISE EXCEPTION 'role_mismatch';
  END IF;

  IF v_kind = 'agency' THEN
    SELECT pix_key_type, pix_key_value
    INTO v_pix_type, v_pix_value
    FROM agencies
    WHERE id = p_user_id;
  ELSE
    SELECT pix_key_type, pix_key_value
    INTO v_pix_type, v_pix_value
    FROM talent_profiles
    WHERE id = p_user_id;
  END IF;

  IF v_pix_type IS NULL OR v_pix_value IS NULL OR trim(v_pix_value) = '' THEN
    RAISE EXCEPTION 'pix_not_configured';
  END IF;

  IF v_balance < v_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE profiles
  SET wallet_balance = round((coalesce(wallet_balance, 0) - v_amount)::numeric, 2)
  WHERE id = p_user_id;

  INSERT INTO wallet_transactions (
    user_id,
    type,
    amount,
    description,
    status,
    provider,
    provider_status,
    fee_amount,
    net_amount,
    idempotency_key
  )
  VALUES (
    p_user_id,
    'withdrawal',
    v_amount,
    CASE
      WHEN v_kind = 'agency' THEN 'Saque solicitado pela agencia'
      ELSE 'Saque solicitado pelo talento'
    END,
    'pending',
    'manual',
    'pending',
    0,
    v_amount,
    'wallet_withdrawal:' || v_kind || ':' || p_user_id::text || ':' || replace(gen_random_uuid()::text, '-', '')
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_wallet_withdrawal(
  p_transaction_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric(12,2);
  v_status text;
  v_note text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  SELECT user_id, amount, status
  INTO v_user_id, v_amount, v_status
  FROM wallet_transactions
  WHERE id = p_transaction_id
    AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'already_cancelled', true);
  END IF;

  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'current_status', v_status);
  END IF;

  UPDATE profiles
  SET wallet_balance = round((coalesce(wallet_balance, 0) + v_amount)::numeric, 2)
  WHERE id = v_user_id;

  UPDATE wallet_transactions
  SET
    status = 'cancelled',
    provider_status = 'cancelled',
    processed_at = now(),
    admin_note = coalesce(v_note, admin_note)
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'amount_restored', v_amount);
END;
$$;

CREATE OR REPLACE FUNCTION mark_wallet_withdrawal_paid(
  p_transaction_id uuid,
  p_provider text,
  p_admin_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_provider text := lower(trim(coalesce(p_provider, 'manual')));
  v_note text := nullif(trim(coalesce(p_admin_note, '')), '');
BEGIN
  SELECT status
  INTO v_status
  FROM wallet_transactions
  WHERE id = p_transaction_id
    AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'paid', 'already_paid', true);
  END IF;

  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'current_status', v_status);
  END IF;

  UPDATE wallet_transactions
  SET
    status = 'paid',
    provider = CASE WHEN v_provider = '' THEN 'manual' ELSE v_provider END,
    provider_status = 'paid',
    processed_at = now(),
    admin_note = coalesce(v_note, admin_note)
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object('ok', true, 'status', 'paid');
END;
$$;
