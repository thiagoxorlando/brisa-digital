-- Add asaas_subscription_id to profiles so we can:
--   1. Avoid creating duplicate subscriptions for the same agency.
--   2. Look up pending subscription payments to surface the checkout URL again.
--   3. Correlate PAYMENT_CREATED webhook events with the correct plan/user.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text;
