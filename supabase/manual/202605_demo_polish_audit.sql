-- =============================================================================
-- BrisaHub Demo Polish Audit
-- Purpose  : Find all ugly / test / dev strings in user-facing fields
--            before the persona seed pass.
-- Created  : 2026-05
-- Run via  : Supabase SQL Editor, as service role (READ ONLY — no writes)
--
-- HOW TO USE
--   Run this script first.
--   Review each result section.
--   Then run 202605_demo_persona_seed.sql to fix what you find here.
--   Then run 202605_demo_health_check.sql to verify.
--
-- UGLY PATTERN DEFINITION
--   Any string in a user-facing display field that contains:
--     test | asd | qa | seed | lorem | pdf | temp | demo | fake | lorem ipsum
--   OR is blank/null in a required display field.
-- =============================================================================


-- =============================================================================
-- PART 1 — AGENCIES
-- =============================================================================

SELECT
  '1. AGENCIES'                     AS "section",
  id::text,
  company_name                      AS "company_name",
  contact_name                      AS "contact_name",
  city                              AS "city",
  LEFT(coalesce(description, ''), 60) AS "description_preview",
  created_at::date                  AS "created"
FROM agencies
WHERE company_name ILIKE '%test%'
   OR company_name ILIKE '%asd%'
   OR company_name ILIKE '%qa%'
   OR company_name ILIKE '%seed%'
   OR company_name ILIKE '%lorem%'
   OR company_name ILIKE '%demo%'
   OR company_name ILIKE '%temp%'
   OR company_name IS NULL
   OR company_name = ''
   OR contact_name ILIKE '%test%'
   OR contact_name ILIKE '%asd%'
ORDER BY created_at;


-- =============================================================================
-- PART 2 — TALENT PROFILES
-- =============================================================================

SELECT
  '2. TALENT PROFILES'              AS "section",
  id::text,
  user_id::text                     AS "user_id",
  full_name,
  city,
  LEFT(coalesce(bio, ''), 80)       AS "bio_preview",
  marketplace_visible,
  created_at::date                  AS "created"
FROM talent_profiles
WHERE full_name ILIKE '%test%'
   OR full_name ILIKE '%asd%'
   OR full_name ILIKE '%qa%'
   OR full_name ILIKE '%seed%'
   OR full_name ILIKE '%lorem%'
   OR full_name ILIKE '%demo%'
   OR full_name IS NULL
   OR full_name = ''
   OR bio ILIKE '%lorem ipsum%'
   OR bio ILIKE '%test bio%'
ORDER BY created_at;


-- =============================================================================
-- PART 3 — JOBS
-- =============================================================================

SELECT
  '3. JOBS'                         AS "section",
  id::text,
  title,
  status,
  LEFT(coalesce(description, ''), 80) AS "description_preview",
  location,
  created_at::date                  AS "created"
FROM jobs
WHERE title ILIKE '%test%'
   OR title ILIKE '%asd%'
   OR title ILIKE '%qa%'
   OR title ILIKE '%seed%'
   OR title ILIKE '%lorem%'
   OR title ILIKE '%pdf%'
   OR title ILIKE '%demo%'
   OR title ILIKE '%temp%'
   OR title ILIKE '%fake%'
   OR description ILIKE '%lorem ipsum%'
   OR description ILIKE '%[QA%'
ORDER BY created_at;


-- =============================================================================
-- PART 4 — PREMIUM WORKSPACES
-- =============================================================================

SELECT
  '4. WORKSPACES'                   AS "section",
  id::text,
  name,
  slug,
  status,
  created_at::date                  AS "created"
FROM premium_workspaces
WHERE name ILIKE '%test%'
   OR name ILIKE '%asd%'
   OR name ILIKE '%qa%'
   OR name ILIKE '%seed%'
   OR name ILIKE '%lorem%'
   OR name ILIKE '%demo%'
   OR name IS NULL
   OR name = ''
ORDER BY created_at;


-- =============================================================================
-- PART 5 — CONTRACTS (job_description field only — financial fields untouched)
-- =============================================================================

SELECT
  '5. CONTRACTS'                    AS "section",
  id::text,
  status,
  payment_amount,
  LEFT(coalesce(job_description, ''), 80) AS "job_description_preview",
  created_at::date                  AS "created"
FROM contracts
WHERE (
  job_description ILIKE '%test%'
  OR job_description ILIKE '%asd%'
  OR job_description ILIKE '%qa%'
  OR job_description ILIKE '%seed%'
  OR job_description ILIKE '%lorem%'
  OR job_description ILIKE '%pdf%'
  OR job_description ILIKE '%demo%'
)
AND deleted_at IS NULL
ORDER BY created_at;


-- =============================================================================
-- PART 6 — BOOKINGS (job_title display field)
-- =============================================================================

SELECT
  '6. BOOKINGS'                     AS "section",
  id::text,
  job_title,
  status,
  price,
  created_at::date                  AS "created"
FROM bookings
WHERE job_title ILIKE '%test%'
   OR job_title ILIKE '%asd%'
   OR job_title ILIKE '%qa%'
   OR job_title ILIKE '%seed%'
   OR job_title ILIKE '%lorem%'
   OR job_title ILIKE '%[QA%'
   OR job_title ILIKE '%demo%'
