


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."_set_updated_at_premium"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_set_updated_at_premium"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."allocate_wallet_withdrawal_sources"("p_user_id" "uuid", "p_withdrawal_transaction_id" "uuid", "p_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_amount numeric(12,2);
  v_tx_user_id uuid;
  v_tx_status text;
  v_available_total numeric(12,2) := 0;
  v_remaining_to_allocate numeric(12,2);
  v_allocated_total numeric(12,2) := 0;
  v_item record;
  v_take numeric(12,2);
  v_allocation_id uuid;
  v_existing_allocations jsonb;
  v_result_allocations jsonb := '[]'::jsonb;
BEGIN
  IF p_user_id IS NULL OR p_withdrawal_transaction_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_argument');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  v_amount := round(p_amount, 2);

  SELECT user_id, status
  INTO v_tx_user_id, v_tx_status
  FROM wallet_transactions
  WHERE id = p_withdrawal_transaction_id
    AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'withdrawal_not_found');
  END IF;

  IF v_tx_user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_mismatch');
  END IF;

  IF v_tx_status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_withdrawal_status', 'status', v_tx_status);
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'allocation_id', a.id,
             'funding_source_id', a.funding_source_id,
             'source_wallet_transaction_id', a.source_wallet_transaction_id,
             'stripe_charge_id', a.stripe_charge_id,
             'allocated_amount', a.allocated_amount,
             'transfer_id', a.transfer_id
           )
           ORDER BY a.created_at, a.id
         )
  INTO v_existing_allocations
  FROM wallet_withdrawal_source_allocations a
  WHERE a.withdrawal_transaction_id = p_withdrawal_transaction_id
    AND a.restored_at IS NULL;

  IF v_existing_allocations IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_allocated', true, 'allocations', v_existing_allocations);
  END IF;

  FOR v_item IN
    SELECT remaining_amount
    FROM wallet_funding_sources
    WHERE current_owner_user_id = p_user_id
      AND status = 'available'
      AND stripe_charge_id IS NOT NULL
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_available_total := round((v_available_total + v_item.remaining_amount)::numeric, 2);
  END LOOP;

  IF COALESCE(v_available_total, 0) < v_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_funding_sources',
      'available', COALESCE(v_available_total, 0),
      'required', v_amount
    );
  END IF;

  v_remaining_to_allocate := v_amount;

  FOR v_item IN
    SELECT id, source_wallet_transaction_id, stripe_charge_id, remaining_amount
    FROM wallet_funding_sources
    WHERE current_owner_user_id = p_user_id
      AND status = 'available'
      AND stripe_charge_id IS NOT NULL
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_to_allocate <= 0;

    v_take := round(LEAST(v_item.remaining_amount, v_remaining_to_allocate), 2);
    IF v_take <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE wallet_funding_sources
    SET
      remaining_amount = round((remaining_amount - v_take)::numeric, 2),
      status = CASE
        WHEN round((remaining_amount - v_take)::numeric, 2) <= 0 THEN 'spent'
        ELSE 'available'
      END
    WHERE id = v_item.id;

    INSERT INTO wallet_withdrawal_source_allocations (
      withdrawal_transaction_id,
      funding_source_id,
      source_wallet_transaction_id,
      stripe_charge_id,
      allocated_amount
    )
    VALUES (
      p_withdrawal_transaction_id,
      v_item.id,
      v_item.source_wallet_transaction_id,
      v_item.stripe_charge_id,
      v_take
    )
    RETURNING id INTO v_allocation_id;

    v_result_allocations := v_result_allocations || jsonb_build_array(
      jsonb_build_object(
        'allocation_id', v_allocation_id,
        'funding_source_id', v_item.id,
        'source_wallet_transaction_id', v_item.source_wallet_transaction_id,
        'stripe_charge_id', v_item.stripe_charge_id,
        'allocated_amount', v_take
      )
    );

    v_allocated_total := round((v_allocated_total + v_take)::numeric, 2);
    v_remaining_to_allocate := round((v_remaining_to_allocate - v_take)::numeric, 2);
  END LOOP;

  IF v_allocated_total <> v_amount THEN
    RAISE EXCEPTION 'allocation_mismatch';
  END IF;

  RETURN jsonb_build_object('ok', true, 'already_allocated', false, 'allocations', v_result_allocations);
END;
$$;


ALTER FUNCTION "public"."allocate_wallet_withdrawal_sources"("p_user_id" "uuid", "p_withdrawal_transaction_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_agency_withdrawal"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_amount  numeric(12,2);
  v_user_id uuid;
  v_status  text;
BEGIN
  SELECT user_id, amount, status
  INTO   v_user_id, v_amount, v_status
  FROM   wallet_transactions
  WHERE  id = p_tx_id AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_status NOT IN ('pending', 'processing', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_cancellable', 'current_status', v_status);
  END IF;

  UPDATE wallet_transactions SET
    status       = 'rejected',
    admin_note   = p_note,
    processed_at = now(),
    processed_by = p_admin_id
  WHERE id = p_tx_id;

  UPDATE profiles
  SET wallet_balance = wallet_balance + v_amount
  WHERE id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'amount_restored', v_amount);
END;
$$;


ALTER FUNCTION "public"."cancel_agency_withdrawal"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_contract_safe"("p_contract_id" "uuid", "p_agency_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  v_amount numeric(12,2);
  v_balance numeric(12,2);
  v_refund_tx_id uuid;
  v_item record;
BEGIN
  SELECT status, payment_amount
  INTO v_status, v_amount
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

  IF v_status = 'confirmed' AND v_amount > 0 AND p_agency_id IS NOT NULL THEN
    SELECT COALESCE(wallet_balance, 0)
    INTO v_balance
    FROM profiles
    WHERE id = p_agency_id
    FOR UPDATE;

    UPDATE profiles
    SET wallet_balance = round((v_balance + v_amount)::numeric, 2)
    WHERE id = p_agency_id;

    INSERT INTO wallet_transactions (user_id, type, amount, description)
    VALUES (
      p_agency_id,
      'refund',
      v_amount,
      'Estorno: contrato cancelado — fundos devolvidos'
    )
    RETURNING id INTO v_refund_tx_id;

    FOR v_item IN
      SELECT id, original_payer_user_id, stripe_charge_id, stripe_payment_intent_id, remaining_amount
      FROM wallet_funding_sources
      WHERE related_contract_id = p_contract_id
        AND source_type = 'escrow'
        AND status = 'reserved'
        AND remaining_amount > 0
      ORDER BY created_at, id
      FOR UPDATE
    LOOP
      INSERT INTO wallet_funding_sources (
        user_id,
        original_payer_user_id,
        current_owner_user_id,
        source_wallet_transaction_id,
        stripe_charge_id,
        stripe_payment_intent_id,
        source_type,
        original_amount,
        remaining_amount,
        status,
        upstream_funding_source_id
      )
      VALUES (
        p_agency_id,
        COALESCE(v_item.original_payer_user_id, p_agency_id),
        p_agency_id,
        v_refund_tx_id,
        v_item.stripe_charge_id,
        v_item.stripe_payment_intent_id,
        'wallet_deposit',
        v_item.remaining_amount,
        v_item.remaining_amount,
        'available',
        v_item.id
      );

      UPDATE wallet_funding_sources
      SET remaining_amount = 0, status = 'spent'
      WHERE id = v_item.id;
    END LOOP;
  END IF;

  UPDATE contracts
  SET status = 'cancelled'
  WHERE id = p_contract_id;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$$;


ALTER FUNCTION "public"."cancel_contract_safe"("p_contract_id" "uuid", "p_agency_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric(12,2);
  v_status text;
  v_note text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  SELECT user_id, amount, status
  INTO v_user_id, v_amount, v_status
  FROM wallet_transactions
  WHERE id = p_transaction_id
    AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'already_cancelled', true);
  END IF;

  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'current_status', v_status);
  END IF;

  UPDATE profiles
  SET wallet_balance = round((coalesce(wallet_balance, 0) + v_amount)::numeric, 2)
  WHERE id = v_user_id;

  UPDATE wallet_transactions
  SET
    status = 'cancelled',
    provider_status = 'cancelled',
    processed_at = now(),
    admin_note = coalesce(v_note, admin_note)
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'amount_restored', v_amount);
END;
$$;


ALTER FUNCTION "public"."cancel_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_booking_escrow"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."confirm_booking_escrow"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_contract_stripe_funding"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric, "p_payment_intent_id" "text", "p_charge_id" "text" DEFAULT NULL::"text", "p_checkout_session_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  v_contract_agency_id uuid;
  v_booking_id uuid;
  v_expected_amount numeric(12,2);
  v_amount numeric(12,2);
  v_existing_payment_intent text;
  v_idem_key text;
  v_tx_id uuid;
BEGIN
  IF p_contract_id IS NULL OR p_agency_id IS NULL OR p_payment_intent_id IS NULL OR trim(p_payment_intent_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_argument');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  v_amount := round(p_amount, 2);
  v_idem_key := 'stripe_contract_funding:' || p_contract_id || ':' || p_payment_intent_id;

  SELECT status, agency_id, booking_id, payment_amount, stripe_payment_intent_id
  INTO v_status, v_contract_agency_id, v_booking_id, v_expected_amount, v_existing_payment_intent
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  IF v_contract_agency_id IS DISTINCT FROM p_agency_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_mismatch');
  END IF;

  IF abs(COALESCE(v_expected_amount, 0) - v_amount) > 0.01 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'amount_mismatch',
      'expected', v_expected_amount,
      'received', v_amount
    );
  END IF;

  IF v_status = 'confirmed' AND v_existing_payment_intent = p_payment_intent_id THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
  END IF;

  IF v_status <> 'signed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_signed', 'status', v_status);
  END IF;

  INSERT INTO wallet_transactions (
    user_id,
    type,
    amount,
    description,
    payment_id,
    reference_id,
    idempotency_key,
    provider,
    provider_status,
    status,
    processed_at,
    stripe_payment_intent_id,
    stripe_charge_id
  )
  VALUES (
    p_agency_id,
    'escrow_lock',
    v_amount,
    'Custodia via Stripe: fundos retidos ate conclusao do servico',
    p_payment_intent_id,
    p_contract_id::text,
    v_idem_key,
    'stripe',
    'paid',
    'paid',
    now(),
    p_payment_intent_id,
    NULLIF(p_charge_id, '')
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NOT NULL THEN
    INSERT INTO wallet_funding_sources (
      user_id,
      original_payer_user_id,
      current_owner_user_id,
      source_wallet_transaction_id,
      stripe_charge_id,
      stripe_payment_intent_id,
      source_type,
      original_amount,
      remaining_amount,
      status,
      related_contract_id
    )
    VALUES (
      p_agency_id,
      p_agency_id,
      p_agency_id,
      v_tx_id,
      NULLIF(p_charge_id, ''),
      p_payment_intent_id,
      'escrow',
      v_amount,
      v_amount,
      'reserved',
      p_contract_id
    );
  END IF;

  UPDATE contracts
  SET
    status = 'confirmed',
    payment_status = 'paid',
    confirmed_at = now(),
    agency_signed_at = now(),
    deposit_paid_at = now(),
    payment_provider = 'stripe',
    stripe_payment_intent_id = p_payment_intent_id,
    stripe_charge_id = NULLIF(p_charge_id, ''),
    stripe_checkout_session_id = NULLIF(p_checkout_session_id, '')
  WHERE id = p_contract_id;

  IF v_booking_id IS NOT NULL THEN
    UPDATE bookings
    SET status = 'confirmed'
    WHERE id = v_booking_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_processed', v_tx_id IS NULL,
    'status', 'confirmed',
    'transaction_id', v_tx_id
  );
END;
$$;


ALTER FUNCTION "public"."confirm_contract_stripe_funding"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric, "p_payment_intent_id" "text", "p_charge_id" "text", "p_checkout_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credit_referral_commission"("p_referrer_id" "uuid", "p_invite_id" "uuid", "p_contract_id" "uuid", "p_commission" numeric, "p_job_title" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_idem_key text := 'referral_commission:' || p_invite_id || ':' || p_contract_id;
  v_tx_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true);
  END IF;

  UPDATE profiles
  SET wallet_balance = round((COALESCE(wallet_balance, 0) + p_commission)::numeric, 2)
  WHERE id = p_referrer_id;

  INSERT INTO wallet_transactions (user_id, type, amount, description, reference_id, idempotency_key)
  VALUES (
    p_referrer_id,
    'referral_commission',
    p_commission,
    'Comissão de indicação (2%) - ' || COALESCE(p_job_title, 'trabalho'),
    p_contract_id::text,
    v_idem_key
  )
  RETURNING id INTO v_tx_id;

  UPDATE referral_invites
  SET
    status = 'commission_paid',
    commission_amount = p_commission,
    commission_paid_at = now(),
    paid_contract_id = p_contract_id,
    updated_at = now()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', true, 'already_processed', false, 'wallet_balance_credited', true, 'transaction_id', v_tx_id);
END;
$$;


