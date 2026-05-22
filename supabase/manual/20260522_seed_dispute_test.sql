-- =============================================================================
-- Dispute System QA Seed Script
-- Created: 2026-05-22
--
-- Keep this seed aligned with current contracts columns.
--
-- PURPOSE
--   Creates 3 contract_disputes rows (open, under_review, resolved_refund)
--   against QA seed contracts in the database.
--   Safe to run multiple times because old QA seed rows are cleaned up first.
--
-- WHAT THIS SCRIPT DOES
--   1. Cleans up prior QA seed rows using existing columns only.
--   2. Finds a real agency user and talent user from live data.
--   3. Creates a QA seed job tagged via title/description.
--   4. Creates 3 lightweight bookings for schemas where contracts.booking_id is required.
--   5. Creates 3 contracts linked to that job.
--   6. Creates escrow_lock wallet_transactions for active QA contracts.
--   7. Creates 3 dispute rows with different statuses.
--   7. RAISES NOTICE for every created ID so you know what was inserted.
--
-- WHAT THIS SCRIPT DOES NOT DO
--   - No wallet_balance changes.
--   - No wallet_balance changes. Escrow is represented by wallet_transactions
--     only so the admin resolver can verify escrow without debiting real users.
--   - No RLS policy changes.
--   - No auth.users inserts.
--   - No contracts.notes or contracts.commission_percent writes.
--
-- HOW TO RUN
--   Paste into Supabase SQL editor and run as service role.
--   Review RAISE NOTICE output to capture IDs for QA.
--
-- VERIFICATION
--   SELECT id, contract_id, workspace_id, status, reason, created_at
--   FROM contract_disputes
--   WHERE reason LIKE '%[QA seed]%'
--   ORDER BY created_at DESC;
--
-- CLEANUP
--   DELETE FROM contract_disputes
--   WHERE reason LIKE '%[QA seed]%'
--      OR resolution_note LIKE '%[QA seed]%'
--      OR contract_id IN (
--        SELECT c.id
--        FROM contracts c
--        JOIN jobs j ON j.id = c.job_id
--        WHERE j.title LIKE '%[QA seed]%'
--           OR j.description LIKE '%[QA seed]%'
--      );
--
--   DELETE FROM wallet_transactions
--   WHERE reference_id IN (
--     SELECT c.id::text
--     FROM contracts c
--     JOIN jobs j ON j.id = c.job_id
--     WHERE j.title LIKE '%[QA seed]%'
--        OR j.description LIKE '%[QA seed]%'
--   )
--      OR idempotency_key IN (
--        SELECT 'escrow_' || c.id::text
--        FROM contracts c
--        JOIN jobs j ON j.id = c.job_id
--        WHERE j.title LIKE '%[QA seed]%'
--           OR j.description LIKE '%[QA seed]%'
--      );
--
--   DELETE FROM contracts
--   WHERE job_id IN (
--     SELECT id
--     FROM jobs
--     WHERE title LIKE '%[QA seed]%'
--        OR description LIKE '%[QA seed]%'
--   );
--
--   DELETE FROM bookings
--   WHERE job_id IN (
--     SELECT id
--     FROM jobs
--     WHERE title LIKE '%[QA seed]%'
--        OR description LIKE '%[QA seed]%'
--   )
--      OR job_title LIKE '%[QA seed]%';
--
--   DELETE FROM jobs
--   WHERE title LIKE '%[QA seed]%'
--      OR description LIKE '%[QA seed]%';
-- =============================================================================

