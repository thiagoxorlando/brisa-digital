-- ============================================================
-- Brisa Digital — Financial Integrity Audit
-- Run in Supabase SQL Editor (service role / direct connection).
-- All queries are READ-ONLY.
-- Columns: check_name | ref_id | details | status
-- ============================================================

-- ── CHECK 1 — Wallet balance vs ledger (per user) ─────────────────────────────

SELECT
  '1 · Wallet vs Ledger'                                          AS check_name,
  p.id::text                                                      AS ref_id,
  ('role=' || p.role
   || ' stored=' || p.wallet_balance
   || ' computed=' || COALESCE(ledger.computed, 0)
   || ' drift=' || (p.wallet_balance - COALESCE(ledger.computed, 0)))::text
                                                                  AS details,
  CASE
    WHEN ABS(p.wallet_balance - COALESCE(ledger.computed, 0)) < 0.01 THEN 'PASS'
    ELSE 'FAIL'
  END                                                             AS status
FROM profiles p
LEFT JOIN (
  SELECT
    user_id,
    SUM(
      CASE type
        WHEN 'deposit'     THEN  amount
        WHEN 'payout'      THEN  amount
        WHEN 'refund'      THEN  amount
        WHEN 'escrow_lock' THEN -amount
        WHEN 'withdrawal'  THEN -amount
        ELSE 0
      END
    ) AS computed
  FROM wallet_transactions
  GROUP BY user_id
) ledger ON ledger.user_id = p.id
WHERE p.wallet_balance <> 0
   OR ledger.computed  IS NOT NULL
ORDER BY ABS(p.wallet_balance - COALESCE(ledger.computed, 0)) DESC;


-- ── CHECK 2 — Active escrow: contracts vs transactions ───────────────────────

WITH contract_escrow AS (
  SELECT COALESCE(SUM(payment_amount), 0) AS total
  FROM   contracts
  WHERE  status = 'confirmed' AND deleted_at IS NULL
),
ledger_escrow AS (
  SELECT
    COALESCE(SUM(CASE WHEN type = 'escrow_lock' THEN amount ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN type = 'refund'      THEN amount ELSE 0 END), 0)
  AS net
  FROM wallet_transactions
)
SELECT
  '2 · Escrow Consistency'::text                                  AS check_name,
  NULL::text                                                      AS ref_id,
  ('contracts=' || contract_escrow.total
   || ' ledger=' || ledger_escrow.net
   || ' diff='   || (contract_escrow.total - ledger_escrow.net))::text
                                                                  AS details,
  CASE
    WHEN ABS(contract_escrow.total - ledger_escrow.net) < 0.01 THEN 'PASS'
    ELSE 'FAIL'
  END::text                                                       AS status
FROM contract_escrow, ledger_escrow;


-- ── CHECK 3 — Payout consistency: contracts vs transactions ──────────────────

WITH contract_payouts AS (
  SELECT COALESCE(SUM(payment_amount), 0) AS total
  FROM   contracts
  WHERE  status = 'paid' AND deleted_at IS NULL
),
ledger_payouts AS (
  SELECT COALESCE(SUM(amount), 0) AS total
  FROM   wallet_transactions
  WHERE  type = 'payout'
)
SELECT
  '3 · Payout Consistency'::text                                  AS check_name,
  NULL::text                                                      AS ref_id,
  ('contracts=' || contract_payouts.total
   || ' ledger=' || ledger_payouts.total
   || ' diff='   || (contract_payouts.total - ledger_payouts.total))::text
                                                                  AS details,
  CASE
    WHEN ABS(contract_payouts.total - ledger_payouts.total) < 0.01 THEN 'PASS'
    ELSE 'FAIL'
  END::text                                                       AS status
FROM contract_payouts, ledger_payouts;


-- ── CHECK 4a — Wallet idempotency key duplicates ─────────────────────────────

SELECT
  '4a · Wallet idempotency duplicates'::text                      AS check_name,
  idempotency_key::text                                           AS ref_id,
  ('occurrences=' || COUNT(*))::text                              AS details,
  'FAIL'::text                                                    AS status
FROM wallet_transactions
WHERE idempotency_key IS NOT NULL
GROUP BY idempotency_key
HAVING COUNT(*) > 1
UNION ALL
SELECT
  '4a · Wallet idempotency'::text,
  NULL::text,
  'No duplicates found'::text,
  'PASS'::text
WHERE NOT EXISTS (
  SELECT 1 FROM wallet_transactions
  WHERE idempotency_key IS NOT NULL
  GROUP BY idempotency_key HAVING COUNT(*) > 1
);


-- ── CHECK 4b — Notification idempotency key duplicates ───────────────────────

SELECT
  '4b · Notification idempotency duplicates'::text                AS check_name,
  idempotency_key::text                                           AS ref_id,
  ('occurrences=' || COUNT(*))::text                              AS details,
  'FAIL'::text                                                    AS status
