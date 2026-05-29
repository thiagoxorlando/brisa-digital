-- Atomically marks a pending withdrawal as paid.
-- Does NOT touch wallet_balance — balance was already deducted at request time.
CREATE OR REPLACE FUNCTION mark_agency_withdrawal_paid(
  p_tx_id    uuid,
  p_admin_id uuid,
  p_note     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
  -- Lock the row to prevent concurrent approve + cancel race
  SELECT status INTO v_status
  FROM   wallet_transactions
  WHERE  id = p_tx_id AND type = 'withdrawal'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_status != 'pending' THEN
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