ALTER FUNCTION "public"."credit_referral_commission"("p_referrer_id" "uuid", "p_invite_id" "uuid", "p_contract_id" "uuid", "p_commission" numeric, "p_job_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credit_stripe_wallet_deposit"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_payment_id" "text", "p_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_amount          numeric(12,2);
  v_tx_id           uuid;
  v_status          text;
  v_provider_status text;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL OR p_transaction_id IS NULL OR p_payment_id IS NULL OR trim(p_payment_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_argument');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  v_amount := round(p_amount::numeric, 2);

  -- Lock the existing pending transaction row, if any
  SELECT id, status, provider_status
  INTO v_tx_id, v_status, v_provider_status
  FROM wallet_transactions
  WHERE id      = p_transaction_id
    AND user_id = p_user_id
    AND type    = 'deposit'
  FOR UPDATE;

  IF v_tx_id IS NOT NULL THEN
    -- Already credited — return early without touching the balance
    IF v_status = 'paid' OR v_provider_status = 'paid' THEN
      RETURN jsonb_build_object(
        'ok',                   true,
        'already_processed',    true,
        'wallet_balance_credited', false,
        'transaction_id',       v_tx_id
      );
    END IF;

    -- Mark the transaction as paid
    UPDATE wallet_transactions
    SET
      status                = 'paid',
      provider              = 'stripe',
      provider_status       = 'paid',
      provider_transfer_id  = p_payment_id,
      payment_id            = p_payment_id,
      description           = 'Deposito via Stripe Checkout',
      processed_at          = now(),
      idempotency_key       = COALESCE(idempotency_key, 'stripe_wallet_deposit:' || p_payment_id)
    WHERE id = v_tx_id;

  ELSE
    -- No pending tx found — insert a synthetic paid record (handles retries where the pending row is missing)
    INSERT INTO wallet_transactions (
      user_id, type, amount, description,
      payment_id, provider, provider_status, provider_transfer_id,
      status, processed_at, idempotency_key
    )
    VALUES (
      p_user_id, 'deposit', v_amount, 'Deposito via Stripe Checkout',
      p_payment_id, 'stripe', 'paid', p_payment_id,
      'paid', now(), 'stripe_wallet_deposit:' || p_payment_id
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_tx_id;

    IF v_tx_id IS NULL THEN
      -- Conflict on idempotency_key means already inserted — look it up and return already_processed
      SELECT id INTO v_tx_id
      FROM wallet_transactions
      WHERE payment_id      = p_payment_id
         OR idempotency_key = 'stripe_wallet_deposit:' || p_payment_id
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok',                   true,
        'already_processed',    true,
        'wallet_balance_credited', false,
        'transaction_id',       v_tx_id
      );
    END IF;
  END IF;

  -- Credit the wallet balance atomically
  UPDATE profiles
  SET wallet_balance = round((COALESCE(wallet_balance, 0) + v_amount)::numeric, 2)
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok',                      true,
    'already_processed',       false,
    'wallet_balance_credited', true,
    'transaction_id',          v_tx_id,
    'amount',                  v_amount
  );
END;
$$;


ALTER FUNCTION "public"."credit_stripe_wallet_deposit"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_payment_id" "text", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credit_wallet_deposit"("p_user_id" "uuid", "p_payment_id" "text", "p_amount" numeric) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rows int;
begin
  -- Path 1: pending row already exists with payment_id; claim it once.
  update public.wallet_transactions
     set description = 'Depósito via PIX',
         amount = p_amount
   where payment_id = p_payment_id
     and user_id = p_user_id
     and coalesce(description, '') <> 'Depósito via PIX';

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Path 2: no pending row; unique payment_id prevents double credit.
    insert into public.wallet_transactions (
      user_id,
      type,
      amount,
      description,
      payment_id
    )
    values (
      p_user_id,
      'deposit',
      p_amount,
      'Depósito via PIX',
      p_payment_id
    )
    on conflict (payment_id) do nothing;

    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      return false;
    end if;
  end if;

  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) + p_amount
   where id = p_user_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."credit_wallet_deposit"("p_user_id" "uuid", "p_payment_id" "text", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text", "p_provider_status" "text" DEFAULT 'failed'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_amount numeric(12,2);
  v_status text;
  v_note text := nullif(trim(coalesce(p_reason, '')), '');
  v_provider_status text := nullif(trim(coalesce(p_provider_status, '')), '');
BEGIN
  SELECT user_id, amount, status
  INTO v_user_id, v_amount, v_status
  FROM wallet_transactions
  WHERE id = p_transaction_id
    AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_status IN ('failed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', true, 'status', v_status, 'already_finalized', true);
  END IF;

  IF v_status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_paid');
  END IF;

  IF v_status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'current_status', v_status);
  END IF;

  UPDATE profiles
  SET wallet_balance = round((coalesce(wallet_balance, 0) + v_amount)::numeric, 2)
  WHERE id = v_user_id;

  UPDATE wallet_transactions
  SET
    status = 'failed',
    provider_status = coalesce(v_provider_status, 'failed'),
    processed_at = now(),
    admin_note = coalesce(v_note, admin_note),
    failure_reason = coalesce(v_note, failure_reason),
    needs_admin_review = false
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object('ok', true, 'status', 'failed', 'amount_restored', v_amount);
END;
$$;


ALTER FUNCTION "public"."fail_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text", "p_provider_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_contract_platform_revenue"("p_contract_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_item record;
  v_platform_amount numeric(12,2) := 0;
BEGIN
  FOR v_item IN
    SELECT id, user_id, original_payer_user_id, stripe_charge_id, stripe_payment_intent_id, source_wallet_transaction_id, remaining_amount
    FROM wallet_funding_sources
    WHERE related_contract_id = p_contract_id
      AND source_type = 'escrow'
      AND status = 'reserved'
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    INSERT INTO wallet_funding_sources (
      user_id,
      original_payer_user_id,
      current_owner_user_id,
      source_wallet_transaction_id,
      stripe_charge_id,
      stripe_payment_intent_id,
      source_type,
      original_amount,
      remaining_amount,
      status,
      related_contract_id,
      upstream_funding_source_id
    )
    VALUES (
      COALESCE(v_item.user_id, v_item.original_payer_user_id),
      COALESCE(v_item.original_payer_user_id, v_item.user_id),
      NULL,
      v_item.source_wallet_transaction_id,
      v_item.stripe_charge_id,
      v_item.stripe_payment_intent_id,
      'platform_fee',
      v_item.remaining_amount,
      0,
      'platform_revenue',
      p_contract_id,
      v_item.id
    );

    UPDATE wallet_funding_sources
    SET remaining_amount = 0, status = 'spent'
    WHERE id = v_item.id;

    v_platform_amount := round((v_platform_amount + v_item.remaining_amount)::numeric, 2);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'platform_revenue_amount', v_platform_amount);
END;
$$;


ALTER FUNCTION "public"."finalize_contract_platform_revenue"("p_contract_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_auto_withdrawable_balance"("p_user_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_balance numeric(12,2);
BEGIN
  SELECT COALESCE(round(sum(remaining_amount)::numeric, 2), 0)
  INTO v_balance
  FROM wallet_funding_sources
  WHERE current_owner_user_id = p_user_id
    AND status = 'available'
    AND stripe_charge_id IS NOT NULL
    AND remaining_amount > 0;

  RETURN COALESCE(v_balance, 0);
END;
$$;


ALTER FUNCTION "public"."get_auto_withdrawable_balance"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles
  set wallet_balance = coalesce(wallet_balance, 0) + p_amount
  where id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_agency_withdrawal_paid"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM   wallet_transactions
  WHERE  id = p_tx_id AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Accept both pending (manual path) and processing (webhook path)
  IF v_status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'current_status', v_status);
  END IF;

  UPDATE wallet_transactions SET
    status       = 'paid',
    admin_note   = p_note,
    processed_at = now(),
    processed_by = p_admin_id
  WHERE id = p_tx_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."mark_agency_withdrawal_paid"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_wallet_withdrawal_paid"("p_transaction_id" "uuid", "p_provider" "text", "p_admin_note" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
  v_provider text := lower(trim(coalesce(p_provider, 'manual')));
  v_note text := nullif(trim(coalesce(p_admin_note, '')), '');
BEGIN
  SELECT status
  INTO v_status
  FROM wallet_transactions
  WHERE id = p_transaction_id
    AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'paid', 'already_paid', true);
  END IF;

  IF v_status NOT IN ('pending', 'processing', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'current_status', v_status);
  END IF;

  UPDATE wallet_transactions
  SET
    status = 'paid',
    provider = CASE WHEN v_provider = '' THEN 'manual' ELSE v_provider END,
    provider_status = 'paid',
    processed_at = now(),
    admin_note = coalesce(v_note, admin_note),
    failure_reason = null,
    needs_admin_review = false
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object('ok', true, 'status', 'paid');
END;
$$;


ALTER FUNCTION "public"."mark_wallet_withdrawal_paid"("p_transaction_id" "uuid", "p_provider" "text", "p_admin_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_privilege_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- auth.uid() returns NULL for service-role requests (no JWT attached).
  -- Only block direct authenticated-user client calls.
  IF auth.uid() IS NOT NULL THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role change not permitted via client';
    END IF;
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
      RAISE EXCEPTION 'wallet_balance change not permitted via client';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_privilege_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_wallet_funding_source"("p_user_id" "uuid", "p_source_wallet_transaction_id" "uuid", "p_stripe_charge_id" "text", "p_stripe_payment_intent_id" "text", "p_source_type" "text", "p_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tx_user_id uuid;
  v_amount numeric(12,2);
  v_source_id uuid;
  v_source_type text := lower(trim(coalesce(p_source_type, 'wallet_deposit')));
BEGIN
  IF p_user_id IS NULL OR p_source_wallet_transaction_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_argument');
  END IF;

  IF p_stripe_charge_id IS NULL OR trim(p_stripe_charge_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_stripe_charge_id');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF v_source_type = 'deposit' THEN
    v_source_type := 'wallet_deposit';
  ELSIF v_source_type = 'referral_commission' THEN
    v_source_type := 'contract_payment';
  ELSIF v_source_type NOT IN ('wallet_deposit', 'contract_payment', 'escrow', 'platform_fee') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source_type');
  END IF;

  v_amount := round(p_amount, 2);

  SELECT user_id
  INTO v_tx_user_id
  FROM wallet_transactions
  WHERE id = p_source_wallet_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_wallet_transaction_not_found');
  END IF;

  IF v_tx_user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_mismatch');
  END IF;

  UPDATE wallet_transactions
  SET
    stripe_payment_intent_id = COALESCE(NULLIF(trim(coalesce(p_stripe_payment_intent_id, '')), ''), stripe_payment_intent_id),
    stripe_charge_id = NULLIF(trim(p_stripe_charge_id), '')
  WHERE id = p_source_wallet_transaction_id;

  SELECT id
  INTO v_source_id
  FROM wallet_funding_sources
  WHERE source_wallet_transaction_id = p_source_wallet_transaction_id
    AND current_owner_user_id = p_user_id
    AND source_type = v_source_type
  ORDER BY created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_source_id IS NOT NULL THEN
    UPDATE wallet_funding_sources
    SET
      stripe_charge_id = trim(p_stripe_charge_id),
      stripe_payment_intent_id = COALESCE(NULLIF(trim(coalesce(p_stripe_payment_intent_id, '')), ''), stripe_payment_intent_id),
      original_amount = v_amount,
      remaining_amount = CASE WHEN v_source_type = 'platform_fee' THEN 0 ELSE v_amount END,
      status = CASE WHEN v_source_type = 'platform_fee' THEN 'platform_revenue' ELSE 'available' END,
      original_payer_user_id = COALESCE(original_payer_user_id, p_user_id),
      current_owner_user_id = COALESCE(current_owner_user_id, p_user_id)
    WHERE id = v_source_id;

    RETURN jsonb_build_object(
      'ok', true,
      'funding_source_id', v_source_id,
      'amount', v_amount,
      'already_registered', true
    );
  END IF;

  INSERT INTO wallet_funding_sources (
    user_id,
    original_payer_user_id,
    current_owner_user_id,
    source_wallet_transaction_id,
    stripe_charge_id,
    stripe_payment_intent_id,
    source_type,
    original_amount,
    remaining_amount,
    status
  )
  VALUES (
    p_user_id,
    p_user_id,
    p_user_id,
    p_source_wallet_transaction_id,
    trim(p_stripe_charge_id),
    NULLIF(trim(coalesce(p_stripe_payment_intent_id, '')), ''),
    v_source_type,
    v_amount,
    CASE WHEN v_source_type = 'platform_fee' THEN 0 ELSE v_amount END,
    CASE WHEN v_source_type = 'platform_fee' THEN 'platform_revenue' ELSE 'available' END
  )
  RETURNING id INTO v_source_id;

  RETURN jsonb_build_object(
    'ok', true,
    'funding_source_id', v_source_id,
    'amount', v_amount
  );
END;
$$;


ALTER FUNCTION "public"."register_wallet_funding_source"("p_user_id" "uuid", "p_source_wallet_transaction_id" "uuid", "p_stripe_charge_id" "text", "p_stripe_payment_intent_id" "text", "p_source_type" "text", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_payment_payout"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
      v_talent_id, 'payment', 'AgÃªncia liberou seu pagamento â€” a caminho!',
      '/talent/finances', false, 'notif_payout_talent_' || p_contract_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'paid', 'transaction_id', v_tx_id);
END;
$$;


ALTER FUNCTION "public"."release_payment_payout"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_agency_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_fee_rate" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_balance    numeric(12,2);
  v_fee        numeric(12,2);
  v_net        numeric(12,2);
  v_remaining numeric(12,2);
  v_idem_key   text;
  v_pix_type   text;
  v_pix_value  text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_amount < 1.00 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'below_minimum', 'minimum', 1.00);
  END IF;

  SELECT pix_key_type, pix_key_value
  INTO v_pix_type, v_pix_value
  FROM agencies
  WHERE id = p_user_id;

  IF v_pix_type IS NULL OR v_pix_value IS NULL OR trim(v_pix_value) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pix_not_configured');
  END IF;

  SELECT wallet_balance
  INTO v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  END IF;

  v_fee := 0.00;
  v_net := p_amount;
  v_remaining := v_balance - p_amount;

  UPDATE profiles
  SET wallet_balance = v_remaining
  WHERE id = p_user_id;

  v_idem_key := 'withdraw_' || p_user_id::text || '_' || extract(epoch from clock_timestamp())::bigint::text;

  INSERT INTO wallet_transactions
    (user_id, type, amount, description, idempotency_key, status, fee_amount, net_amount)
  VALUES
    (p_user_id, 'withdrawal', p_amount, 'Saque solicitado', v_idem_key, 'pending', v_fee, v_net);

  RETURN jsonb_build_object(
    'ok', true,
    'amount', p_amount,
    'fee', v_fee,
    'net_amount', v_net,
    'remaining_balance', v_remaining
  );
END;
$$;


ALTER FUNCTION "public"."request_agency_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_fee_rate" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_talent_withdrawal"("p_user_id" "uuid", "p_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role       text;
  v_balance    numeric(12,2);
  v_amount     numeric(12,2);
  v_remaining  numeric(12,2);
  v_pix_type   text;
  v_pix_value  text;
  v_idem_key   text;
  v_tx_id      uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_user');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  v_amount := round(p_amount, 2);

  SELECT role, wallet_balance
  INTO v_role, v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_role <> 'talent' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_talent');
  END IF;

  SELECT pix_key_type, pix_key_value
  INTO v_pix_type, v_pix_value
  FROM talent_profiles
  WHERE id = p_user_id;

  IF v_pix_type IS NULL OR v_pix_value IS NULL OR trim(v_pix_value) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pix_not_configured');
  END IF;

  IF COALESCE(v_balance, 0) < v_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'available', COALESCE(v_balance, 0)
    );
  END IF;

  v_remaining := round((COALESCE(v_balance, 0) - v_amount)::numeric, 2);

  UPDATE profiles
  SET wallet_balance = v_remaining
  WHERE id = p_user_id;

  v_idem_key := 'talent_withdrawal:' || p_user_id::text || ':'
                || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO wallet_transactions
    (user_id, type, amount, description, idempotency_key, status, fee_amount, net_amount)
  VALUES
    (p_user_id, 'withdrawal', v_amount, 'Saque solicitado por talento', v_idem_key, 'pending', 0, v_amount)
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'ok', true,
    'tx_id', v_tx_id,
    'amount', v_amount,
    'net_amount', v_amount,
    'remaining_balance', v_remaining
  );
