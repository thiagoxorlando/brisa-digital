-- Upgrade notifications to be fully atomic and idempotent.
--
-- Changes:
-- 1. Add idempotency_key to notifications (unique index, nullable — existing rows unaffected)
-- 2. Move lifecycle notifications INSIDE the financial RPCs so they commit
--    in the same transaction as the money operation. If the app process dies
--    between RPC and the app-layer notify() call, the notification is never lost.
-- 3. The app-layer notify() calls for these two events are removed in code.

-- ── Step 1: Schema ────────────────────────────────────────────────────────────

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_idempotency_key_idx
  ON notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── Step 2: confirm_booking_escrow — add notification inserts ─────────────────
-- Notifies:
--   talent  → "Agência confirmou o contrato e realizou o depósito"  (/talent/contracts)
--   agency  → "Reserva confirmada — fundos em custódia"             (/agency/finances)
-- Keys: notif_escrow_talent_<id>, notif_escrow_agency_<id>

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
  v_talent_id  uuid;
  v_idem_key   text := 'escrow_' || p_contract_id;
BEGIN
  -- Idempotency fast-path (wallet transaction already written → money already moved)
  IF EXISTS (
    SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
  END IF;

  SELECT status, booking_id, talent_id
  INTO   v_status, v_booking_id, v_talent_id
  FROM   contracts
  WHERE  id = p_contract_id
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

  IF p_amount > 0 THEN
    SELECT wallet_balance INTO v_balance
    FROM   profiles
    WHERE  id = p_agency_id
    FOR UPDATE;

    IF v_balance IS NULL THEN v_balance := 0; END IF;

    IF v_balance < p_amount THEN
      RETURN jsonb_build_object(
        'ok',        false,
        'error',     'insufficient_balance',
        'required',  p_amount,
        'available', v_balance
      );
    END IF;

    UPDATE profiles SET wallet_balance = v_balance - p_amount WHERE id = p_agency_id;

    -- Unique key makes this INSERT fail (rolling back the whole txn) on concurrent duplicate
    INSERT INTO wallet_transactions (user_id, type, amount, description, idempotency_key)
    VALUES (p_agency_id, 'escrow_lock', p_amount,
            'Custódia: fundos retidos até conclusão do serviço', v_idem_key);
  END IF;

  UPDATE contracts
  SET
    status           = 'confirmed',
    confirmed_at     = now(),
    agency_signed_at = now(),
    deposit_paid_at  = now()
  WHERE id = p_contract_id;

  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'confirmed' WHERE id = v_booking_id;
  END IF;

  -- Notify talent (atomic — same transaction as the money operation)
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

  -- Notify agency (only if money was actually locked)
  IF p_amount > 0 THEN
    INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
    VALUES (
      p_agency_id, 'booking',
      'Reserva confirmada — fundos em custódia',
      '/agency/finances', false,
      'notif_escrow_agency_' || p_contract_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END;
$$;

-- ── Step 3: release_payment_payout — add notification insert ─────────────────
-- Notifies:
--   talent → "Agência liberou seu pagamento — a caminho!"  (/talent/finances)
-- Key: notif_payout_talent_<id>

CREATE OR REPLACE FUNCTION release_payment_payout(
  p_contract_id uuid,
  p_agency_id   uuid,
  p_amount      numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status    text;
  v_talent_id uuid;
  v_idem_key  text := 'payout_' || p_contract_id;
BEGIN
  -- Idempotency fast-path
  IF EXISTS (
    SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'paid');
  END IF;

  SELECT status, talent_id
  INTO   v_status, v_talent_id
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

  IF p_amount > 0 THEN
    INSERT INTO wallet_transactions (user_id, type, amount, description, idempotency_key)
    VALUES (p_agency_id, 'payout', p_amount,
            'Pagamento liberado ao talento', v_idem_key);
  END IF;

  UPDATE contracts SET status = 'paid', paid_at = now() WHERE id = p_contract_id;

  -- Notify talent atomically
  IF v_talent_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
    VALUES (
      v_talent_id, 'payment',
      'Agência liberou seu pagamento — a caminho!',
      '/talent/finances', false,
      'notif_payout_talent_' || p_contract_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'paid');
END;
$$;
