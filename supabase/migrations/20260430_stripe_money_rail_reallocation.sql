-- Stripe-only money rail with internal wallet ownership reallocation.
-- All withdrawable balances must stay linked to Stripe charge-backed sources.

ALTER TABLE wallet_funding_sources
  DROP CONSTRAINT IF EXISTS wallet_funding_sources_source_wallet_transaction_id_key;

ALTER TABLE wallet_funding_sources
  ADD COLUMN IF NOT EXISTS original_payer_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_owner_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS related_contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS upstream_funding_source_id uuid REFERENCES wallet_funding_sources(id) ON DELETE SET NULL;

UPDATE wallet_funding_sources
SET
  original_payer_user_id = COALESCE(original_payer_user_id, user_id),
  current_owner_user_id = COALESCE(current_owner_user_id, user_id),
  source_type = CASE
    WHEN source_type = 'deposit' THEN 'wallet_deposit'
    WHEN source_type = 'referral_commission' THEN 'contract_payment'
    ELSE source_type
  END,
  status = CASE
    WHEN status = 'available' AND COALESCE(remaining_amount, 0) <= 0 THEN 'spent'
    ELSE status
  END
WHERE original_payer_user_id IS NULL
   OR current_owner_user_id IS NULL
   OR source_type IN ('deposit', 'referral_commission');

CREATE INDEX IF NOT EXISTS wallet_funding_sources_owner_status_idx
  ON wallet_funding_sources(current_owner_user_id, status, created_at, id);

CREATE INDEX IF NOT EXISTS wallet_funding_sources_contract_idx
  ON wallet_funding_sources(related_contract_id, status, created_at, id);

CREATE INDEX IF NOT EXISTS wallet_funding_sources_upstream_idx
  ON wallet_funding_sources(upstream_funding_source_id);

