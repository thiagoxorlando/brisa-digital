-- Fix corrupted UTF-8 notification messages and links.
--
-- Root cause: migration 20260508 SQL file was saved with wrong charset encoding,
-- causing Postgres to store mojibake characters in existing notification rows.
-- Migration 20260513 fixed the Postgres function for future inserts, but
-- ON CONFLICT (idempotency_key) DO NOTHING prevented re-insertion, so
-- existing rows still have the wrong message AND wrong link.
--
-- Why previous exact-match SQL failed:
--   The em dash — (U+2014, UTF-8: E2 80 94) was stored as the Windows-1252
--   re-encoding of those bytes: â (U+00E2) + € (U+20AC) + " (U+201D).
--   The WHERE clause used a plain " (U+0022) which silently matched nothing.
--
-- Fix strategy: use LIKE patterns on ASCII-only invariant substrings for
-- matching (encoding-safe), and correct UTF-8 literals for the SET values.

-- ── 1. Fix payout notification messages ──────────────────────────────────────
-- Old (mojibake): 'AgÃªncia liberou seu pagamento â€" a caminho!'
-- New (correct):  'Agência liberou seu pagamento — a caminho!'
UPDATE notifications
SET message = 'Agência liberou seu pagamento — a caminho!'
WHERE type = 'payment'
  AND message LIKE '%gncia liberou seu pagamento%';

-- ── 2. Fix escrow/contract notification messages ──────────────────────────────
-- Old (mojibake, if any): 'Ag?ncia confirmou o contrato e realizou o dep?sito'
-- New (correct):          'Agência confirmou o contrato e realizou o depósito'
-- (20260417/20260501/20260502 all had correct encoding; this is a safety net)
UPDATE notifications
SET message = 'Agência confirmou o contrato e realizou o depósito'
WHERE type = 'contract'
  AND message LIKE '%confirmou o contrato%'
  AND message NOT LIKE '%Ag_ncia confirmou%';

-- ── 3. Fix agency booking notification messages ───────────────────────────────
-- Old (mojibake, if any): 'Reserva confirmada ? fundos em cust?dia'
-- New (correct):          'Reserva confirmada — fundos em custódia'
UPDATE notifications
SET message = 'Reserva confirmada — fundos em custódia'
WHERE type = 'booking'
  AND message LIKE '%Reserva confirmada%'
  AND message NOT LIKE '%cust_dia%';

-- ── 4. Fix payout notification links for Premium workspace talent ─────────────
-- Old: '/talent/finances'  (hardcoded by RPC versions 20260503 and 20260508)
-- New: '/talent/workspaces/<slug>/finances'
-- Matching is done via idempotency_key → contract → job → workspace slug.
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
-- Old: '/talent/contracts' or '/talent/finances'
-- New: '/talent/workspaces/<slug>/contracts'
UPDATE notifications n
SET link = '/talent/workspaces/' || pw.slug || '/contracts'
FROM contracts c
JOIN jobs j ON j.id = c.job_id
JOIN premium_workspaces pw ON pw.id = j.workspace_id
WHERE n.idempotency_key = 'notif_escrow_talent_' || c.id::text
  AND j.workspace_id IS NOT NULL
  AND pw.slug IS NOT NULL
  AND n.link IN ('/talent/contracts', '/talent/finances');
