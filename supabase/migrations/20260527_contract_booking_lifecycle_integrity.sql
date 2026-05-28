-- Ensure every active booking in the "awaiting signature" phase has a real contract row.
-- This backfills legacy booking-only rows and adds a one-contract-per-booking guard when safe.
-- Safe to rerun.

DO $$
DECLARE
  v_contract_job_date_type text;
  v_contract_job_time_type text;
  v_contract_payment_amount_type text;
  v_contract_commission_amount_type text;
  v_contract_net_amount_type text;
  v_job_date_expr text;
  v_job_time_expr text;
  v_payment_amount_expr text;
  v_commission_amount_expr text;
  v_net_amount_expr text;
  v_status_expr text;
BEGIN
  SELECT data_type
  INTO v_contract_job_date_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contracts'
    AND column_name = 'job_date';

  SELECT data_type
  INTO v_contract_job_time_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contracts'
    AND column_name = 'job_time';

  SELECT data_type
  INTO v_contract_payment_amount_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contracts'
    AND column_name = 'payment_amount';

  SELECT data_type
  INTO v_contract_commission_amount_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contracts'
    AND column_name = 'commission_amount';

  SELECT data_type
  INTO v_contract_net_amount_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contracts'
    AND column_name = 'net_amount';

  v_job_date_expr := CASE
    WHEN v_contract_job_date_type = 'date'
      THEN 'NULLIF(ob.job_date::text, '''')::date'
    ELSE
      'NULLIF(ob.job_date::text, '''')'
  END;

  v_job_time_expr := CASE
    WHEN v_contract_job_time_type = 'time without time zone'
      THEN 'NULLIF(ob.job_time::text, '''')::time'
    ELSE
      'NULLIF(ob.job_time::text, '''')'
  END;

  v_payment_amount_expr := CASE
    WHEN v_contract_payment_amount_type = 'numeric'
      THEN 'COALESCE(NULLIF(ob.price::text, '''')::numeric, 0)'
    ELSE
      'COALESCE(ob.price::text, ''0'')'
  END;

  v_commission_amount_expr := CASE
    WHEN v_contract_commission_amount_type = 'numeric'
      THEN 'ROUND(COALESCE(NULLIF(ob.price::text, '''')::numeric, 0) * (COALESCE(ob.commission_percent, 20) / 100.0), 2)'
    ELSE
      'ROUND(COALESCE(NULLIF(ob.price::text, '''')::numeric, 0) * (COALESCE(ob.commission_percent, 20) / 100.0), 2)::text'
  END;

  v_net_amount_expr := CASE
    WHEN v_contract_net_amount_type = 'numeric'
      THEN 'ROUND(COALESCE(NULLIF(ob.price::text, '''')::numeric, 0) - (COALESCE(NULLIF(ob.price::text, '''')::numeric, 0) * (COALESCE(ob.commission_percent, 20) / 100.0)), 2)'
    ELSE
      'ROUND(COALESCE(NULLIF(ob.price::text, '''')::numeric, 0) - (COALESCE(NULLIF(ob.price::text, '''')::numeric, 0) * (COALESCE(ob.commission_percent, 20) / 100.0)), 2)::text'
  END;

  v_status_expr := '''sent''';

  EXECUTE format($sql$
    WITH orphan_bookings AS (
      SELECT
        b.id AS booking_id,
        b.job_id,
        b.agency_id,
        b.talent_user_id,
        b.job_title,
        b.price,
        b.created_at,
        j.description AS job_description,
        j.job_date,
        j.job_time,
        j.location,
        j.workspace_id,
        j.created_by_user_id,
        COALESCE(
          ps.commission_percent,
          CASE
            WHEN j.workspace_id IS NOT NULL THEN 10
            WHEN COALESCE(p.plan, 'free') IN ('pro', 'premium') THEN 10
            ELSE 20
          END
        ) AS commission_percent
      FROM bookings b
      LEFT JOIN contracts c
        ON c.booking_id = b.id
       AND c.deleted_at IS NULL
      LEFT JOIN jobs j
        ON j.id = b.job_id
      LEFT JOIN profiles p
        ON p.id = b.agency_id
      LEFT JOIN plan_settings ps
        ON ps.plan_key = CASE
          WHEN j.workspace_id IS NOT NULL THEN 'premium'
          ELSE COALESCE(p.plan, 'free')
        END
      WHERE b.deleted_at IS NULL
        AND COALESCE(b.status, 'pending') IN ('pending', 'pending_payment', 'confirmed', 'paid')
        AND c.id IS NULL
        AND b.talent_user_id IS NOT NULL
        AND b.agency_id IS NOT NULL
    )
    INSERT INTO contracts (
      booking_id,
      job_id,
      talent_id,
      talent_user_id,
      agency_id,
      workspace_id,
      created_by_user_id,
      job_date,
      job_time,
      location,
      job_description,
      payment_amount,
      commission_amount,
      net_amount,
      status,
      created_at
    )
    SELECT
      ob.booking_id,
      ob.job_id,
      ob.talent_user_id,
      ob.talent_user_id,
      ob.agency_id,
      ob.workspace_id,
      ob.created_by_user_id,
      %1$s,
      %2$s,
      NULLIF(ob.location::text, ''),
      COALESCE(NULLIF(ob.job_description::text, ''), NULLIF(ob.job_title::text, ''), 'Contrato sem descrição'),
      %3$s,
      %4$s,
      %5$s,
      %6$s,
      ob.created_at
    FROM orphan_bookings ob
  $sql$, v_job_date_expr, v_job_time_expr, v_payment_amount_expr, v_commission_amount_expr, v_net_amount_expr, v_status_expr);
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM contracts
    WHERE booking_id IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY booking_id
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Skipping contracts_booking_id_unique_active_idx because duplicate active contracts per booking still exist.';
  ELSE
    EXECUTE '
      CREATE UNIQUE INDEX IF NOT EXISTS contracts_booking_id_unique_active_idx
      ON public.contracts (booking_id)
      WHERE booking_id IS NOT NULL
        AND deleted_at IS NULL
    ';
  END IF;
END $$;
