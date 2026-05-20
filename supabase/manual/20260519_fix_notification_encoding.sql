-- Fix UTF-8 mojibake in notifications inserted by migration 20260508.
-- That migration file was saved as Latin-1 but Postgres treated it as UTF-8,
-- producing double-encoded Portuguese characters.
-- Migration 20260513 replaced the Postgres function with correct encoding,
-- so only past-stored rows need repair.

UPDATE notifications
SET message = 'Agência liberou seu pagamento — a caminho!'
WHERE message = 'AgÃªncia liberou seu pagamento â€" a caminho!';
