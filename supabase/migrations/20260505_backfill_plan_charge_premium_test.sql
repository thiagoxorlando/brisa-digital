-- One-time backfill: insert the Premium test plan_charge for the known agency.
--
-- Context: the Premium payment succeeded and profiles.plan was set to 'premium',
-- but no wallet_transactions row was created because:
--   (a) the checkout route pre-dates the plan_charge insert logic, and
--   (b) no Asaas webhook event was stored in asaas_webhook_events.
--
-- This migration inserts a synthetic plan_charge row so the billing page can
-- display the charge history and last charge for this agency.
--
-- All columns used here are confirmed to exist in production:
--   user_id, type, amount, description, payment_id  — migration 20260417
--   status, processed_at                            — migration 20260425
--   provider                                        — migration 20260427
--
-- The WHERE NOT EXISTS guard makes this idempotent: safe to run multiple times.

INSERT INTO wallet_transactions
  (user_id, type, amount, status, provider, description, payment_id, created_at, processed_at)
SELECT
  '038b6d4e-0491-49be-9d24-3b904fbeec5b'::uuid,
  'plan_charge',
  5.00,
  'paid',
  'asaas',
  'Assinatura Premium - BrisaHub',
  'manual_backfill_premium_test_20260504',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM   wallet_transactions
  WHERE  user_id = '038b6d4e-0491-49be-9d24-3b904fbeec5b'
    AND  type    = 'plan_charge'
);
