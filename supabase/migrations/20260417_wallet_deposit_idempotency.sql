-- Unique index prevents two wallet_transactions rows for the same MP payment.
-- Partial (WHERE payment_id IS NOT NULL) so NULL rows (manual credits etc.) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_payment_id_uniq
  ON wallet_transactions(payment_id)
  WHERE payment_id IS NOT NULL;

-- credit_wallet_deposit
-- Atomically credits a wallet for a PIX deposit.
-- Returns TRUE if the credit was applied, FALSE if the payment was already processed.
--
-- Race-safety:
--   UPDATE path  — marks a pending row as confirmed; succeeds only once (WHERE description != '...')
--   INSERT path  — creates a confirmed row when none existed; ON CONFLICT DO NOTHING prevents
--                  a concurrent INSERT from the same payment_id from doubling the credit
--   The wallet UPDATE only runs if one of the above paths claimed the row.
CREATE OR REPLACE FUNCTION credit_wallet_deposit(
  p_user_id    uuid,
  p_payment_id text,
  p_amount     numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows int;
BEGIN
  -- Path 1: pending row already exists with payment_id — claim it
  UPDATE wallet_transactions
     SET description = 'Depósito via PIX',
         amount      = p_amount
   WHERE payment_id  = p_payment_id
     AND user_id     = p_user_id
     AND description != 'Depósito via PIX';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Path 2: no pending row (payment_id not set yet, or first-ever call)
    -- The unique index on payment_id ensures only one INSERT wins.
    INSERT INTO wallet_transactions (user_id, type, amount, description, payment_id)
    VALUES (p_user_id, 'deposit', p_amount, 'Depósito via PIX', p_payment_id)
    ON CONFLICT (payment_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    -- 0 rows → the unique conflict fired → already processed
    IF v_rows = 0 THEN
      RETURN false;
    END IF;
  END IF;

  -- Atomically credit the wallet — only reached when we claimed the transaction above
  UPDATE profiles
     SET wallet_balance = wallet_balance + p_amount
   WHERE id = p_user_id;

  RETURN true;
END;
$$;
