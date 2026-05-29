-- Creates (or replaces) the credit_stripe_wallet_deposit RPC.
-- Safe to run on databases that already have the function (CREATE OR REPLACE).
-- Idempotent: the function itself guards against double-credit via the status check + FOR UPDATE lock.

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
