-- ============================================================================
-- Make agencies.payment_mode and escrow_enabled nullable.
--
-- NULL means "inherit from global platform default" (platform_settings).
-- Previously the backfill migration (20260528) set every agency to
-- payment_mode='escrow', escrow_enabled=true, overriding the global default
-- for agencies that had no intentional per-agency configuration.
--
-- This migration:
--   1. Drops the NOT NULL constraint so NULL is a valid value.
--   2. Resets every agency to NULL so they inherit the global default.
--      Admins can set explicit overrides via /admin/plans per-agency panel.
--   3. Updates confirm_booking_escrow to consult platform_settings when
--      agencies.payment_mode IS NULL.
-- ============================================================================


-- ── 1. Make columns nullable ─────────────────────────────────────────────────

ALTER TABLE agencies
  ALTER COLUMN payment_mode   DROP NOT NULL,
  ALTER COLUMN payment_mode   SET DEFAULT NULL,
  ALTER COLUMN escrow_enabled DROP NOT NULL,
  ALTER COLUMN escrow_enabled SET DEFAULT NULL;


-- ── 2. Drop old CHECK (did not allow NULL) and add NULL-aware one ────────────

ALTER TABLE agencies DROP CONSTRAINT IF EXISTS agencies_payment_mode_check;

ALTER TABLE agencies
  ADD CONSTRAINT agencies_payment_mode_check
  CHECK (payment_mode IS NULL OR payment_mode IN ('internal', 'escrow'));


-- ── 3. Reset all agencies to NULL so they inherit the global default ─────────
-- After this, set explicit overrides via /admin/plans for agencies that
-- should deviate from the platform default.

UPDATE agencies SET payment_mode = NULL, escrow_enabled = NULL;


-- ── 4. Update confirm_booking_escrow to respect NULL payment_mode ────────────
-- When payment_mode IS NULL, the function checks platform_settings for the
-- global default. This mirrors what resolveAgencyConfig() does in TypeScript.

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
  v_status                text;
  v_balance               numeric(12,2);
  v_booking_id            uuid;
  v_talent_id             uuid;
  v_idem_key              text := 'escrow_' || p_contract_id;
  v_tx_id                 uuid;
  v_workspace_slug        text;
  v_talent_contracts_link text := '/talent/contracts';
  v_agency_wallet_link    text := '/agency/finances';
  v_payment_mode          text;
  v_raw_mode              text;
  v_global_mode           text := 'escrow'; -- safe fallback
BEGIN

  -- ── Resolve effective payment mode ─────────────────────────────────────────
  -- Priority: agency.payment_mode (if NOT NULL) → platform_settings default.
  -- Defensive: skip if payment_mode column doesn't exist yet.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'payment_mode'
  ) THEN
    SELECT payment_mode INTO v_raw_mode FROM agencies WHERE id = p_agency_id;

    IF v_raw_mode IS NOT NULL THEN
      v_payment_mode := v_raw_mode;
    ELSE
      -- NULL = inherit global default from platform_settings
      BEGIN
        SELECT trim(both '"' from value::text) INTO v_global_mode
        FROM platform_settings WHERE key = 'default_payment_mode' LIMIT 1;
      EXCEPTION WHEN OTHERS THEN
        v_global_mode := 'escrow'; -- table or row missing → safe fallback
      END;
      v_payment_mode := COALESCE(v_global_mode, 'escrow');
    END IF;

    IF v_payment_mode = 'internal' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'internal_payment_mode');
    END IF;
  END IF;

  -- ── Idempotency ─────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
  END IF;

  -- ── Fetch + lock contract ───────────────────────────────────────────────────
  SELECT status, booking_id, talent_id
  INTO   v_status, v_booking_id, v_talent_id
  FROM   contracts WHERE id = p_contract_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  -- ── Workspace notification links ────────────────────────────────────────────
  SELECT pw.slug INTO v_workspace_slug
  FROM contracts c
  LEFT JOIN jobs j ON j.id = c.job_id
  LEFT JOIN premium_workspaces pw ON pw.id = j.workspace_id
  WHERE c.id = p_contract_id LIMIT 1;

  IF v_workspace_slug IS NOT NULL THEN
    v_talent_contracts_link := '/talent/workspaces/' || v_workspace_slug || '/contracts';
    v_agency_wallet_link    := '/agency/workspace/wallet';
  END IF;

  -- ── Status check ────────────────────────────────────────────────────────────
  IF v_status != 'signed' THEN
    IF v_status = 'confirmed' THEN
      RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_signed', 'status', v_status);
  END IF;

  -- ── Balance check ───────────────────────────────────────────────────────────
  SELECT COALESCE(wallet_balance, 0) INTO v_balance
  FROM profiles WHERE id = p_agency_id FOR UPDATE;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'insufficient_balance',
      'required', p_amount, 'available', v_balance);
  END IF;

  -- ── Wallet deduction + escrow_lock ──────────────────────────────────────────
  UPDATE profiles SET wallet_balance = round((v_balance - p_amount)::numeric, 2)
  WHERE id = p_agency_id;

  INSERT INTO wallet_transactions (user_id, type, amount, description, idempotency_key)
  VALUES (p_agency_id, 'escrow_lock', round(p_amount, 2),
          'Custodia: fundos retidos ate conclusao do servico', v_idem_key)
  RETURNING id INTO v_tx_id;

  -- ── Confirm contract + booking ──────────────────────────────────────────────
  UPDATE contracts
  SET status = 'confirmed', confirmed_at = now(), agency_signed_at = now(), deposit_paid_at = now()
  WHERE id = p_contract_id;

  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'confirmed' WHERE id = v_booking_id;
  END IF;

  -- ── Escrow-only notifications ───────────────────────────────────────────────
  IF v_talent_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
    VALUES (v_talent_id, 'contract',
            'Agência confirmou o contrato e realizou o depósito',
            v_talent_contracts_link, false,
            'notif_escrow_talent_' || p_contract_id)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
  VALUES (p_agency_id, 'booking',
          'Reserva confirmada — fundos em custódia',
          v_agency_wallet_link, false,
          'notif_escrow_agency_' || p_contract_id)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed', 'transaction_id', v_tx_id);
END;
$$;


-- ── 5. Reload PostgREST schema cache ─────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
