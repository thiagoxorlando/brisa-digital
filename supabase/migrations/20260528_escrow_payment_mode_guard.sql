-- Add payment-mode guard to confirm_booking_escrow.
--
-- Previously the function unconditionally sent escrow notifications for every
-- agency, including those in internal-payment mode where no deposit ever
-- happens. This migration replaces the function to check agencies.payment_mode
-- before proceeding.
--
-- Defensive: if the payment_mode column does not yet exist (migration
-- 20260525_agency_payment_config.sql not applied), the function falls back to
-- the legacy escrow behaviour so no existing flow breaks.
--
-- Error returned for internal-mode: { "ok": false, "error": "internal_payment_mode" }
-- The TypeScript route converts this to a 422 with a user-facing message.

CREATE OR REPLACE FUNCTION confirm_booking_escrow(
  p_contract_id uuid,
  p_agency_id   uuid,
  p_amount      numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status               text;
  v_balance              numeric(12,2);
  v_booking_id           uuid;
  v_talent_id            uuid;
  v_idem_key             text := 'escrow_' || p_contract_id;
  v_tx_id                uuid;
  v_workspace_slug       text;
  v_talent_contracts_link text := '/talent/contracts';
  v_agency_wallet_link   text := '/agency/finances';
  v_payment_mode         text := 'escrow';  -- safe default when column absent
BEGIN
  -- ── Payment mode guard ───────────────────────────────────────────────────
  -- Only check when the column exists (defensive against environments where
  -- 20260525_agency_payment_config.sql has not been applied yet).
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'agencies'
      AND column_name  = 'payment_mode'
  ) THEN
    SELECT COALESCE(payment_mode, 'escrow')
    INTO v_payment_mode
    FROM agencies
    WHERE id = p_agency_id;

    IF v_payment_mode = 'internal' THEN
      RETURN jsonb_build_object(
        'ok',    false,
        'error', 'internal_payment_mode'
      );
    END IF;
  END IF;

  -- ── Idempotency check ────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
  END IF;

  -- ── Fetch + lock contract ─────────────────────────────────────────────────
  SELECT status, booking_id, talent_id
  INTO v_status, v_booking_id, v_talent_id
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  -- ── Resolve workspace notification links ─────────────────────────────────
  SELECT pw.slug
  INTO v_workspace_slug
  FROM contracts c
  LEFT JOIN jobs j ON j.id = c.job_id
  LEFT JOIN premium_workspaces pw ON pw.id = j.workspace_id
  WHERE c.id = p_contract_id
  LIMIT 1;

  IF v_workspace_slug IS NOT NULL THEN
    v_talent_contracts_link := '/talent/workspaces/' || v_workspace_slug || '/contracts';
    v_agency_wallet_link    := '/agency/workspace/wallet';
  END IF;

  -- ── Status check ─────────────────────────────────────────────────────────
  IF v_status != 'signed' THEN
    IF v_status = 'confirmed' THEN
      RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_signed', 'status', v_status);
  END IF;

  -- ── Balance check ─────────────────────────────────────────────────────────
  SELECT COALESCE(wallet_balance, 0)
  INTO v_balance
  FROM profiles
  WHERE id = p_agency_id
  FOR UPDATE;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'ok',       false,
      'error',    'insufficient_balance',
      'required', p_amount,
      'available', v_balance
    );
  END IF;

  -- ── Deduct wallet ─────────────────────────────────────────────────────────
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

  -- ── Confirm contract + booking ────────────────────────────────────────────
  UPDATE contracts
  SET
    status          = 'confirmed',
    confirmed_at    = now(),
    agency_signed_at = now(),
    deposit_paid_at  = now()
  WHERE id = p_contract_id;

  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'confirmed' WHERE id = v_booking_id;
  END IF;

  -- ── Escrow-only notifications (only reached when payment_mode = 'escrow') ─
  IF v_talent_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
    VALUES (
      v_talent_id, 'contract',
      'Agência confirmou o contrato e realizou o depósito',
      v_talent_contracts_link, false,
      'notif_escrow_talent_' || p_contract_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
  VALUES (
    p_agency_id, 'booking',
    'Reserva confirmada — fundos em custódia',
    v_agency_wallet_link, false,
    'notif_escrow_agency_' || p_contract_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed', 'transaction_id', v_tx_id);
END;
$$;
