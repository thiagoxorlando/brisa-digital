-- Fix corrupted UTF-8 notification messages and links.
--
-- Root cause: migration 20260508 SQL file was saved with wrong charset encoding.
-- The `ê` in "Agência" (UTF-8: C3 AA) was misread byte-by-byte as Latin-1,
-- yielding Ã (C3→U+00C3) + ª (AA→U+00AA), storing "AgÃªncia" in the DB.
-- The em dash — (UTF-8: E2 80 94) was likewise stored as â€" (Windows-1252
-- re-encoding of those three bytes: â + € + " right-quote U+201D).
-- Migration 20260513 fixed the Postgres function for future inserts, but
-- ON CONFLICT (idempotency_key) DO NOTHING prevented re-insertion,
-- so existing rows still carry the wrong message and link.
--
-- Why the previous LIKE pattern '%gncia liberou seu pagamento%' failed:
--   "Agência" → mojibake "AgÃªncia": chars between g and n are now Ã + ª
--   (two non-ASCII chars), making "gncia" non-contiguous — the LIKE never
--   matched. The fix is to use a pure-ASCII substring that IS contiguous in
--   both the correct and the mojibake form.

-- ── 1. Fix payout notification messages (type = 'payment') ───────────────────
-- Only 20260508 had bad file encoding; it stored the payout notification.
-- 'liberou seu pagamento' is pure ASCII and contiguous in both versions.
UPDATE notifications
SET message = 'Agência liberou seu pagamento — a caminho!'
WHERE type = 'payment'
  AND message LIKE '%liberou seu pagamento%'
  AND message <> 'Agência liberou seu pagamento — a caminho!';

-- ── 2. Fix escrow/contract notification messages (safety net) ─────────────────
-- All migrations that created these notifications had correct UTF-8 encoding,
-- but this guard repairs them if any row was somehow affected.
UPDATE notifications
SET message = 'Agência confirmou o contrato e realizou o depósito'
WHERE type = 'contract'
  AND message LIKE '%confirmou o contrato e realizou%'
  AND message <> 'Agência confirmou o contrato e realizou o depósito';

-- ── 3. Fix agency booking notification messages (safety net) ─────────────────
UPDATE notifications
SET message = 'Reserva confirmada — fundos em custódia'
WHERE type = 'booking'
  AND message LIKE '%Reserva confirmada%fundos em%'
  AND message <> 'Reserva confirmada — fundos em custódia';

-- ── 4. Fix payout notification links for Premium workspace talent ─────────────
-- Older RPC versions (20260503, 20260508) hardcoded '/talent/finances'.
-- Match via idempotency_key → contract → job → workspace slug.
UPDATE notifications n
SET link = '/talent/workspaces/' || pw.slug || '/finances'
FROM contracts c
JOIN jobs j ON j.id = c.job_id
JOIN premium_workspaces pw ON pw.id = j.workspace_id
WHERE n.idempotency_key = 'notif_payout_talent_' || c.id::text
  AND j.workspace_id IS NOT NULL
  AND pw.slug IS NOT NULL
  AND n.link = '/talent/finances';

-- ── 5. Fix escrow/contract notification links for Premium workspace talent ────
-- Older RPC versions stored '/talent/contracts' instead of workspace-scoped link.
UPDATE notifications n
SET link = '/talent/workspaces/' || pw.slug || '/contracts'
FROM contracts c
JOIN jobs j ON j.id = c.job_id
JOIN premium_workspaces pw ON pw.id = j.workspace_id
WHERE n.idempotency_key = 'notif_escrow_talent_' || c.id::text
  AND j.workspace_id IS NOT NULL
  AND pw.slug IS NOT NULL
  AND n.link IN ('/talent/contracts', '/talent/finances');