FROM notifications
WHERE idempotency_key IS NOT NULL
GROUP BY idempotency_key
HAVING COUNT(*) > 1
UNION ALL
SELECT
  '4b · Notification idempotency'::text,
  NULL::text,
  'No duplicates found'::text,
  'PASS'::text
WHERE NOT EXISTS (
  SELECT 1 FROM notifications
  WHERE idempotency_key IS NOT NULL
  GROUP BY idempotency_key HAVING COUNT(*) > 1
);


-- ── CHECK 5 — Negative wallet balances ───────────────────────────────────────

SELECT
  '5 · Negative Balances'::text                                   AS check_name,
  id::text                                                        AS ref_id,
  ('role=' || role || ' balance=' || wallet_balance)::text        AS details,
  'FAIL'::text                                                    AS status
FROM profiles
WHERE wallet_balance < 0
UNION ALL
SELECT
  '5 · Negative Balances'::text,
  NULL::text,
  'No negative balances'::text,
  'PASS'::text
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE wallet_balance < 0);


-- ── CHECK 6a — Active contracts without booking_id ───────────────────────────

SELECT
  '6a · Contracts missing booking_id'::text                       AS check_name,
  id::text                                                        AS ref_id,
  ('status=' || status)::text                                     AS details,
  'FAIL'::text                                                    AS status
FROM contracts
WHERE booking_id IS NULL
  AND deleted_at IS NULL
  AND status NOT IN ('rejected', 'cancelled')
UNION ALL
SELECT
  '6a · Contracts missing booking_id'::text,
  NULL::text,
  'All active contracts have booking_id'::text,
  'PASS'::text
WHERE NOT EXISTS (
  SELECT 1 FROM contracts
  WHERE booking_id IS NULL
    AND deleted_at IS NULL
    AND status NOT IN ('rejected', 'cancelled')
);


-- ── CHECK 6b — Bookings without any contract ─────────────────────────────────

SELECT
  '6b · Bookings without contract'::text                          AS check_name,
  b.id::text                                                      AS ref_id,
  ('status=' || b.status)::text                                   AS details,
  'WARN'::text                                                    AS status
FROM bookings b
WHERE NOT EXISTS (SELECT 1 FROM contracts c WHERE c.booking_id = b.id)
  AND b.status NOT IN ('cancelled')
UNION ALL
SELECT
  '6b · Bookings without contract'::text,
  NULL::text,
  'All bookings have a contract'::text,
  'PASS'::text
WHERE NOT EXISTS (
  SELECT 1 FROM bookings b
  WHERE NOT EXISTS (SELECT 1 FROM contracts c WHERE c.booking_id = b.id)
    AND b.status NOT IN ('cancelled')
);


-- ── CHECK 6c — Transactions with invalid user_id ─────────────────────────────

SELECT
  '6c · Transactions invalid user_id'::text                       AS check_name,
  wt.id::text                                                     AS ref_id,
  ('type=' || wt.type || ' amount=' || wt.amount)::text           AS details,
  'FAIL'::text                                                    AS status
FROM wallet_transactions wt
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = wt.user_id)
UNION ALL
SELECT
  '6c · Transactions invalid user_id'::text,
  NULL::text,
  'All transactions have valid user_id'::text,
  'PASS'::text
WHERE NOT EXISTS (
  SELECT 1 FROM wallet_transactions wt
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = wt.user_id)
);


-- ── CHECK 7 — Platform obligation summary ────────────────────────────────────

SELECT
  '7 · Platform Obligation'::text                                 AS check_name,
  NULL::text                                                      AS ref_id,
  ('escrow_locked='       || COALESCE(SUM(CASE WHEN c.status = 'confirmed' THEN c.payment_amount END), 0)
   || ' earned_not_withdrawn=' || COALESCE(SUM(CASE WHEN c.status = 'paid' AND c.withdrawn_at IS NULL THEN c.payment_amount END), 0)
   || ' total_obligation='     || COALESCE(SUM(CASE WHEN c.status IN ('confirmed','paid') AND c.withdrawn_at IS NULL THEN c.payment_amount END), 0))::text
                                                                  AS details,
  'INFO'::text                                                    AS status
FROM contracts c
WHERE c.deleted_at IS NULL;


-- ── CHECK 8a — confirmed_at missing on confirmed/paid contracts ───────────────

SELECT
  '8a · confirmed_at missing'::text                               AS check_name,
  id::text                                                        AS ref_id,
  ('status=' || status)::text                                     AS details,
  'FAIL'::text                                                    AS status
FROM contracts
WHERE status IN ('confirmed', 'paid')
  AND confirmed_at IS NULL
  AND deleted_at   IS NULL
UNION ALL
SELECT
  '8a · confirmed_at missing'::text,
  NULL::text,
  'All confirmed/paid contracts have confirmed_at'::text,
  'PASS'::text
