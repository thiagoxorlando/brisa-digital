-- =============================================================================
-- BrisaHub Full UI Content Audit
-- Purpose  : Detect ALL ugly, test, keyboard-mash, and placeholder strings
--            in user-facing display fields across the entire platform.
-- Created  : 2026-05
-- Run via  : Supabase SQL Editor, as service role (READ ONLY — no writes)
--
-- HOW TO USE
--   1. Run this script to identify all fields needing polish.
--   2. Run 202605_demo_content_normalizer.sql to fix detected patterns.
--   3. Run 202605_demo_health_check.sql to verify cleanup.
--
-- PATTERNS DETECTED
--   Known test markers  : [QA seed], [QA test], [qa], seed, lorem
--   Common keyboard-mash: asd, sdf, dfg, qwe, wer, ert, rty, zxc, xcv, cvb
--   Extended mash       : sdfasdf, qwerty, asdfgh, zxcvbn, adsasd, sdasd
--   Repeated chars      : xxx, yyy, zzz, aaa, bbb, 111, 222, 333 and 3+ repeated
--   Garbage patterns    : test, demo, fake, temp, pdf, placeholder, dummy, foobar
--   Short/empty         : null or <= 2 chars in required name fields
--   All-digit names     : names that are entirely numeric
-- =============================================================================


-- =============================================================================
-- PART 1 — AGENCIES
-- =============================================================================

SELECT
  '1. AGENCIES — company_name'           AS "section_field",
  id::text,
  company_name                           AS "value",
  contact_name,
  city,
  created_at::date                       AS "created"
FROM agencies
WHERE company_name ILIKE '%test%'
   OR company_name ILIKE '%asd%'
   OR company_name ILIKE '%sdf%'
   OR company_name ILIKE '%qwe%'
   OR company_name ILIKE '%zxc%'
   OR company_name ILIKE '%xcv%'
   OR company_name ILIKE '%lorem%'
   OR company_name ILIKE '%seed%'
   OR company_name ILIKE '%qa%'
   OR company_name ILIKE '%demo%'
   OR company_name ILIKE '%fake%'
   OR company_name ILIKE '%temp%'
   OR company_name ILIKE '%dummy%'
   OR company_name ILIKE '%foobar%'
   OR company_name ILIKE '%pdf%'
   OR company_name ILIKE '%xxx%'
   OR company_name ILIKE '%yyy%'
   OR company_name ILIKE '%zzz%'
   OR company_name ILIKE '%111%'
   OR company_name ILIKE '%222%'
   OR company_name ILIKE '%333%'
   OR company_name ~ '(.)\1\1'
   OR company_name IS NULL
   OR trim(company_name) = ''
   OR length(trim(company_name)) <= 2
   OR (company_name ~ '^[0-9]+$')

UNION ALL

SELECT
  '1. AGENCIES — contact_name',
  id::text,
  contact_name,
  company_name,
  city,
  created_at::date
FROM agencies
WHERE contact_name ILIKE '%test%'
   OR contact_name ILIKE '%asd%'
   OR contact_name ILIKE '%qwe%'
   OR contact_name ILIKE '%sdf%'
   OR contact_name ILIKE '%lorem%'
   OR contact_name ILIKE '%seed%'
   OR contact_name ILIKE '%fake%'
   OR contact_name ILIKE '%dummy%'
   OR contact_name ~ '(.)\1\1'
   OR trim(contact_name) = ''
   OR (contact_name IS NOT NULL AND length(trim(contact_name)) <= 2)

ORDER BY "created";


-- =============================================================================
-- PART 2 — TALENT PROFILES
-- =============================================================================

SELECT
  '2. TALENT PROFILES — full_name'       AS "section_field",
  id::text,
  full_name                              AS "value",
  city,
  marketplace_visible,
  created_at::date                       AS "created"
