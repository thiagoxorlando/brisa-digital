-- ============================================================
-- VERIFICATION — run each query individually after applying fix
-- ============================================================

-- A) Does agencies.payment_mode exist?
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'agencies'
  AND column_name  IN ('payment_mode', 'escrow_enabled')
ORDER BY column_name;
-- Expected: 2 rows (payment_mode text, escrow_enabled boolean)

-- B) What payment_mode are current agencies in?
SELECT payment_mode, escrow_enabled, count(*) AS agency_count
FROM agencies
GROUP BY payment_mode, escrow_enabled
ORDER BY payment_mode;
-- Expected: all existing agencies should show payment_mode='escrow', escrow_enabled=true

-- C) Does confirm_booking_escrow have the internal_payment_mode guard?
SELECT routine_definition LIKE '%internal_payment_mode%' AS has_guard
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'confirm_booking_escrow';
-- Expected: true

-- D) Does release_payment_payout have correct UTF-8 text (no mojibake)?
SELECT routine_definition LIKE '%AgÃ%' AS has_mojibake
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'release_payment_payout';
-- Expected: false

-- E) Any remaining mojibake in notifications table?
SELECT id, message, created_at
FROM notifications
WHERE message ~ 'Ã[£¡©§³º­ª¢]|â€"'
ORDER BY created_at DESC;
-- Expected: 0 rows

-- F) Last 20 notifications (any type) — check encoding
SELECT
  n.created_at,
  n.type,
  n.message,
  n.idempotency_key,
  au.email AS recipient_email
FROM notifications n
LEFT JOIN auth.users au ON au.id = n.user_id
ORDER BY n.created_at DESC
LIMIT 20;

-- G) Escrow notifications with agency payment_mode
-- (shows whether internal agencies are still getting escrow notifications)
SELECT
  n.created_at,
  n.message,
  n.idempotency_key,
  c.id   AS contract_id,
  c.agency_id,
  a.payment_mode,
  a.escrow_enabled,
  au.email AS talent_email
FROM notifications n
LEFT JOIN contracts c
  ON n.idempotency_key = 'notif_escrow_talent_' || c.id::text
  OR n.idempotency_key = 'notif_escrow_agency_' || c.id::text
LEFT JOIN agencies a ON a.id = c.agency_id
LEFT JOIN auth.users au ON au.id = n.user_id
WHERE n.idempotency_key LIKE 'notif_escrow_%'
ORDER BY n.created_at DESC
LIMIT 20;
-- For internal agencies: expected 0 rows after fix applied
-- For escrow agencies: expected rows with payment_mode='escrow'
