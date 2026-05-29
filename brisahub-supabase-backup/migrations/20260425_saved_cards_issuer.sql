-- Add issuer_id to saved_cards.
-- Mercado Pago requires issuer_id in Payment.create for saved-card charges
-- so it can route the payment to the correct card network (Visa, Mastercard, etc).
-- Without it, MP returns error "not_result_by_params".
-- Stored as text to avoid precision loss; converted to number at charge time.

ALTER TABLE saved_cards
  ADD COLUMN IF NOT EXISTS issuer_id text;

NOTIFY pgrst, 'reload schema';