DO $$
DECLARE
  -- Resolved admin/user references (discovered at runtime from live data)
  v_agency_user_id        uuid;
  v_talent_user_id        uuid;
  v_talent_profile_id     uuid;  -- = talent_profiles.id = auth.users.id for talent
  v_admin_user_id         uuid;  -- used as opened_by_user_id
  v_resolver_user_id      uuid;

  -- Workspace is optional and used only to show the Premium badge.
  v_workspace_id          uuid;

  -- Created IDs
  v_job_id                uuid;
  v_booking_open_id       uuid;
  v_booking_review_id     uuid;
  v_booking_resolved_id   uuid;
  v_contract_open_id      uuid;
  v_contract_review_id    uuid;
  v_contract_resolved_id  uuid;
  v_dispute_open_id       uuid;
  v_dispute_review_id     uuid;
  v_dispute_resolved_id   uuid;

  -- Cleanup ID tracking
  v_cleanup_job_ids       uuid[];
  v_cleanup_contract_ids  uuid[];

  -- Current contracts schema flags
  v_has_booking_id        boolean := false;
  v_has_talent_user_id    boolean := false;
  v_has_workspace_id      boolean := false;
  v_has_commission_amount boolean := false;
  v_has_net_amount        boolean := false;
  v_has_payment_status    boolean := false;
  v_has_job_date          boolean := false;
  v_has_deposit_paid_at   boolean := false;
  v_has_confirmed_at      boolean := false;
  v_has_created_at        boolean := false;

  -- Dynamic contract insert helpers
  v_cols                  text[];
  v_vals                  text[];

  -- Temp variables
  v_agency_name           text;
  v_talent_name           text;
