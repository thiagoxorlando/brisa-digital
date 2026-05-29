-- ============================================================
-- Premium Agent Wallet Ledger — Settlement Fix
-- ============================================================
--
-- ACCOUNTING MODEL (read before editing this table or its callers):
--
--   The premium_agent_wallet_transactions table is a pure internal ledger.
--   No real money moves here — profiles.wallet_balance is NEVER touched.
--   Only the owner's wallet_balance (via confirm_booking_escrow RPC) actually
--   holds real money; agent entries are internal budget control rows only.
--
--   Entry types and their effect on agent virtual balance:
--
--   allocation          +allocated  (owner grants budget to agent)
--   allocation_reversal −allocated  (owner reclaims unspent budget)
--   job_commitment      +committed  (agent reserves budget when creating a job)
--   job_release         −committed  (commitment released when job closed/cancelled
--                                    without a paid contract)
--   job_settlement      −committed, +spent  (commitment permanently consumed when
--                                    the agent's job contract is paid — this is
--                                    the entry that was MISSING from the CHECK
--                                    constraint, causing the duplication display bug)
--   refund              −committed  (partial refund of committed amount)
--   adjustment          no automatic effect (admin correction only)
--
--   Virtual available balance formula:
--     available = allocated − committed − spent
--
--   Owner summary formula:
--     activelyAllocated = totalAllocated − totalSettled
--     ownerUnallocatedAvailable = wallet_balance − activelyAllocated
--
-- BUG THAT THIS MIGRATION FIXES:
--   The original CHECK constraint omitted 'job_settlement'.  Every INSERT of a
--   job_settlement row silently failed with a Postgres CHECK violation.  Because
--   the application code had no error check on that INSERT, the failure was
--   invisible.  The result: totalSettled never increased, so activelyAllocated
--   stayed positive even after the owner's wallet_balance had already been
--   debited.  The owner's wallet page displayed phantom "Reservado a agentes"
--   money that had already been spent — the classic duplication symptom.
-- ============================================================

-- 1. Replace the type CHECK constraint to include 'job_settlement'.
--    Must drop-then-recreate because Postgres does not support ALTER CONSTRAINT
--    to change the expression.
ALTER TABLE premium_agent_wallet_transactions
  DROP CONSTRAINT IF EXISTS premium_agent_wallet_transactions_type_check;

ALTER TABLE premium_agent_wallet_transactions
  ADD CONSTRAINT premium_agent_wallet_transactions_type_check
    CHECK (type IN (
      'allocation',
      'allocation_reversal',
      'job_commitment',
      'job_release',
      'job_settlement',
      'refund',
      'adjustment'
    ));

-- 2. At-most-one job_settlement per contract.
--    Database-level idempotency guard: if the application check races or retries,
--    the second INSERT is rejected by this index rather than creating duplicate
--    settlements that would double-count as "spent".
CREATE UNIQUE INDEX IF NOT EXISTS uq_pawt_settlement_per_contract
  ON premium_agent_wallet_transactions (related_contract_id)
  WHERE type = 'job_settlement'
    AND related_contract_id IS NOT NULL;

-- 3. At-most-one active job_commitment per job.
--    Prevents duplicate commitment entries if the job creation route is retried.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pawt_commitment_per_job
  ON premium_agent_wallet_transactions (related_job_id)
  WHERE type = 'job_commitment'
    AND related_job_id IS NOT NULL
    AND status = 'completed';
