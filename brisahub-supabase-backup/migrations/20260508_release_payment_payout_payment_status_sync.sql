-- Keep contract payment_status in sync when payout is released.
-- Preserve existing idempotency: repeated payout attempts must not double-credit wallets.

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

  UPDATE contracts
  SET
    status = 'paid',
    payment_status = 'paid',
    paid_at = now()
  WHERE id = p_contract_id;

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

UPDATE contracts
SET payment_status = 'paid'
WHERE status = 'paid'
  AND payment_status IS DISTINCT FROM 'paid';