END;
$$;


ALTER FUNCTION "public"."request_talent_withdrawal"("p_user_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_wallet_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_kind" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role text;
  v_balance numeric(12,2);
  v_amount numeric(12,2);
  v_tx_id uuid;
  v_kind text := lower(trim(coalesce(p_kind, '')));
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user_id';
  END IF;

  IF v_kind NOT IN ('agency', 'talent') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  v_amount := round(p_amount::numeric, 2);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT role, coalesce(wallet_balance, 0)
  INTO v_role, v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_role IS DISTINCT FROM v_kind THEN
    RAISE EXCEPTION 'role_mismatch';
  END IF;

  IF v_balance < v_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE profiles
  SET wallet_balance = round((coalesce(wallet_balance, 0) - v_amount)::numeric, 2)
  WHERE id = p_user_id;

  INSERT INTO wallet_transactions (
    user_id,
    type,
    amount,
    description,
    status,
    provider,
    provider_status,
    fee_amount,
    net_amount,
    idempotency_key
  )
  VALUES (
    p_user_id,
    'withdrawal',
    v_amount,
    CASE
      WHEN v_kind = 'agency' THEN 'Saque solicitado pela agencia'
      ELSE 'Saque solicitado pelo talento'
    END,
    'pending',
    'manual',
    'pending',
    0,
    v_amount,
    'wallet_withdrawal:' || v_kind || ':' || p_user_id::text || ':' || replace(gen_random_uuid()::text, '-', '')
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;


ALTER FUNCTION "public"."request_wallet_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_contract_dispute"("p_dispute_id" "uuid", "p_admin_user_id" "uuid", "p_action" "text", "p_admin_note" "text", "p_talent_amount" numeric DEFAULT NULL::numeric, "p_agency_refund_amount" numeric DEFAULT NULL::numeric, "p_note_visibility" "text" DEFAULT 'internal'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_dispute contract_disputes%ROWTYPE;
  v_contract contracts%ROWTYPE;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_note text := trim(coalesce(p_admin_note, ''));
  v_visibility text := lower(trim(coalesce(p_note_visibility, 'internal')));
  v_gross numeric(12,2);
  v_commission numeric(12,2);
  v_contract_net numeric(12,2);
  v_talent_user_id uuid;
  v_talent_amount numeric(12,2) := 0;
  v_agency_refund_amount numeric(12,2) := 0;
  v_platform_retained numeric(12,2) := 0;
  v_resolution_status text;
  v_contract_status text;
  v_payment_status text;
  v_booking_status text;
  v_talent_balance numeric(12,2);
  v_agency_balance numeric(12,2);
  v_payout_tx_id uuid;
  v_refund_tx_id uuid;
  v_referral_id uuid;
  v_referrer_id uuid;
  v_referral_commission_rate numeric;
  v_referral_found boolean := false;
  v_referral_commission numeric(12,2) := 0;
  v_referral_tx_id uuid;
  v_has_wallet_escrow boolean := false;
  v_has_agent_commitment boolean := false;
  v_agent_commitment record;
  v_settle_amount numeric(12,2) := 0;
  v_release_amount numeric(12,2) := 0;
  v_now timestamptz := now();
BEGIN
  IF p_dispute_id IS NULL OR p_admin_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_argument');
  END IF;

  IF v_action NOT IN ('release', 'refund', 'split', 'close') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  IF length(v_note) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_note_required');
  END IF;

  IF v_visibility NOT IN ('internal', 'public') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_note_visibility');
  END IF;

  SELECT *
  INTO v_dispute
  FROM contract_disputes
  WHERE id = p_dispute_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dispute_not_found');
  END IF;

  IF v_dispute.status NOT IN ('open', 'under_review') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'dispute_not_open',
      'status', v_dispute.status
    );
  END IF;

  SELECT *
  INTO v_contract
  FROM contracts
  WHERE id = v_dispute.contract_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  v_gross := round(coalesce(v_contract.payment_amount, 0)::numeric, 2);
  v_commission := round(coalesce(v_contract.commission_amount, 0)::numeric, 2);
  v_contract_net := round(coalesce(v_contract.net_amount, greatest(v_gross - v_commission, 0))::numeric, 2);
  v_talent_user_id := coalesce(v_contract.talent_user_id, v_contract.talent_id);

  IF v_action IN ('release', 'refund', 'split') THEN
    IF v_contract.status <> 'confirmed' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'contract_not_confirmed',
        'status', v_contract.status
      );
    END IF;

    IF v_gross <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_escrow_amount');
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM wallet_transactions
      WHERE type = 'escrow_lock'
        AND (status = 'completed' OR status IS NULL)
        AND (
          reference_id = v_contract.id::text
          OR idempotency_key = 'escrow_' || v_contract.id::text
        )
    )
    INTO v_has_wallet_escrow;

    SELECT *
    INTO v_agent_commitment
    FROM premium_agent_wallet_transactions
    WHERE type = 'job_commitment'
      AND status = 'completed'
      AND (
        related_contract_id = v_contract.id
        OR (v_contract.job_id IS NOT NULL AND related_job_id = v_contract.job_id)
      )
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    v_has_agent_commitment := FOUND;

    IF NOT v_has_wallet_escrow AND NOT v_has_agent_commitment THEN
      RETURN jsonb_build_object('ok', false, 'error', 'escrow_not_found');
    END IF;
  END IF;

  IF v_action IN ('release', 'split') THEN
    IF v_talent_user_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'talent_not_found');
    END IF;
  END IF;

  IF v_action IN ('refund', 'split') THEN
    IF v_contract.agency_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'agency_not_found');
    END IF;
  END IF;

  IF v_action IN ('release', 'refund', 'split') THEN
    IF EXISTS (
      SELECT 1
      FROM wallet_transactions
      WHERE reference_id = v_contract.id::text
        AND type = 'payout'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'payout_already_exists');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM wallet_transactions
      WHERE reference_id = v_contract.id::text
        AND type = 'refund'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'refund_already_exists');
    END IF;
  END IF;

  IF v_action = 'release' THEN
    SELECT id, referrer_id, commission_rate
    INTO v_referral_id, v_referrer_id, v_referral_commission_rate
    FROM referral_invites
    WHERE referred_user_id = v_talent_user_id
      AND job_id = v_contract.job_id
      AND status <> 'fraud_reported'
      AND status <> 'commission_paid'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    v_referral_found := FOUND;

    IF v_referral_found AND v_referrer_id IS NOT NULL THEN
      v_referral_commission := round((v_gross * coalesce(v_referral_commission_rate, 0.02))::numeric, 2);
    END IF;

    v_talent_amount := greatest(round((v_contract_net - v_referral_commission)::numeric, 2), 0);
    v_agency_refund_amount := 0;
    v_resolution_status := 'resolved_release';
    v_contract_status := 'paid';
    v_payment_status := 'paid';
    v_booking_status := 'paid';
  ELSIF v_action = 'refund' THEN
    v_talent_amount := 0;
    v_agency_refund_amount := v_gross;
    v_resolution_status := 'resolved_refund';
    v_contract_status := 'cancelled';
    v_payment_status := 'refunded';
    v_booking_status := 'cancelled';
  ELSIF v_action = 'split' THEN
    v_talent_amount := round(coalesce(p_talent_amount, 0)::numeric, 2);
    v_agency_refund_amount := round(coalesce(p_agency_refund_amount, 0)::numeric, 2);

    IF v_talent_amount < 0 OR v_agency_refund_amount < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_split_amount');
    END IF;

    IF v_talent_amount = 0 AND v_agency_refund_amount = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'split_requires_amount');
    END IF;

    IF round((v_talent_amount + v_agency_refund_amount)::numeric, 2) > v_gross THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'split_exceeds_escrow',
        'escrow_amount', v_gross
      );
    END IF;

    v_resolution_status := 'resolved_split';
    v_contract_status := CASE WHEN v_talent_amount > 0 THEN 'paid' ELSE 'cancelled' END;
    v_payment_status := 'split';
    v_booking_status := CASE WHEN v_talent_amount > 0 THEN 'paid' ELSE 'cancelled' END;
  ELSE
    v_talent_amount := 0;
    v_agency_refund_amount := 0;
    v_resolution_status := 'closed';
  END IF;

  v_platform_retained := greatest(round((v_gross - v_talent_amount - v_agency_refund_amount - v_referral_commission)::numeric, 2), 0);

  IF v_talent_amount > 0 THEN
    SELECT coalesce(wallet_balance, 0)
    INTO v_talent_balance
    FROM profiles
    WHERE id = v_talent_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'talent_profile_not_found');
    END IF;

    UPDATE profiles
    SET wallet_balance = round((v_talent_balance + v_talent_amount)::numeric, 2)
    WHERE id = v_talent_user_id;

    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount,
      description,
      reference_id,
      idempotency_key,
      status
    )
    VALUES (
      v_talent_user_id,
      'payout',
      v_talent_amount,
      CASE
        WHEN v_action = 'split' THEN 'Pagamento parcial por resolucao de disputa'
        ELSE 'Pagamento liberado por resolucao de disputa'
      END,
      v_contract.id::text,
      'dispute:payout:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_payout_tx_id;
  END IF;

  IF v_agency_refund_amount > 0 THEN
    SELECT coalesce(wallet_balance, 0)
    INTO v_agency_balance
    FROM profiles
    WHERE id = v_contract.agency_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'agency_profile_not_found');
    END IF;

    UPDATE profiles
    SET wallet_balance = round((v_agency_balance + v_agency_refund_amount)::numeric, 2)
    WHERE id = v_contract.agency_id;

    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount,
      description,
      reference_id,
      idempotency_key,
      status
    )
    VALUES (
      v_contract.agency_id,
      'refund',
      v_agency_refund_amount,
      CASE
        WHEN v_action = 'split' THEN 'Reembolso parcial por resolucao de disputa'
        ELSE 'Reembolso por resolucao de disputa'
      END,
      v_contract.id::text,
      'dispute:refund:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_refund_tx_id;
  END IF;

  IF v_referral_found AND v_referral_commission > 0 AND v_referrer_id IS NOT NULL THEN
    UPDATE profiles
    SET wallet_balance = round((coalesce(wallet_balance, 0) + v_referral_commission)::numeric, 2)
    WHERE id = v_referrer_id;

    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount,
      description,
      reference_id,
      idempotency_key,
      status
    )
    VALUES (
      v_referrer_id,
      'referral_commission',
      v_referral_commission,
      'Comissao de indicacao por resolucao de disputa',
      v_contract.id::text,
      'dispute:referral:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_referral_tx_id;

    UPDATE referral_invites
    SET
      status = 'commission_paid',
      commission_amount = coalesce(commission_amount, v_referral_commission),
      commission_paid = coalesce(commission_paid, v_referral_commission),
      commission_paid_at = coalesce(commission_paid_at, v_now),
      paid_contract_id = v_contract.id,
      updated_at = v_now
    WHERE id = v_referral_id;
  END IF;

  IF v_action IN ('release', 'refund', 'split') THEN
    UPDATE contracts
    SET
      status = v_contract_status,
      payment_status = v_payment_status,
      paid_at = CASE WHEN v_talent_amount > 0 THEN coalesce(paid_at, v_now) ELSE paid_at END,
      paid_by_user_id = CASE WHEN v_talent_amount > 0 THEN p_admin_user_id ELSE paid_by_user_id END
    WHERE id = v_contract.id;

    IF v_contract.booking_id IS NOT NULL THEN
      UPDATE bookings
      SET status = v_booking_status
      WHERE id = v_contract.booking_id;
    END IF;

    IF v_has_agent_commitment THEN
      v_settle_amount := CASE
        WHEN v_action = 'release' THEN v_gross
        WHEN v_action = 'split' THEN greatest(round((v_gross - v_agency_refund_amount)::numeric, 2), 0)
        ELSE 0
      END;
      v_release_amount := CASE
        WHEN v_action = 'refund' THEN v_gross
        WHEN v_action = 'split' THEN v_agency_refund_amount
        ELSE 0
      END;

      IF v_settle_amount > 0 AND NOT EXISTS (
        SELECT 1
        FROM premium_agent_wallet_transactions
        WHERE related_contract_id = v_contract.id
          AND type = 'job_settlement'
      ) THEN
        INSERT INTO premium_agent_wallet_transactions (
          workspace_id,
          agent_user_id,
          owner_user_id,
          type,
          amount,
          status,
          related_job_id,
          related_contract_id,
          created_by,
          note,
          metadata
        )
        VALUES (
          v_agent_commitment.workspace_id,
          v_agent_commitment.agent_user_id,
          v_agent_commitment.owner_user_id,
          'job_settlement',
          v_settle_amount,
          'completed',
          v_contract.job_id,
          v_contract.id,
          p_admin_user_id,
          'Resolucao de disputa: valor consumido da reserva do agente.',
          jsonb_build_object('dispute_id', p_dispute_id, 'action', v_action)
        );
      END IF;

      IF v_release_amount > 0 AND NOT EXISTS (
        SELECT 1
        FROM premium_agent_wallet_transactions
        WHERE related_contract_id = v_contract.id
          AND type IN ('job_release', 'refund')
      ) THEN
        INSERT INTO premium_agent_wallet_transactions (
          workspace_id,
          agent_user_id,
          owner_user_id,
          type,
          amount,
          status,
          related_job_id,
          related_contract_id,
          created_by,
          note,
          metadata
        )
        VALUES (
          v_agent_commitment.workspace_id,
          v_agent_commitment.agent_user_id,
          v_agent_commitment.owner_user_id,
          'job_release',
          v_release_amount,
          'completed',
          v_contract.job_id,
          v_contract.id,
          p_admin_user_id,
          'Resolucao de disputa: valor devolvido da reserva do agente.',
          jsonb_build_object('dispute_id', p_dispute_id, 'action', v_action)
        );
      END IF;
    END IF;
  END IF;

  UPDATE contract_disputes
  SET
    status = v_resolution_status,
    resolved_at = v_now,
    resolved_by_user_id = p_admin_user_id,
    resolution_note = v_note,
    resolution_action = v_action,
    talent_amount = v_talent_amount,
    agency_refund_amount = v_agency_refund_amount
  WHERE id = p_dispute_id;

  INSERT INTO contract_dispute_notes (
    dispute_id,
    admin_user_id,
    visibility,
    body
  )
  VALUES (
    p_dispute_id,
    p_admin_user_id,
    v_visibility,
    v_note
  );

  RETURN jsonb_build_object(
    'ok', true,
    'dispute_id', p_dispute_id,
    'contract_id', v_contract.id,
    'status', v_resolution_status,
    'action', v_action,
    'talent_amount', v_talent_amount,
    'agency_refund_amount', v_agency_refund_amount,
    'referral_commission', v_referral_commission,
    'platform_retained', v_platform_retained,
    'payout_transaction_id', v_payout_tx_id,
    'refund_transaction_id', v_refund_tx_id,
    'referral_transaction_id', v_referral_tx_id
  );
END;
$$;


ALTER FUNCTION "public"."resolve_contract_dispute"("p_dispute_id" "uuid", "p_admin_user_id" "uuid", "p_action" "text", "p_admin_note" "text", "p_talent_amount" numeric, "p_agency_refund_amount" numeric, "p_note_visibility" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_wallet_withdrawal_sources"("p_withdrawal_transaction_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row record;
  v_restored_amount numeric(12,2) := 0;
BEGIN
  IF p_withdrawal_transaction_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_argument');
  END IF;

  FOR v_row IN
    SELECT id, funding_source_id, allocated_amount
    FROM wallet_withdrawal_source_allocations
    WHERE withdrawal_transaction_id = p_withdrawal_transaction_id
      AND restored_at IS NULL
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    UPDATE wallet_funding_sources
    SET
      remaining_amount = round((remaining_amount + v_row.allocated_amount)::numeric, 2),
      status = 'available'
    WHERE id = v_row.funding_source_id;

    UPDATE wallet_withdrawal_source_allocations
    SET restored_at = now()
    WHERE id = v_row.id;

    v_restored_amount := round((v_restored_amount + v_row.allocated_amount)::numeric, 2);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'restored_amount', v_restored_amount
  );
END;
$$;


ALTER FUNCTION "public"."restore_wallet_withdrawal_sources"("p_withdrawal_transaction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_contract_disputes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_contract_disputes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_payments_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_payments_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_agency_talent_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.talent_user_id IS NULL OR NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    INSERT INTO agency_talent_history (agency_id, talent_id, jobs_count, jobs_completed, last_worked_at, last_job_status)
    VALUES (NEW.agency_id, NEW.talent_user_id, 1, 1, now(), 'paid')
    ON CONFLICT (agency_id, talent_id) DO UPDATE SET
      jobs_count      = agency_talent_history.jobs_count + 1,
      jobs_completed  = agency_talent_history.jobs_completed + 1,
      last_worked_at  = now(),
      last_job_status = 'paid';
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled'
     AND NEW.cancelled_by = 'talent'
     AND (OLD.cancelled_by IS NULL OR OLD.cancelled_by != 'talent') THEN
    INSERT INTO agency_talent_history (agency_id, talent_id, jobs_count, jobs_cancelled, last_worked_at, last_job_status)
    VALUES (NEW.agency_id, NEW.talent_user_id, 0, 1, now(), 'cancelled')
    ON CONFLICT (agency_id, talent_id) DO UPDATE SET
      jobs_cancelled  = agency_talent_history.jobs_cancelled + 1,
      last_worked_at  = now(),
      last_job_status = 'cancelled';
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_agency_talent_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_booking_on_contract_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- when contract becomes signed → move booking forward
  if new.status = 'signed' and old.status is distinct from 'signed' then
    update bookings
    set status = 'pending_payment'
    where id = new.booking_id
      and status = 'pending';
  end if;

  -- when contract becomes confirmed → keep booking confirmed
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    update bookings
    set status = 'confirmed'
    where id = new.booking_id;
  end if;

  -- when contract becomes paid → booking also paid
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update bookings
    set status = 'paid'
    where id = new.booking_id;
  end if;

  -- when contract cancelled → booking cancelled
  if new.status = 'cancelled' then
    update bookings
    set status = 'cancelled'
    where id = new.booking_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_booking_on_contract_update"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "before" "jsonb",
    "after" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_nav_seen" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "nav_key" "text" NOT NULL,
    "seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_nav_seen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_notification_broadcasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "audience" "text" NOT NULL,
    "target_user_id" "uuid",
    "link" "text",
    "sent_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."admin_notification_broadcasts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text",
    "avatar_url" "text",
    "subscription_status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "address" "text",
    "phone" "text",
    "email" "text",
    "website" "text",
    "description" "text",
    "company_name" "text",
    "contact_name" "text",
    "country" "text",
    "city" "text",
    "deleted_at" timestamp with time zone,
    "pix_key_type" "text",
    "pix_key_value" "text",
    "pix_holder_name" "text",
    "stripe_charges_enabled" boolean DEFAULT false NOT NULL,
    "stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
    "stripe_details_submitted" boolean DEFAULT false NOT NULL,
    "stripe_transfers_active" boolean DEFAULT false NOT NULL,
    "stripe_connect_updated_at" timestamp with time zone,
    "stripe_account_id" "text",
    "state" "text"
);


ALTER TABLE "public"."agencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agency_plans" (
    "user_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'pro'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agency_plans_plan_check" CHECK (("plan" = ANY (ARRAY['pro'::"text", 'basic'::"text"])))
);


ALTER TABLE "public"."agency_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agency_talent_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "talent_id" "uuid" NOT NULL,
    "jobs_count" integer DEFAULT 0,
    "last_worked_at" timestamp with time zone,
    "is_favorite" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "jobs_completed" integer DEFAULT 0 NOT NULL,
    "jobs_cancelled" integer DEFAULT 0 NOT NULL,
    "last_job_status" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agency_talent_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid",
    "talent_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asaas_webhook_events" (
    "id" "text" NOT NULL,
    "event_type" "text",
    "payload" "jsonb" NOT NULL,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_id" "text"
);


ALTER TABLE "public"."asaas_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_test_payments_20260501" (
    "id" "uuid",
    "provider" "text",
    "provider_payment_id" "text",
    "idempotency_key" "text",
    "booking_id" "uuid",
    "contract_id" "uuid",
    "agency_id" "uuid",
    "amount" numeric(12,2),
    "currency" "text",
    "status" "text",
    "raw_provider_payload" "jsonb",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."backup_test_payments_20260501" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_test_wallet_transactions_20260501" (
    "id" "uuid",
    "user_id" "uuid",
    "amount" numeric,
    "type" "text",
    "created_at" timestamp with time zone,
    "description" "text",
    "idempotency_key" "text",
    "payment_id" "text",
    "reference_id" "text",
    "status" "text",
    "processed_at" timestamp with time zone,
    "processed_by" "uuid",
    "admin_note" "text",
    "fee_amount" numeric(12,2),
    "net_amount" numeric(12,2),
    "provider" "text",
    "provider_transfer_id" "text",
    "provider_status" "text",
    "provider_payout_id" "text",
    "failure_reason" "text",
    "needs_admin_review" boolean,
    "stripe_payment_intent_id" "text",
    "stripe_charge_id" "text",
    "asaas_payment_id" "text",
    "asaas_transfer_id" "text",
    "asaas_status" "text",
    "pix_key" "text",
    "pix_key_type" "text"
);


ALTER TABLE "public"."backup_test_wallet_transactions_20260501" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid",
    "talent_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "price" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "agency_id" "uuid",
    "talent_user_id" "uuid",
    "job_title" "text",
    "deleted_at" timestamp with time zone,
    "cancelled_by" "text",
    CONSTRAINT "bookings_status_valid" CHECK (("status" = ANY (ARRAY['pending'::"text", 'pending_payment'::"text", 'confirmed'::"text", 'paid'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "valid_booking_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'pending_payment'::"text", 'confirmed'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_dispute_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dispute_id" "uuid" NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "visibility" "text" DEFAULT 'internal'::"text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contract_dispute_notes_body_check" CHECK (("length"(TRIM(BOTH FROM "body")) > 0)),
    CONSTRAINT "contract_dispute_notes_visibility_check" CHECK (("visibility" = ANY (ARRAY['internal'::"text", 'public'::"text"])))
);


ALTER TABLE "public"."contract_dispute_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "workspace_id" "uuid",
    "opened_by_user_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by_user_id" "uuid",
    "resolution_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolution_action" "text",
    "talent_amount" numeric(12,2),
    "agency_refund_amount" numeric(12,2),
    CONSTRAINT "contract_disputes_reason_check" CHECK (("length"(TRIM(BOTH FROM "reason")) > 0)),
    CONSTRAINT "contract_disputes_resolved_check" CHECK ((("status" <> ALL (ARRAY['resolved_refund'::"text", 'resolved_release'::"text", 'resolved_split'::"text", 'closed'::"text"])) OR (("resolved_at" IS NOT NULL) AND ("resolved_by_user_id" IS NOT NULL)))),
    CONSTRAINT "contract_disputes_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'under_review'::"text", 'resolved_refund'::"text", 'resolved_release'::"text", 'resolved_split'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."contract_disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "agency_signed_at" timestamp with time zone,
    "deposit_paid_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "talent_id" "uuid",
    "agency_id" "uuid",
    "job_date" "date",
    "job_time" time without time zone,
    "location" "text",
    "job_description" "text",
    "payment_amount" numeric,
    "payment_method" "text",
    "additional_notes" "text",
    "signed_at" timestamp with time zone,
    "withdrawn_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "job_id" "uuid",
    "pix_payment_id" "text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "commission_amount" numeric(12,2),
    "net_amount" numeric(12,2),
    "contract_file_url" "text",
    "signed_contract_url" "text",
    "confirmed_at" timestamp with time zone,
    "stripe_payment_intent_id" "text",
    "stripe_charge_id" "text",
    "stripe_transfer_id" "text",
    "payment_provider" "text",
    "stripe_checkout_session_id" "text",
    "talent_user_id" "uuid",
    "workspace_id" "uuid",
    "created_by_user_id" "uuid",
    "paid_by_user_id" "uuid",
    CONSTRAINT "contracts_payment_provider_check" CHECK (("payment_provider" = ANY (ARRAY['efi'::"text", 'stripe'::"text", 'asaas'::"text"]))),
    CONSTRAINT "contracts_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'signed'::"text", 'rejected'::"text", 'confirmed'::"text", 'deposit_paid'::"text", 'paid'::"text", 'cancelled'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_invite_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "workspace_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "max_uses" integer,
    "use_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "job_invite_links_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."job_invite_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "talent_id" "uuid" NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid",
    "title" "text",
    "description" "text",
    "job_date" "date",
    "talents_needed" integer,
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "budget" numeric,
    "deadline" "date",
    "location" "text",
    "gender" "text",
    "age_min" integer,
    "age_max" integer,
    "number_of_talents_required" integer DEFAULT 1,
    "deleted_at" timestamp with time zone,
    "job_role" "text",
    "job_time" "text",
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "application_requirements" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "workspace_id" "uuid",
    "created_by_user_id" "uuid",
    "invite_only" boolean DEFAULT false NOT NULL,
    CONSTRAINT "jobs_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'active'::"text", 'draft'::"text", 'paused'::"text", 'closed'::"text", 'inactive'::"text", 'cancelled'::"text", 'expired'::"text", 'completed'::"text"]))),
    CONSTRAINT "jobs_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text", 'private_invite'::"text", 'workspace_only'::"text"])))
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text",
    "message" "text",
    "link" "text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "idempotency_key" "text"
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'mercadopago'::"text" NOT NULL,
    "provider_payment_id" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "booking_id" "uuid",
    "contract_id" "uuid",
    "agency_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "raw_provider_payload" "jsonb",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text", 'refunded'::"text", 'expired'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric DEFAULT 0 NOT NULL,
    "commission_percent" numeric NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "job_limit" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "max_hires_per_job" integer,
    "included_agent_seats" integer,
    "extra_agent_seat_price" numeric
);


