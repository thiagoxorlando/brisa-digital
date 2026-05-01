-- Stripe-funded wallet sources for Brazil Connect withdrawals.
-- Links wallet credits back to Stripe charges so withdrawals can use
-- source_transaction safely and atomically.

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text;

CREATE TABLE IF NOT EXISTS wallet_funding_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_wallet_transaction_id uuid NOT NULL REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  stripe_charge_id text NOT NULL,
  stripe_payment_intent_id text,
  source_type text NOT NULL,
  original_amount numeric(12,2) NOT NULL,
  remaining_amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_wallet_transaction_id)
);

CREATE INDEX IF NOT EXISTS wallet_funding_sources_user_created_idx
  ON wallet_funding_sources(user_id, created_at, id);

CREATE INDEX IF NOT EXISTS wallet_funding_sources_charge_idx
  ON wallet_funding_sources(stripe_charge_id);

CREATE TABLE IF NOT EXISTS wallet_withdrawal_source_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_transaction_id uuid NOT NULL REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  funding_source_id uuid NOT NULL REFERENCES wallet_funding_sources(id) ON DELETE CASCADE,
  source_wallet_transaction_id uuid NOT NULL REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  stripe_charge_id text NOT NULL,
  allocated_amount numeric(12,2) NOT NULL,
  transfer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  UNIQUE (withdrawal_transaction_id, funding_source_id)
);

CREATE INDEX IF NOT EXISTS wallet_withdrawal_allocations_withdrawal_idx
  ON wallet_withdrawal_source_allocations(withdrawal_transaction_id, created_at, id);

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

  INSERT INTO wallet_funding_sources (
    user_id,
    source_wallet_transaction_id,
    stripe_charge_id,
    stripe_payment_intent_id,
    source_type,
    original_amount,
    remaining_amount
  )
  VALUES (
    p_user_id,
    p_source_wallet_transaction_id,
    trim(p_stripe_charge_id),
    NULLIF(trim(coalesce(p_stripe_payment_intent_id, '')), ''),
    coalesce(nullif(trim(coalesce(p_source_type, '')), ''), 'deposit'),
    v_amount,
    v_amount
  )
  ON CONFLICT (source_wallet_transaction_id) DO UPDATE
  SET
    stripe_charge_id = EXCLUDED.stripe_charge_id,
    stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, wallet_funding_sources.stripe_payment_intent_id),
    source_type = EXCLUDED.source_type
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
  v_available_total numeric(12,2);
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

  v_available_total := 0;

  FOR v_item IN
    SELECT remaining_amount
    FROM wallet_funding_sources
    WHERE user_id = p_user_id
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_available_total := round((v_available_total + v_item.remaining_amount)::numeric, 2);
  END LOOP;

  IF coalesce(v_available_total, 0) < v_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_funding_sources',
      'available', coalesce(v_available_total, 0),
      'required', v_amount
    );
  END IF;

  v_remaining_to_allocate := v_amount;

  FOR v_item IN
    SELECT id, source_wallet_transaction_id, stripe_charge_id, remaining_amount
    FROM wallet_funding_sources
    WHERE user_id = p_user_id
      AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_to_allocate <= 0;

    v_take := LEAST(v_item.remaining_amount, v_remaining_to_allocate);
    v_take := round(v_take, 2);

    IF v_take <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE wallet_funding_sources
    SET remaining_amount = round((remaining_amount - v_take)::numeric, 2)
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
    SET remaining_amount = round((remaining_amount + v_row.allocated_amount)::numeric, 2)
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