FROM talent_profiles
WHERE full_name ILIKE '%test%'
   OR full_name ILIKE '%asd%'
   OR full_name ILIKE '%sdf%'
   OR full_name ILIKE '%qwe%'
   OR full_name ILIKE '%zxc%'
   OR full_name ILIKE '%lorem%'
   OR full_name ILIKE '%seed%'
   OR full_name ILIKE '%qa%'
   OR full_name ILIKE '%demo%'
   OR full_name ILIKE '%fake%'
   OR full_name ILIKE '%dummy%'
   OR full_name ILIKE '%xxx%'
   OR full_name ~ '(.)\1\1'
   OR full_name IS NULL
   OR trim(full_name) = ''
   OR length(trim(full_name)) <= 2
   OR (full_name ~ '^[0-9]+$')

UNION ALL

SELECT
  '2. TALENT PROFILES — bio (preview)',
  id::text,
  LEFT(coalesce(bio, ''), 100),
  city,
  marketplace_visible,
  created_at::date
FROM talent_profiles
WHERE bio ILIKE '%lorem ipsum%'
   OR bio ILIKE '%test bio%'
   OR bio ILIKE '%[QA%'
   OR bio ILIKE '%asd asd%'
   OR bio ILIKE '%sdf sdf%'
   OR bio ILIKE '%placeholder%'
   OR bio ILIKE '%dummy%'
   OR bio ~ '(.)\1\1\1'

ORDER BY "created";


-- =============================================================================
-- PART 3 — JOBS
-- =============================================================================

SELECT
  '3. JOBS — title'                      AS "section_field",
  id::text,
  title                                  AS "value",
  status,
  created_at::date                       AS "created"
FROM jobs
WHERE title ILIKE '%test%'
   OR title ILIKE '%asd%'
   OR title ILIKE '%sdf%'
   OR title ILIKE '%qwe%'
   OR title ILIKE '%zxc%'
   OR title ILIKE '%lorem%'
   OR title ILIKE '%seed%'
   OR title ILIKE '%[QA%'
   OR title ILIKE '%demo%'
   OR title ILIKE '%fake%'
   OR title ILIKE '%temp%'
   OR title ILIKE '%dummy%'
   OR title ILIKE '%pdf%'
   OR title ILIKE '%foobar%'
   OR title ILIKE '%xxx%'
   OR title ~ '(.)\1\1'
   OR trim(title) = ''
   OR length(trim(title)) <= 3
   OR (title ~ '^[0-9 ]+$')

UNION ALL

SELECT
  '3. JOBS — description (preview)',
  id::text,
  LEFT(coalesce(description, ''), 100),
  status,
  created_at::date
FROM jobs
WHERE description ILIKE '%lorem ipsum%'
   OR description ILIKE '%[QA seed]%'
   OR description ILIKE '%[QA test]%'
   OR description ILIKE '%asd asd%'
   OR description ILIKE '%sdf sdf%'
   OR description ILIKE '%placeholder%'
   OR description ILIKE '%dummy%'

ORDER BY "created";


-- =============================================================================
-- PART 4 — PREMIUM WORKSPACES
-- =============================================================================

SELECT
  '4. WORKSPACES — name'                 AS "section_field",
  id::text,
  name                                   AS "value",
  slug,
  status,
  created_at::date                       AS "created"
FROM premium_workspaces
WHERE name ILIKE '%test%'
   OR name ILIKE '%asd%'
   OR name ILIKE '%sdf%'
   OR name ILIKE '%qwe%'
   OR name ILIKE '%lorem%'
   OR name ILIKE '%seed%'
   OR name ILIKE '%qa%'
   OR name ILIKE '%demo%'
   OR name ILIKE '%fake%'
   OR name ILIKE '%temp%'
   OR name ILIKE '%dummy%'
   OR name ILIKE '%xxx%'
   OR name ~ '(.)\1\1'
   OR name IS NULL
   OR trim(name) = ''
   OR length(trim(name)) <= 2

ORDER BY "created";


-- =============================================================================
-- PART 5 — CONTRACTS (display fields only — financial untouched)
-- =============================================================================

SELECT
  '5. CONTRACTS — job_description (preview)' AS "section_field",
  id::text,
  LEFT(coalesce(job_description, ''), 100)   AS "value",
  status,
  created_at::date                           AS "created"