ALTER TABLE "public"."plan_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_settings_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_key" "text" NOT NULL,
    "changed_by" "uuid" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "old_price" numeric NOT NULL,
    "new_price" numeric NOT NULL,
    "old_commission_percent" numeric NOT NULL,
    "new_commission_percent" numeric NOT NULL,
    "old_is_available" boolean NOT NULL,
    "new_is_available" boolean NOT NULL,
    "old_job_limit" integer,
    "new_job_limit" integer,
    "old_included_agent_seats" integer,
    "new_included_agent_seats" integer,
    "old_extra_agent_seat_price" numeric,
    "new_extra_agent_seat_price" numeric
);


ALTER TABLE "public"."plan_settings_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_balance" (
    "id" integer DEFAULT 1 NOT NULL,
    "balance" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_balance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "description" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_agent_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "invited_email" "text" NOT NULL,
    "role" "text" DEFAULT 'agent'::"text" NOT NULL,
    "token" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "spending_limit" numeric,
    CONSTRAINT "premium_agent_invites_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'agent'::"text"]))),
    CONSTRAINT "premium_agent_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."premium_agent_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_agent_wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "agent_user_id" "uuid" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "related_job_id" "uuid",
    "related_contract_id" "uuid",
    "note" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reversed_at" timestamp with time zone,
    "metadata" "jsonb",
    CONSTRAINT "premium_agent_wallet_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "premium_agent_wallet_transactions_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'reversed'::"text", 'pending'::"text"]))),
    CONSTRAINT "premium_agent_wallet_transactions_type_check" CHECK (("type" = ANY (ARRAY['allocation'::"text", 'allocation_reversal'::"text", 'job_commitment'::"text", 'job_release'::"text", 'job_settlement'::"text", 'refund'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."premium_agent_wallet_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_workspace_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'agent'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "spending_limit" numeric,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_at" timestamp with time zone,
    CONSTRAINT "premium_workspace_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'agent'::"text"]))),
    CONSTRAINT "premium_workspace_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'invited'::"text", 'removed'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."premium_workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_workspace_talents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "talent_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "source" "text" DEFAULT 'portal'::"text" NOT NULL,
    "invited_by" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_at" timestamp with time zone,
    CONSTRAINT "premium_workspace_talents_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."premium_workspace_talents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."premium_workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "agency_id" "uuid",
    "name" "text" NOT NULL,
    "slug" "text",
    "logo_url" "text",
    "brand_primary_color" "text",
    "brand_accent_color" "text",
    "welcome_message" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "included_agent_seats" integer DEFAULT 2 NOT NULL,
    "extra_agent_seats" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "onboarding_completed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "premium_workspaces_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'cancelled'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."premium_workspaces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."presentation_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "presentation_id" "uuid" NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "client_token" "text" NOT NULL,
    "vote" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "viewer_name" "text",
    "viewer_company" "text",
    "viewer_email" "text",
    CONSTRAINT "presentation_feedback_vote_check" CHECK (("vote" = ANY (ARRAY['approved'::"text", 'rejected'::"text", 'favorite'::"text"])))
);


ALTER TABLE "public"."presentation_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text",
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "onboarding_completed" boolean DEFAULT false,
    "wallet_balance" numeric DEFAULT 0,
    "plan" "text" DEFAULT 'free'::"text",
    "plan_status" "text" DEFAULT 'inactive'::"text",
    "plan_expires_at" timestamp with time zone,
    "is_frozen" boolean DEFAULT false NOT NULL,
    "mp_customer_id" "text",
    "asaas_customer_id" "text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_subscription_status" "text",
    "stripe_price_id" "text",
    "asaas_subscription_id" "text",
    "asaas_subscription_status" "text",
    "cpf_cnpj" "text",
    "deleted_at" timestamp with time zone,
    "language_preference" "text" DEFAULT 'pt-BR'::"text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(24), 'hex'::"text") NOT NULL,
    "job_id" "uuid",
    "referrer_id" "uuid" NOT NULL,
    "referred_email" "text" NOT NULL,
    "referred_name" "text",
    "submission_id" "uuid",
    "referred_user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "commission_paid" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "commission_rate" numeric(5,4) DEFAULT 0.02 NOT NULL,
    "commission_amount" numeric(12,2),
    "signed_up_at" timestamp with time zone,
    "applied_at" timestamp with time zone,
    "hired_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "commission_due_at" timestamp with time zone,
    "commission_paid_at" timestamp with time zone,
    "paid_contract_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "signup_email" "text",
    "skip_reason" "text"
);


ALTER TABLE "public"."referral_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "mp_customer_id" "text" NOT NULL,
    "mp_card_id" "text" NOT NULL,
    "brand" "text",
    "last_four" "text",
    "holder_name" "text",
    "expiry_month" integer,
    "expiry_year" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "holder_document_type" "text",
    "holder_document_number" "text",
    "issuer_id" "text"
);


ALTER TABLE "public"."saved_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "livemode" boolean DEFAULT false NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submission_pipeline_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "author_user_id" "uuid" NOT NULL,
    "author_name" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."submission_pipeline_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "job_id" "uuid",
    "talent_user_id" "uuid",
    "talent_name" "text",
    "email" "text",
    "bio" "text",
    "referrer_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "mode" "text",
    "photo_front_url" "text",
    "photo_left_url" "text",
    "photo_right_url" "text",
    "video_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "curriculum_url" "text",
    "portfolio_url" "text",
    "pipeline_status" "text",
    CONSTRAINT "submissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    CONSTRAINT "support_conversations_priority_chk" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "support_conversations_status_chk" CHECK (("status" = ANY (ARRAY['open'::"text", 'waiting_admin'::"text", 'waiting_user'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."support_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_role" "text" NOT NULL,
    "message" "text" NOT NULL,
    "attachment_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "support_messages_sender_role_chk" CHECK (("sender_role" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."support_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."talent_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "talent_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "is_available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."talent_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."talent_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "age" integer,
    "gender" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "full_name" "text",
    "country" "text",
    "city" "text",
    "bio" "text",
    "categories" "text"[],
    "instagram" "text",
    "tiktok" "text",
    "youtube" "text",
    "x_handle" "text",
    "website" "text",
    "imdb" "text",
    "avatar_url" "text",
    "photo_front_url" "text",
    "photo_left_url" "text",
    "photo_right_url" "text",
    "username" "text",
    "deleted_at" timestamp with time zone,
    "ethnicity" "text",
    "eye_color" "text",
    "hair_color" "text",
    "skills" "text"[],
    "linkedin" "text",
    "twitter" "text",
    "pix_key_type" "text",
    "pix_key_value" "text",
    "cpf_or_id" "text",
    "main_role" "text",
    "stripe_account_id" "text",
    "pix_holder_name" "text",
    "stripe_charges_enabled" boolean DEFAULT false NOT NULL,
    "stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
    "stripe_details_submitted" boolean DEFAULT false NOT NULL,
    "stripe_transfers_active" boolean DEFAULT false NOT NULL,
    "stripe_connect_updated_at" timestamp with time zone,
    "state" "text",
    "marketplace_visible" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."talent_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."terms_acceptances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "terms_version" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text",
    "user_agent" "text"
);


