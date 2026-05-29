-- Ensure asaas_webhook_events has the production column names.
-- Production uses "payload" (not "raw_payload") and "event_id" with a unique index.

ALTER TABLE public.asaas_webhook_events
  ADD COLUMN IF NOT EXISTS payload   jsonb,
  ADD COLUMN IF NOT EXISTS event_id  text;

CREATE UNIQUE INDEX IF NOT EXISTS asaas_webhook_events_event_id_uniq
  ON public.asaas_webhook_events(event_id)
  WHERE event_id IS NOT NULL;
