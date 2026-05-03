-- Replace confirm_booking_escrow to use ONLY wallet_balance.
-- Removes the wallet_funding_sources check that was causing
-- "insufficient_funding_sources" even when wallet_balance was sufficient.

CREATE OR REPLACE FUNCTION confirm_booking_escrow(
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
  v_balance numeric(12,2);
  v_booking_id uuid;
  v_talent_id uuid;
  v_idem_key text := 'escrow_' || p_contract_id;
  v_tx_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
  END IF;

  SELECT status, booking_id, talent_id
  INTO v_status, v_booking_id, v_talent_id
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  IF v_status != 'signed' THEN
    IF v_status = 'confirmed' THEN
      RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_signed', 'status', v_status);
  END IF;

  SELECT COALESCE(wallet_balance, 0)
  INTO v_balance
  FROM profiles
  WHERE id = p_agency_id
  FOR UPDATE;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'required', p_amount,
      'available', v_balance
    );
  END IF;

  UPDATE profiles
  SET wallet_balance = round((v_balance - p_amount)::numeric, 2)
  WHERE id = p_agency_id;

  INSERT INTO wallet_transactions (user_id, type, amount, description, idempotency_key)
  VALUES (
    p_agency_id,
    'escrow_lock',
    round(p_amount, 2),
    'Custodia: fundos retidos ate conclusao do servico',
    v_idem_key
  )
  RETURNING id INTO v_tx_id;

  UPDATE contracts
  SET
    status = 'confirmed',
    confirmed_at = now(),
    agency_signed_at = now(),
    deposit_paid_at = now()
  WHERE id = p_contract_id;

  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'confirmed' WHERE id = v_booking_id;
  END IF;

  IF v_talent_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
    VALUES (
      v_talent_id, 'contract',
      'Agência confirmou o contrato e realizou o depósito',
      '/talent/contracts', false,
      'notif_escrow_talent_' || p_contract_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
  VALUES (
    p_agency_id, 'booking',
    'Reserva confirmada — fundos em custódia',
    '/agency/finances', false,
    'notif_escrow_agency_' || p_contract_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed', 'transaction_id', v_tx_id);
END;
$$;
