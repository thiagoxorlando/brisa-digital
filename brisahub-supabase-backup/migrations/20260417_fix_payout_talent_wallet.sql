-- Fix release_payment_payout: credit talent wallet correctly.
--
-- Prior bug: transaction was inserted under user_id = p_agency_id (the agency),
-- not the talent. profiles.wallet_balance for the talent was never updated.
--
-- Fix:
--   1. SELECT talent_id + booking_id from contracts (FOR UPDATE)
--   2. UPDATE profiles SET wallet_balance += amount WHERE id = talent_id
--   3. INSERT wallet_transactions under talent_id (type = 'payout')
--   4. UPDATE contracts SET status = 'paid', paid_at = now()
--   5. UPDATE bookings  SET status = 'paid'   (atomic, same txn)
--   6. INSERT talent notification (idempotent)
--
-- Idempotency key: 'payout_<contract_id>' — unchanged, safe to re-run.
-- The fast-path SELECT checks wallet_transactions for existing key; if the old
-- (wrong) row exists under agency_id it will NOT match a talent-owned row, so
-- a re-run of this migration will re-create the function correctly.  Any
-- existing bad wallet_transactions rows from the prior version are left in
-- place (they are ledger history); only new payouts use the fixed function.

CREATE OR REPLACE FUNCTION release_payment_payout(
  p_contract_id uuid,
  p_agency_id   uuid,
  p_amount      numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status     text;
  v_talent_id  uuid;
  v_booking_id uuid;
  v_idem_key   text := 'payout_' || p_contract_id;
BEGIN
  -- Idempotency fast-path: if we already wrote the payout row, funds already moved.
  IF EXISTS (
    SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'paid');
  END IF;

  -- Lock contract row; fetch talent + booking at the same time.
  SELECT status, talent_id, booking_id
  INTO   v_status, v_talent_id, v_booking_id
  FROM   contracts
  WHERE  id = p_contract_id
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
    -- Credit talent wallet (escrow already deducted from agency at confirmation).
    UPDATE profiles
    SET    wallet_balance = COALESCE(wallet_balance, 0) + p_amount
    WHERE  id = v_talent_id;

    -- Ledger entry under talent_id — unique key prevents double-credit on concurrent calls.
    INSERT INTO wallet_transactions (user_id, type, amount, description, idempotency_key)
    VALUES (
      v_talent_id,
      'payout',
      p_amount,
      'Pagamento recebido pelo trabalho',
      v_idem_key
    );
  END IF;

  -- Mark contract paid.
  UPDATE contracts
  SET    status  = 'paid',
         paid_at = now()
  WHERE  id = p_contract_id;

  -- Sync booking status in same transaction (no separate syncBooking call needed).
  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings
    SET    status = 'paid'
    WHERE  id = v_booking_id;
  END IF;

  -- Notify talent atomically (idempotent — safe on retries).
  IF v_talent_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
    VALUES (
      v_talent_id,
      'payment',
      'Agência liberou seu pagamento — a caminho!',
      '/talent/finances',
      false,
      'notif_payout_talent_' || p_contract_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'paid');
END;
$$;