WHERE NOT EXISTS (
  SELECT 1 FROM contracts
  WHERE status IN ('confirmed', 'paid')
    AND confirmed_at IS NULL
    AND deleted_at   IS NULL
);


-- ── CHECK 8b — paid_at missing on paid contracts ─────────────────────────────

SELECT
  '8b · paid_at missing'::text                                    AS check_name,
  id::text                                                        AS ref_id,
  ('confirmed_at=' || confirmed_at)::text                         AS details,
  'FAIL'::text                                                    AS status
FROM contracts
WHERE status    = 'paid'
  AND paid_at   IS NULL
  AND deleted_at IS NULL
UNION ALL
SELECT
  '8b · paid_at missing'::text,
  NULL::text,
  'All paid contracts have paid_at'::text,
  'PASS'::text
WHERE NOT EXISTS (
  SELECT 1 FROM contracts
  WHERE status = 'paid' AND paid_at IS NULL AND deleted_at IS NULL
);


-- ── CHECK 8c — Contract paid but booking not paid ────────────────────────────

SELECT
  '8c · Contract paid / booking not paid'::text                   AS check_name,
  c.id::text                                                      AS ref_id,
  ('booking_id=' || b.id || ' booking_status=' || b.status)::text AS details,
  'WARN'::text                                                    AS status
FROM contracts c
JOIN bookings b ON b.id = c.booking_id
WHERE c.status = 'paid' AND b.status != 'paid' AND c.deleted_at IS NULL
UNION ALL
SELECT
  '8c · Contract paid / booking not paid'::text,
  NULL::text,
  'All paid contracts have paid booking'::text,
  'PASS'::text
WHERE NOT EXISTS (
  SELECT 1 FROM contracts c JOIN bookings b ON b.id = c.booking_id
  WHERE c.status = 'paid' AND b.status != 'paid' AND c.deleted_at IS NULL
);


-- ── CHECK 8d — Contract confirmed but booking not confirmed ──────────────────

SELECT
  '8d · Contract confirmed / booking not confirmed'::text         AS check_name,
  c.id::text                                                      AS ref_id,
  ('booking_id=' || b.id || ' booking_status=' || b.status)::text AS details,
  'WARN'::text                                                    AS status
FROM contracts c
JOIN bookings b ON b.id = c.booking_id
WHERE c.status = 'confirmed' AND b.status != 'confirmed' AND c.deleted_at IS NULL
UNION ALL
SELECT
  '8d · Contract confirmed / booking not confirmed'::text,
  NULL::text,
  'All confirmed contracts have confirmed booking'::text,
  'PASS'::text
WHERE NOT EXISTS (
  SELECT 1 FROM contracts c JOIN bookings b ON b.id = c.booking_id
  WHERE c.status = 'confirmed' AND b.status != 'confirmed' AND c.deleted_at IS NULL
);


-- ── SUMMARY TOTALS ────────────────────────────────────────────────────────────

SELECT
  'Summary · Contracts'::text                                     AS check_name,
  NULL::text                                                      AS ref_id,
  ('total='     || COUNT(*)
   || ' sent='      || COUNT(*) FILTER (WHERE status = 'sent')
   || ' signed='    || COUNT(*) FILTER (WHERE status = 'signed')
   || ' confirmed=' || COUNT(*) FILTER (WHERE status = 'confirmed')
   || ' paid='      || COUNT(*) FILTER (WHERE status = 'paid')
   || ' cancelled=' || COUNT(*) FILTER (WHERE status = 'cancelled')
   || ' rejected='  || COUNT(*) FILTER (WHERE status = 'rejected')
   || ' escrow_total=' || COALESCE(SUM(payment_amount) FILTER (WHERE status = 'confirmed'), 0)
   || ' paid_total='   || COALESCE(SUM(payment_amount) FILTER (WHERE status = 'paid'),      0))::text
                                                                  AS details,
  'INFO'::text                                                    AS status
FROM contracts
WHERE deleted_at IS NULL;

SELECT
  'Summary · Wallets'::text                                       AS check_name,
  NULL::text                                                      AS ref_id,
  ('agency='  || COALESCE(SUM(wallet_balance) FILTER (WHERE role = 'agency'), 0)
   || ' talent=' || COALESCE(SUM(wallet_balance) FILTER (WHERE role = 'talent'), 0)
   || ' total='  || COALESCE(SUM(wallet_balance), 0))::text       AS details,
  'INFO'::text                                                    AS status
FROM profiles;

SELECT
  ('Summary · Transactions [' || type || ']')::text               AS check_name,
  NULL::text                                                      AS ref_id,
  ('count=' || COUNT(*) || ' total=' || COALESCE(SUM(amount), 0))::text
                                                                  AS details,
  'INFO'::text                                                    AS status
FROM wallet_transactions
GROUP BY type
ORDER BY SUM(amount) DESC;
