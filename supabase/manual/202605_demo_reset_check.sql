-- =============================================================================
-- BrisaHub Demo Integrity Check
-- Purpose  : Verify the database is clean and relational integrity holds
--            before a demo recording, investor walk-through, or acquisition.
-- Created  : 2026-05
-- Run via  : Supabase SQL Editor, as service role (read-only, SELECT only)
--
-- HOW TO READ RESULTS
--   Every row should have count = 0.
--   Any count > 0 is a problem to investigate before the demo.
--
-- RUN ORDER
--   1. 202605_clean_demo_data.sql  (cleanup pass)
--   2. THIS FILE                   (integrity verification)
-- =============================================================================


-- =============================================================================
-- PART A — QA / TEST DATA REMAINING
-- All should be 0 after running clean_demo_data.sql
-- =============================================================================

WITH checks AS (
SELECT
  '[QA seed] jobs remaining'              AS check_name,
  count(*)::int                           AS count,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL — run 202605_clean_demo_data.sql' END AS status
FROM jobs
WHERE title ILIKE '%[QA seed]%' OR description ILIKE '%[QA seed]%'

UNION ALL SELECT
  '[QA test] disputes remaining',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL — run clean_demo_data.sql Section 1' END
FROM contract_disputes
WHERE reason ILIKE '%[QA seed]%'
   OR reason ILIKE '%[QA test]%'
   OR resolution_note ILIKE '%[QA seed]%'

UNION ALL SELECT
  'Referral test submissions remaining',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL — run clean_demo_data.sql Section 2' END
FROM submissions
WHERE bio = 'Referral email test sent by admin.'

UNION ALL SELECT
  '[QA] notifications remaining',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL — run clean_demo_data.sql Section 3' END
FROM notifications
-- Assumption verified against current Supabase schema/migrations:
-- notifications uses message/type/link/created_at and does not have title/body.
WHERE COALESCE(message, '') ILIKE '%[QA%'


-- =============================================================================
-- PART B — ORPHAN / BROKEN REFERENCES
-- These indicate data integrity issues, not just test cleanup problems.
-- =============================================================================

UNION ALL SELECT
  'Orphan contracts (job deleted or missing)',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — review orphan contracts' END
FROM contracts c
WHERE c.job_id IS NOT NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = c.job_id)

UNION ALL SELECT
  'Disputes on non-existent contracts',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — orphan disputes exist' END
FROM contract_disputes cd
WHERE NOT EXISTS (SELECT 1 FROM contracts c WHERE c.id = cd.contract_id)

UNION ALL SELECT
  'Active disputes on deleted/cancelled contracts',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — disputed contracts may be closed' END
FROM contract_disputes cd
JOIN contracts c ON c.id = cd.contract_id
WHERE cd.status IN ('open', 'under_review')
  AND c.status IN ('cancelled', 'rejected')
  AND c.deleted_at IS NULL

UNION ALL SELECT
  'Contracts with invalid workspace_id',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — workspace ref broken' END
FROM contracts c
WHERE c.workspace_id IS NOT NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM premium_workspaces pw WHERE pw.id = c.workspace_id)

UNION ALL SELECT
  'Disputes workspace_id mismatch with contract',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — dispute workspace != contract workspace' END
FROM contract_disputes cd
JOIN contracts c ON c.id = cd.contract_id
WHERE cd.workspace_id IS DISTINCT FROM c.workspace_id

UNION ALL SELECT
  'Contracts with duplicate active disputes',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL — more than 1 open dispute per contract' END
FROM (
  SELECT contract_id
  FROM contract_disputes
  WHERE status IN ('open', 'under_review')
  GROUP BY contract_id
  HAVING count(*) > 1
) dup

UNION ALL SELECT
  'escrow_lock rows with no matching contract',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — stale escrow references' END
FROM wallet_transactions wt
WHERE wt.type = 'escrow_lock'
  AND wt.reference_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contracts c WHERE c.id::text = wt.reference_id
  )

UNION ALL SELECT
  'Contracts missing agency',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'WARN — contracts without agency' END
FROM contracts c
WHERE c.agency_id IS NULL
  AND c.deleted_at IS NULL


-- =============================================================================
-- PART C — CONTENT HEALTH
-- Obvious test-looking text in user-facing fields
-- =============================================================================

UNION ALL SELECT
  'Jobs with "asd" in title',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVIEW — possible test jobs' END
FROM jobs
WHERE title ILIKE '%asd%' AND deleted_at IS NULL

UNION ALL SELECT
  'Jobs with "lorem" in title or description',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVIEW — possible lorem ipsum rows' END
FROM jobs
WHERE (title ILIKE '%lorem%' OR description ILIKE '%lorem ipsum%')
  AND deleted_at IS NULL

UNION ALL SELECT
  'Bookings with "test" in job_title',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVIEW — possible test bookings' END
FROM bookings
WHERE job_title ILIKE '%[QA%'
   OR job_title ILIKE '%asd%'

UNION ALL SELECT
  'Support conversations with "asd" in subject',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK' ELSE 'REVIEW — possible test support tickets' END
FROM support_conversations
WHERE subject ILIKE '%asd%'
   OR subject ILIKE '%lorem%'
)

SELECT *
FROM checks
ORDER BY
  CASE
    WHEN status = 'OK' THEN 0
    WHEN status = 'WARN' THEN 1
    ELSE 2
  END,
  check_name;


-- =============================================================================
-- PART D — PLATFORM HEALTH SNAPSHOT (informational, not pass/fail)
-- Gives a quick picture of what real data exists for the demo.
-- =============================================================================

SELECT
  'Active jobs (open)'            AS metric,
  count(*)::int                   AS value
FROM jobs WHERE status = 'open' AND deleted_at IS NULL

UNION ALL SELECT 'Total talent profiles',         count(*)::int FROM talent_profiles WHERE deleted_at IS NULL
UNION ALL SELECT 'Total agencies',                count(*)::int FROM agencies WHERE deleted_at IS NULL
UNION ALL SELECT 'Contracts (all statuses)',       count(*)::int FROM contracts WHERE deleted_at IS NULL
UNION ALL SELECT 'Contracts (paid)',               count(*)::int FROM contracts WHERE status = 'paid' AND deleted_at IS NULL
UNION ALL SELECT 'Contracts (confirmed/escrow)',   count(*)::int FROM contracts WHERE status = 'confirmed' AND deleted_at IS NULL
UNION ALL SELECT 'Open disputes',                  count(*)::int FROM contract_disputes WHERE status IN ('open', 'under_review')
UNION ALL SELECT 'Resolved disputes',              count(*)::int FROM contract_disputes WHERE status NOT IN ('open', 'under_review')
UNION ALL SELECT 'Active premium workspaces',      count(*)::int FROM premium_workspaces WHERE status = 'active' AND deleted_at IS NULL
UNION ALL SELECT 'Total notifications',            count(*)::int FROM notifications
UNION ALL SELECT 'Open support tickets',           count(*)::int FROM support_conversations WHERE status = 'waiting_admin' AND archived_at IS NULL

ORDER BY metric;
