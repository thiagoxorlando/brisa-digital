-- ============================================================
-- 20260416_payment_safety.sql
-- Atomic payment flow: escrow lock, payout, refund.
-- All money operations run inside a single transaction via RPC.
-- ============================================================

-- Add confirmed_at to contracts (canonical timestamp for escrow lock)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- ── confirm_booking_escrow ────────────────────────────────────────────────────
-- signed → confirmed  (atomic wallet deduction + escrow record + contract update)
-- Returns: { ok, error?, required?, available? }
CREATE OR REPLACE FUNCTION confirm_booking_escrow(
  p_contract_id uuid,
  p_agency_id   uuid,
  p_amount      numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status  text;
  v_balance numeric;
BEGIN
  -- Lock contract row to prevent concurrent confirmations
  SELECT status INTO v_status
  FROM contracts
  WHERE id = p_contract_id
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
    FROM profiles
    WHERE id = p_agency_id
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
    SET wallet_balance = v_balance - p_amount
    WHERE id = p_agency_id;

    INSERT INTO wallet_transactions (user_id, type, amount, description)
    VALUES (
      p_agency_id,
      'escrow_lock',
      p_amount,
      'Custódia: fundos retidos até conclusão do serviço'
    );
  END IF;

  UPDATE contracts
  SET
    status          = 'confirmed',
    confirmed_at    = now(),
    agency_signed_at = now(),
    deposit_paid_at  = now()
  WHERE id = p_contract_id;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END;
$$;

-- ── release_payment_payout ───────────────────────────────────────────────────
-- confirmed → paid  (atomic payout record + contract update)
-- NEVER deducts wallet again — money was already locked at escrow time.
-- Returns: { ok, error? }
CREATE OR REPLACE FUNCTION release_payment_payout(
  p_contract_id uuid,
  p_agency_id   uuid,
  p_amount      numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  IF v_status != 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_confirmed', 'status', v_status);
  END IF;

  IF p_amount > 0 THEN
    INSERT INTO wallet_transactions (user_id, type, amount, description)
    VALUES (
      p_agency_id,
      'payout',
      p_amount,
      'Pagamento liberado ao talento'
    );
  END IF;

  UPDATE contracts
  SET status = 'paid', paid_at = now()
  WHERE id = p_contract_id;

  RETURN jsonb_build_object('ok', true, 'status', 'paid');
END;
$$;

-- ── cancel_contract_safe ─────────────────────────────────────────────────────
-- Cancel a contract and refund escrow if it was confirmed.
-- Pass p_agency_id to trigger refund when cancelling confirmed contracts.
-- Pass NULL for talent-initiated cancels (they can't cancel from confirmed).
-- Returns: { ok, error? }
CREATE OR REPLACE FUNCTION cancel_contract_safe(
  p_contract_id uuid,
  p_agency_id   uuid   -- NULL = no refund (talent cancel, or pre-escrow cancel)
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status  text;
  v_amount  numeric;
  v_balance numeric;
BEGIN
  SELECT status, payment_amount INTO v_status, v_amount
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  IF v_status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_cancel_paid');
  END IF;

  IF v_status = 'cancelled' OR v_status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_terminal', 'status', v_status);
  END IF;

  -- Refund escrow only when contract was confirmed and caller provides agency_id
  IF v_status = 'confirmed' AND v_amount > 0 AND p_agency_id IS NOT NULL THEN
    SELECT wallet_balance INTO v_balance
    FROM profiles
    WHERE id = p_agency_id
    FOR UPDATE;

    IF v_balance IS NULL THEN
      v_balance := 0;
    END IF;

    UPDATE profiles
    SET wallet_balance = v_balance + v_amount
    WHERE id = p_agency_id;

    INSERT INTO wallet_transactions (user_id, type, amount, description)
    VALUES (
      p_agency_id,
      'refund',
      v_amount,
      'Estorno: contrato cancelado — fundos devolvidos'
    );
  END IF;

  UPDATE contracts
  SET status = 'cancelled'
  WHERE id = p_contract_id;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$$;
