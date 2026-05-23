-- =============================================================================
-- BrisaHub Demo Health Check
-- Purpose  : Full pass/fail verification that the platform is investor-ready.
--            Run AFTER clean_demo_data.sql and demo_persona_seed.sql.
-- Created  : 2026-05
-- Run via  : Supabase SQL Editor, as service role (READ ONLY — no writes)
--
-- HOW TO READ RESULTS
--   status = 'OK'     → clean, no action needed
--   status = 'WARN'   → investigate, may need manual review
--   status = 'FAIL'   → must fix before demo
--
-- RUN ORDER
--   1. 202605_clean_demo_data.sql    (remove QA/test tagged rows)
--   2. 202605_demo_persona_seed.sql  (rename ugly data to polished personas)
--   3. THIS FILE                     (verify everything is clean)
-- =============================================================================


-- =============================================================================
-- PART A — TEST DATA STILL PRESENT (all should be OK after cleanup)
-- =============================================================================

WITH checks AS (

SELECT
  'A1. [QA seed] jobs remaining'          AS check_name,
  count(*)::int                           AS count,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'FAIL — run 202605_clean_demo_data.sql Section 1' END AS status
FROM jobs
WHERE title ILIKE '%[QA seed]%' OR description ILIKE '%[QA seed]%'

UNION ALL SELECT
  'A2. [QA test] disputes remaining',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'FAIL — run clean_demo_data.sql Section 1' END
FROM contract_disputes
WHERE reason ILIKE '%[QA seed]%'
   OR reason ILIKE '%[QA test]%'
   OR resolution_note ILIKE '%[QA seed]%'

UNION ALL SELECT
  'A3. Referral test submissions remaining',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'FAIL — run clean_demo_data.sql Section 2' END
FROM submissions
WHERE bio = 'Referral email test sent by admin.'

UNION ALL SELECT
  'A4. Agencies with ugly test name',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — run 202605_demo_persona_seed.sql Section 1' END
FROM agencies
WHERE company_name ILIKE '%test%'
   OR company_name ILIKE '%asd%'
   OR company_name ILIKE '%qa%'
   OR company_name ILIKE '%seed%'
   OR company_name IS NULL
   OR company_name = ''

UNION ALL SELECT
  'A5. Talent profiles with ugly name',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — run demo_persona_seed.sql Section 2' END
FROM talent_profiles
WHERE full_name ILIKE '%test%'
   OR full_name ILIKE '%asd%'
   OR full_name ILIKE '%seed%'
   OR full_name IS NULL
   OR full_name = ''

UNION ALL SELECT
  'A6. Jobs with ugly test title',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — run demo_persona_seed.sql Section 3' END
FROM jobs
WHERE (title ILIKE '%test%' OR title ILIKE '%asd%'
    OR title ILIKE '%seed%' OR title ILIKE '%pdf%')
  AND deleted_at IS NULL

UNION ALL SELECT
  'A7. Premium workspaces with ugly name',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — run demo_persona_seed.sql Section 4' END
FROM premium_workspaces
WHERE name ILIKE '%test%'
   OR name ILIKE '%asd%'
   OR name ILIKE '%seed%'
   OR name IS NULL
   OR name = ''

UNION ALL SELECT
  'A8. Disputes with ugly reason',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — run demo_persona_seed.sql Section 7' END
FROM contract_disputes
WHERE reason ILIKE '%test%'
   OR reason ILIKE '%asd%'
   OR reason ILIKE '%seed%'
   OR reason ILIKE '%lorem%'

UNION ALL SELECT
  'A9. Support conversations with ugly subject',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — run demo_persona_seed.sql Section 8' END
FROM support_conversations
WHERE subject ILIKE '%test%'
   OR subject ILIKE '%asd%'
   OR subject ILIKE '%seed%'


-- =============================================================================
-- PART B — RELATIONAL INTEGRITY (all should be OK)
-- =============================================================================

UNION ALL SELECT
  'B1. Orphan contracts (job not found)',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — orphan contracts exist' END
FROM contracts c
WHERE c.job_id IS NOT NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = c.job_id)

