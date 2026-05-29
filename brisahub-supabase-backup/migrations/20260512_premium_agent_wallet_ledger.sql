-- Internal allocation ledger for Premium workspace agent cash management.
-- This is platform-internal accounting only — no external money moves.
-- profiles.wallet_balance is never mutated here.
CREATE TABLE IF NOT EXISTS premium_agent_wallet_transactions (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid         NOT NULL REFERENCES premium_workspaces(id) ON DELETE CASCADE,
  agent_user_id       uuid         NOT NULL REFERENCES auth.users(id),
  owner_user_id       uuid         NOT NULL REFERENCES auth.users(id),
  type                text         NOT NULL CHECK (type IN (
                        'allocation', 'allocation_reversal',
                        'job_commitment', 'job_release',
                        'refund', 'adjustment'
                      )),
  amount              numeric(14,2) NOT NULL CHECK (amount > 0),
  status              text         NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('completed', 'reversed', 'pending')),
  related_job_id      uuid         REFERENCES jobs(id) ON DELETE SET NULL,
  related_contract_id uuid         REFERENCES contracts(id) ON DELETE SET NULL,
  note                text,
  created_by          uuid         NOT NULL REFERENCES auth.users(id),
  created_at          timestamptz  NOT NULL DEFAULT now(),
  reversed_at         timestamptz,
  metadata            jsonb
);

CREATE INDEX ON premium_agent_wallet_transactions (workspace_id);
CREATE INDEX ON premium_agent_wallet_transactions (workspace_id, agent_user_id);
CREATE INDEX ON premium_agent_wallet_transactions (related_job_id) WHERE related_job_id IS NOT NULL;

ALTER TABLE premium_agent_wallet_transactions ENABLE ROW LEVEL SECURITY;
-- All access via service role only — no public policies.
