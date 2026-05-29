-- Add Asaas customer ID to profiles (search-or-create cache for payment integration).
-- Mirrors the existing mp_customer_id column used for Mercado Pago.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS asaas_customer_id text;