UNION ALL SELECT
  'B2. Disputes on non-existent contracts',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'FAIL — orphan disputes exist' END
FROM contract_disputes cd
WHERE NOT EXISTS (SELECT 1 FROM contracts c WHERE c.id = cd.contract_id)

UNION ALL SELECT
  'B3. Contracts with invalid workspace_id',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — workspace_id ref broken' END
FROM contracts c
WHERE c.workspace_id IS NOT NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM premium_workspaces pw WHERE pw.id = c.workspace_id)

UNION ALL SELECT
  'B4. Disputes workspace_id mismatch with contract',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — dispute workspace != contract workspace' END
FROM contract_disputes cd
JOIN contracts c ON c.id = cd.contract_id
WHERE cd.workspace_id IS DISTINCT FROM c.workspace_id

UNION ALL SELECT
  'B5. Contracts with duplicate active disputes',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'FAIL — multiple open disputes per contract' END
FROM (
  SELECT contract_id
  FROM contract_disputes
  WHERE status IN ('open', 'under_review')
  GROUP BY contract_id
  HAVING count(*) > 1
) dup

UNION ALL SELECT
  'B6. escrow_lock rows with no matching contract',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — stale escrow references' END
FROM wallet_transactions wt
WHERE wt.type = 'escrow_lock'
  AND wt.reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.id::text = wt.reference_id)

UNION ALL SELECT
  'B7. Active disputes on cancelled/rejected contracts',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — open dispute on closed contract' END
FROM contract_disputes cd
JOIN contracts c ON c.id = cd.contract_id
WHERE cd.status IN ('open', 'under_review')
  AND c.status IN ('cancelled', 'rejected')
  AND c.deleted_at IS NULL

UNION ALL SELECT
  'B8. Portal talents visible in open-space queries',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — portal-only talents have marketplace_visible = true' END
FROM talent_profiles tp
JOIN premium_workspace_talents pwt
  ON pwt.talent_user_id = tp.user_id
  AND pwt.status = 'active'
  AND pwt.removed_at IS NULL
WHERE tp.marketplace_visible = true
  AND tp.deleted_at IS NULL

UNION ALL SELECT
  'B9. Premium workspace members in deleted workspaces',
  count(*)::int,
  CASE WHEN count(*) = 0 THEN 'OK'
       ELSE 'WARN — active members in deleted workspace' END
FROM premium_workspace_members pwm
JOIN premium_workspaces pw ON pw.id = pwm.workspace_id
WHERE pwm.status = 'active'
  AND pw.deleted_at IS NOT NULL


-- =============================================================================
-- PART C — DEMO FLOW READINESS (informational, not pass/fail per se)
-- The demo needs populated data to be believable.
-- =============================================================================

UNION ALL SELECT
  'C1. Open jobs (need >= 2 for demo)',
  count(*)::int,
  CASE WHEN count(*) >= 2 THEN 'OK'
       ELSE 'WARN — fewer than 2 open jobs visible in open space' END
FROM jobs
WHERE status = 'open'
  AND workspace_id IS NULL
  AND deleted_at IS NULL

UNION ALL SELECT
  'C2. Paid contracts (need >= 1 for demo)',
  count(*)::int,
  CASE WHEN count(*) >= 1 THEN 'OK'
       ELSE 'WARN — no paid contracts for demo financial flow' END
FROM contracts
WHERE status = 'paid'
  AND deleted_at IS NULL

UNION ALL SELECT
  'C3. Escrowed contracts (need >= 1 for demo)',
  count(*)::int,
  CASE WHEN count(*) >= 1 THEN 'OK'
       ELSE 'WARN — no confirmed/escrowed contracts' END
FROM contracts
WHERE status = 'confirmed'
  AND deleted_at IS NULL

