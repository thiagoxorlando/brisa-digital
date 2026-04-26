-- Financial security hardening pass — 2026-04-25
-- Addresses:
--   1. Role/wallet escalation via client-side profile UPDATE
--   2. fee_rate bounds validation in request_agency_withdrawal RPC
--   3. Explicit write-deny on wallet_transactions for authenticated role

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TRIGGER: prevent role/wallet_balance escalation via Supabase client
--
-- The existing "profiles_self_update" RLS policy allows authenticated users to
-- UPDATE their own profile row, but doesn't restrict WHICH columns they can
-- change. Without this trigger, any authenticated user could issue:
--
--   UPDATE profiles SET role = 'admin' WHERE id = auth.uid()
--
-- This trigger blocks role and wallet_balance changes made with a user JWT
-- (auth.uid() IS NOT NULL). Service-role calls have no JWT so auth.uid() = NULL
-- and bypass this guard — all API-layer financial writes remain unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON profiles;

CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_privilege_escalation();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC: validate fee_rate bounds in request_agency_withdrawal
--
-- Previously, a caller could pass a negative p_fee_rate making v_net > p_amount.
-- The server always passes a fixed env var (0.03), but defence-in-depth requires
-- the RPC itself to reject invalid values.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION request_agency_withdrawal(
  p_user_id  uuid,
  p_amount   numeric,
  p_fee_rate numeric DEFAULT 0.03
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance    numeric(12,2);
  v_fee        numeric(12,2);
  v_net        numeric(12,2);
  v_remaining  numeric(12,2);
  v_idem_key   text;
  v_pix_type   text;
  v_pix_value  text;
BEGIN
  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Clamp fee_rate to [0, 1] — prevents negative net or net > amount
  IF p_fee_rate IS NULL OR p_fee_rate < 0 OR p_fee_rate > 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_fee_rate');
  END IF;

  SELECT pix_key_type, pix_key_value INTO v_pix_type, v_pix_value
  FROM agencies WHERE id = p_user_id;

  IF v_pix_type IS NULL OR v_pix_value IS NULL OR trim(v_pix_value) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pix_not_configured');
  END IF;

  -- Lock profile row — blocks concurrent withdrawal attempts
  SELECT wallet_balance INTO v_balance
  FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  END IF;

  v_fee       := round(p_amount * p_fee_rate, 2);
  v_net       := p_amount - v_fee;
  v_remaining := v_balance - p_amount;

  UPDATE profiles SET wallet_balance = v_remaining WHERE id = p_user_id;

  v_idem_key := 'withdraw_' || p_user_id::text || '_'
                || extract(epoch from clock_timestamp())::bigint::text;

  INSERT INTO wallet_transactions
    (user_id, type, amount, description, idempotency_key, status, fee_amount, net_amount)
  VALUES
    (p_user_id, 'withdrawal', p_amount, 'Saque solicitado', v_idem_key, 'pending', v_fee, v_net);

  RETURN jsonb_build_object(
    'ok',                true,
    'amount',            p_amount,
    'fee',               v_fee,
    'net_amount',        v_net,
    'remaining_balance', v_remaining
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Explicit write-deny on wallet_transactions for authenticated role
--
-- RLS is enabled on wallet_transactions and there are no existing permissive
-- INSERT/UPDATE/DELETE policies for the authenticated role, so these operations
-- are already denied by default. This adds RESTRICTIVE policies to make the
-- intent explicit, documented, and resilient to future policy additions.
--
-- SECURITY DEFINER functions (all withdrawal RPCs) run as the function owner
-- and bypass RLS entirely — they are unaffected by these policies.
-- Service-role API calls also bypass RLS.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallet_transactions'
      AND policyname = 'deny_client_insert_wallet_transactions'
  ) THEN
    CREATE POLICY "deny_client_insert_wallet_transactions"
      ON wallet_transactions
      AS RESTRICTIVE
      FOR INSERT
      TO authenticated
      WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallet_transactions'
      AND policyname = 'deny_client_update_wallet_transactions'
  ) THEN
    CREATE POLICY "deny_client_update_wallet_transactions"
      ON wallet_transactions
      AS RESTRICTIVE
      FOR UPDATE
      TO authenticated
      USING (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'wallet_transactions'
      AND policyname = 'deny_client_delete_wallet_transactions'
  ) THEN
    CREATE POLICY "deny_client_delete_wallet_transactions"
      ON wallet_transactions
      AS RESTRICTIVE
      FOR DELETE
      TO authenticated
      USING (false);
  END IF;
END $$;