ALTER TABLE "public"."terms_acceptances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_funding_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_wallet_transaction_id" "uuid" NOT NULL,
    "stripe_charge_id" "text" NOT NULL,
    "stripe_payment_intent_id" "text",
    "source_type" "text" NOT NULL,
    "original_amount" numeric(12,2) NOT NULL,
    "remaining_amount" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "original_payer_user_id" "uuid",
    "current_owner_user_id" "uuid",
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "related_contract_id" "uuid",
    "upstream_funding_source_id" "uuid"
);


ALTER TABLE "public"."wallet_funding_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "amount" numeric,
    "type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "idempotency_key" "text",
    "payment_id" "text",
    "reference_id" "text",
    "status" "text",
    "processed_at" timestamp with time zone,
    "processed_by" "uuid",
    "admin_note" "text",
    "fee_amount" numeric(12,2),
    "net_amount" numeric(12,2),
    "provider" "text",
    "provider_transfer_id" "text",
    "provider_status" "text",
    "provider_payout_id" "text",
    "failure_reason" "text",
    "needs_admin_review" boolean DEFAULT false NOT NULL,
    "stripe_payment_intent_id" "text",
    "stripe_charge_id" "text",
    "asaas_payment_id" "text",
    "asaas_transfer_id" "text",
    "asaas_status" "text",
    "pix_key" "text",
    "pix_key_type" "text",
    "invoice_url" "text"
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_withdrawal_source_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "withdrawal_transaction_id" "uuid" NOT NULL,
    "funding_source_id" "uuid" NOT NULL,
    "source_wallet_transaction_id" "uuid" NOT NULL,
    "stripe_charge_id" "text" NOT NULL,
    "allocated_amount" numeric(12,2) NOT NULL,
    "transfer_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "restored_at" timestamp with time zone
);


ALTER TABLE "public"."wallet_withdrawal_source_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'mercadopago'::"text" NOT NULL,
    "event_id" "text" NOT NULL,
    "provider_event_id" "text" NOT NULL,
    "topic" "text",
    "raw_payload" "jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed" boolean DEFAULT false NOT NULL,
    "processed_at" timestamp with time zone,
    "error" "text"
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_presentation_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "presentation_id" "uuid" NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."workspace_presentation_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_presentations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "job_id" "uuid",
    "title" "text" NOT NULL,
    "intro" "text",
    "token" "text" NOT NULL,
    "password_hash" "text",
    "expires_at" timestamp with time zone,
    "view_count" integer DEFAULT 0 NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_presentations" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_nav_seen"
    ADD CONSTRAINT "admin_nav_seen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_nav_seen"
    ADD CONSTRAINT "admin_nav_seen_user_key_unique" UNIQUE ("admin_user_id", "nav_key");



ALTER TABLE ONLY "public"."admin_notification_broadcasts"
    ADD CONSTRAINT "admin_notification_broadcasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agency_plans"
    ADD CONSTRAINT "agency_plans_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."agency_talent_history"
    ADD CONSTRAINT "agency_talent_history_agency_id_talent_id_key" UNIQUE ("agency_id", "talent_id");



ALTER TABLE ONLY "public"."agency_talent_history"
    ADD CONSTRAINT "agency_talent_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asaas_webhook_events"
    ADD CONSTRAINT "asaas_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_dispute_notes"
    ADD CONSTRAINT "contract_dispute_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_disputes"
    ADD CONSTRAINT "contract_disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_invite_links"
    ADD CONSTRAINT "job_invite_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_invite_links"
    ADD CONSTRAINT "job_invite_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."job_invites"
    ADD CONSTRAINT "job_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_provider_id_uniq" UNIQUE ("provider", "provider_payment_id");



ALTER TABLE ONLY "public"."plan_settings_history"
    ADD CONSTRAINT "plan_settings_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_settings"
    ADD CONSTRAINT "plan_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_settings"
    ADD CONSTRAINT "plan_settings_plan_key_key" UNIQUE ("plan_key");



