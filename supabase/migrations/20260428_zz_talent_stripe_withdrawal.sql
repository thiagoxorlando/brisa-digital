-- Stripe withdrawals for talents.
--
-- Contract release remains unchanged: paid jobs still credit profiles.wallet_balance.
-- This migration only changes the wallet withdrawal step so talents with a ready
-- Stripe Connect account can withdraw from wallet_balance automatically.

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS status               text,
  ADD COLUMN IF NOT EXISTS processed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by         uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS admin_note           text,
  ADD COLUMN IF NOT EXISTS provider             text,
  ADD COLUMN IF NOT EXISTS provider_transfer_id text,
  ADD COLUMN IF NOT EXISTS provider_status      text;

DROP FUNCTION IF EXISTS request_talent_withdrawal(uuid, numeric);
DROP FUNCTION IF EXISTS request_talent_withdrawal(uuid, numeric, text);

CREATE OR REPLACE FUNCTION request_talent_withdrawal(
  p_user_id  uuid,
  p_amount   numeric,
  p_provider text DEFAULT 'manual'
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
  v_stripe_id  text;
  v_provider   text := COALESCE(NULLIF(trim(p_provider), ''), 'manual');
  v_idem_key   text;
  v_tx_id      uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_user');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF v_provider NOT IN ('manual', 'stripe') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_provider');
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

  IF v_provider = 'stripe' THEN
    SELECT stripe_account_id
    INTO v_stripe_id
    FROM talent_profiles
    WHERE id = p_user_id;

    IF v_stripe_id IS NULL OR trim(v_stripe_id) = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stripe_not_configured');
    END IF;
  ELSE
    SELECT pix_key_type, pix_key_value
    INTO v_pix_type, v_pix_value
    FROM talent_profiles
    WHERE id = p_user_id;

    IF v_pix_type IS NULL OR v_pix_value IS NULL OR trim(v_pix_value) = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'pix_not_configured');
    END IF;
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

  v_idem_key := CASE
    WHEN v_provider = 'stripe' THEN 'talent_stripe_withdrawal:'
    ELSE 'talent_withdrawal:'
  END || p_user_id::text || ':' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO wallet_transactions
    (
      user_id,
      type,
      amount,
      description,
      idempotency_key,
      status,
      fee_amount,
      net_amount,
      provider,
      provider_status
    )
  VALUES
    (
      p_user_id,
      'withdrawal',
      v_amount,
      CASE WHEN v_provider = 'stripe' THEN 'Saque via Stripe' ELSE 'Saque solicitado por talento' END,
      v_idem_key,
      'pending',
      0,
      v_amount,
      CASE WHEN v_provider = 'stripe' THEN 'stripe' ELSE NULL END,
      CASE WHEN v_provider = 'stripe' THEN 'pending_transfer' ELSE NULL END
    )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'ok', true,
    'tx_id', v_tx_id,
    'amount', v_amount,
    'net_amount', v_amount,
    'remaining_balance', v_remaining,
    'provider', v_provider
  );
END;
$$;

CREATE OR REPLACE FUNCTION refund_failed_withdrawal(
  p_tx_id  uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount  numeric(12,2);
BEGIN
  SELECT user_id, amount
  INTO v_user_id, v_amount
  FROM wallet_transactions
  WHERE id = p_tx_id
    AND type = 'withdrawal'
    AND status = 'pending'
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true);
  END IF;

  UPDATE profiles
  SET wallet_balance = round((COALESCE(wallet_balance, 0) + v_amount)::numeric, 2)
  WHERE id = v_user_id;

  UPDATE wallet_transactions
  SET
    status          = 'failed',
    provider_status = 'failed',
    processed_at    = now(),
    admin_note      = COALESCE(NULLIF(trim(p_reason), ''), 'Stripe transfer failed; wallet balance refunded')
  WHERE id = p_tx_id
    AND type = 'withdrawal'
    AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'wallet_refunded', true, 'amount', v_amount);
END;
$$;