FROM contracts
WHERE (
  job_description ILIKE '%test%'
  OR job_description ILIKE '%asd%'
  OR job_description ILIKE '%sdf%'
  OR job_description ILIKE '%qwe%'
  OR job_description ILIKE '%lorem%'
  OR job_description ILIKE '%seed%'
  OR job_description ILIKE '%[QA%'
  OR job_description ILIKE '%pdf%'
  OR job_description ILIKE '%demo%'
  OR job_description ILIKE '%fake%'
  OR job_description ILIKE '%dummy%'
  OR job_description ILIKE '%placeholder%'
  OR job_description ~ '(.)\1\1\1'
)
AND deleted_at IS NULL

ORDER BY "created";


-- =============================================================================
-- PART 6 — BOOKINGS
-- =============================================================================

SELECT
  '6. BOOKINGS — job_title'              AS "section_field",
  id::text,
  job_title                              AS "value",
  status,
  price::text                            AS "price",
  created_at::date                       AS "created"
FROM bookings
WHERE job_title ILIKE '%test%'
   OR job_title ILIKE '%asd%'
   OR job_title ILIKE '%sdf%'
   OR job_title ILIKE '%qwe%'
   OR job_title ILIKE '%lorem%'
   OR job_title ILIKE '%seed%'
   OR job_title ILIKE '%[QA%'
   OR job_title ILIKE '%demo%'
   OR job_title ILIKE '%fake%'
   OR job_title ILIKE '%dummy%'
   OR job_title ILIKE '%pdf%'
   OR job_title ~ '(.)\1\1'
   OR trim(job_title) = ''
   OR length(trim(job_title)) <= 3

ORDER BY "created";


-- =============================================================================
-- PART 7 — DISPUTES
-- =============================================================================

SELECT
  '7. DISPUTES — reason'                 AS "section_field",
  id::text,
  LEFT(coalesce(reason, ''), 120)        AS "value",
  status,
  created_at::date                       AS "created"
FROM contract_disputes
WHERE reason ILIKE '%test%'
   OR reason ILIKE '%asd%'
   OR reason ILIKE '%sdf%'
   OR reason ILIKE '%qwe%'
   OR reason ILIKE '%lorem%'
   OR reason ILIKE '%seed%'
   OR reason ILIKE '%[QA%'
   OR reason ILIKE '%demo%'
   OR reason ILIKE '%fake%'
   OR reason ILIKE '%dummy%'
   OR reason ILIKE '%placeholder%'
   OR reason ~ '(.)\1\1\1'

UNION ALL

SELECT
  '7. DISPUTES — resolution_note',
  id::text,
  LEFT(coalesce(resolution_note, ''), 120),
  status,
  created_at::date
FROM contract_disputes
WHERE resolution_note ILIKE '%test%'
   OR resolution_note ILIKE '%asd%'
   OR resolution_note ILIKE '%lorem%'
   OR resolution_note ILIKE '%seed%'
   OR resolution_note ILIKE '%[QA%'
   OR resolution_note ILIKE '%demo%'
   OR resolution_note ILIKE '%dummy%'
   OR resolution_note ILIKE '%placeholder%'
   OR resolution_note ~ '(.)\1\1\1'

ORDER BY "created";


-- =============================================================================
-- PART 8 — SUPPORT CONVERSATIONS
-- =============================================================================

SELECT
  '8. SUPPORT — subject'                 AS "section_field",
  id::text,
  subject                                AS "value",
  status,
  created_at::date                       AS "created"
FROM support_conversations
WHERE subject ILIKE '%test%'
   OR subject ILIKE '%asd%'
   OR subject ILIKE '%sdf%'
   OR subject ILIKE '%qwe%'
   OR subject ILIKE '%lorem%'
   OR subject ILIKE '%seed%'
   OR subject ILIKE '%qa%'
   OR subject ILIKE '%demo%'
   OR subject ILIKE '%fake%'
   OR subject ILIKE '%dummy%'
   OR subject ~ '(.)\1\1'
   OR trim(subject) = ''
   OR length(trim(subject)) <= 3

ORDER BY "created";


-- =============================================================================
-- PART 9 — NOTIFICATIONS
-- =============================================================================