ALTER TABLE ONLY "public"."platform_balance"
    ADD CONSTRAINT "platform_balance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."premium_agent_invites"
    ADD CONSTRAINT "premium_agent_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_agent_invites"
    ADD CONSTRAINT "premium_agent_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."premium_agent_wallet_transactions"
    ADD CONSTRAINT "premium_agent_wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_workspace_members"
    ADD CONSTRAINT "premium_workspace_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_workspace_talents"
    ADD CONSTRAINT "premium_workspace_talents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_workspaces"
    ADD CONSTRAINT "premium_workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."premium_workspaces"
    ADD CONSTRAINT "premium_workspaces_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."presentation_feedback"
    ADD CONSTRAINT "presentation_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."presentation_feedback"
    ADD CONSTRAINT "presentation_feedback_presentation_id_submission_id_client__key" UNIQUE ("presentation_id", "submission_id", "client_token");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_invites"
    ADD CONSTRAINT "referral_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_cards"
    ADD CONSTRAINT "saved_cards_mp_card_id_key" UNIQUE ("mp_card_id");



ALTER TABLE ONLY "public"."saved_cards"
    ADD CONSTRAINT "saved_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_events"
    ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submission_pipeline_notes"
    ADD CONSTRAINT "submission_pipeline_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_conversations"
    ADD CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."talent_availability"
    ADD CONSTRAINT "talent_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."talent_availability"
    ADD CONSTRAINT "talent_availability_talent_id_date_key" UNIQUE ("talent_id", "date");



ALTER TABLE ONLY "public"."talent_profiles"
    ADD CONSTRAINT "talent_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."talent_profiles"
    ADD CONSTRAINT "talent_profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."terms_acceptances"
    ADD CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_funding_sources"
    ADD CONSTRAINT "wallet_funding_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_withdrawal_source_allocations"
    ADD CONSTRAINT "wallet_withdrawal_source_allo_withdrawal_transaction_id_fun_key" UNIQUE ("withdrawal_transaction_id", "funding_source_id");



ALTER TABLE ONLY "public"."wallet_withdrawal_source_allocations"
    ADD CONSTRAINT "wallet_withdrawal_source_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_provider_event_uniq" UNIQUE ("provider", "provider_event_id");



ALTER TABLE ONLY "public"."workspace_presentation_candidates"
    ADD CONSTRAINT "workspace_presentation_candid_presentation_id_submission_id_key" UNIQUE ("presentation_id", "submission_id");



ALTER TABLE ONLY "public"."workspace_presentation_candidates"
    ADD CONSTRAINT "workspace_presentation_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_presentations"
    ADD CONSTRAINT "workspace_presentations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_presentations"
    ADD CONSTRAINT "workspace_presentations_token_key" UNIQUE ("token");



CREATE INDEX "admin_audit_logs_admin_id_idx" ON "public"."admin_audit_logs" USING "btree" ("admin_id");



CREATE INDEX "admin_audit_logs_created_at_idx" ON "public"."admin_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "admin_audit_logs_entity_idx" ON "public"."admin_audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "admin_nav_seen_user_idx" ON "public"."admin_nav_seen" USING "btree" ("admin_user_id");



CREATE INDEX "admin_notification_broadcasts_archived_at_idx" ON "public"."admin_notification_broadcasts" USING "btree" ("archived_at");



CREATE INDEX "admin_notification_broadcasts_deleted_at_idx" ON "public"."admin_notification_broadcasts" USING "btree" ("deleted_at");



CREATE UNIQUE INDEX "agencies_stripe_account_id_uniq" ON "public"."agencies" USING "btree" ("stripe_account_id") WHERE ("stripe_account_id" IS NOT NULL);



CREATE UNIQUE INDEX "asaas_webhook_events_event_id_uniq" ON "public"."asaas_webhook_events" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



CREATE INDEX "contract_dispute_notes_admin_user_id_idx" ON "public"."contract_dispute_notes" USING "btree" ("admin_user_id", "created_at" DESC);



CREATE INDEX "contract_dispute_notes_dispute_id_idx" ON "public"."contract_dispute_notes" USING "btree" ("dispute_id", "created_at" DESC);



CREATE INDEX "contract_disputes_active_contract_idx" ON "public"."contract_disputes" USING "btree" ("contract_id") WHERE ("status" = ANY (ARRAY['open'::"text", 'under_review'::"text"]));



CREATE INDEX "contract_disputes_contract_id_idx" ON "public"."contract_disputes" USING "btree" ("contract_id");



CREATE INDEX "contract_disputes_created_at_idx" ON "public"."contract_disputes" USING "btree" ("created_at" DESC);



CREATE INDEX "contract_disputes_status_idx" ON "public"."contract_disputes" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['open'::"text", 'under_review'::"text"]));



CREATE INDEX "contracts_agency_id_idx" ON "public"."contracts" USING "btree" ("agency_id");



CREATE INDEX "contracts_created_at_idx" ON "public"."contracts" USING "btree" ("created_at" DESC);



CREATE INDEX "contracts_deleted_at_idx" ON "public"."contracts" USING "btree" ("deleted_at");



CREATE INDEX "contracts_job_id_idx" ON "public"."contracts" USING "btree" ("job_id");



CREATE INDEX "contracts_status_idx" ON "public"."contracts" USING "btree" ("status");



CREATE INDEX "contracts_stripe_charge_idx" ON "public"."contracts" USING "btree" ("stripe_charge_id") WHERE ("stripe_charge_id" IS NOT NULL);



CREATE INDEX "contracts_stripe_checkout_session_idx" ON "public"."contracts" USING "btree" ("stripe_checkout_session_id") WHERE ("stripe_checkout_session_id" IS NOT NULL);



CREATE INDEX "contracts_stripe_payment_intent_idx" ON "public"."contracts" USING "btree" ("stripe_payment_intent_id") WHERE ("stripe_payment_intent_id" IS NOT NULL);



CREATE INDEX "contracts_talent_id_idx" ON "public"."contracts" USING "btree" ("talent_id");



CREATE INDEX "contracts_talent_workspace_idx" ON "public"."contracts" USING "btree" ("talent_user_id", "workspace_id") WHERE ("workspace_id" IS NOT NULL);



CREATE INDEX "contracts_workspace_id_idx" ON "public"."contracts" USING "btree" ("workspace_id") WHERE ("workspace_id" IS NOT NULL);



CREATE INDEX "idx_admin_notification_broadcasts_admin_id" ON "public"."admin_notification_broadcasts" USING "btree" ("admin_id");



CREATE INDEX "idx_admin_notification_broadcasts_created_at" ON "public"."admin_notification_broadcasts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_feedback_presentation" ON "public"."presentation_feedback" USING "btree" ("presentation_id");



CREATE INDEX "idx_payments_agency_id" ON "public"."payments" USING "btree" ("agency_id") WHERE ("agency_id" IS NOT NULL);



CREATE INDEX "idx_payments_booking_id" ON "public"."payments" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "idx_payments_contract_id" ON "public"."payments" USING "btree" ("contract_id") WHERE ("contract_id" IS NOT NULL);



CREATE INDEX "idx_payments_idempotency_key" ON "public"."payments" USING "btree" ("idempotency_key");



CREATE INDEX "idx_pipeline_notes_submission" ON "public"."submission_pipeline_notes" USING "btree" ("submission_id");



CREATE INDEX "idx_pipeline_notes_workspace" ON "public"."submission_pipeline_notes" USING "btree" ("workspace_id");



CREATE INDEX "idx_plan_settings_history_changed_at" ON "public"."plan_settings_history" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_plan_settings_history_plan_key" ON "public"."plan_settings_history" USING "btree" ("plan_key");



CREATE INDEX "idx_pres_cands_presentation" ON "public"."workspace_presentation_candidates" USING "btree" ("presentation_id");



CREATE INDEX "idx_presentations_job" ON "public"."workspace_presentations" USING "btree" ("job_id");



CREATE UNIQUE INDEX "idx_presentations_token" ON "public"."workspace_presentations" USING "btree" ("token");



CREATE INDEX "idx_presentations_workspace" ON "public"."workspace_presentations" USING "btree" ("workspace_id");



CREATE INDEX "idx_profiles_mp_customer_id" ON "public"."profiles" USING "btree" ("mp_customer_id");



CREATE INDEX "idx_support_conv_last_msg" ON "public"."support_conversations" USING "btree" ("last_message_at" DESC);



CREATE INDEX "idx_support_conv_status" ON "public"."support_conversations" USING "btree" ("status");



CREATE INDEX "idx_support_conv_user" ON "public"."support_conversations" USING "btree" ("user_id");



CREATE INDEX "idx_support_msg_conv" ON "public"."support_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_webhook_events_event_id" ON "public"."webhook_events" USING "btree" ("event_id");



CREATE INDEX "idx_webhook_events_processed" ON "public"."webhook_events" USING "btree" ("processed");



CREATE INDEX "idx_webhook_events_received_at" ON "public"."webhook_events" USING "btree" ("received_at");



CREATE INDEX "job_invite_links_job_idx" ON "public"."job_invite_links" USING "btree" ("job_id");



CREATE INDEX "job_invite_links_token_idx" ON "public"."job_invite_links" USING "btree" ("token");



CREATE INDEX "job_invite_links_workspace_idx" ON "public"."job_invite_links" USING "btree" ("workspace_id") WHERE ("workspace_id" IS NOT NULL);



CREATE INDEX "job_invites_agency_id_idx" ON "public"."job_invites" USING "btree" ("agency_id");



CREATE INDEX "job_invites_job_id_idx" ON "public"."job_invites" USING "btree" ("job_id");



CREATE UNIQUE INDEX "job_invites_job_talent_uniq" ON "public"."job_invites" USING "btree" ("job_id", "talent_id");



CREATE INDEX "job_invites_talent_id_idx" ON "public"."job_invites" USING "btree" ("talent_id");



CREATE INDEX "jobs_workspace_id_idx" ON "public"."jobs" USING "btree" ("workspace_id") WHERE ("workspace_id" IS NOT NULL);



CREATE UNIQUE INDEX "notifications_idempotency_key_idx" ON "public"."notifications" USING "btree" ("idempotency_key");



CREATE INDEX "premium_agent_invites_email_idx" ON "public"."premium_agent_invites" USING "btree" ("invited_email");



CREATE INDEX "premium_agent_invites_token_idx" ON "public"."premium_agent_invites" USING "btree" ("token");



CREATE INDEX "premium_agent_invites_workspace_idx" ON "public"."premium_agent_invites" USING "btree" ("workspace_id");



CREATE INDEX "premium_agent_wallet_transactio_workspace_id_agent_user_id_idx1" ON "public"."premium_agent_wallet_transactions" USING "btree" ("workspace_id", "agent_user_id");



CREATE INDEX "premium_agent_wallet_transaction_workspace_id_agent_user_id_idx" ON "public"."premium_agent_wallet_transactions" USING "btree" ("workspace_id", "agent_user_id");



CREATE INDEX "premium_agent_wallet_transactions_related_job_id_idx" ON "public"."premium_agent_wallet_transactions" USING "btree" ("related_job_id") WHERE ("related_job_id" IS NOT NULL);



CREATE INDEX "premium_agent_wallet_transactions_related_job_id_idx1" ON "public"."premium_agent_wallet_transactions" USING "btree" ("related_job_id") WHERE ("related_job_id" IS NOT NULL);



CREATE INDEX "premium_agent_wallet_transactions_workspace_id_idx" ON "public"."premium_agent_wallet_transactions" USING "btree" ("workspace_id");



CREATE INDEX "premium_agent_wallet_transactions_workspace_id_idx1" ON "public"."premium_agent_wallet_transactions" USING "btree" ("workspace_id");



CREATE UNIQUE INDEX "premium_workspace_members_active_unique" ON "public"."premium_workspace_members" USING "btree" ("workspace_id", "user_id") WHERE ("removed_at" IS NULL);



CREATE INDEX "premium_workspace_members_user_idx" ON "public"."premium_workspace_members" USING "btree" ("user_id");



CREATE INDEX "premium_workspace_members_workspace_idx" ON "public"."premium_workspace_members" USING "btree" ("workspace_id");



CREATE UNIQUE INDEX "premium_workspace_talents_active_uidx" ON "public"."premium_workspace_talents" USING "btree" ("workspace_id", "talent_user_id") WHERE ("removed_at" IS NULL);



CREATE INDEX "premium_workspace_talents_talent_user_id_idx" ON "public"."premium_workspace_talents" USING "btree" ("talent_user_id");



CREATE INDEX "premium_workspace_talents_workspace_id_idx" ON "public"."premium_workspace_talents" USING "btree" ("workspace_id");



CREATE INDEX "premium_workspaces_agency_idx" ON "public"."premium_workspaces" USING "btree" ("agency_id") WHERE ("agency_id" IS NOT NULL);



CREATE UNIQUE INDEX "premium_workspaces_owner_active_unique" ON "public"."premium_workspaces" USING "btree" ("owner_user_id") WHERE (("deleted_at" IS NULL) AND ("status" <> ALL (ARRAY['cancelled'::"text", 'deleted'::"text"])));



CREATE INDEX "premium_workspaces_owner_idx" ON "public"."premium_workspaces" USING "btree" ("owner_user_id");



CREATE UNIQUE INDEX "profiles_stripe_customer_id_uniq" ON "public"."profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "profiles_stripe_subscription_id_idx" ON "public"."profiles" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "referral_invites_job_email_idx" ON "public"."referral_invites" USING "btree" ("job_id", "lower"("referred_email")) WHERE (("job_id" IS NOT NULL) AND ("referred_email" IS NOT NULL));



CREATE INDEX "referral_invites_job_user_idx" ON "public"."referral_invites" USING "btree" ("job_id", "referred_user_id") WHERE (("job_id" IS NOT NULL) AND ("referred_user_id" IS NOT NULL));



