-- Fix release_payment_payout and credit_referral_commission:
-- Remove wallet_funding_sources reserved-source validation and allocation loops.
-- The contract being in 'confirmed' status is the only escrow proof needed.
-- Agency wallet was already debited at confirm time; do NOT debit again here.

-- ── release_payment_payout ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION release_payment_payout(
  p_contract_id uuid,
  p_agency_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_talent_id uuid;
  v_booking_id uuid;
  v_idem_key text := 'payout_' || p_contract_id;
  v_tx_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'paid');
  END IF;

  SELECT status, talent_id, booking_id
  INTO v_status, v_talent_id, v_booking_id
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  IF v_status != 'confirmed' THEN
    IF v_status = 'paid' THEN
      RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'paid');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_confirmed', 'status', v_status);
  END IF;

  IF p_amount > 0 AND v_talent_id IS NOT NULL THEN
    UPDATE profiles
    SET wallet_balance = round((COALESCE(wallet_balance, 0) + p_amount)::numeric, 2)
    WHERE id = v_talent_id;

    INSERT INTO wallet_transactions (user_id, type, amount, description, reference_id, idempotency_key)
    VALUES (
      v_talent_id,
      'payout',
      p_amount,
      'Pagamento recebido pelo trabalho',
      p_contract_id::text,
      v_idem_key
    )
    RETURNING id INTO v_tx_id;
  END IF;

  UPDATE contracts SET status = 'paid', paid_at = now() WHERE id = p_contract_id;

  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'paid' WHERE id = v_booking_id;
  END IF;

  IF v_talent_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
    VALUES (
      v_talent_id, 'payment', 'Agência liberou seu pagamento — a caminho!',
      '/talent/finances', false, 'notif_payout_talent_' || p_contract_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'paid', 'transaction_id', v_tx_id);
END;
$$;

-- ── credit_referral_commission ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION credit_referral_commission(
  p_referrer_id uuid,
  p_invite_id uuid,
  p_contract_id uuid,
  p_commission numeric,
  p_job_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idem_key text := 'referral_commission:' || p_invite_id || ':' || p_contract_id;
  v_tx_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true);
  END IF;

  UPDATE profiles
  SET wallet_balance = round((COALESCE(wallet_balance, 0) + p_commission)::numeric, 2)
  WHERE id = p_referrer_id;

  INSERT INTO wallet_transactions (user_id, type, amount, description, reference_id, idempotency_key)
  VALUES (
    p_referrer_id,
    'referral_commission',
    p_commission,
    'Comissão de indicação (2%) - ' || COALESCE(p_job_title, 'trabalho'),
    p_contract_id::text,
    v_idem_key
  )
  RETURNING id INTO v_tx_id;

  UPDATE referral_invites
  SET
    status = 'commission_paid',
    commission_amount = p_commission,
    commission_paid_at = now(),
    paid_contract_id = p_contract_id,
    updated_at = now()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', true, 'already_processed', false, 'wallet_balance_credited', true, 'transaction_id', v_tx_id);
END;
$$;
