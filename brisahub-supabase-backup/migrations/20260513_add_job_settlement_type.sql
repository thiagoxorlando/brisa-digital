-- Add job_settlement transaction type to the Premium agent wallet ledger.
-- job_settlement is inserted when a Premium agent-created contract is paid.
-- It permanently consumes the committed allocation so the agent's available
-- balance cannot recover phantom money after the owner's wallet was debited.
ALTER TABLE premium_agent_wallet_transactions
  DROP CONSTRAINT IF EXISTS premium_agent_wallet_transactions_type_check;

ALTER TABLE premium_agent_wallet_transactions
  ADD CONSTRAINT premium_agent_wallet_transactions_type_check
  CHECK (type IN (
    'allocation',
    'allocation_reversal',
    'job_commitment',
    'job_release',
    'refund',
    'adjustment',
    'job_settlement'
  ));
