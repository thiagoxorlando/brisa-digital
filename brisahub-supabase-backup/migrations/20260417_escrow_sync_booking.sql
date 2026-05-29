-- Update confirm_booking_escrow to also set booking.status = 'confirmed'
-- atomically in the same transaction as the contract update.
--
-- Previously the booking sync was done in application code (syncBooking),
-- which ran AFTER the RPC returned. If the app call failed or the
-- booking_id join was stale, the booking remained at 'pending_payment'
-- while the contract was already 'confirmed' — causing UI inconsistency
-- and downstream constraint violations.

CREATE OR REPLACE FUNCTION confirm_booking_escrow(
  p_contract_id uuid,
  p_agency_id   uuid,
  p_amount      numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status     text;
  v_balance    numeric;
  v_booking_id uuid;
BEGIN
  -- Lock contract row to prevent concurrent confirmations
  SELECT status, booking_id
  INTO   v_status, v_booking_id
  FROM   contracts
  WHERE  id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  IF v_status != 'signed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_signed', 'status', v_status);
  END IF;

  IF p_amount > 0 THEN
    -- Lock profile row to prevent concurrent wallet deductions
    SELECT wallet_balance INTO v_balance
    FROM   profiles
    WHERE  id = p_agency_id
    FOR UPDATE;

    IF v_balance IS NULL THEN
      v_balance := 0;
    END IF;

    IF v_balance < p_amount THEN
      RETURN jsonb_build_object(
        'ok',        false,
        'error',     'insufficient_balance',
        'required',  p_amount,
        'available', v_balance
      );
    END IF;

    UPDATE profiles
    SET    wallet_balance = v_balance - p_amount
    WHERE  id = p_agency_id;

    INSERT INTO wallet_transactions (user_id, type, amount, description)
    VALUES (
      p_agency_id,
      'escrow_lock',
      p_amount,
      'Custódia: fundos retidos até conclusão do serviço'
    );
  END IF;

  -- Update contract
  UPDATE contracts
  SET
    status           = 'confirmed',
    confirmed_at     = now(),
    agency_signed_at = now(),
    deposit_paid_at  = now()
  WHERE id = p_contract_id;

  -- Sync booking in the same transaction — no application-layer race possible
  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings
    SET status = 'confirmed'
    WHERE id = v_booking_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END;
$$;
