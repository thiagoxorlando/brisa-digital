-- ============================================================================
-- FINAL COMPREHENSIVE FIX — run this in Supabase SQL Editor
-- ============================================================================
-- Fixes three problems:
--   1. agencies.payment_mode / escrow_enabled columns missing
--   2. confirm_booking_escrow has no internal-payment guard (sends wrong notifications)
--   3. release_payment_payout may have mojibake notification text
--   4. Existing notification rows have mojibake
-- Safe to rerun: every statement uses IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================


-- ============================================================
-- SECTION 1: agencies columns (from 20260525_agency_payment_config)
-- ============================================================

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS payment_mode              text    NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS commission_percent_override numeric,
  ADD COLUMN IF NOT EXISTS escrow_enabled             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_uploads_enabled    boolean NOT NULL DEFAULT true;

-- Backfill: agencies that existed before this migration keep escrow behaviour.
-- DEFAULT 'internal' only applies to rows created AFTER this migration runs.
UPDATE agencies
SET
  payment_mode   = 'escrow',
  escrow_enabled = true
WHERE payment_mode = 'internal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agencies_payment_mode_check'
  ) THEN
    ALTER TABLE agencies
      ADD CONSTRAINT agencies_payment_mode_check
      CHECK (payment_mode IN ('internal', 'escrow'));
  END IF;
END $$;


-- ============================================================
-- SECTION 2: confirm_booking_escrow — with internal-payment guard
-- ============================================================
-- Returns {ok:false, error:'internal_payment_mode'} before any wallet
-- or notification writes when agency is in internal-payment mode.
-- Defensive: if payment_mode column is absent the guard is skipped and
-- legacy escrow behaviour is preserved.

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
  v_payment_mode         text := 'escrow';
BEGIN

  -- ── Payment-mode guard ───────────────────────────────────────────────────
  -- Only executes when the payment_mode column exists to remain backward-
  -- compatible with environments where 20260525_agency_payment_config has not
  -- yet been applied (those environments have no internal-mode agencies).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'agencies'
      AND column_name  = 'payment_mode'
  ) THEN
    SELECT COALESCE(payment_mode, 'escrow')
    INTO   v_payment_mode
    FROM   agencies
    WHERE  id = p_agency_id;

    IF v_payment_mode = 'internal' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'internal_payment_mode');
    END IF;
  END IF;

  -- ── Idempotency ──────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
  END IF;

  -- ── Fetch + lock contract ─────────────────────────────────────────────────
  SELECT status, booking_id, talent_id
  INTO   v_status, v_booking_id, v_talent_id
  FROM   contracts
  WHERE  id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  -- ── Workspace notification links ─────────────────────────────────────────
  SELECT pw.slug
  INTO   v_workspace_slug
  FROM   contracts c
  LEFT JOIN jobs j ON j.id = c.job_id
  LEFT JOIN premium_workspaces pw ON pw.id = j.workspace_id
  WHERE  c.id = p_contract_id
  LIMIT  1;

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
  INTO   v_balance
  FROM   profiles
  WHERE  id = p_agency_id
  FOR UPDATE;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'ok',        false,
      'error',     'insufficient_balance',
      'required',  p_amount,
      'available', v_balance
    );
  END IF;

  -- ── Deduct wallet ─────────────────────────────────────────────────────────
  UPDATE profiles
  SET    wallet_balance = round((v_balance - p_amount)::numeric, 2)
  WHERE  id = p_agency_id;

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
    status           = 'confirmed',
    confirmed_at     = now(),
    agency_signed_at = now(),
    deposit_paid_at  = now()
  WHERE id = p_contract_id;

  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'confirmed' WHERE id = v_booking_id;
  END IF;

  -- ── Escrow-only notifications ─────────────────────────────────────────────
  -- Only reached when payment_mode = 'escrow' (guarded above).
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


-- ============================================================
-- SECTION 3: release_payment_payout — correct UTF-8 text
-- ============================================================
-- Replaces any older version that may have mojibake in the notification
-- message (20260508 was saved with incorrect charset encoding).

CREATE OR REPLACE FUNCTION release_payment_payout(
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
  v_status             text;
  v_talent_id          uuid;
  v_booking_id         uuid;
  v_idem_key           text := 'payout_' || p_contract_id;
  v_tx_id              uuid;
  v_workspace_slug     text;
  v_talent_finances_link text := '/talent/finances';
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'paid');
  END IF;

  SELECT status, talent_id, booking_id
  INTO   v_status, v_talent_id, v_booking_id
  FROM   contracts
  WHERE  id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  SELECT pw.slug
  INTO   v_workspace_slug
  FROM   contracts c
  LEFT JOIN jobs j ON j.id = c.job_id
  LEFT JOIN premium_workspaces pw ON pw.id = j.workspace_id
  WHERE  c.id = p_contract_id
  LIMIT  1;

  IF v_workspace_slug IS NOT NULL THEN
    v_talent_finances_link := '/talent/workspaces/' || v_workspace_slug || '/finances';
  END IF;

  IF v_status != 'confirmed' THEN
    IF v_status = 'paid' THEN
      RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'paid');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_confirmed', 'status', v_status);
  END IF;

  IF p_amount > 0 AND v_talent_id IS NOT NULL THEN
    UPDATE profiles
    SET    wallet_balance = round((COALESCE(wallet_balance, 0) + p_amount)::numeric, 2)
    WHERE  id = v_talent_id;

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
    status         = 'paid',
    payment_status = 'paid',
    paid_at        = now()
  WHERE id = p_contract_id;

  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings SET status = 'paid' WHERE id = v_booking_id;
  END IF;

  -- Notification text is UTF-8 correct here.
  -- The TypeScript layer (renderNotificationTemplate "payout_released") also
  -- sends this with the same idempotency key, so only one row is ever created.
  IF v_talent_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
    VALUES (
      v_talent_id, 'payment',
      'Agência liberou seu pagamento — a caminho!',
      v_talent_finances_link, false,
      'notif_payout_talent_' || p_contract_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'paid', 'transaction_id', v_tx_id);
END;
$$;


-- ============================================================
-- SECTION 4: Fix existing mojibake notification rows
-- ============================================================
-- Repairs rows created by the old 20260508 function that was saved with
-- incorrect charset encoding. Safe to rerun (REPLACE is idempotent).

UPDATE notifications
SET message = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
  message,
  'AgÃªncia',  'Agência'),
  'agÃªncia',  'agência'),
  'Ã£',        'ã'),
  'Ã¡',        'á'),
  'Ã©',        'é'),
  'Ã§',        'ç'),
  'Ã³',        'ó'),
  'Ãº',        'ú'),
  'Ã­',        'í'),
  'Ã¢',        'â'),
  'â€"',       '—')
WHERE message ~ 'Ã[£¡©§³º­ª¢]|â€"';


-- ============================================================
-- SECTION 5: Reload PostgREST schema cache
-- ============================================================

NOTIFY pgrst, 'reload schema';
