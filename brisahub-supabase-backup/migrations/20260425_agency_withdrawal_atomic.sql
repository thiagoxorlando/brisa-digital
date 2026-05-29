-- Atomic agency withdrawal: FOR UPDATE lock + idempotency key prevents double-withdraw.
-- Called exclusively from /api/agencies/withdraw (service role).

CREATE OR REPLACE FUNCTION request_agency_withdrawal(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance  numeric(12,2);
  v_idem_key text;
BEGIN
  -- Lock the profile row for the duration of this transaction.
  -- Any concurrent call blocks here until this transaction commits,
  -- guaranteeing only one sees balance > 0.
  SELECT wallet_balance INTO v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_balance <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  END IF;

  -- Zero balance inside the same transaction that holds the lock.
  UPDATE profiles
  SET wallet_balance = 0
  WHERE id = p_user_id;

  v_idem_key := 'withdraw_' || p_user_id::text || '_'
                || extract(epoch from clock_timestamp())::bigint::text;

  INSERT INTO wallet_transactions (user_id, type, amount, description, idempotency_key)
  VALUES (p_user_id, 'withdrawal', v_balance, 'Saque solicitado', v_idem_key);

  RETURN jsonb_build_object('ok', true, 'amount', v_balance);
END;
$$;
