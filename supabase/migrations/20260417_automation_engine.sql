-- ============================================================
-- Brisa Digital — Booking Lifecycle Automation Engine
--
-- Scheduled functions that run on pg_cron to automatically
-- send reminders and flag stale records.
--
-- All functions are safe to call manually or re-run:
--   • automations_log deduplicates execution per contract
--   • notifications.idempotency_key deduplicates user-facing alerts
--   • Cancelled/deleted contracts are always excluded
-- ============================================================

-- ── Extension (Supabase already enables this, no-op if present) ──────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── automations_log ───────────────────────────────────────────────────────────
-- Immutable execution log. One row per (type, reference_id) enforces that each
-- automation fires only once per contract unless you want repeating reminders —
-- in that case remove the unique constraint and rely on the time-window logic.

CREATE TABLE IF NOT EXISTS automations_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text        NOT NULL,
  reference_id uuid,
  executed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automations_type_ref_idx
  ON automations_log (type, reference_id);

-- Unique constraint so concurrent scheduler runs can't double-log the same event
ALTER TABLE automations_log
  DROP CONSTRAINT IF EXISTS automations_log_type_ref_unique;

ALTER TABLE automations_log
  ADD CONSTRAINT automations_log_type_ref_unique
  UNIQUE (type, reference_id);

-- ── Helper: insert a notification idempotently ────────────────────────────────
-- Shared by all automation functions to avoid repetition.