ORDER BY created_at;


-- =============================================================================
-- PART 7 — DISPUTES (reason / resolution_note)
-- =============================================================================

SELECT
  '7. DISPUTES'                     AS "section",
  id::text,
  contract_id::text,
  status,
  LEFT(coalesce(reason, ''), 100)   AS "reason_preview",
  LEFT(coalesce(resolution_note, ''), 80) AS "resolution_note_preview",
  created_at::date                  AS "created"
FROM contract_disputes
WHERE reason ILIKE '%test%'
   OR reason ILIKE '%asd%'
   OR reason ILIKE '%qa%'
   OR reason ILIKE '%seed%'
   OR reason ILIKE '%lorem%'
   OR reason ILIKE '%demo%'
   OR reason ILIKE '%[QA%'
   OR resolution_note ILIKE '%test%'
   OR resolution_note ILIKE '%lorem%'
   OR resolution_note ILIKE '%[QA%'
ORDER BY created_at;


-- =============================================================================
-- PART 8 — SUPPORT CONVERSATIONS (subject line)
-- =============================================================================

SELECT
  '8. SUPPORT'                      AS "section",
  id::text,
  subject,
  status,
  created_at::date                  AS "created"
FROM support_conversations
WHERE subject ILIKE '%test%'
   OR subject ILIKE '%asd%'
   OR subject ILIKE '%qa%'
   OR subject ILIKE '%seed%'
   OR subject ILIKE '%lorem%'
   OR subject ILIKE '%demo%'
ORDER BY created_at;


-- =============================================================================
-- PART 9 — NOTIFICATIONS (message field)
-- =============================================================================

SELECT
  '9. NOTIFICATIONS'                AS "section",
  id::text,
  type,
  LEFT(coalesce(message, ''), 80)   AS "message_preview",
  created_at::date                  AS "created"
FROM notifications
WHERE COALESCE(message, '') ILIKE '%[QA%'
   OR COALESCE(message, '') ILIKE '%test%'
   OR COALESCE(message, '') ILIKE '%seed%'
   OR COALESCE(message, '') ILIKE '%lorem%'
ORDER BY created_at;


-- =============================================================================
-- PART 10 — SUMMARY COUNT BY TABLE
-- Quick overview of how many rows need polish
-- =============================================================================

SELECT 'agencies (ugly name)'        AS "category", count(*)::int AS "rows_needing_polish"
FROM agencies
WHERE company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR company_name ILIKE '%qa%'
   OR company_name ILIKE '%seed%' OR company_name ILIKE '%lorem%' OR company_name ILIKE '%demo%'
   OR company_name IS NULL OR company_name = ''
UNION ALL
SELECT 'talent_profiles (ugly name)', count(*)::int
FROM talent_profiles
WHERE full_name ILIKE '%test%' OR full_name ILIKE '%asd%' OR full_name ILIKE '%qa%'
   OR full_name ILIKE '%seed%' OR full_name IS NULL OR full_name = ''
UNION ALL
SELECT 'jobs (ugly title)', count(*)::int
FROM jobs
WHERE (title ILIKE '%test%' OR title ILIKE '%asd%' OR title ILIKE '%qa%'
    OR title ILIKE '%seed%' OR title ILIKE '%lorem%' OR title ILIKE '%pdf%'
    OR title ILIKE '%demo%')
  AND deleted_at IS NULL
UNION ALL
SELECT 'premium_workspaces (ugly name)', count(*)::int
FROM premium_workspaces
WHERE name ILIKE '%test%' OR name ILIKE '%asd%' OR name ILIKE '%qa%'
   OR name ILIKE '%seed%' OR name ILIKE '%demo%' OR name IS NULL OR name = ''
UNION ALL
SELECT 'contracts (ugly job_description)', count(*)::int
FROM contracts
WHERE (job_description ILIKE '%test%' OR job_description ILIKE '%asd%'
    OR job_description ILIKE '%seed%' OR job_description ILIKE '%lorem%')
  AND deleted_at IS NULL
UNION ALL
SELECT 'bookings (ugly job_title)', count(*)::int
FROM bookings
WHERE job_title ILIKE '%test%' OR job_title ILIKE '%asd%'
   OR job_title ILIKE '%qa%' OR job_title ILIKE '%seed%' OR job_title ILIKE '%[QA%'
UNION ALL
SELECT 'disputes (ugly reason)', count(*)::int
FROM contract_disputes
WHERE reason ILIKE '%test%' OR reason ILIKE '%asd%' OR reason ILIKE '%seed%'
   OR reason ILIKE '%lorem%' OR reason ILIKE '%[QA%'
UNION ALL
SELECT 'support_conversations (ugly subject)', count(*)::int
FROM support_conversations
WHERE subject ILIKE '%test%' OR subject ILIKE '%asd%' OR subject ILIKE '%lorem%'
UNION ALL
SELECT 'notifications (QA/test message)', count(*)::int
FROM notifications
WHERE COALESCE(message, '') ILIKE '%[QA%' OR COALESCE(message, '') ILIKE '%test%'
   OR COALESCE(message, '') ILIKE '%seed%'

ORDER BY "rows_needing_polish" DESC, "category";
