-- ============================================================
-- Atomic wallet debit RPC (Phase 5A — P0-1 fix)
--
-- Replaces the two-step "read balance then UPDATE with .gte()"
-- pattern in app/api/asaas/withdraw/route.ts.
--
-- Uses SELECT ... FOR UPDATE to serialize concurrent withdrawal
-- requests on the same user_id, guaranteeing:
--   1. Balance is read at lock time, not at request start.
--   2. Only one withdrawal can decrement the balance at a time.
--   3. wallet_balance can never go below zero through this path.
--
-- Returns a jsonb object so the caller can handle each case:
--   { "success": true,  "new_balance": N }
--   { "success": false, "error": "insufficient_balance", "balance": N }
--   { "success": false, "error": "profile_not_found" }
-- ============================================================

CREATE OR REPLACE FUNCTION decrement_wallet_balance_if_sufficient(
  p_user_id uuid,
  p_amount   numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance     numeric;
  v_new_balance numeric;
BEGIN
  -- SELECT FOR UPDATE locks this profile row for the duration of the
  -- surrounding transaction. Any concurrent call for the same user_id
  -- will block at this point until we commit or rollback, eliminating
  -- the TOCTOU race in the previous application-level check.
  SELECT wallet_balance
  INTO   v_balance
  FROM   profiles
  WHERE  id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'profile_not_found'
    );
  END IF;

  -- Treat NULL as zero (should not occur in production, but be safe).
  v_balance := COALESCE(v_balance, 0::numeric);

  -- Refuse if funds are insufficient (numeric comparison, no float drift).
  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'insufficient_balance',
      'balance', v_balance
    );
  END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE profiles
  SET    wallet_balance = v_new_balance
  WHERE  id = p_user_id;

  RETURN jsonb_build_object(
    'success',     true,
    'new_balance', v_new_balance
  );
END;
$$;

COMMENT ON FUNCTION decrement_wallet_balance_if_sufficient(uuid, numeric) IS
  'Atomic wallet debit with row-level lock. Safe for concurrent withdrawal requests.';
