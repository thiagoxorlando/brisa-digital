-- Make referral commissions real withdrawable wallet balance.
--
-- This replaces credit_referral_commission with an insert-first idempotent
-- version: only the transaction that successfully creates the unique
-- referral_commission ledger row is allowed to credit profiles.wallet_balance.
-- Retries return already_processed without double-crediting.

CREATE OR REPLACE FUNCTION credit_referral_commission(
  p_referrer_id  uuid,
  p_invite_id    uuid,
  p_contract_id  uuid,
  p_commission   numeric,
  p_job_title    text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idem_key       text := 'referral_commission:' || p_invite_id || ':' || p_contract_id;
  v_now            timestamptz := now();
  v_existing_tx_id uuid;
  v_tx_id          uuid;
  v_profile_id     uuid;
  v_invite_id      uuid;
BEGIN
  IF p_referrer_id IS NULL OR p_invite_id IS NULL OR p_contract_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_argument');
  END IF;

  IF p_commission IS NULL OR p_commission <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_commission');
  END IF;

  SELECT id
  INTO v_invite_id
  FROM referral_invites
  WHERE id = p_invite_id
    AND referrer_id = p_referrer_id
  FOR UPDATE;

  IF v_invite_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referral_invite_not_found');
  END IF;

  SELECT id
  INTO v_existing_tx_id
  FROM wallet_transactions
  WHERE idempotency_key = v_idem_key
  FOR UPDATE;

  IF v_existing_tx_id IS NOT NULL THEN
    UPDATE referral_invites
    SET
      status             = 'commission_paid',
      commission_amount  = COALESCE(commission_amount, p_commission),
      completed_at       = COALESCE(completed_at, v_now),
      commission_due_at  = COALESCE(commission_due_at, v_now),
      commission_paid_at = COALESCE(commission_paid_at, v_now),
      paid_contract_id   = COALESCE(paid_contract_id, p_contract_id),
      updated_at         = v_now
    WHERE id = p_invite_id;

    RETURN jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'wallet_balance_credited', false,
      'transaction_id', v_existing_tx_id
    );
  END IF;

  INSERT INTO wallet_transactions (user_id, type, amount, description, reference_id, idempotency_key)
  VALUES (
    p_referrer_id,
    'referral_commission',
    round(p_commission, 2),
    'Comissão de indicação (2%) - ' || COALESCE(NULLIF(p_job_title, ''), 'trabalho'),
    p_contract_id::text,
    v_idem_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN
    SELECT id
    INTO v_existing_tx_id
    FROM wallet_transactions
    WHERE idempotency_key = v_idem_key;

    UPDATE referral_invites
    SET
      status             = 'commission_paid',
      commission_amount  = COALESCE(commission_amount, p_commission),
      completed_at       = COALESCE(completed_at, v_now),
      commission_due_at  = COALESCE(commission_due_at, v_now),
      commission_paid_at = COALESCE(commission_paid_at, v_now),
      paid_contract_id   = COALESCE(paid_contract_id, p_contract_id),
      updated_at         = v_now
    WHERE id = p_invite_id;

    RETURN jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'wallet_balance_credited', false,
      'transaction_id', v_existing_tx_id
    );
  END IF;

  UPDATE profiles
  SET wallet_balance = round((COALESCE(wallet_balance, 0) + p_commission)::numeric, 2)
  WHERE id = p_referrer_id
  RETURNING id INTO v_profile_id;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Referrer profile not found: %', p_referrer_id;
  END IF;

  UPDATE referral_invites
  SET
    status             = 'commission_paid',
    commission_amount  = round(p_commission, 2),
    completed_at       = COALESCE(completed_at, v_now),
    commission_due_at  = COALESCE(commission_due_at, v_now),
    commission_paid_at = v_now,
    paid_contract_id   = p_contract_id,
    updated_at         = v_now
  WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'wallet_balance_credited', true,
    'transaction_id', v_tx_id
  );
END;
$$;
