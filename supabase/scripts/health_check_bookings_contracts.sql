-- Health check: latest 20 bookings and whether each has a contract
-- Run this in Supabase SQL Editor to diagnose contract creation issues.

SELECT
  b.id                        AS booking_id,
  b.created_at                AS booking_created,
  b.status                    AS booking_status,
  b.talent_user_id,
  b.agency_id,
  b.job_title,
  au.email                    AS talent_email,
  c.id                        AS contract_id,
  c.status                    AS contract_status,
  c.talent_user_id            AS contract_talent_user_id,
  c.talent_id                 AS contract_talent_id,
  c.agency_id                 AS contract_agency_id,
  CASE
    WHEN c.id IS NULL           THEN 'MISSING CONTRACT'
    WHEN c.talent_user_id IS NULL THEN 'NULL talent_user_id'
    WHEN c.talent_user_id <> b.talent_user_id THEN 'MISMATCH talent_user_id'
    ELSE 'OK'
  END                         AS health
FROM bookings b
LEFT JOIN contracts c
  ON c.booking_id = b.id
  AND c.deleted_at IS NULL
LEFT JOIN auth.users au
  ON au.id = b.talent_user_id
WHERE b.deleted_at IS NULL
ORDER BY b.created_at DESC
LIMIT 20;
