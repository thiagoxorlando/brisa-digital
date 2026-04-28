-- Repair talent wallet balances inflated by old-style withdrawals.
--
-- Root cause: release_payment_payout correctly credits wallet_balance when a
-- contract is paid.  The old PATCH action="withdraw" only set contracts.withdrawn_at
-- and never debited wallet_balance.  So talents who withdrew via the old UI still
-- have those amounts sitting in wallet_balance, appearing as "available to withdraw"
-- when they have already been paid out.
--
-- Fix: recalculate wallet_balance as
--   credits    (wallet_transactions type IN ('payout','referral_commission'))
-- - new debits (wallet_transactions type = 'withdrawal', from request_talent_withdrawal)
-- - old debits (paid contracts with withdrawn_at that have no wallet_transaction debit)
--
-- For old contracts the exact payout amount is read from the wallet_transactions row
-- whose reference_id matches the contract id (added in 20260428_referral_commission_rpc).
-- If no such row exists (pre-reference_id era), 85% of payment_amount is used.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — PREVIEW (read-only, safe to run at any time)
-- Run this first; verify correct_balance looks right for each talent.
-- ─────────────────────────────────────────────────────────────────────────────

WITH
  ledger AS (
    SELECT  user_id,
            SUM(CASE WHEN type IN ('payout','referral_commission') THEN amount ELSE 0 END) AS credits,
            SUM(CASE WHEN type  = 'withdrawal'                     THEN amount ELSE 0 END) AS new_debits
    FROM    wallet_transactions
    GROUP BY user_id
  ),
  old_withdrawals AS (
    -- Every paid contract that was "withdrawn" via the old UI action="withdraw".
    -- The payout amount is taken from the wallet_transactions row linked by
    -- reference_id (exact), or estimated as 85% of payment_amount (fallback).
    SELECT  c.talent_id AS user_id,
            SUM(
              COALESCE(
                (SELECT wt.amount
                 FROM   wallet_transactions wt
                 WHERE  wt.reference_id = c.id::text
                   AND  wt.type         = 'payout'
                 LIMIT  1),
                ROUND((c.payment_amount * 0.85)::numeric, 2)
              )
            ) AS amount
    FROM    contracts c
    WHERE   c.status       = 'paid'
      AND   c.withdrawn_at IS NOT NULL
      AND   c.talent_id    IS NOT NULL
    GROUP BY c.talent_id
  )
SELECT  p.id,
        tp.full_name,
        ROUND(p.wallet_balance::numeric, 2)               AS current_balance,
        ROUND(COALESCE(l.credits,    0)::numeric, 2)      AS ledger_credits,
        ROUND(COALESCE(l.new_debits, 0)::numeric, 2)      AS new_debits,
        ROUND(COALESCE(ow.amount,    0)::numeric, 2)       AS old_withdrawals,
        GREATEST(0,
          ROUND((
              COALESCE(l.credits,    0)
            - COALESCE(l.new_debits, 0)
            - COALESCE(ow.amount,    0)
          )::numeric, 2)
        )                                                  AS correct_balance
FROM    profiles         p
LEFT JOIN talent_profiles tp ON tp.id     = p.id
LEFT JOIN ledger          l  ON l.user_id  = p.id
LEFT JOIN old_withdrawals ow ON ow.user_id = p.id
WHERE   p.role = 'talent'
ORDER   BY p.wallet_balance DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — APPLY FIX
-- Only run after STEP 1 output looks correct.
-- Updates wallet_balance to the corrected ledger value for all talents.
-- ─────────────────────────────────────────────────────────────────────────────

WITH
  ledger AS (
    SELECT  user_id,
            SUM(CASE WHEN type IN ('payout','referral_commission') THEN amount ELSE 0 END) AS credits,
            SUM(CASE WHEN type  = 'withdrawal'                     THEN amount ELSE 0 END) AS new_debits
    FROM    wallet_transactions
    GROUP BY user_id
  ),
  old_withdrawals AS (
    SELECT  c.talent_id AS user_id,
            SUM(
              COALESCE(
                (SELECT wt.amount
                 FROM   wallet_transactions wt
                 WHERE  wt.reference_id = c.id::text
                   AND  wt.type         = 'payout'
                 LIMIT  1),
                ROUND((c.payment_amount * 0.85)::numeric, 2)
              )
            ) AS amount
    FROM    contracts c
    WHERE   c.status       = 'paid'
      AND   c.withdrawn_at IS NOT NULL
      AND   c.talent_id    IS NOT NULL
    GROUP BY c.talent_id
  ),
  correct AS (
    SELECT  p.id AS user_id,
            GREATEST(0,
              ROUND((
                  COALESCE(l.credits,    0)
                - COALESCE(l.new_debits, 0)
                - COALESCE(ow.amount,    0)
              )::numeric, 2)
            ) AS balance
    FROM    profiles         p
    LEFT JOIN ledger          l  ON l.user_id  = p.id
    LEFT JOIN old_withdrawals ow ON ow.user_id = p.id
    WHERE   p.role = 'talent'
  )
UPDATE profiles
SET    wallet_balance = correct.balance
FROM   correct
WHERE  profiles.id            = correct.user_id
  AND  profiles.wallet_balance IS DISTINCT FROM correct.balance;