SELECT
  '9. NOTIFICATIONS — message'           AS "section_field",
  id::text,
  LEFT(coalesce(message, ''), 100)       AS "value",
  type,
  created_at::date                       AS "created"
FROM notifications
WHERE COALESCE(message, '') ILIKE '%[QA%'
   OR COALESCE(message, '') ILIKE '%test%'
   OR COALESCE(message, '') ILIKE '%seed%'
   OR COALESCE(message, '') ILIKE '%lorem%'
   OR COALESCE(message, '') ILIKE '%asd%'
   OR COALESCE(message, '') ILIKE '%sdf%'
   OR COALESCE(message, '') ILIKE '%qwe%'
   OR COALESCE(message, '') ILIKE '%dummy%'
   OR COALESCE(message, '') ILIKE '%fake%'
   OR COALESCE(message, '') ~ '(.)\1\1\1'

ORDER BY "created";


-- =============================================================================
-- PART 10 — SUBMISSIONS (visible fields)
-- =============================================================================

SELECT
  '10. SUBMISSIONS — bio / cover_letter' AS "section_field",
  id::text,
  LEFT(coalesce(bio, ''), 100)           AS "value",
  email,
  created_at::date                       AS "created"
FROM submissions
WHERE bio = 'Referral email test sent by admin.'
   OR bio ILIKE '%lorem ipsum%'
   OR bio ILIKE '%test%'
   OR bio ILIKE '%seed%'
   OR bio ILIKE '%[QA%'
   OR bio ILIKE '%asd asd%'
   OR bio ILIKE '%dummy%'
   OR bio ILIKE '%placeholder%'

ORDER BY "created";


-- =============================================================================
-- PART 11 — SUMMARY: Count by table / pattern category
-- Quick overview before running the normalizer
-- =============================================================================

SELECT
  'agencies — ugly company_name'         AS "category",
  count(*)::int                          AS "rows_needing_polish"
FROM agencies
WHERE company_name ILIKE '%test%' OR company_name ILIKE '%asd%' OR company_name ILIKE '%sdf%'
   OR company_name ILIKE '%qwe%' OR company_name ILIKE '%zxc%' OR company_name ILIKE '%lorem%'
   OR company_name ILIKE '%seed%' OR company_name ILIKE '%qa%' OR company_name ILIKE '%demo%'
   OR company_name ILIKE '%fake%' OR company_name ILIKE '%dummy%' OR company_name ILIKE '%xxx%'
   OR company_name ~ '(.)\1\1'
   OR company_name IS NULL OR trim(company_name) = '' OR length(trim(company_name)) <= 2

UNION ALL SELECT 'talent_profiles — ugly full_name', count(*)::int
FROM talent_profiles
WHERE full_name ILIKE '%test%' OR full_name ILIKE '%asd%' OR full_name ILIKE '%sdf%'
   OR full_name ILIKE '%qwe%' OR full_name ILIKE '%lorem%' OR full_name ILIKE '%seed%'
   OR full_name ILIKE '%qa%' OR full_name ILIKE '%demo%' OR full_name ILIKE '%fake%'
   OR full_name ILIKE '%dummy%' OR full_name ~ '(.)\1\1'
   OR full_name IS NULL OR trim(full_name) = '' OR length(trim(full_name)) <= 2

UNION ALL SELECT 'talent_profiles — lorem/test bio', count(*)::int
FROM talent_profiles
WHERE bio ILIKE '%lorem ipsum%' OR bio ILIKE '%test bio%'
   OR bio ILIKE '%[QA%' OR bio ILIKE '%asd asd%' OR bio ILIKE '%dummy%'
   OR bio ~ '(.)\1\1\1'

UNION ALL SELECT 'jobs — ugly title', count(*)::int
FROM jobs
WHERE title ILIKE '%test%' OR title ILIKE '%asd%' OR title ILIKE '%sdf%'
   OR title ILIKE '%qwe%' OR title ILIKE '%lorem%' OR title ILIKE '%seed%'
   OR title ILIKE '%[QA%' OR title ILIKE '%demo%' OR title ILIKE '%fake%'
   OR title ILIKE '%pdf%' OR title ILIKE '%dummy%' OR title ~ '(.)\1\1'
   OR trim(title) = '' OR length(trim(title)) <= 3

