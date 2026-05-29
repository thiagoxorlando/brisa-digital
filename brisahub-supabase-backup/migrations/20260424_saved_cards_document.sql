-- Add cardholder document fields to saved_cards.
-- Stored as raw digits (no formatting) for reliable use in Payment.create.
-- holder_document_type: "CPF" or "CNPJ"
-- holder_document_number: digits only, e.g. "12345678901"

ALTER TABLE saved_cards
  ADD COLUMN IF NOT EXISTS holder_document_type   text,
  ADD COLUMN IF NOT EXISTS holder_document_number text;

NOTIFY pgrst, 'reload schema';