CREATE OR REPLACE FUNCTION get_auto_withdrawable_balance(
  p_user_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION register_wallet_funding_source(
  p_user_id uuid,
  p_source_wallet_transaction_id uuid,
  p_stripe_charge_id text,
  p_stripe_payment_intent_id text,
  p_source_type text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION allocate_wallet_withdrawal_sources(
  p_user_id uuid,
  p_withdrawal_transaction_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION restore_wallet_withdrawal_sources(
  p_withdrawal_transaction_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION confirm_booking_escrow(
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
  v_balance numeric(12,2);
  v_booking_id uuid;
  v_talent_id uuid;
  v_idem_key text := 'escrow_' || p_contract_id;
  v_tx_id uuid;
  v_available_total numeric(12,2) := 0;
  v_remaining numeric(12,2);
  v_item record;
  v_take numeric(12,2);
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

  FOR v_item IN
    SELECT remaining_amount
    FROM wallet_funding_sources
    WHERE current_owner_user_id = p_agency_id
      AND status = 'available'
      AND stripe_charge_id IS NOT NULL
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_available_total := round((v_available_total + v_item.remaining_amount)::numeric, 2);
  END LOOP;

  IF v_available_total < round(p_amount, 2) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_funding_sources',
      'required', round(p_amount, 2),
      'available', v_available_total
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

  v_remaining := round(p_amount, 2);

  FOR v_item IN
    SELECT id, stripe_charge_id, stripe_payment_intent_id, original_payer_user_id, remaining_amount
    FROM wallet_funding_sources
    WHERE current_owner_user_id = p_agency_id
      AND status = 'available'
      AND stripe_charge_id IS NOT NULL
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := round(LEAST(v_item.remaining_amount, v_remaining), 2);
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
      p_agency_id,
      COALESCE(v_item.original_payer_user_id, p_agency_id),
      p_agency_id,
      v_tx_id,
      v_item.stripe_charge_id,
      v_item.stripe_payment_intent_id,
      'escrow',
      v_take,
      v_take,
      'reserved',
      p_contract_id,
      v_item.id
    );

    v_remaining := round((v_remaining - v_take)::numeric, 2);
  END LOOP;

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

CREATE OR REPLACE FUNCTION confirm_contract_stripe_funding(
  p_contract_id uuid,
  p_agency_id uuid,
  p_amount numeric,
  p_payment_intent_id text,
  p_charge_id text DEFAULT NULL,
  p_checkout_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_remaining numeric(12,2);
  v_reserved_total numeric(12,2) := 0;
  v_item record;
  v_take numeric(12,2);
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

  FOR v_item IN
    SELECT remaining_amount
    FROM wallet_funding_sources
    WHERE related_contract_id = p_contract_id
      AND source_type = 'escrow'
      AND status = 'reserved'
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_reserved_total := round((v_reserved_total + v_item.remaining_amount)::numeric, 2);
  END LOOP;

  IF v_reserved_total < round(p_amount, 2) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_reserved_sources', 'available', v_reserved_total, 'required', round(p_amount, 2));
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

    v_remaining := round(p_amount, 2);

    FOR v_item IN
      SELECT id, stripe_charge_id, stripe_payment_intent_id, original_payer_user_id, remaining_amount
      FROM wallet_funding_sources
      WHERE related_contract_id = p_contract_id
        AND source_type = 'escrow'
        AND status = 'reserved'
        AND remaining_amount > 0
      ORDER BY created_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_take := round(LEAST(v_item.remaining_amount, v_remaining), 2);
      IF v_take <= 0 THEN
        CONTINUE;
      END IF;

      UPDATE wallet_funding_sources
      SET
        remaining_amount = round((remaining_amount - v_take)::numeric, 2),
        status = CASE
          WHEN round((remaining_amount - v_take)::numeric, 2) <= 0 THEN 'spent'
          ELSE 'reserved'
        END
      WHERE id = v_item.id;

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
        v_talent_id,
        COALESCE(v_item.original_payer_user_id, p_agency_id),
        v_talent_id,
        v_tx_id,
        v_item.stripe_charge_id,
        v_item.stripe_payment_intent_id,
        'contract_payment',
        v_take,
        v_take,
        'available',
        p_contract_id,
        v_item.id
      );

      v_remaining := round((v_remaining - v_take)::numeric, 2);
    END LOOP;
  END IF;

  UPDATE contracts SET status = 'paid', paid_at = now() WHERE id = p_contract_id;

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

CREATE OR REPLACE FUNCTION credit_referral_commission(
  p_referrer_id uuid,
  p_invite_id uuid,
  p_contract_id uuid,
  p_commission numeric,
  p_job_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idem_key text := 'referral_commission:' || p_invite_id || ':' || p_contract_id;
  v_tx_id uuid;
  v_remaining numeric(12,2);
  v_reserved_total numeric(12,2) := 0;
  v_item record;
  v_take numeric(12,2);
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE idempotency_key = v_idem_key) THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true);
  END IF;

  FOR v_item IN
    SELECT remaining_amount
    FROM wallet_funding_sources
    WHERE related_contract_id = p_contract_id
      AND source_type = 'escrow'
      AND status = 'reserved'
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_reserved_total := round((v_reserved_total + v_item.remaining_amount)::numeric, 2);
  END LOOP;

  IF p_commission > COALESCE(v_reserved_total, 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_reserved_sources', 'available', v_reserved_total, 'required', p_commission);
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

  v_remaining := round(p_commission, 2);

  FOR v_item IN
    SELECT id, stripe_charge_id, stripe_payment_intent_id, original_payer_user_id, remaining_amount
    FROM wallet_funding_sources
    WHERE related_contract_id = p_contract_id
      AND source_type = 'escrow'
      AND status = 'reserved'
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := round(LEAST(v_item.remaining_amount, v_remaining), 2);
    IF v_take <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE wallet_funding_sources
    SET
      remaining_amount = round((remaining_amount - v_take)::numeric, 2),
      status = CASE
        WHEN round((remaining_amount - v_take)::numeric, 2) <= 0 THEN 'spent'
        ELSE 'reserved'
      END
    WHERE id = v_item.id;

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
      p_referrer_id,
      COALESCE(v_item.original_payer_user_id, p_referrer_id),
      p_referrer_id,
      v_tx_id,
      v_item.stripe_charge_id,
      v_item.stripe_payment_intent_id,
      'contract_payment',
      v_take,
      v_take,
      'available',
      p_contract_id,
      v_item.id
    );

    v_remaining := round((v_remaining - v_take)::numeric, 2);
  END LOOP;

  UPDATE referral_invites
  SET
    status = 'commission_paid',
    commission_amount = p_commission,
    commission_paid_at = now(),
    paid_contract_id = p_contract_id,
    updated_at = now()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', true, 'already_processed', false, 'transaction_id', v_tx_id);
END;
$$;

CREATE OR REPLACE FUNCTION finalize_contract_platform_revenue(
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION cancel_contract_safe(
  p_contract_id uuid,
  p_agency_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