UNION ALL SELECT 'premium_workspaces — ugly name', count(*)::int
FROM premium_workspaces
WHERE name ILIKE '%test%' OR name ILIKE '%asd%' OR name ILIKE '%sdf%'
   OR name ILIKE '%qwe%' OR name ILIKE '%lorem%' OR name ILIKE '%seed%'
   OR name ILIKE '%qa%' OR name ILIKE '%demo%' OR name ILIKE '%fake%'
   OR name ILIKE '%dummy%' OR name ~ '(.)\1\1'
   OR name IS NULL OR trim(name) = '' OR length(trim(name)) <= 2

UNION ALL SELECT 'contracts — ugly job_description', count(*)::int
FROM contracts
WHERE (job_description ILIKE '%test%' OR job_description ILIKE '%asd%'
    OR job_description ILIKE '%sdf%' OR job_description ILIKE '%qwe%'
    OR job_description ILIKE '%lorem%' OR job_description ILIKE '%seed%'
    OR job_description ILIKE '%[QA%' OR job_description ILIKE '%pdf%'
    OR job_description ILIKE '%dummy%' OR job_description ILIKE '%placeholder%'
    OR job_description ~ '(.)\1\1\1')
  AND deleted_at IS NULL

UNION ALL SELECT 'bookings — ugly job_title', count(*)::int
FROM bookings
WHERE job_title ILIKE '%test%' OR job_title ILIKE '%asd%' OR job_title ILIKE '%sdf%'
   OR job_title ILIKE '%qwe%' OR job_title ILIKE '%[QA%' OR job_title ILIKE '%lorem%'
   OR job_title ILIKE '%demo%' OR job_title ILIKE '%dummy%' OR job_title ~ '(.)\1\1'
   OR trim(job_title) = '' OR length(trim(job_title)) <= 3

UNION ALL SELECT 'disputes — ugly reason/resolution', count(*)::int
FROM contract_disputes
WHERE reason ILIKE '%test%' OR reason ILIKE '%asd%' OR reason ILIKE '%sdf%'
   OR reason ILIKE '%lorem%' OR reason ILIKE '%seed%' OR reason ILIKE '%[QA%'
   OR reason ILIKE '%dummy%' OR reason ~ '(.)\1\1\1'
   OR resolution_note ILIKE '%test%' OR resolution_note ILIKE '%lorem%'
   OR resolution_note ILIKE '%[QA%' OR resolution_note ILIKE '%dummy%'

UNION ALL SELECT 'support_conversations — ugly subject', count(*)::int
FROM support_conversations
WHERE subject ILIKE '%test%' OR subject ILIKE '%asd%' OR subject ILIKE '%sdf%'
   OR subject ILIKE '%qwe%' OR subject ILIKE '%lorem%' OR subject ILIKE '%seed%'
   OR subject ILIKE '%qa%' OR subject ILIKE '%demo%' OR subject ILIKE '%dummy%'
   OR subject ~ '(.)\1\1'

UNION ALL SELECT 'notifications — QA/test/lorem message', count(*)::int
FROM notifications
WHERE COALESCE(message, '') ILIKE '%[QA%' OR COALESCE(message, '') ILIKE '%test%'
   OR COALESCE(message, '') ILIKE '%seed%' OR COALESCE(message, '') ILIKE '%lorem%'
   OR COALESCE(message, '') ILIKE '%asd%' OR COALESCE(message, '') ILIKE '%dummy%'
   OR COALESCE(message, '') ~ '(.)\1\1\1'

UNION ALL SELECT 'submissions — referral test / lorem bio', count(*)::int
FROM submissions
WHERE bio = 'Referral email test sent by admin.'
   OR bio ILIKE '%lorem ipsum%' OR bio ILIKE '%test%'
   OR bio ILIKE '%seed%' OR bio ILIKE '%[QA%' OR bio ILIKE '%dummy%'

ORDER BY "rows_needing_polish" DESC, "category";
