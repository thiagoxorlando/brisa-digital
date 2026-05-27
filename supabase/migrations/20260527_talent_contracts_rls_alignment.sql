-- Align talent contract visibility with both current and legacy identity columns.
-- This keeps direct client reads, realtime, and embedded booking->contract joins
-- consistent with server-side queries that already check both columns.

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "talent_read_own_contracts" ON contracts;
CREATE POLICY "talent_read_own_contracts"
  ON contracts FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      talent_id = auth.uid()
      OR talent_user_id = auth.uid()
    )
  );