CREATE INDEX "referral_invites_token_job_idx" ON "public"."referral_invites" USING "btree" ("token", "job_id");



CREATE UNIQUE INDEX "referral_invites_token_key" ON "public"."referral_invites" USING "btree" ("token");



CREATE INDEX "saved_cards_user_id_idx" ON "public"."saved_cards" USING "btree" ("user_id");



CREATE INDEX "support_conversations_archived_at_idx" ON "public"."support_conversations" USING "btree" ("archived_at") WHERE ("archived_at" IS NOT NULL);



CREATE INDEX "talent_availability_date_idx" ON "public"."talent_availability" USING "btree" ("date");



CREATE INDEX "talent_availability_talent_id_idx" ON "public"."talent_availability" USING "btree" ("talent_id");



CREATE INDEX "talent_profiles_age_idx" ON "public"."talent_profiles" USING "btree" ("age");



CREATE INDEX "talent_profiles_deleted_at_idx" ON "public"."talent_profiles" USING "btree" ("deleted_at");



CREATE INDEX "talent_profiles_gender_idx" ON "public"."talent_profiles" USING "btree" ("gender");



CREATE INDEX "talent_profiles_instagram_idx" ON "public"."talent_profiles" USING "btree" ("instagram");



CREATE INDEX "talent_profiles_marketplace_visible_idx" ON "public"."talent_profiles" USING "btree" ("marketplace_visible") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "talent_profiles_stripe_account_id_uniq" ON "public"."talent_profiles" USING "btree" ("stripe_account_id") WHERE ("stripe_account_id" IS NOT NULL);



CREATE INDEX "terms_acceptances_terms_version_idx" ON "public"."terms_acceptances" USING "btree" ("terms_version");



CREATE INDEX "terms_acceptances_user_id_idx" ON "public"."terms_acceptances" USING "btree" ("user_id");



CREATE UNIQUE INDEX "terms_acceptances_user_version_uniq" ON "public"."terms_acceptances" USING "btree" ("user_id", "terms_version");



CREATE UNIQUE INDEX "uq_pawt_commitment_per_job" ON "public"."premium_agent_wallet_transactions" USING "btree" ("related_job_id") WHERE (("type" = 'job_commitment'::"text") AND ("related_job_id" IS NOT NULL) AND ("status" = 'completed'::"text"));



CREATE UNIQUE INDEX "uq_pawt_settlement_per_contract" ON "public"."premium_agent_wallet_transactions" USING "btree" ("related_contract_id") WHERE (("type" = 'job_settlement'::"text") AND ("related_contract_id" IS NOT NULL));



CREATE INDEX "wallet_funding_sources_charge_idx" ON "public"."wallet_funding_sources" USING "btree" ("stripe_charge_id");



CREATE INDEX "wallet_funding_sources_contract_idx" ON "public"."wallet_funding_sources" USING "btree" ("related_contract_id", "status", "created_at", "id");



CREATE INDEX "wallet_funding_sources_owner_status_idx" ON "public"."wallet_funding_sources" USING "btree" ("current_owner_user_id", "status", "created_at", "id");



CREATE INDEX "wallet_funding_sources_upstream_idx" ON "public"."wallet_funding_sources" USING "btree" ("upstream_funding_source_id");



CREATE INDEX "wallet_funding_sources_user_created_idx" ON "public"."wallet_funding_sources" USING "btree" ("user_id", "created_at", "id");



CREATE UNIQUE INDEX "wallet_idempotency_key_idx" ON "public"."wallet_transactions" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "wallet_transactions_asaas_payment_id_idx" ON "public"."wallet_transactions" USING "btree" ("asaas_payment_id");



CREATE UNIQUE INDEX "wallet_transactions_asaas_payment_id_uniq" ON "public"."wallet_transactions" USING "btree" ("asaas_payment_id") WHERE ("asaas_payment_id" IS NOT NULL);



CREATE INDEX "wallet_transactions_asaas_transfer_id_idx" ON "public"."wallet_transactions" USING "btree" ("asaas_transfer_id");



CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_idx" ON "public"."wallet_transactions" USING "btree" ("idempotency_key");



CREATE UNIQUE INDEX "wallet_transactions_payment_id_unique_idx" ON "public"."wallet_transactions" USING "btree" ("payment_id");



CREATE UNIQUE INDEX "wallet_transactions_provider_transfer_id_uniq" ON "public"."wallet_transactions" USING "btree" ("provider_transfer_id") WHERE ("provider_transfer_id" IS NOT NULL);



CREATE INDEX "wallet_withdrawal_allocations_withdrawal_idx" ON "public"."wallet_withdrawal_source_allocations" USING "btree" ("withdrawal_transaction_id", "created_at", "id");



CREATE OR REPLACE TRIGGER "contract_disputes_updated_at_trigger" BEFORE UPDATE ON "public"."contract_disputes" FOR EACH ROW EXECUTE FUNCTION "public"."set_contract_disputes_updated_at"();



CREATE OR REPLACE TRIGGER "trg_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_payments_updated_at"();



CREATE OR REPLACE TRIGGER "trg_premium_workspace_members_updated_at" BEFORE UPDATE ON "public"."premium_workspace_members" FOR EACH ROW EXECUTE FUNCTION "public"."_set_updated_at_premium"();



CREATE OR REPLACE TRIGGER "trg_premium_workspaces_updated_at" BEFORE UPDATE ON "public"."premium_workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."_set_updated_at_premium"();



CREATE OR REPLACE TRIGGER "trg_prevent_privilege_escalation" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_privilege_escalation"();



CREATE OR REPLACE TRIGGER "trg_sync_agency_talent_history" AFTER UPDATE ON "public"."bookings" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") OR ("old"."cancelled_by" IS DISTINCT FROM "new"."cancelled_by"))) EXECUTE FUNCTION "public"."sync_agency_talent_history"();



CREATE OR REPLACE TRIGGER "trg_sync_booking_on_contract_update" AFTER UPDATE ON "public"."contracts" FOR EACH ROW EXECUTE FUNCTION "public"."sync_booking_on_contract_update"();



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agency_plans"
    ADD CONSTRAINT "agency_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "public"."talent_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_talent_user_id_fkey" FOREIGN KEY ("talent_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contract_dispute_notes"
    ADD CONSTRAINT "contract_dispute_notes_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_dispute_notes"
    ADD CONSTRAINT "contract_dispute_notes_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "public"."contract_disputes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_disputes"
    ADD CONSTRAINT "contract_disputes_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_disputes"
    ADD CONSTRAINT "contract_disputes_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_disputes"
    ADD CONSTRAINT "contract_disputes_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contract_disputes"
    ADD CONSTRAINT "contract_disputes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."premium_workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."premium_workspaces"("id");