CREATE OR REPLACE FUNCTION _automation_notify(
  p_user_id        uuid,
  p_type           text,
  p_message        text,
  p_link           text,
  p_idempotency_key text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO notifications (user_id, type, message, link, is_read, idempotency_key)
  VALUES (p_user_id, p_type, p_message, p_link, false, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING;
$$;

-- ── send_job_reminders ────────────────────────────────────────────────────────
-- Runs every hour.
-- Notifies talent + agency for every confirmed contract whose job_date falls
-- within the next 24 hours and hasn't been reminded yet.

CREATE OR REPLACE FUNCTION send_job_reminders()
RETURNS integer   -- returns count of contracts processed
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec     RECORD;
  v_count integer := 0;
BEGIN
  FOR rec IN
    SELECT
      c.id        AS contract_id,
      c.talent_id,
      c.agency_id,
      c.job_date
    FROM contracts c
    WHERE c.status     = 'confirmed'
      AND c.deleted_at IS NULL
      AND c.job_date   IS NOT NULL
      AND c.job_date::date >= CURRENT_DATE
      AND c.job_date::date <  (CURRENT_DATE + interval '2 days')::date
      AND NOT EXISTS (
        SELECT 1 FROM automations_log al
        WHERE al.type = 'job_reminder' AND al.reference_id = c.id
      )
  LOOP
    -- Notify talent
    IF rec.talent_id IS NOT NULL THEN
      PERFORM _automation_notify(
        rec.talent_id, 'booking',
        'Lembrete: seu trabalho é amanhã! Confirme sua presença.',
        '/talent/bookings',
        'notif_reminder_talent_' || rec.contract_id
      );
    END IF;

    -- Notify agency
    IF rec.agency_id IS NOT NULL THEN
      PERFORM _automation_notify(
        rec.agency_id, 'booking',
        'Lembrete: trabalho confirmado acontece amanhã.',
        '/agency/bookings',
        'notif_reminder_agency_' || rec.contract_id
      );
    END IF;

    -- Log execution — unique constraint blocks duplicate rows on concurrent runs
    INSERT INTO automations_log (type, reference_id)
    VALUES ('job_reminder', rec.contract_id)
    ON CONFLICT (type, reference_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── send_payment_reminders ────────────────────────────────────────────────────
-- Runs every hour.
-- Notifies the agency when a contract is still 'confirmed' (not paid) and the
-- job date has already passed. One reminder per contract.

CREATE OR REPLACE FUNCTION send_payment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec     RECORD;
  v_count integer := 0;
BEGIN
  FOR rec IN
    SELECT
      c.id        AS contract_id,
      c.agency_id,
      c.talent_id,
      c.job_date
    FROM contracts c
    WHERE c.status     = 'confirmed'
      AND c.deleted_at IS NULL
      AND c.paid_at    IS NULL
      AND c.job_date   IS NOT NULL
      AND c.job_date::date < CURRENT_DATE    -- job date has passed
      AND NOT EXISTS (
        SELECT 1 FROM automations_log al
        WHERE al.type = 'payment_reminder' AND al.reference_id = c.id
      )
  LOOP
    IF rec.agency_id IS NOT NULL THEN
      PERFORM _automation_notify(
        rec.agency_id, 'payment',
        'Pagamento pendente: o trabalho foi concluído. Libere o pagamento do talento.',
        '/agency/bookings',
        'notif_payment_reminder_' || rec.contract_id
      );
    END IF;

    INSERT INTO automations_log (type, reference_id)
    VALUES ('payment_reminder', rec.contract_id)
    ON CONFLICT (type, reference_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── send_contract_nudges ──────────────────────────────────────────────────────
-- Runs every 6 hours.
-- Nudges talent when a contract has been in 'sent' state for more than 24 hours
-- without being signed. One nudge per contract.

CREATE OR REPLACE FUNCTION send_contract_nudges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec     RECORD;
  v_count integer := 0;
BEGIN
  FOR rec IN
    SELECT
      c.id        AS contract_id,
      c.talent_id,
      c.agency_id,
      c.created_at
    FROM contracts c
    WHERE c.status     = 'sent'
      AND c.deleted_at IS NULL
      AND c.created_at < now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM automations_log al
        WHERE al.type = 'contract_nudge' AND al.reference_id = c.id
      )
  LOOP
    IF rec.talent_id IS NOT NULL THEN
      PERFORM _automation_notify(
        rec.talent_id, 'contract',
        'Você tem um contrato pendente de assinatura.',
        '/talent/contracts',
        'notif_contract_nudge_' || rec.contract_id
      );
    END IF;

    INSERT INTO automations_log (type, reference_id)
    VALUES ('contract_nudge', rec.contract_id)
    ON CONFLICT (type, reference_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── send_stale_booking_alerts ─────────────────────────────────────────────────
-- Runs every 6 hours.
-- Alerts admin when a confirmed contract's job date passed 48+ hours ago
-- and no payment has been released. Flags potential no-shows or disputes.

CREATE OR REPLACE FUNCTION send_stale_booking_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec     RECORD;
  admin   RECORD;
  v_count integer := 0;
BEGIN
  FOR rec IN
    SELECT
      c.id        AS contract_id,
      c.agency_id,
      c.talent_id,
      c.job_date,
      c.payment_amount
    FROM contracts c
    WHERE c.status     = 'confirmed'
      AND c.deleted_at IS NULL
      AND c.paid_at    IS NULL
      AND c.job_date   IS NOT NULL
      AND c.job_date::date < (CURRENT_DATE - interval '2 days')::date
      AND NOT EXISTS (
        SELECT 1 FROM automations_log al
        WHERE al.type = 'stale_booking_alert' AND al.reference_id = c.id
      )
  LOOP
    -- Notify all admin users
    FOR admin IN
      SELECT id FROM profiles WHERE role = 'admin'
    LOOP
      PERFORM _automation_notify(
        admin.id, 'booking',
        'Trabalho concluído há mais de 48h sem pagamento liberado. Verifique.',
        '/admin/bookings',
        'notif_stale_admin_' || admin.id || '_' || rec.contract_id
      );
    END LOOP;

    INSERT INTO automations_log (type, reference_id)
    VALUES ('stale_booking_alert', rec.contract_id)
    ON CONFLICT (type, reference_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── pg_cron schedules ─────────────────────────────────────────────────────────
-- Unschedule existing jobs first so this migration is re-runnable.

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'brisa-job-reminders',
    'brisa-payment-reminders',
    'brisa-contract-nudges',
    'brisa-stale-alerts'
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- pg_cron not available in local dev — skip silently
END;
$$;

DO $$
BEGIN
  -- Every hour, on the hour
  PERFORM cron.schedule(
    'brisa-job-reminders',
    '0 * * * *',
    'SELECT send_job_reminders()'
  );

  -- Every hour, at :30
  PERFORM cron.schedule(
    'brisa-payment-reminders',
    '30 * * * *',
    'SELECT send_payment_reminders()'
  );

  -- Every 6 hours
  PERFORM cron.schedule(
    'brisa-contract-nudges',
    '0 */6 * * *',
    'SELECT send_contract_nudges()'
  );

  -- Every 6 hours, offset by 3h to spread load
  PERFORM cron.schedule(
    'brisa-stale-alerts',
    '0 3/6 * * *',
    'SELECT send_stale_booking_alerts()'
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- pg_cron not available in local dev — skip silently
END;
$$;