UNION ALL SELECT
  'C4. Active premium workspaces (need >= 1)',
  count(*)::int,
  CASE WHEN count(*) >= 1 THEN 'OK'
       ELSE 'WARN — no active premium workspace for demo' END
FROM premium_workspaces
WHERE status = 'active'
  AND deleted_at IS NULL

UNION ALL SELECT
  'C5. Disputes (need >= 1 for dispute demo)',
  count(*)::int,
  CASE WHEN count(*) >= 1 THEN 'OK'
       ELSE 'WARN — no disputes exist for dispute flow demo' END
FROM contract_disputes

UNION ALL SELECT
  'C6. Talent profiles (need >= 3)',
  count(*)::int,
  CASE WHEN count(*) >= 3 THEN 'OK'
       ELSE 'WARN — fewer than 3 talent profiles' END
FROM talent_profiles
WHERE deleted_at IS NULL

UNION ALL SELECT
  'C7. Agencies (need >= 1)',
  count(*)::int,
  CASE WHEN count(*) >= 1 THEN 'OK'
       ELSE 'FAIL — no agencies in the platform' END
FROM agencies
WHERE deleted_at IS NULL

)

SELECT
  check_name,
  count,
  status
FROM checks
ORDER BY
  CASE status
    WHEN 'FAIL' THEN 0
    WHEN 'WARN' THEN 1
    ELSE 2
  END,
  check_name;


-- =============================================================================
-- PART D — PLATFORM HEALTH SNAPSHOT (informational, not pass/fail)
-- Shows what real polished data exists for the demo.
-- Run this after the checks to see the full picture.
-- =============================================================================

SELECT
  'Active open-space jobs'               AS metric,
  count(*)::int                          AS value,
  'Open space demo data'                 AS "context"
FROM jobs WHERE status = 'open' AND workspace_id IS NULL AND deleted_at IS NULL

UNION ALL SELECT 'Active workspace jobs', count(*)::int, 'Premium workspace demo data'
FROM jobs WHERE status = 'open' AND workspace_id IS NOT NULL AND deleted_at IS NULL

UNION ALL SELECT 'Talent profiles (total)', count(*)::int, 'Available talent pool'
FROM talent_profiles WHERE deleted_at IS NULL

UNION ALL SELECT 'Agencies (total)', count(*)::int, 'Agency user base'
FROM agencies WHERE deleted_at IS NULL

UNION ALL SELECT 'Contracts — sent', count(*)::int, 'Awaiting talent signature'
FROM contracts WHERE status = 'sent' AND deleted_at IS NULL

UNION ALL SELECT 'Contracts — confirmed (escrowed)', count(*)::int, 'Active escrow'
FROM contracts WHERE status = 'confirmed' AND deleted_at IS NULL

UNION ALL SELECT 'Contracts — paid', count(*)::int, 'Completed transactions'
FROM contracts WHERE status = 'paid' AND deleted_at IS NULL

UNION ALL SELECT 'Contracts — cancelled', count(*)::int, 'Cancelled (expected some)'
FROM contracts WHERE status = 'cancelled' AND deleted_at IS NULL

UNION ALL SELECT 'Disputes — open', count(*)::int, 'Needs admin action'
FROM contract_disputes WHERE status = 'open'

UNION ALL SELECT 'Disputes — under_review', count(*)::int, 'Being reviewed by admin'
FROM contract_disputes WHERE status = 'under_review'

UNION ALL SELECT 'Disputes — resolved (all types)', count(*)::int, 'Historical disputes'
FROM contract_disputes WHERE status NOT IN ('open', 'under_review')

UNION ALL SELECT 'Active premium workspaces', count(*)::int, 'Premium environment'
FROM premium_workspaces WHERE status = 'active' AND deleted_at IS NULL

UNION ALL SELECT 'Open support tickets', count(*)::int, 'Awaiting admin reply'
FROM support_conversations WHERE status = 'waiting_admin' AND archived_at IS NULL

UNION ALL SELECT 'Total notifications', count(*)::int, 'Platform activity'
FROM notifications

ORDER BY metric;
