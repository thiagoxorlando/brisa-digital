-- Phase 1: Payments foundation — additive only.
--
-- Adds two new tables that do not touch any existing table, RPC, or route:
--
--   payments       — canonical record of every real money movement from
--                    Mercado Pago into the platform. One row per provider
--                    payment ID. Gives a forensic link between an external
--                    payment and the business action it triggered (wallet
--                    top-up, plan purchase, etc.).  wallet_transactions
--                    remains the internal ledger; this table is the external
--                    receipt.
--
--   webhook_events — log of every inbound provider notification before any
--                    business logic runs. The unique constraint on
--                    (provider, provider_event_id) is the deduplication
--                    gate: an INSERT ON CONFLICT DO NOTHING returning 0 rows
--                    means the event was already seen and must be skipped.
--
-- Both tables are written exclusively by the service role (server-side routes).
-- RLS is enabled with no permissive read policy for regular authenticated
-- users — forensic payment data must not be exposed client-side at this stage.

-- ── Extension ─────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── payments ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identity
  provider            text          NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text          NOT NULL,

  -- Stable business key used when calling the provider API.
  -- Prevents the provider treating a retry as a new charge.
  idempotency_key     text          NOT NULL,

  -- What this payment funded (at most one should be non-null per row).
  -- References are nullable because wallet top-ups have no booking/contract.
  booking_id          uuid          REFERENCES public.bookings(id),
  contract_id         uuid          REFERENCES public.contracts(id),
  agency_id           uuid          REFERENCES public.profiles(id),

  -- Financial fields
  amount              numeric(12,2) NOT NULL,
  currency            text          NOT NULL DEFAULT 'BRL',

  -- Mirrors provider status vocabulary so the row is self-describing.
  status              text          NOT NULL
                        CONSTRAINT payments_status_check CHECK (
                          status IN (
                            'pending', 'approved', 'rejected',
                            'cancelled', 'refunded', 'expired', 'failed'
                          )
                        ),

  -- Full provider response stored verbatim for audit / dispute resolution.
  -- Never used for business logic — source of truth is the status column.
  raw_provider_payload jsonb,

  -- When the webhook handler finished processing this payment.
  -- NULL means received but not yet processed (or processing failed).
  processed_at        timestamptz,

  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  -- Deduplication: one row per real provider payment.
  CONSTRAINT payments_provider_id_uniq UNIQUE (provider, provider_payment_id)
);

-- Partial indexes — only index rows where the FK is actually set.
CREATE INDEX IF NOT EXISTS idx_payments_booking_id
  ON public.payments (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_contract_id
  ON public.payments (contract_id)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_agency_id
  ON public.payments (agency_id)
  WHERE agency_id IS NOT NULL;

-- Used for idempotency lookups before hitting the provider.
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key
  ON public.payments (idempotency_key);

-- Trigger to keep updated_at current on every row update.
CREATE OR REPLACE FUNCTION public.set_payments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_payments_updated_at();

-- ── webhook_events ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider identity
  provider          text        NOT NULL DEFAULT 'mercadopago',

  -- x-request-id header from the provider (request-level tracing).
  event_id          text        NOT NULL,

  -- data.id from the webhook body (the provider's payment / resource ID).
  -- This is the canonical deduplication key.
  provider_event_id text        NOT NULL,

  -- Webhook topic, e.g. 'payment', 'subscription_authorized_payment'.
  topic             text,

  -- Full raw body stored verbatim. Never mutated after insert.
  raw_payload       jsonb       NOT NULL,

  received_at       timestamptz NOT NULL DEFAULT now(),

  -- Set to true only after all business logic for this event has committed.
  processed         boolean     NOT NULL DEFAULT false,
  processed_at      timestamptz,

  -- If processing failed, the error message is stored here for ops visibility.
  error             text,

  -- Deduplication gate: INSERT ON CONFLICT DO NOTHING returns 0 rows if seen.
  CONSTRAINT webhook_events_provider_event_uniq UNIQUE (provider, provider_event_id)
);

-- Lookup by raw x-request-id for tracing across logs.
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id
  ON public.webhook_events (event_id);

-- Allows ops to query unprocessed events easily.
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed
  ON public.webhook_events (processed);

-- Time-range queries for monitoring and reconciliation.
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON public.webhook_events (received_at);

-- ── Row-Level Security ────────────────────────────────────────────────────────
--
-- Both tables are service-role-write-only for now.
-- No SELECT policy is granted to authenticated users: payment forensic data
-- must not be exposed client-side until a scoped read requirement exists.
-- The service role bypasses RLS entirely, so routes using the service client
-- can read and write freely without any policy.

ALTER TABLE public.payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- No authenticated-user policies are added intentionally.
-- To add read access for admin UI later:
--
--   CREATE POLICY "admin_read_payments" ON public.payments
--     FOR SELECT TO authenticated
--     USING (
--       EXISTS (
--         SELECT 1 FROM public.profiles
--         WHERE id = auth.uid() AND role = 'admin'
--       )
--     );
--
-- That policy should live in its own migration when the admin UI needs it.

-- ── PostgREST schema cache ─────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
