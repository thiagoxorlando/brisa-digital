-- Fix UTF-8 mojibake in existing notifications rows.
-- Root cause: notification text was hardcoded in TypeScript/SQL with
-- files saved as Windows-1252 (or read that way), causing UTF-8 multi-byte
-- sequences to be stored as two Latin-1 characters.
--
-- Examples:
--   ê (0xC3 0xAA) → Ãª
--   — (0xE2 0x80 0x94) → â€"
--   ã (0xC3 0xA3) → Ã£
--   á (0xC3 0xA1) → Ã¡
--
-- This migration patches the notifications table in-place.
-- Safe to rerun: REPLACE is idempotent when the pattern is absent.

UPDATE notifications
SET message = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
  message,
  'AgÃªncia',   'Agência'),
  'agÃªncia',   'agência'),
  'Ã£',         'ã'),
  'Ã¡',         'á'),
  'Ã©',         'é'),
  'Ã§',         'ç'),
  'Ã³',         'ó'),
  'Ãº',         'ú'),
  'Ã­',         'í'),
  'Ã¢',         'â'),
  'â€"',        '—')
WHERE message ~ 'Ã[£¡©§³º­ª¢]|â€"';
