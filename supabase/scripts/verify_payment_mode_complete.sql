-- ============================================================
-- COMPLETE VERIFICATION — run each block after applying fix
-- ============================================================

-- 1. Global payment defaults in platform_settings
SELECT key, value
FROM platform_settings
WHERE key IN ('default_payment_mode', 'default_escrow_enabled', 'default_commission_percent')
ORDER BY key;
-- Expected rows:
--   default_commission_percent | "20"
--   default_escrow_enabled     | "true"
--   default_payment_mode       | "escrow"

-- 2. All agencies with payment_mode / escrow_enabled
SELECT id, payment_mode, escrow_enabled, commission_percent_override
FROM agencies
ORDER BY payment_mode, escrow_enabled;
-- Expected: all existing agencies show payment_mode='escrow', escrow_enabled=true
--           any new agency created after this fix shows payment_mode='internal', escrow_enabled=false

-- 3. Agencies where payment_mode and escrow_enabled conflict
-- (escrow_enabled=true for an internal agency is a contradiction)
SELECT id, payment_mode, escrow_enabled
FROM agencies
WHERE (payment_mode = 'internal' AND escrow_enabled = true)
   OR (payment_mode = 'escrow'   AND escrow_enabled = false);
-- Expected: 0 rows

-- 4. Does confirm_booking_escrow have the internal_payment_mode guard?
SELECT
  routine_name,
  (routine_definition LIKE '%internal_payment_mode%') AS has_guard,
  (routine_definition LIKE '%payment_mode%')          AS reads_payment_mode
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('confirm_booking_escrow', 'release_payment_payout');
-- Expected: confirm_booking_escrow → has_guard=true, reads_payment_mode=true
--           release_payment_payout → has_guard=false (not needed), reads_payment_mode=false

-- 5. Does release_payment_payout have UTF-8 correct notification text?
SELECT
  routine_name,
  (routine_definition LIKE '%AgÃ%') AS has_mojibake,
  (routine_definition LIKE '%â€%')  AS has_emdash_mojibake
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'release_payment_payout';
-- Expected: both false

-- 6. Remaining mojibake in notifications table
SELECT id, message, created_at
FROM notifications
WHERE message LIKE '%AgÃ%'
   OR message LIKE '%Ã£%'
   OR message LIKE '%Ã¡%'
   OR message LIKE '%â€"%'
ORDER BY created_at DESC;
-- Expected: 0 rows

-- 7. Last 20 notifications with agency payment_mode context
SELECT
  n.created_at,
  n.type,
  n.message,
  n.idempotency_key,
  a.payment_mode,
  a.escrow_enabled,
  talent.email AS talent_email,
  agency_u.email AS agency_email
FROM notifications n
LEFT JOIN auth.users talent ON talent.id = n.user_id
-- Try to resolve agency from idempotency key
LEFT JOIN contracts c ON (
  n.idempotency_key = 'notif_escrow_talent_' || c.id::text OR
  n.idempotency_key = 'notif_escrow_agency_' || c.id::text OR
  n.idempotency_key = 'notif_payout_talent_' || c.id::text
)
LEFT JOIN agencies a ON a.id = c.agency_id
LEFT JOIN auth.users agency_u ON agency_u.id = c.agency_id
ORDER BY n.created_at DESC
LIMIT 20;

-- 8. Escrow notifications linked to internal agencies (must be 0)
SELECT
  n.created_at,
  n.message,
  n.idempotency_key,
  c.agency_id,
  a.payment_mode,
  a.escrow_enabled
FROM notifications n
JOIN contracts c ON (
  n.idempotency_key = 'notif_escrow_talent_' || c.id::text OR
  n.idempotency_key = 'notif_escrow_agency_' || c.id::text
)
JOIN agencies a ON a.id = c.agency_id
WHERE a.payment_mode = 'internal'
ORDER BY n.created_at DESC;
-- Expected: 0 rows after fix applied and tested
