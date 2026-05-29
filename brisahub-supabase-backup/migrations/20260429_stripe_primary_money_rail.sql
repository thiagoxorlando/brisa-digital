-- Stripe primary money rail for agency funds, plan billing, and job funding.
--
-- Real funds are collected by Stripe. BrisaHub wallet_balance remains an
-- internal ledger balance. Contract release still only credits the talent's
-- internal wallet; talent withdrawals send money through Stripe Connect later.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

CREATE INDEX IF NOT EXISTS profiles_stripe_subscription_id_idx
  ON profiles (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

CREATE INDEX IF NOT EXISTS contracts_stripe_checkout_session_idx
  ON contracts (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_transfer_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reference_id text;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_idempotency_key_idx
  ON wallet_transactions (idempotency_key);

CREATE OR REPLACE FUNCTION credit_stripe_wallet_deposit(
  p_user_id        uuid,
  p_transaction_id uuid,
  p_payment_id     text,
  p_amount         numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric(12,2);
  v_tx_id uuid;
  v_status text;
  v_provider_status text;
BEGIN
  IF p_user_id IS NULL OR p_transaction_id IS NULL OR p_payment_id IS NULL OR trim(p_payment_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_argument');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  v_amount := round(p_amount, 2);

  SELECT id, status, provider_status
  INTO v_tx_id, v_status, v_provider_status
  FROM wallet_transactions
  WHERE id = p_transaction_id
    AND user_id = p_user_id
    AND type = 'deposit'
  FOR UPDATE;

  IF v_tx_id IS NOT NULL THEN
    IF v_status = 'paid' OR v_provider_status = 'paid' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_processed', true,
        'wallet_balance_credited', false,
        'transaction_id', v_tx_id
      );
    END IF;

    UPDATE wallet_transactions
    SET
      amount = v_amount,
      description = 'Deposito via Stripe Checkout',
      payment_id = p_payment_id,
      provider = 'stripe',
      provider_status = 'paid',
      status = 'paid',
      processed_at = now(),
      idempotency_key = COALESCE(idempotency_key, 'stripe_wallet_deposit:' || p_payment_id)
    WHERE id = v_tx_id;
  ELSE
    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount,
      description,
      payment_id,
      provider,
      provider_status,
      status,
      processed_at,
      idempotency_key
    )
    VALUES (
      p_user_id,
      'deposit',
      v_amount,
      'Deposito via Stripe Checkout',
      p_payment_id,
      'stripe',
      'paid',
      'paid',
      now(),
      'stripe_wallet_deposit:' || p_payment_id
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_tx_id;

    IF v_tx_id IS NULL THEN
      SELECT id
      INTO v_tx_id
      FROM wallet_transactions
      WHERE payment_id = p_payment_id
         OR idempotency_key = 'stripe_wallet_deposit:' || p_payment_id
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'already_processed', true,
        'wallet_balance_credited', false,
        'transaction_id', v_tx_id
      );
    END IF;
  END IF;

  UPDATE profiles
  SET wallet_balance = round((COALESCE(wallet_balance, 0) + v_amount)::numeric, 2)
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'wallet_balance_credited', true,
    'transaction_id', v_tx_id,
    'amount', v_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION confirm_contract_stripe_funding(
  p_contract_id          uuid,
  p_agency_id            uuid,
  p_amount               numeric,
  p_payment_intent_id    text,
  p_charge_id            text DEFAULT NULL,
  p_checkout_session_id  text DEFAULT NULL
) RETURNS jsonb
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
    processed_at
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
    now()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_tx_id;

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
