-- =============================================================================
-- Dispute System Integrity Check
-- Created: 2026-05-22
--
-- PURPOSE
--   Returns rows that indicate broken dispute relationships.
--   A healthy system returns 0 rows from every query.
--   Run periodically or after bulk migrations.
--
-- HOW TO RUN
--   Paste each block into the Supabase SQL editor and run as service role.
--   Investigate any returned rows before resolving disputes against them.
-- =============================================================================

-- ── Check 1: Dispute workspace_id does not match contract workspace_id ────────
-- Indicates a stale dispute row or a contract that was re-assigned.
SELECT
  d.id        AS dispute_id,
  d.contract_id,
  d.workspace_id   AS dispute_workspace_id,
  c.workspace_id   AS contract_workspace_id,
  d.status,
  d.created_at
FROM contract_disputes d
JOIN contracts c ON c.id = d.contract_id
WHERE d.workspace_id IS DISTINCT FROM c.workspace_id
  AND c.deleted_at IS NULL
ORDER BY d.created_at DESC;

-- ── Check 2: Premium dispute where job workspace_id mismatches ────────────────
-- job.workspace_id must equal contract.workspace_id for Premium scope.
SELECT
  d.id         AS dispute_id,
  d.contract_id,
  d.workspace_id   AS dispute_workspace_id,
  c.workspace_id   AS contract_workspace_id,
  j.workspace_id   AS job_workspace_id,
  d.status,
  d.created_at
FROM contract_disputes d
JOIN contracts c ON c.id = d.contract_id
JOIN jobs j      ON j.id = c.job_id
WHERE d.workspace_id IS NOT NULL
  AND j.workspace_id IS DISTINCT FROM c.workspace_id
  AND c.deleted_at IS NULL
  AND j.deleted_at IS NULL
ORDER BY d.created_at DESC;

-- ── Check 3: Premium disputes where talent is not an active workspace member ──
-- talent_user_id must have status = 'active', removed_at IS NULL in
-- premium_workspace_talents for the dispute's workspace.
SELECT
  d.id         AS dispute_id,
  d.contract_id,
  d.workspace_id,
  c.talent_user_id,
  c.talent_id,
  d.status,
  d.created_at
FROM contract_disputes d
JOIN contracts c ON c.id = d.contract_id
WHERE d.workspace_id IS NOT NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM premium_workspace_talents pwa
    WHERE pwa.workspace_id = d.workspace_id
      AND pwa.talent_user_id IN (c.talent_user_id, c.talent_id)
      AND pwa.status = 'active'
      AND pwa.removed_at IS NULL
  )
ORDER BY d.created_at DESC;

-- ── Check 4: Disputes referencing a missing or deleted contract ───────────────
SELECT
  d.id        AS dispute_id,
  d.contract_id,
  d.workspace_id,
  d.status,
  d.created_at
FROM contract_disputes d
LEFT JOIN contracts c ON c.id = d.contract_id AND c.deleted_at IS NULL
WHERE c.id IS NULL
ORDER BY d.created_at DESC;

-- ── Check 5: Disputes with no corresponding escrow evidence ──────────────────
-- Active disputes (open / under_review) on confirmed contracts should have
-- either a wallet_transactions escrow_lock row or a Premium agent
-- job_commitment row. Rows here may need manual escrow audit.
SELECT
  d.id         AS dispute_id,
  d.contract_id,
  d.workspace_id,
  c.status     AS contract_status,
  d.status     AS dispute_status,
  d.created_at
FROM contract_disputes d
JOIN contracts c ON c.id = d.contract_id
WHERE d.status IN ('open', 'under_review')
  AND c.status = 'confirmed'
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM wallet_transactions wt
    WHERE wt.type = 'escrow_lock'
      AND wt.status = 'completed'
      AND (
        wt.reference_id = d.contract_id::text
        OR wt.idempotency_key = 'escrow_' || d.contract_id::text
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM premium_agent_wallet_transactions pat
    WHERE pat.type = 'job_commitment'
      AND pat.status = 'completed'
      AND (
        pat.related_contract_id = d.contract_id
        OR (c.job_id IS NOT NULL AND pat.related_job_id = c.job_id)
      )
  )
