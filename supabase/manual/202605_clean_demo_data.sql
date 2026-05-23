-- =============================================================================
-- BrisaHub Demo Data Cleanup
-- Purpose  : Remove QA / test seed rows before demo recording or acquisition
-- Created  : 2026-05
-- Run via  : Supabase SQL Editor, as service role
--
-- STRATEGY
--   1. PREVIEW sections (SELECT only) — run first, review output.
--   2. CLEANUP sections (DELETE/UPDATE) — run after reviewing previews.
--   3. VERIFY section — run last; every count should be 0.
--
-- WHAT IS REMOVED
--   A. Rows tagged [QA seed] — created by 20260522_seed_dispute_test.sql
--   B. Rows tagged [QA test] — created by /api/admin/disputes/qa-create
--   C. Referral test submissions — created by /api/admin/referrals/test-email
--   D. Notifications referencing QA/test content
--   E. Other obvious non-demo rows (reviewed in Section 3 before deletion)
--
-- WHAT IS NOT REMOVED
--   - Real user accounts and profiles
--   - Real jobs, bookings, contracts, payments
--   - Financial transactions (wallet_transactions) except QA escrow rows
--   - Migrations, schema, RLS policies
--   - Polished demo disputes if any exist with real content
-- =============================================================================


-- =============================================================================
-- SECTION 0 — PREVIEW (run first, review before deleting anything)
-- =============================================================================

-- 0a. QA seed jobs
SELECT id, title, status, created_at
FROM jobs
WHERE title ILIKE '%[QA seed]%'
   OR description ILIKE '%[QA seed]%'
ORDER BY created_at DESC;

-- 0b. QA seed / QA test disputes
SELECT cd.id, cd.contract_id, cd.status, LEFT(cd.reason, 80) AS reason_preview, cd.created_at
FROM contract_disputes cd
WHERE cd.reason ILIKE '%[QA seed]%'
   OR cd.reason ILIKE '%[QA test]%'
   OR cd.resolution_note ILIKE '%[QA seed]%'
   OR cd.contract_id IN (
     SELECT c.id FROM contracts c
     JOIN jobs j ON j.id = c.job_id
     WHERE j.title ILIKE '%[QA seed]%' OR j.description ILIKE '%[QA seed]%'
   )
ORDER BY cd.created_at DESC;

-- 0c. QA seed wallet transactions
SELECT id, type, amount, LEFT(description, 80) AS description_preview, created_at
FROM wallet_transactions
WHERE description ILIKE '%[QA seed]%'
   OR reference_id IN (
     SELECT c.id::text FROM contracts c
     JOIN jobs j ON j.id = c.job_id
     WHERE j.title ILIKE '%[QA seed]%' OR j.description ILIKE '%[QA seed]%'
   )
   OR idempotency_key IN (
     SELECT 'escrow_' || c.id::text FROM contracts c
     JOIN jobs j ON j.id = c.job_id
     WHERE j.title ILIKE '%[QA seed]%' OR j.description ILIKE '%[QA seed]%'
   )
ORDER BY created_at DESC;

-- 0d. Referral test submissions (created by /api/admin/referrals/test-email)
SELECT id, job_id, email, LEFT(bio, 80) AS bio_preview, created_at
FROM submissions
WHERE bio = 'Referral email test sent by admin.'
ORDER BY created_at DESC;

-- 0e. QA/test notifications
-- Assumption verified against current Supabase schema/migrations:
-- notifications has message/type/link/created_at and does not have title/body.
SELECT id, type, LEFT(COALESCE(message, ''), 60) AS message_preview, link, created_at
FROM notifications
WHERE COALESCE(message, '') ILIKE '%[QA%'
ORDER BY created_at DESC;

-- 0f. Manual review — other suspicious patterns (review before acting)
--     These may include legitimate rows; review output before uncommenting DELETEs below.
SELECT 'jobs' AS "table", id::text, title AS "text_value", created_at
FROM jobs
WHERE (
    title ILIKE '%asd%'
    OR title ILIKE '%lorem%'
    OR title ILIKE '%pdf test%'
    OR title ILIKE '%wallet test%'
    OR title ILIKE '%escrow test%'
    OR description ILIKE '%asd%'
    OR description ILIKE '%lorem ipsum%'
)
AND deleted_at IS NULL
UNION ALL
SELECT 'support_conversations', id::text, subject, created_at
FROM support_conversations
WHERE subject ILIKE '%test%'
   OR subject ILIKE '%asd%'
   OR subject ILIKE '%qa%'
ORDER BY created_at DESC;


-- =============================================================================
-- SECTION 1 — CLEAN [QA seed] TAGGED DATA
-- Rows created by: supabase/manual/20260522_seed_dispute_test.sql
-- =============================================================================

DO $$
DECLARE
  v_qa_job_ids      uuid[];
  v_qa_contract_ids uuid[];
  v_rows_deleted    int;
