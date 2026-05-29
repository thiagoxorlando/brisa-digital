-- Track Stripe transfer/payout ids and reconciliation state for automatic withdrawals.

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS provider_payout_id text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS needs_admin_review boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION mark_wallet_withdrawal_paid(
  p_transaction_id uuid,
  p_provider text,
  p_admin_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION fail_wallet_withdrawal(
  p_transaction_id uuid,
  p_reason text,
  p_provider_status text DEFAULT 'failed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