ALTER TABLE ONLY "public"."job_invite_links"
    ADD CONSTRAINT "job_invite_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."job_invite_links"
    ADD CONSTRAINT "job_invite_links_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_invite_links"
    ADD CONSTRAINT "job_invite_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."premium_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_invites"
    ADD CONSTRAINT "job_invites_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_invites"
    ADD CONSTRAINT "job_invites_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_invites"
    ADD CONSTRAINT "job_invites_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."premium_workspaces"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."premium_agent_invites"
    ADD CONSTRAINT "premium_agent_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."premium_agent_invites"
    ADD CONSTRAINT "premium_agent_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."premium_agent_invites"
    ADD CONSTRAINT "premium_agent_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."premium_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."premium_agent_wallet_transactions"
    ADD CONSTRAINT "premium_agent_wallet_transactions_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."premium_agent_wallet_transactions"
    ADD CONSTRAINT "premium_agent_wallet_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."premium_agent_wallet_transactions"
    ADD CONSTRAINT "premium_agent_wallet_transactions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."premium_agent_wallet_transactions"
    ADD CONSTRAINT "premium_agent_wallet_transactions_related_contract_id_fkey" FOREIGN KEY ("related_contract_id") REFERENCES "public"."contracts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."premium_agent_wallet_transactions"
    ADD CONSTRAINT "premium_agent_wallet_transactions_related_job_id_fkey" FOREIGN KEY ("related_job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."premium_agent_wallet_transactions"
    ADD CONSTRAINT "premium_agent_wallet_transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."premium_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."premium_workspace_members"
    ADD CONSTRAINT "premium_workspace_members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."premium_workspace_members"
    ADD CONSTRAINT "premium_workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."premium_workspace_members"
    ADD CONSTRAINT "premium_workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."premium_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."premium_workspace_talents"
    ADD CONSTRAINT "premium_workspace_talents_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."premium_workspace_talents"
    ADD CONSTRAINT "premium_workspace_talents_talent_user_id_fkey" FOREIGN KEY ("talent_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."premium_workspace_talents"
    ADD CONSTRAINT "premium_workspace_talents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."premium_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."premium_workspaces"
    ADD CONSTRAINT "premium_workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presentation_feedback"
    ADD CONSTRAINT "presentation_feedback_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "public"."workspace_presentations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."presentation_feedback"
    ADD CONSTRAINT "presentation_feedback_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_cards"
    ADD CONSTRAINT "saved_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submission_pipeline_notes"
    ADD CONSTRAINT "submission_pipeline_notes_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_talent_user_id_fkey" FOREIGN KEY ("talent_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_conversations"
    ADD CONSTRAINT "support_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."talent_availability"
    ADD CONSTRAINT "talent_availability_talent_id_fkey" FOREIGN KEY ("talent_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."talent_profiles"
    ADD CONSTRAINT "talent_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."terms_acceptances"
    ADD CONSTRAINT "terms_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_funding_sources"
    ADD CONSTRAINT "wallet_funding_sources_current_owner_user_id_fkey" FOREIGN KEY ("current_owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_funding_sources"
    ADD CONSTRAINT "wallet_funding_sources_original_payer_user_id_fkey" FOREIGN KEY ("original_payer_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_funding_sources"
    ADD CONSTRAINT "wallet_funding_sources_related_contract_id_fkey" FOREIGN KEY ("related_contract_id") REFERENCES "public"."contracts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_funding_sources"
    ADD CONSTRAINT "wallet_funding_sources_source_wallet_transaction_id_fkey" FOREIGN KEY ("source_wallet_transaction_id") REFERENCES "public"."wallet_transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_funding_sources"
    ADD CONSTRAINT "wallet_funding_sources_upstream_funding_source_id_fkey" FOREIGN KEY ("upstream_funding_source_id") REFERENCES "public"."wallet_funding_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_funding_sources"
    ADD CONSTRAINT "wallet_funding_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."wallet_withdrawal_source_allocations"
    ADD CONSTRAINT "wallet_withdrawal_source_allo_source_wallet_transaction_id_fkey" FOREIGN KEY ("source_wallet_transaction_id") REFERENCES "public"."wallet_transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_withdrawal_source_allocations"
    ADD CONSTRAINT "wallet_withdrawal_source_allocat_withdrawal_transaction_id_fkey" FOREIGN KEY ("withdrawal_transaction_id") REFERENCES "public"."wallet_transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_withdrawal_source_allocations"
    ADD CONSTRAINT "wallet_withdrawal_source_allocations_funding_source_id_fkey" FOREIGN KEY ("funding_source_id") REFERENCES "public"."wallet_funding_sources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_presentation_candidates"
    ADD CONSTRAINT "workspace_presentation_candidates_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "public"."workspace_presentations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_presentation_candidates"
    ADD CONSTRAINT "workspace_presentation_candidates_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_presentations"
    ADD CONSTRAINT "workspace_presentations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



CREATE POLICY "Service role can do everything on profiles" ON "public"."profiles" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on agencies" ON "public"."agencies" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on agency_plans" ON "public"."agency_plans" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on bookings" ON "public"."bookings" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on contracts" ON "public"."contracts" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on jobs" ON "public"."jobs" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on notifications" ON "public"."notifications" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on profiles" ON "public"."profiles" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on submissions" ON "public"."submissions" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on talent_profiles" ON "public"."talent_profiles" USING (true) WITH CHECK (true);



CREATE POLICY "Users can read own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can read own terms acceptance" ON "public"."terms_acceptances" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_nav_seen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_notification_broadcasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agency_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agency_talent_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asaas_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_test_payments_20260501" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_test_wallet_transactions_20260501" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_dispute_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_disputes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny_client_delete_wallet_transactions" ON "public"."wallet_transactions" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "deny_client_insert_wallet_transactions" ON "public"."wallet_transactions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "deny_client_update_wallet_transactions" ON "public"."wallet_transactions" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "dispute_insert_authenticated" ON "public"."contract_disputes" FOR INSERT TO "authenticated" WITH CHECK (("opened_by_user_id" = "auth"."uid"()));



CREATE POLICY "dispute_read_own" ON "public"."contract_disputes" FOR SELECT TO "authenticated" USING (("opened_by_user_id" = "auth"."uid"()));



CREATE POLICY "jil_workspace_member_select" ON "public"."job_invite_links" FOR SELECT USING ((("workspace_id" IS NOT NULL) AND ("workspace_id" IN ( SELECT "premium_workspace_members"."workspace_id"
   FROM "public"."premium_workspace_members"
  WHERE (("premium_workspace_members"."user_id" = "auth"."uid"()) AND ("premium_workspace_members"."status" = 'active'::"text"))))));



ALTER TABLE "public"."job_invite_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_invites_agency_manage_own" ON "public"."job_invites" TO "authenticated" USING (("agency_id" = "auth"."uid"())) WITH CHECK (("agency_id" = "auth"."uid"()));



CREATE POLICY "job_invites_talent_read_own" ON "public"."job_invites" FOR SELECT TO "authenticated" USING (("talent_id" = "auth"."uid"()));



ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pai_workspace_owner_select" ON "public"."premium_agent_invites" FOR SELECT USING (("workspace_id" IN ( SELECT "premium_workspace_members"."workspace_id"
   FROM "public"."premium_workspace_members"
  WHERE (("premium_workspace_members"."user_id" = "auth"."uid"()) AND ("premium_workspace_members"."role" = 'owner'::"text") AND ("premium_workspace_members"."status" = 'active'::"text")))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_settings_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premium_agent_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premium_agent_wallet_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premium_workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premium_workspace_talents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."premium_workspaces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."presentation_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "pw_member_select" ON "public"."premium_workspaces" FOR SELECT USING (("id" IN ( SELECT "premium_workspace_members"."workspace_id"
   FROM "public"."premium_workspace_members"
  WHERE (("premium_workspace_members"."user_id" = "auth"."uid"()) AND ("premium_workspace_members"."status" = 'active'::"text")))));



CREATE POLICY "pwm_self_select" ON "public"."premium_workspace_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."referral_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_invites_referrer_select" ON "public"."referral_invites" FOR SELECT USING (("auth"."uid"() = "referrer_id"));



ALTER TABLE "public"."saved_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_cards_delete_own" ON "public"."saved_cards" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "saved_cards_select_own" ON "public"."saved_cards" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "service_role_only" ON "public"."admin_notification_broadcasts" USING (false) WITH CHECK (false);



CREATE POLICY "service_role_only" ON "public"."plan_settings_history" USING (false) WITH CHECK (false);



ALTER TABLE "public"."stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submission_pipeline_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_conv_own" ON "public"."support_conversations" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."support_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_msg_insert_own" ON "public"."support_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("sender_role" = 'user'::"text") AND ("conversation_id" IN ( SELECT "support_conversations"."id"
   FROM "public"."support_conversations"
  WHERE ("support_conversations"."user_id" = "auth"."uid"())))));



CREATE POLICY "support_msg_read_own" ON "public"."support_messages" FOR SELECT USING (("conversation_id" IN ( SELECT "support_conversations"."id"
   FROM "public"."support_conversations"
  WHERE ("support_conversations"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."talent_availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "talent_availability_manage_own" ON "public"."talent_availability" TO "authenticated" USING (("talent_id" = "auth"."uid"())) WITH CHECK (("talent_id" = "auth"."uid"()));



ALTER TABLE "public"."talent_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "talent_read_own_contracts_by_user_id" ON "public"."contracts" FOR SELECT TO "authenticated" USING ((("talent_user_id" = "auth"."uid"()) OR ("talent_id" = "auth"."uid"())));



ALTER TABLE "public"."terms_acceptances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_funding_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_transactions_select_own" ON "public"."wallet_transactions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."wallet_withdrawal_source_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_presentation_candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_presentations" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_set_updated_at_premium"() TO "anon";
GRANT ALL ON FUNCTION "public"."_set_updated_at_premium"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_set_updated_at_premium"() TO "service_role";



GRANT ALL ON FUNCTION "public"."allocate_wallet_withdrawal_sources"("p_user_id" "uuid", "p_withdrawal_transaction_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."allocate_wallet_withdrawal_sources"("p_user_id" "uuid", "p_withdrawal_transaction_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."allocate_wallet_withdrawal_sources"("p_user_id" "uuid", "p_withdrawal_transaction_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_agency_withdrawal"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_agency_withdrawal"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_agency_withdrawal"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_contract_safe"("p_contract_id" "uuid", "p_agency_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_contract_safe"("p_contract_id" "uuid", "p_agency_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_contract_safe"("p_contract_id" "uuid", "p_agency_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_booking_escrow"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_booking_escrow"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_booking_escrow"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_contract_stripe_funding"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric, "p_payment_intent_id" "text", "p_charge_id" "text", "p_checkout_session_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_contract_stripe_funding"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric, "p_payment_intent_id" "text", "p_charge_id" "text", "p_checkout_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_contract_stripe_funding"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric, "p_payment_intent_id" "text", "p_charge_id" "text", "p_checkout_session_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."credit_referral_commission"("p_referrer_id" "uuid", "p_invite_id" "uuid", "p_contract_id" "uuid", "p_commission" numeric, "p_job_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."credit_referral_commission"("p_referrer_id" "uuid", "p_invite_id" "uuid", "p_contract_id" "uuid", "p_commission" numeric, "p_job_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_referral_commission"("p_referrer_id" "uuid", "p_invite_id" "uuid", "p_contract_id" "uuid", "p_commission" numeric, "p_job_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."credit_stripe_wallet_deposit"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_payment_id" "text", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."credit_stripe_wallet_deposit"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_payment_id" "text", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_stripe_wallet_deposit"("p_user_id" "uuid", "p_transaction_id" "uuid", "p_payment_id" "text", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."credit_wallet_deposit"("p_user_id" "uuid", "p_payment_id" "text", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."credit_wallet_deposit"("p_user_id" "uuid", "p_payment_id" "text", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_wallet_deposit"("p_user_id" "uuid", "p_payment_id" "text", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."fail_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text", "p_provider_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fail_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text", "p_provider_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fail_wallet_withdrawal"("p_transaction_id" "uuid", "p_reason" "text", "p_provider_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_contract_platform_revenue"("p_contract_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_contract_platform_revenue"("p_contract_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_contract_platform_revenue"("p_contract_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_auto_withdrawable_balance"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_auto_withdrawable_balance"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_auto_withdrawable_balance"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_wallet_balance"("p_user_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_agency_withdrawal_paid"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_agency_withdrawal_paid"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_agency_withdrawal_paid"("p_tx_id" "uuid", "p_admin_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_wallet_withdrawal_paid"("p_transaction_id" "uuid", "p_provider" "text", "p_admin_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_wallet_withdrawal_paid"("p_transaction_id" "uuid", "p_provider" "text", "p_admin_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_wallet_withdrawal_paid"("p_transaction_id" "uuid", "p_provider" "text", "p_admin_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_privilege_escalation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_privilege_escalation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_privilege_escalation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."register_wallet_funding_source"("p_user_id" "uuid", "p_source_wallet_transaction_id" "uuid", "p_stripe_charge_id" "text", "p_stripe_payment_intent_id" "text", "p_source_type" "text", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."register_wallet_funding_source"("p_user_id" "uuid", "p_source_wallet_transaction_id" "uuid", "p_stripe_charge_id" "text", "p_stripe_payment_intent_id" "text", "p_source_type" "text", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_wallet_funding_source"("p_user_id" "uuid", "p_source_wallet_transaction_id" "uuid", "p_stripe_charge_id" "text", "p_stripe_payment_intent_id" "text", "p_source_type" "text", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."release_payment_payout"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."release_payment_payout"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_payment_payout"("p_contract_id" "uuid", "p_agency_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."request_agency_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_fee_rate" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."request_agency_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_fee_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_agency_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_fee_rate" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."request_talent_withdrawal"("p_user_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."request_talent_withdrawal"("p_user_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_talent_withdrawal"("p_user_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."request_wallet_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_kind" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_wallet_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_wallet_withdrawal"("p_user_id" "uuid", "p_amount" numeric, "p_kind" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_contract_dispute"("p_dispute_id" "uuid", "p_admin_user_id" "uuid", "p_action" "text", "p_admin_note" "text", "p_talent_amount" numeric, "p_agency_refund_amount" numeric, "p_note_visibility" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_contract_dispute"("p_dispute_id" "uuid", "p_admin_user_id" "uuid", "p_action" "text", "p_admin_note" "text", "p_talent_amount" numeric, "p_agency_refund_amount" numeric, "p_note_visibility" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_contract_dispute"("p_dispute_id" "uuid", "p_admin_user_id" "uuid", "p_action" "text", "p_admin_note" "text", "p_talent_amount" numeric, "p_agency_refund_amount" numeric, "p_note_visibility" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_wallet_withdrawal_sources"("p_withdrawal_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_wallet_withdrawal_sources"("p_withdrawal_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_wallet_withdrawal_sources"("p_withdrawal_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_contract_disputes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_contract_disputes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_contract_disputes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_payments_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_payments_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_payments_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_agency_talent_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_agency_talent_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_agency_talent_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_booking_on_contract_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_booking_on_contract_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_booking_on_contract_update"() TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_nav_seen" TO "anon";
GRANT ALL ON TABLE "public"."admin_nav_seen" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_nav_seen" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notification_broadcasts" TO "anon";
GRANT ALL ON TABLE "public"."admin_notification_broadcasts" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notification_broadcasts" TO "service_role";



GRANT ALL ON TABLE "public"."agencies" TO "anon";
GRANT ALL ON TABLE "public"."agencies" TO "authenticated";
GRANT ALL ON TABLE "public"."agencies" TO "service_role";



GRANT ALL ON TABLE "public"."agency_plans" TO "anon";
GRANT ALL ON TABLE "public"."agency_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."agency_plans" TO "service_role";



GRANT ALL ON TABLE "public"."agency_talent_history" TO "anon";
GRANT ALL ON TABLE "public"."agency_talent_history" TO "authenticated";
GRANT ALL ON TABLE "public"."agency_talent_history" TO "service_role";



GRANT ALL ON TABLE "public"."applications" TO "anon";
GRANT ALL ON TABLE "public"."applications" TO "authenticated";
GRANT ALL ON TABLE "public"."applications" TO "service_role";



GRANT ALL ON TABLE "public"."asaas_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."asaas_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."asaas_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."backup_test_payments_20260501" TO "anon";
GRANT ALL ON TABLE "public"."backup_test_payments_20260501" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_test_payments_20260501" TO "service_role";



GRANT ALL ON TABLE "public"."backup_test_wallet_transactions_20260501" TO "anon";
GRANT ALL ON TABLE "public"."backup_test_wallet_transactions_20260501" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_test_wallet_transactions_20260501" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."contract_dispute_notes" TO "anon";
GRANT ALL ON TABLE "public"."contract_dispute_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_dispute_notes" TO "service_role";



GRANT ALL ON TABLE "public"."contract_disputes" TO "anon";
GRANT ALL ON TABLE "public"."contract_disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_disputes" TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON TABLE "public"."job_invite_links" TO "anon";
GRANT ALL ON TABLE "public"."job_invite_links" TO "authenticated";
GRANT ALL ON TABLE "public"."job_invite_links" TO "service_role";



GRANT ALL ON TABLE "public"."job_invites" TO "anon";
GRANT ALL ON TABLE "public"."job_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."job_invites" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."plan_settings" TO "anon";
GRANT ALL ON TABLE "public"."plan_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_settings" TO "service_role";



GRANT ALL ON TABLE "public"."plan_settings_history" TO "anon";
GRANT ALL ON TABLE "public"."plan_settings_history" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_settings_history" TO "service_role";



GRANT ALL ON TABLE "public"."platform_balance" TO "anon";
GRANT ALL ON TABLE "public"."platform_balance" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_balance" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."premium_agent_invites" TO "anon";
GRANT ALL ON TABLE "public"."premium_agent_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_agent_invites" TO "service_role";



GRANT ALL ON TABLE "public"."premium_agent_wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."premium_agent_wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_agent_wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."premium_workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."premium_workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."premium_workspace_talents" TO "anon";
GRANT ALL ON TABLE "public"."premium_workspace_talents" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_workspace_talents" TO "service_role";



GRANT ALL ON TABLE "public"."premium_workspaces" TO "anon";
GRANT ALL ON TABLE "public"."premium_workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."premium_workspaces" TO "service_role";



GRANT ALL ON TABLE "public"."presentation_feedback" TO "anon";
GRANT ALL ON TABLE "public"."presentation_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."presentation_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."referral_invites" TO "anon";
GRANT ALL ON TABLE "public"."referral_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_invites" TO "service_role";



GRANT ALL ON TABLE "public"."saved_cards" TO "anon";
GRANT ALL ON TABLE "public"."saved_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_cards" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."submission_pipeline_notes" TO "anon";
GRANT ALL ON TABLE "public"."submission_pipeline_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."submission_pipeline_notes" TO "service_role";



GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON TABLE "public"."support_conversations" TO "anon";
GRANT ALL ON TABLE "public"."support_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."support_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."support_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_messages" TO "service_role";



GRANT ALL ON TABLE "public"."talent_availability" TO "anon";
GRANT ALL ON TABLE "public"."talent_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."talent_availability" TO "service_role";



GRANT ALL ON TABLE "public"."talent_profiles" TO "anon";
GRANT ALL ON TABLE "public"."talent_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."talent_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."terms_acceptances" TO "anon";
GRANT ALL ON TABLE "public"."terms_acceptances" TO "authenticated";
GRANT ALL ON TABLE "public"."terms_acceptances" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_funding_sources" TO "anon";
GRANT ALL ON TABLE "public"."wallet_funding_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_funding_sources" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_withdrawal_source_allocations" TO "anon";
GRANT ALL ON TABLE "public"."wallet_withdrawal_source_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_withdrawal_source_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_presentation_candidates" TO "anon";
GRANT ALL ON TABLE "public"."workspace_presentation_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_presentation_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_presentations" TO "anon";
GRANT ALL ON TABLE "public"."workspace_presentations" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_presentations" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







