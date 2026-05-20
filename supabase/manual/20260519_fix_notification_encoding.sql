-- Fix UTF-8 mojibake in notifications inserted by migration 20260508.
-- That migration file was saved as Latin-1 but Postgres treated it as UTF-8,
-- producing double-encoded Portuguese characters.
-- Migration 20260513 replaced the Postgres function with correct encoding,
-- so only past-stored rows need repair.

UPDATE notifications
SET message = 'Agência liberou seu pagamento — a caminho!'
WHERE message = 'AgÃªncia liberou seu pagamento â€" a caminho!';

-- Fix links for existing Premium workspace payout notifications stored with
-- hardcoded /talent/finances by older RPC versions (20260503, 20260508).
-- ON CONFLICT DO NOTHING in those migrations prevented re-insertion when 20260513
-- fixed the function, so these rows still have the wrong link.
UPDATE notifications n
SET link = '/talent/workspaces/' || pw.slug || '/finances'
FROM contracts c
JOIN jobs j ON j.id = c.job_id
JOIN premium_workspaces pw ON pw.id = j.workspace_id
WHERE n.idempotency_key = 'notif_payout_talent_' || c.id::text
  AND j.workspace_id IS NOT NULL
  AND pw.slug IS NOT NULL
  AND n.link = '/talent/finances';

-- Fix links for existing Premium workspace escrow/contract notifications.
UPDATE notifications n
SET link = '/talent/workspaces/' || pw.slug || '/contracts'
FROM contracts c
JOIN jobs j ON j.id = c.job_id
JOIN premium_workspaces pw ON pw.id = j.workspace_id
WHERE n.idempotency_key = 'notif_escrow_talent_' || c.id::text
  AND j.workspace_id IS NOT NULL
  AND pw.slug IS NOT NULL
  AND n.link IN ('/talent/contracts', '/talent/finances');
