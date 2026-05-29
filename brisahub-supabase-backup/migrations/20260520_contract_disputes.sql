-- Contract disputes table.
-- Disputes block payout release until resolved by an admin.
-- See lib/disputePolicy.ts for canonical status constants and blocking logic.

CREATE TABLE IF NOT EXISTS contract_disputes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id         uuid        NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  workspace_id        uuid        REFERENCES premium_workspaces(id) ON DELETE SET NULL,
  opened_by_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason              text        NOT NULL CHECK (length(trim(reason)) > 0),
  status              text        NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open','under_review','resolved_refund','resolved_release','closed')),
  resolved_at         timestamptz,
  resolved_by_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Validate resolved fields are consistent.
ALTER TABLE contract_disputes
  ADD CONSTRAINT contract_disputes_resolved_check
  CHECK (
    -- If resolved or closed, resolved_at and resolved_by must be set.
    (status NOT IN ('resolved_refund','resolved_release','closed'))
    OR (resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL)
  );

-- Fast lookup used by the payout gate in /api/contracts/[id].
CREATE INDEX IF NOT EXISTS contract_disputes_contract_id_idx
  ON contract_disputes (contract_id);

-- Index for admin queue sorted by newest-first.
CREATE INDEX IF NOT EXISTS contract_disputes_created_at_idx
  ON contract_disputes (created_at DESC);

-- Index for filtering active disputes quickly.
CREATE INDEX IF NOT EXISTS contract_disputes_status_idx
  ON contract_disputes (status)
  WHERE status IN ('open', 'under_review');

-- Auto-update updated_at on row change.
CREATE OR REPLACE FUNCTION set_contract_disputes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'contract_disputes_updated_at_trigger'
  ) THEN
    CREATE TRIGGER contract_disputes_updated_at_trigger
      BEFORE UPDATE ON contract_disputes
      FOR EACH ROW EXECUTE FUNCTION set_contract_disputes_updated_at();
  END IF;
END $$;

-- RLS: enable row-level security.
ALTER TABLE contract_disputes ENABLE ROW LEVEL SECURITY;

-- Admins (service role) have full access.
-- Application code that reads disputes uses createServerClient({ useServiceRole: true }).

-- Authenticated users can read disputes they opened.
CREATE POLICY "dispute_read_own"
  ON contract_disputes FOR SELECT
  TO authenticated
  USING (opened_by_user_id = auth.uid());

-- Authenticated users can open a dispute on a contract they are party to.
-- The API route enforces the business rule; this policy allows the insert.
CREATE POLICY "dispute_insert_authenticated"
  ON contract_disputes FOR INSERT
  TO authenticated
  WITH CHECK (opened_by_user_id = auth.uid());
