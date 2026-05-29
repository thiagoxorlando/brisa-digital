-- Idempotency + double-action protection for escrow and payout flows.
--
-- Problem: two concurrent API calls (double-click, network retry) both pass
-- the FOR UPDATE status check before either commits, resulting in:
--   - wallet charged twice
--   - talent paid twice
--
-- Solution: unique idempotency_key on wallet_transactions.
-- The INSERT inside each function will raise a unique-violation if the key
-- already exists, which rolls back the entire transaction automatically.
-- For zero-amount contracts the contract status guard is the sole barrier
-- (no wallet row is written), which is already safe via FOR UPDATE.

-- ── Schema ────────────────────────────────────────────────────────────────────

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_idempotency_key_idx
  ON wallet_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── confirm_booking_escrow ────────────────────────────────────────────────────
-- signed → confirmed
-- Idempotency key: 'escrow_<contract_id>'

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
  v_idem_key   text := 'escrow_' || p_contract_id;
BEGIN
  -- Idempotency fast-path: if we already wrote the escrow transaction, the
  -- money was already deducted and the contract is confirmed. Return ok.
  IF EXISTS (
    SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
  END IF;

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
    -- Already confirmed by a concurrent call that committed first — treat as ok
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

    -- Unique key on idempotency_key guarantees this INSERT fails (and rolls back
    -- the whole transaction) if a concurrent call slipped past the fast-path check.
    INSERT INTO wallet_transactions (user_id, type, amount, description, idempotency_key)
    VALUES (
      p_agency_id,
      'escrow_lock',
      p_amount,
      'Custódia: fundos retidos até conclusão do serviço',
      v_idem_key
    );
  END IF;

  UPDATE contracts
  SET
    status           = 'confirmed',
    confirmed_at     = now(),
    agency_signed_at = now(),
    deposit_paid_at  = now()
  WHERE id = p_contract_id;

  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings
    SET status = 'confirmed'
    WHERE id = v_booking_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END;
$$;

-- ── release_payment_payout ────────────────────────────────────────────────────
-- confirmed → paid
-- Idempotency key: 'payout_<contract_id>'

CREATE OR REPLACE FUNCTION release_payment_payout(
  p_contract_id uuid,
  p_agency_id   uuid,
  p_amount      numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status   text;
  v_idem_key text := 'payout_' || p_contract_id;
BEGIN
  -- Idempotency fast-path
  IF EXISTS (
    SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'paid');
  END IF;

  SELECT status INTO v_status
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
    VALUES (
      p_agency_id,
      'payout',
      p_amount,
      'Pagamento liberado ao talento',
      v_idem_key
    );
  END IF;

  UPDATE contracts
  SET status = 'paid', paid_at = now()
  WHERE id = p_contract_id;

  RETURN jsonb_build_object('ok', true, 'status', 'paid');
END;
$$;