ORDER BY d.created_at DESC;

-- ── Check 6: Duplicate active disputes per contract ───────────────────────────
-- Each contract may have at most one open or under_review dispute at a time.
SELECT
  contract_id,
  count(*) AS active_count,
  array_agg(id ORDER BY created_at) AS dispute_ids
FROM contract_disputes
WHERE status IN ('open', 'under_review')
GROUP BY contract_id
HAVING count(*) > 1
ORDER BY active_count DESC;

-- ── Summary (run last) ────────────────────────────────────────────────────────
-- Returns a single health summary row. "issues" = 0 means all checks passed.
WITH
  mismatch_workspace AS (
    SELECT count(*) AS n
    FROM contract_disputes d
    JOIN contracts c ON c.id = d.contract_id
    WHERE d.workspace_id IS DISTINCT FROM c.workspace_id AND c.deleted_at IS NULL
  ),
  mismatch_job_workspace AS (
    SELECT count(*) AS n
    FROM contract_disputes d
    JOIN contracts c ON c.id = d.contract_id
    JOIN jobs j ON j.id = c.job_id
    WHERE d.workspace_id IS NOT NULL
      AND j.workspace_id IS DISTINCT FROM c.workspace_id
      AND c.deleted_at IS NULL AND j.deleted_at IS NULL
  ),
  missing_membership AS (
    SELECT count(*) AS n
    FROM contract_disputes d
    JOIN contracts c ON c.id = d.contract_id
    WHERE d.workspace_id IS NOT NULL AND c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM premium_workspace_talents pwa
        WHERE pwa.workspace_id = d.workspace_id
          AND pwa.talent_user_id IN (c.talent_user_id, c.talent_id)
          AND pwa.status = 'active' AND pwa.removed_at IS NULL
      )
  ),
  missing_contract AS (
    SELECT count(*) AS n
    FROM contract_disputes d
    LEFT JOIN contracts c ON c.id = d.contract_id AND c.deleted_at IS NULL
    WHERE c.id IS NULL
  ),
  no_escrow AS (
    SELECT count(*) AS n
    FROM contract_disputes d
    JOIN contracts c ON c.id = d.contract_id
    WHERE d.status IN ('open','under_review') AND c.status = 'confirmed' AND c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions wt
        WHERE wt.type = 'escrow_lock'
          AND wt.status = 'completed'
          AND (
            wt.reference_id = d.contract_id::text
            OR wt.idempotency_key = 'escrow_' || d.contract_id::text
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM premium_agent_wallet_transactions pat
        WHERE pat.type = 'job_commitment'
          AND pat.status = 'completed'
          AND (
            pat.related_contract_id = d.contract_id
            OR (c.job_id IS NOT NULL AND pat.related_job_id = c.job_id)
          )
      )
  ),
  duplicates AS (
    SELECT count(*) AS n
    FROM (
      SELECT contract_id FROM contract_disputes
      WHERE status IN ('open','under_review')
      GROUP BY contract_id HAVING count(*) > 1
    ) sub
  )
SELECT
  (SELECT n FROM mismatch_workspace)    AS dispute_contract_workspace_mismatch,
  (SELECT n FROM mismatch_job_workspace) AS job_workspace_mismatch,
  (SELECT n FROM missing_membership)    AS premium_talent_not_member,
  (SELECT n FROM missing_contract)      AS disputes_missing_contract,
  (SELECT n FROM no_escrow)             AS active_disputes_no_escrow,
  (SELECT n FROM duplicates)            AS duplicate_active_disputes,
  (
    (SELECT n FROM mismatch_workspace)
    + (SELECT n FROM mismatch_job_workspace)
    + (SELECT n FROM missing_membership)
    + (SELECT n FROM missing_contract)
    + (SELECT n FROM duplicates)
  ) AS total_issues;