BEGIN
  -- Inspect contracts columns so optional fields are only inserted when present.
  SELECT
    coalesce(bool_or(column_name = 'booking_id'), false),
    coalesce(bool_or(column_name = 'talent_user_id'), false),
    coalesce(bool_or(column_name = 'workspace_id'), false),
    coalesce(bool_or(column_name = 'commission_amount'), false),
    coalesce(bool_or(column_name = 'net_amount'), false),
    coalesce(bool_or(column_name = 'payment_status'), false),
    coalesce(bool_or(column_name = 'job_date'), false),
    coalesce(bool_or(column_name = 'deposit_paid_at'), false),
    coalesce(bool_or(column_name = 'confirmed_at'), false),
    coalesce(bool_or(column_name = 'created_at'), false)
  INTO
    v_has_booking_id,
    v_has_talent_user_id,
    v_has_workspace_id,
    v_has_commission_amount,
    v_has_net_amount,
    v_has_payment_status,
    v_has_job_date,
    v_has_deposit_paid_at,
    v_has_confirmed_at,
    v_has_created_at
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contracts';

  RAISE NOTICE 'contracts.booking_id exists: %', v_has_booking_id;
  RAISE NOTICE 'contracts.talent_user_id exists: %', v_has_talent_user_id;
  RAISE NOTICE 'contracts.workspace_id exists: %', v_has_workspace_id;
  RAISE NOTICE 'contracts.commission_amount exists: %', v_has_commission_amount;
  RAISE NOTICE 'contracts.net_amount exists: %', v_has_net_amount;
  RAISE NOTICE 'contracts.payment_status exists: %', v_has_payment_status;

  -- Clean up old QA seed data first so the script is idempotent.
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO v_cleanup_job_ids
  FROM jobs
  WHERE (title LIKE '%[QA seed]%' OR description LIKE '%[QA seed]%')
    AND deleted_at IS NULL;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO v_cleanup_contract_ids
  FROM contracts
  WHERE job_id = ANY(v_cleanup_job_ids)
    AND deleted_at IS NULL;

  DELETE FROM contract_disputes
  WHERE reason LIKE '%[QA seed]%'
     OR resolution_note LIKE '%[QA seed]%'
     OR contract_id = ANY(v_cleanup_contract_ids);

  DELETE FROM wallet_transactions
  WHERE reference_id IN (
    SELECT cleanup_contract_id::text
    FROM unnest(v_cleanup_contract_ids) AS cleanup_contract_id
  )
     OR idempotency_key IN (
       SELECT 'escrow_' || cleanup_contract_id::text
       FROM unnest(v_cleanup_contract_ids) AS cleanup_contract_id
     );

  DELETE FROM contracts
  WHERE id = ANY(v_cleanup_contract_ids);

  DELETE FROM bookings
  WHERE job_id = ANY(v_cleanup_job_ids)
     OR job_title LIKE '%[QA seed]%';

  DELETE FROM jobs
  WHERE id = ANY(v_cleanup_job_ids);

  -- Step 1: Resolve users
  SELECT id INTO v_admin_user_id
  FROM profiles
  WHERE role = 'admin' AND deleted_at IS NULL
  LIMIT 1;

  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'No admin user found. Cannot create disputes without a valid opened_by_user_id.';
  END IF;
  RAISE NOTICE 'Admin user ID: %', v_admin_user_id;

  SELECT p.id, a.company_name
  INTO v_agency_user_id, v_agency_name
  FROM profiles p
  JOIN agencies a ON a.id = p.id OR a.user_id = p.id
  WHERE p.role = 'agency'
    AND p.deleted_at IS NULL
    AND a.deleted_at IS NULL
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_agency_user_id IS NULL THEN
    RAISE EXCEPTION 'No agency user found. Cannot create dispute contract without an agency.';
  END IF;
  RAISE NOTICE 'Agency user ID: % (%)', v_agency_user_id, v_agency_name;

  SELECT p.id, tp.full_name
  INTO v_talent_user_id, v_talent_name
  FROM profiles p
  JOIN talent_profiles tp ON tp.id = p.id
  WHERE p.role = 'talent'
    AND p.deleted_at IS NULL
    AND tp.deleted_at IS NULL
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_talent_user_id IS NULL THEN
    RAISE EXCEPTION 'No talent user found. Cannot create dispute contract without a talent.';
  END IF;
  v_talent_profile_id := v_talent_user_id;
  RAISE NOTICE 'Talent user ID: % (%)', v_talent_user_id, v_talent_name;

  v_resolver_user_id := v_admin_user_id;

  SELECT id INTO v_workspace_id
  FROM premium_workspaces
  WHERE deleted_at IS NULL
  LIMIT 1;
  RAISE NOTICE 'Workspace ID (may be null): %', v_workspace_id;

  -- Step 2: Create a job for the disputes.
  INSERT INTO jobs (
    agency_id,
    title,
    description,
    status,
    workspace_id,
    created_by_user_id,
    created_at
  )
  VALUES (
    v_agency_user_id,
    'Campanha Verao Brisa - Testado [QA seed]',
    'Vaga criada automaticamente para testes do sistema de disputas. [QA seed]',
    'open',
    v_workspace_id,
    v_agency_user_id,
    now() - interval '10 days'
  )
  RETURNING id INTO v_job_id;
  RAISE NOTICE 'Created QA seed job ID: %', v_job_id;

  -- Step 3: Create lightweight bookings.
  -- These keep current schemas with contracts.booking_id NOT NULL happy.
  INSERT INTO bookings (
    job_id,
    agency_id,
    talent_user_id,
    job_title,
    price,
    status,
    created_at
  )
  VALUES (
    v_job_id,
    v_agency_user_id,
    v_talent_user_id,
    'Disputa aberta [QA seed]',
    5000.00,
    'pending',
    now() - interval '8 days'
  )
  RETURNING id INTO v_booking_open_id;

  INSERT INTO bookings (
    job_id,
    agency_id,
    talent_user_id,
    job_title,
    price,
    status,
    created_at
  )
  VALUES (
    v_job_id,
    v_agency_user_id,
    v_talent_user_id,
    'Disputa em analise [QA seed]',
    3200.00,
    'pending',
    now() - interval '12 days'
  )
  RETURNING id INTO v_booking_review_id;

  INSERT INTO bookings (
    job_id,
    agency_id,
    talent_user_id,
    job_title,
    price,
    status,
    created_at
  )
  VALUES (
    v_job_id,
    v_agency_user_id,
    v_talent_user_id,
    'Disputa resolvida com reembolso [QA seed]',
    8000.00,
    'pending',
    now() - interval '25 days'
  )
  RETURNING id INTO v_booking_resolved_id;

  RAISE NOTICE 'Created booking IDs: %, %, %', v_booking_open_id, v_booking_review_id, v_booking_resolved_id;

  -- Step 4: Create contracts for each dispute type.
  -- Core contract columns used: job_id, agency_id, talent_id, status, payment_amount.
  -- Optional columns are appended only after information_schema confirms they exist.

  -- Contract A: status = 'confirmed' -> will have the 'open' dispute.
  v_cols := ARRAY['job_id', 'agency_id', 'talent_id', 'status', 'payment_amount'];
  v_vals := ARRAY[
    quote_nullable(v_job_id),
    quote_nullable(v_agency_user_id),
    quote_nullable(v_talent_profile_id),
    quote_literal('confirmed'),
    '5000.00'
  ];

  IF v_has_booking_id THEN
    v_cols := array_append(v_cols, 'booking_id');
    v_vals := array_append(v_vals, quote_nullable(v_booking_open_id));
  END IF;
  IF v_has_talent_user_id THEN
    v_cols := array_append(v_cols, 'talent_user_id');
    v_vals := array_append(v_vals, quote_nullable(v_talent_user_id));
  END IF;
  IF v_has_workspace_id THEN
    v_cols := array_append(v_cols, 'workspace_id');
    v_vals := array_append(v_vals, quote_nullable(v_workspace_id));
  END IF;
  IF v_has_commission_amount THEN
    v_cols := array_append(v_cols, 'commission_amount');
    v_vals := array_append(v_vals, '500.00');
  END IF;
  IF v_has_net_amount THEN
    v_cols := array_append(v_cols, 'net_amount');
    v_vals := array_append(v_vals, '4500.00');
  END IF;
  IF v_has_payment_status THEN
    v_cols := array_append(v_cols, 'payment_status');
    v_vals := array_append(v_vals, quote_literal('escrowed'));
  END IF;
  IF v_has_job_date THEN
    v_cols := array_append(v_cols, 'job_date');
    v_vals := array_append(v_vals, quote_literal((current_date - interval '3 days')::date));
  END IF;
  IF v_has_deposit_paid_at THEN
    v_cols := array_append(v_cols, 'deposit_paid_at');
    v_vals := array_append(v_vals, quote_literal(now() - interval '7 days'));
  END IF;
  IF v_has_confirmed_at THEN
    v_cols := array_append(v_cols, 'confirmed_at');
    v_vals := array_append(v_vals, quote_literal(now() - interval '7 days'));
  END IF;
  IF v_has_created_at THEN
    v_cols := array_append(v_cols, 'created_at');
    v_vals := array_append(v_vals, quote_literal(now() - interval '8 days'));
  END IF;

  EXECUTE format(
    'INSERT INTO contracts (%s) VALUES (%s) RETURNING id',
    array_to_string(v_cols, ', '),
    array_to_string(v_vals, ', ')
  )
  INTO v_contract_open_id;
  RAISE NOTICE 'Created contract (open dispute) ID: %', v_contract_open_id;

  -- Contract B: status = 'confirmed' -> will have the 'under_review' dispute.
  v_cols := ARRAY['job_id', 'agency_id', 'talent_id', 'status', 'payment_amount'];
  v_vals := ARRAY[
    quote_nullable(v_job_id),
    quote_nullable(v_agency_user_id),
    quote_nullable(v_talent_profile_id),
    quote_literal('confirmed'),
    '3200.00'
  ];

  IF v_has_booking_id THEN
    v_cols := array_append(v_cols, 'booking_id');
    v_vals := array_append(v_vals, quote_nullable(v_booking_review_id));
  END IF;
  IF v_has_talent_user_id THEN
    v_cols := array_append(v_cols, 'talent_user_id');
    v_vals := array_append(v_vals, quote_nullable(v_talent_user_id));
  END IF;
  IF v_has_workspace_id THEN
    v_cols := array_append(v_cols, 'workspace_id');
    v_vals := array_append(v_vals, 'NULL');
  END IF;
  IF v_has_commission_amount THEN
    v_cols := array_append(v_cols, 'commission_amount');
    v_vals := array_append(v_vals, '640.00');
  END IF;
  IF v_has_net_amount THEN
    v_cols := array_append(v_cols, 'net_amount');
    v_vals := array_append(v_vals, '2560.00');
  END IF;
  IF v_has_payment_status THEN
    v_cols := array_append(v_cols, 'payment_status');
    v_vals := array_append(v_vals, quote_literal('escrowed'));
  END IF;
  IF v_has_job_date THEN
    v_cols := array_append(v_cols, 'job_date');
    v_vals := array_append(v_vals, quote_literal((current_date - interval '5 days')::date));
  END IF;
  IF v_has_deposit_paid_at THEN
    v_cols := array_append(v_cols, 'deposit_paid_at');
    v_vals := array_append(v_vals, quote_literal(now() - interval '11 days'));
  END IF;
  IF v_has_confirmed_at THEN
    v_cols := array_append(v_cols, 'confirmed_at');
    v_vals := array_append(v_vals, quote_literal(now() - interval '11 days'));
  END IF;
  IF v_has_created_at THEN
    v_cols := array_append(v_cols, 'created_at');
    v_vals := array_append(v_vals, quote_literal(now() - interval '12 days'));
  END IF;

  EXECUTE format(
    'INSERT INTO contracts (%s) VALUES (%s) RETURNING id',
    array_to_string(v_cols, ', '),
    array_to_string(v_vals, ', ')
  )
  INTO v_contract_review_id;
  RAISE NOTICE 'Created contract (under_review dispute) ID: %', v_contract_review_id;

  -- Contract C: status = 'cancelled' -> will have the 'resolved_refund' dispute.
  v_cols := ARRAY['job_id', 'agency_id', 'talent_id', 'status', 'payment_amount'];
  v_vals := ARRAY[
    quote_nullable(v_job_id),
    quote_nullable(v_agency_user_id),
    quote_nullable(v_talent_profile_id),
    quote_literal('cancelled'),
    '8000.00'
  ];

  IF v_has_booking_id THEN
    v_cols := array_append(v_cols, 'booking_id');
    v_vals := array_append(v_vals, quote_nullable(v_booking_resolved_id));
  END IF;
  IF v_has_talent_user_id THEN
    v_cols := array_append(v_cols, 'talent_user_id');
    v_vals := array_append(v_vals, quote_nullable(v_talent_user_id));
  END IF;
  IF v_has_workspace_id THEN
    v_cols := array_append(v_cols, 'workspace_id');
    v_vals := array_append(v_vals, 'NULL');
  END IF;
  IF v_has_commission_amount THEN
    v_cols := array_append(v_cols, 'commission_amount');
    v_vals := array_append(v_vals, '800.00');
  END IF;
  IF v_has_net_amount THEN
    v_cols := array_append(v_cols, 'net_amount');
    v_vals := array_append(v_vals, '7200.00');
  END IF;
  IF v_has_payment_status THEN
    v_cols := array_append(v_cols, 'payment_status');
    v_vals := array_append(v_vals, quote_literal('refunded'));
  END IF;
  IF v_has_job_date THEN
    v_cols := array_append(v_cols, 'job_date');
    v_vals := array_append(v_vals, quote_literal((current_date - interval '20 days')::date));
  END IF;
  IF v_has_deposit_paid_at THEN
    v_cols := array_append(v_cols, 'deposit_paid_at');
    v_vals := array_append(v_vals, quote_literal(now() - interval '24 days'));
  END IF;
  IF v_has_confirmed_at THEN
    v_cols := array_append(v_cols, 'confirmed_at');
    v_vals := array_append(v_vals, quote_literal(now() - interval '24 days'));
  END IF;
  IF v_has_created_at THEN
    v_cols := array_append(v_cols, 'created_at');
    v_vals := array_append(v_vals, quote_literal(now() - interval '25 days'));
  END IF;

  EXECUTE format(
    'INSERT INTO contracts (%s) VALUES (%s) RETURNING id',
    array_to_string(v_cols, ', '),
    array_to_string(v_vals, ', ')
  )
  INTO v_contract_resolved_id;
  RAISE NOTICE 'Created contract (resolved dispute) ID: %', v_contract_resolved_id;

  -- Step 5: Create escrow ledger rows for active disputes.
  -- The admin dispute resolver verifies escrow via these idempotency keys.
  -- We do not mutate profile wallet_balance in a manual QA seed.
  INSERT INTO wallet_transactions (
    user_id,
    type,
    amount,
    description,
    reference_id,
    idempotency_key,
    status,
    created_at
  )
  VALUES (
    v_agency_user_id,
    'escrow_lock',
    5000.00,
    'Custodia QA seed: fundos simulados para disputa aberta [QA seed]',
    v_contract_open_id::text,
    'escrow_' || v_contract_open_id::text,
    'completed',
    now() - interval '7 days'
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  INSERT INTO wallet_transactions (
    user_id,
    type,
    amount,
    description,
    reference_id,
    idempotency_key,
    status,
    created_at
  )
  VALUES (
    v_agency_user_id,
    'escrow_lock',
    3200.00,
    'Custodia QA seed: fundos simulados para disputa em analise [QA seed]',
    v_contract_review_id::text,
    'escrow_' || v_contract_review_id::text,
    'completed',
    now() - interval '11 days'
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RAISE NOTICE 'Created QA escrow wallet_transactions for contracts: %, %', v_contract_open_id, v_contract_review_id;

  -- Step 6: Create dispute rows.
  INSERT INTO contract_disputes (
    contract_id,
    workspace_id,
    opened_by_user_id,
    reason,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_contract_open_id,
    v_workspace_id,
    v_admin_user_id,
    'Talento relatou divergencia nos termos de pagamento e solicitou revisao administrativa. O valor combinado verbalmente diferiu do registrado no contrato digital. [QA seed]',
    'open',
    now() - interval '2 days',
    now() - interval '2 days'
  )
  RETURNING id INTO v_dispute_open_id;
  RAISE NOTICE 'Created dispute (open) ID: %', v_dispute_open_id;

  INSERT INTO contract_disputes (
    contract_id,
    workspace_id,
    opened_by_user_id,
    reason,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_contract_review_id,
    NULL,
    v_admin_user_id,
    'Agencia alega que talento nao compareceu no horario definido. Talento apresentou comprovante de presenca. Admin aguarda documentacao adicional de ambas as partes. [QA seed]',
    'under_review',
    now() - interval '6 days',
    now() - interval '1 day'
  )
  RETURNING id INTO v_dispute_review_id;
  RAISE NOTICE 'Created dispute (under_review) ID: %', v_dispute_review_id;

  INSERT INTO contract_disputes (
    contract_id,
    workspace_id,
    opened_by_user_id,
    reason,
    status,
    resolved_at,
    resolved_by_user_id,
    resolution_note,
    created_at,
    updated_at
  )
  VALUES (
    v_contract_resolved_id,
    NULL,
    v_admin_user_id,
    'Producao audiovisual cancelada dois dias antes do evento. Agencia solicitou reembolso integral do escrow. [QA seed]',
    'resolved_refund',
    now() - interval '18 days',
    v_resolver_user_id,
    'Reembolso aprovado: talento confirmou cancelamento com antecedencia suficiente. Escrow devolvido a agencia. [QA seed]',
    now() - interval '22 days',
    now() - interval '18 days'
  )
  RETURNING id INTO v_dispute_resolved_id;
  RAISE NOTICE 'Created dispute (resolved_refund) ID: %', v_dispute_resolved_id;

  -- Summary
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'QA Dispute Seed - Summary';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'Agency user ID  : %', v_agency_user_id;
  RAISE NOTICE 'Talent user ID  : %', v_talent_user_id;
  RAISE NOTICE 'Admin user ID   : %', v_admin_user_id;
  RAISE NOTICE 'Workspace ID    : %', v_workspace_id;
  RAISE NOTICE '--------------------------------------------------------';
  RAISE NOTICE 'Job ID          : %', v_job_id;
  RAISE NOTICE 'Booking A       : %', v_booking_open_id;
  RAISE NOTICE 'Booking B       : %', v_booking_review_id;
  RAISE NOTICE 'Booking C       : %', v_booking_resolved_id;
  RAISE NOTICE '--------------------------------------------------------';
  RAISE NOTICE 'Contract A (open)     : %', v_contract_open_id;
  RAISE NOTICE 'Contract B (review)   : %', v_contract_review_id;
  RAISE NOTICE 'Contract C (resolved) : %', v_contract_resolved_id;
  RAISE NOTICE '--------------------------------------------------------';
  RAISE NOTICE 'Dispute OPEN        ID: %', v_dispute_open_id;
  RAISE NOTICE 'Dispute UNDER_REVIEW ID: %', v_dispute_review_id;
  RAISE NOTICE 'Dispute RESOLVED    ID: %', v_dispute_resolved_id;
  RAISE NOTICE '========================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'QA Pages to visit:';
  RAISE NOTICE '  /admin/disputes  (all 3 rows visible)';
  RAISE NOTICE '  /admin/disputes  (filter Aberta -> 1 row)';
  RAISE NOTICE '  /admin/disputes  (filter Em analise -> 1 row)';
  RAISE NOTICE '  /admin/disputes  (filter Resolvida (reembolso) -> 1 row)';
  RAISE NOTICE '';
  RAISE NOTICE 'Payout blocking test:';
  RAISE NOTICE '  PATCH /api/contracts/%/  action=pay  -> expect 409 (blocked)', v_contract_open_id;
  RAISE NOTICE '  PATCH /api/contracts/%/  action=pay  -> expect 409 (blocked)', v_contract_review_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Verify inserted disputes:';
  RAISE NOTICE '  SELECT id, contract_id, workspace_id, status, reason, created_at FROM contract_disputes WHERE reason LIKE ''%%[QA seed]%%'' ORDER BY created_at DESC;';
  RAISE NOTICE '';
  RAISE NOTICE 'CLEANUP when done:';
  RAISE NOTICE '  DELETE FROM contract_disputes WHERE reason LIKE ''%%[QA seed]%%'' OR resolution_note LIKE ''%%[QA seed]%%'' OR contract_id IN (SELECT c.id FROM contracts c JOIN jobs j ON j.id = c.job_id WHERE j.title LIKE ''%%[QA seed]%%'' OR j.description LIKE ''%%[QA seed]%%'');';
  RAISE NOTICE '  DELETE FROM wallet_transactions WHERE reference_id IN (SELECT c.id::text FROM contracts c JOIN jobs j ON j.id = c.job_id WHERE j.title LIKE ''%%[QA seed]%%'' OR j.description LIKE ''%%[QA seed]%%'') OR idempotency_key IN (SELECT ''escrow_'' || c.id::text FROM contracts c JOIN jobs j ON j.id = c.job_id WHERE j.title LIKE ''%%[QA seed]%%'' OR j.description LIKE ''%%[QA seed]%%'');';
  RAISE NOTICE '  DELETE FROM contracts WHERE job_id IN (SELECT id FROM jobs WHERE title LIKE ''%%[QA seed]%%'' OR description LIKE ''%%[QA seed]%%'');';
  RAISE NOTICE '  DELETE FROM bookings WHERE job_id IN (SELECT id FROM jobs WHERE title LIKE ''%%[QA seed]%%'' OR description LIKE ''%%[QA seed]%%'') OR job_title LIKE ''%%[QA seed]%%'';';
  RAISE NOTICE '  DELETE FROM jobs WHERE title LIKE ''%%[QA seed]%%'' OR description LIKE ''%%[QA seed]%%'';';
END $$;