BEGIN
  -- Collect job IDs tagged [QA seed]
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO v_qa_job_ids
  FROM jobs
  WHERE title ILIKE '%[QA seed]%'
     OR description ILIKE '%[QA seed]%';

  -- Collect contract IDs linked to those jobs
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO v_qa_contract_ids
  FROM contracts
  WHERE job_id = ANY(v_qa_job_ids);

  RAISE NOTICE '[QA seed] jobs found    : %', coalesce(array_length(v_qa_job_ids, 1), 0);
  RAISE NOTICE '[QA seed] contracts found: %', coalesce(array_length(v_qa_contract_ids, 1), 0);

  -- 1a. Dispute notes (child of contract_disputes)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contract_dispute_notes'
  ) THEN
    DELETE FROM contract_dispute_notes
    WHERE dispute_id IN (
      SELECT id FROM contract_disputes
      WHERE contract_id = ANY(v_qa_contract_ids)
         OR reason ILIKE '%[QA seed]%'
         OR reason ILIKE '%[QA test]%'
    );
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted dispute notes : %', v_rows_deleted;
  END IF;

  -- 1b. Disputes (both [QA seed] reason AND [QA test] reason)
  DELETE FROM contract_disputes
  WHERE reason ILIKE '%[QA seed]%'
     OR reason ILIKE '%[QA test]%'
     OR resolution_note ILIKE '%[QA seed]%'
     OR contract_id = ANY(v_qa_contract_ids);
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted disputes       : %', v_rows_deleted;

  -- 1c. QA escrow wallet transactions (do NOT touch real financial rows)
  DELETE FROM wallet_transactions
  WHERE description ILIKE '%[QA seed]%'
     OR reference_id IN (
       SELECT cid::text FROM unnest(v_qa_contract_ids) AS cid
     )
     OR idempotency_key IN (
       SELECT 'escrow_' || cid::text FROM unnest(v_qa_contract_ids) AS cid
     );
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted wallet_transactions: %', v_rows_deleted;

  -- 1d. Contracts
  DELETE FROM contracts
  WHERE id = ANY(v_qa_contract_ids);
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted contracts      : %', v_rows_deleted;

  -- 1e. Bookings
  DELETE FROM bookings
  WHERE job_id = ANY(v_qa_job_ids)
     OR job_title ILIKE '%[QA seed]%';
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted bookings       : %', v_rows_deleted;

  -- 1f. Jobs
  DELETE FROM jobs
  WHERE id = ANY(v_qa_job_ids);
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted jobs           : %', v_rows_deleted;

  RAISE NOTICE '--- Section 1 complete ---';
END $$;


-- =============================================================================
-- SECTION 2 — CLEAN REFERRAL TEST DATA
-- Rows created by: /api/admin/referrals/test-email
-- The submissions.bio field is set to the sentinel string below.
-- =============================================================================

DO $$
DECLARE
  v_test_submission_ids uuid[];
  v_rows_deleted        int;
BEGIN
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO v_test_submission_ids
  FROM submissions
  WHERE bio = 'Referral email test sent by admin.';

  RAISE NOTICE 'Referral test submissions found: %', coalesce(array_length(v_test_submission_ids, 1), 0);

  -- Referral invites reference submissions
  DELETE FROM referral_invites
  WHERE submission_id = ANY(v_test_submission_ids);
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted referral invites: %', v_rows_deleted;

  DELETE FROM submissions
  WHERE id = ANY(v_test_submission_ids);
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted test submissions: %', v_rows_deleted;

  RAISE NOTICE '--- Section 2 complete ---';
END $$;


-- =============================================================================
-- SECTION 3 — CLEAN QA/TEST NOTIFICATIONS
-- =============================================================================

DO $$
DECLARE
  v_rows_deleted int;
BEGIN
  -- Assumption verified against current Supabase schema/migrations:
  -- cleanup must match notifications.message because title/body do not exist.
  DELETE FROM notifications
  WHERE COALESCE(message, '') ILIKE '%[QA%';
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted QA notifications: %', v_rows_deleted;

  RAISE NOTICE '--- Section 3 complete ---';
END $$;


-- =============================================================================
-- SECTION 4 — MANUAL / OPTIONAL: Suspicious patterns (review 0f preview first)
--
-- These are COMMENTED OUT. Only uncomment after reviewing Section 0f output.
-- Patterns like 'asd', 'lorem', 'pdf test' may appear in legitimate rows.
-- =============================================================================

-- -- Delete jobs with clearly test-only titles (review 0f first):
-- DELETE FROM jobs
-- WHERE title ILIKE '%asd%'
--    OR title ILIKE '%lorem ipsum%'
--    OR title ILIKE '%pdf test%'
--    OR title ILIKE '%wallet test%'
--    OR title ILIKE '%escrow test%';
--
-- -- Delete test support conversations (review subject list in 0f first):
-- DELETE FROM support_messages
-- WHERE conversation_id IN (
--   SELECT id FROM support_conversations
--   WHERE subject ILIKE '%test%' AND subject ILIKE '%asd%'
-- );
-- DELETE FROM support_conversations
-- WHERE subject ILIKE '%asd%';


-- =============================================================================
-- SECTION 5 — FINAL VERIFICATION (should all return 0)
-- =============================================================================

SELECT
  '[QA seed] jobs remaining'           AS check_name,
  count(*)                             AS count
FROM jobs
WHERE title ILIKE '%[QA seed]%' OR description ILIKE '%[QA seed]%'

UNION ALL SELECT
  '[QA seed] disputes remaining',
  count(*)
FROM contract_disputes
WHERE reason ILIKE '%[QA seed]%' OR resolution_note ILIKE '%[QA seed]%'

UNION ALL SELECT
  '[QA test] disputes remaining',
  count(*)
FROM contract_disputes
WHERE reason ILIKE '%[QA test]%'

UNION ALL SELECT
  'Referral test submissions remaining',
  count(*)
FROM submissions
WHERE bio = 'Referral email test sent by admin.'

UNION ALL SELECT
  '[QA] notifications remaining',
  count(*)
FROM notifications
WHERE COALESCE(message, '') ILIKE '%[QA%'

ORDER BY check_name;
