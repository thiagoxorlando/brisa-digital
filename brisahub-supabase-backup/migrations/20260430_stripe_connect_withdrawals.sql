-- Stripe Connect automatic withdrawals for agencies and talents.
-- Wallet balance remains internal in profiles.wallet_balance.
-- Stripe is only the payment rail after funds are atomically locked by RPC.

ALTER TABLE talent_profiles
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_transfers_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_updated_at timestamptz;

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_transfers_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_updated_at timestamptz;

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

  IF v_status NOT IN ('pending', 'processing') THEN
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

CREATE OR REPLACE FUNCTION fail_wallet_withdrawal(
  p_transaction_id uuid,
  p_reason text,
  p_provider_status text DEFAULT 'failed'
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
  v_provider_status text := nullif(trim(coalesce(p_provider_status, '')), '');
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

  IF v_status IN ('failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', true, 'status', v_status, 'already_finalized', true);
  END IF;

  IF v_status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_paid');
  END IF;

  IF v_status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'current_status', v_status);
  END IF;

  UPDATE profiles
  SET wallet_balance = round((coalesce(wallet_balance, 0) + v_amount)::numeric, 2)
  WHERE id = v_user_id;

  UPDATE wallet_transactions
  SET
    status = 'failed',
    provider_status = coalesce(v_provider_status, 'failed'),
    processed_at = now(),
    admin_note = coalesce(v_note, admin_note)
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object('ok', true, 'status', 'failed', 'amount_restored', v_amount);
END;
$$;
