-- =============================================================================
-- Dispute System QA Seed Script
-- Created: 2026-05-22
--
-- PURPOSE
--   Creates 3 contract_disputes rows (open, under_review, resolved_refund)
--   against real contracts already in the database.
--   Safe to run multiple times — all inserts are guarded by NOT EXISTS.
--
-- WHAT THIS SCRIPT DOES
--   1. Finds a real agency user and talent user from live data.
--   2. Finds or creates a job for the dispute contract.
--   3. Creates a "confirmed" contract (no wallet mutation, status only).
--   4. Creates 3 dispute rows with different statuses.
--   5. RAISES NOTICE for every created ID so you know what was inserted.
--
-- WHAT THIS SCRIPT DOES NOT DO
--   - No wallet_transactions inserts.
--   - No wallet_balance changes.
--   - No RLS policy changes.
--   - No auth.users inserts.
--   - Idempotent: re-running skips already-existing rows.
--
-- HOW TO RUN
--   Paste into Supabase SQL editor and run as service role.
--   Review RAISE NOTICE output to capture IDs for QA.
--
-- CLEANUP
--   DELETE FROM contract_disputes WHERE resolution_note LIKE '%[QA seed]%';
--   DELETE FROM contracts WHERE notes LIKE '%[QA seed]%';
--   DELETE FROM jobs WHERE description LIKE '%[QA seed]%';
-- =============================================================================

DO $$
DECLARE
  -- Resolved admin/user references (discovered at runtime from live data)
  v_agency_user_id        uuid;
  v_talent_user_id        uuid;
  v_talent_profile_id     uuid;  -- = talent_profiles.id = auth.users.id for talent
  v_admin_user_id         uuid;  -- used as opened_by_user_id
  v_resolver_user_id      uuid;

  -- Workspace (optional — used for the "open" dispute to show Premium badge)
  v_workspace_id          uuid;

  -- Created/reused IDs
  v_job_id                uuid;
  v_contract_open_id      uuid;
  v_contract_review_id    uuid;
  v_contract_resolved_id  uuid;
  v_dispute_open_id       uuid;
  v_dispute_review_id     uuid;
  v_dispute_resolved_id   uuid;

  -- Temp variables
  v_agency_name           text;
  v_talent_name           text;

BEGIN

  -- ── Step 1: Resolve users ─────────────────────────────────────────────────
  -- Find an admin user
  SELECT id INTO v_admin_user_id
  FROM profiles
  WHERE role = 'admin' AND deleted_at IS NULL
  LIMIT 1;

  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'No admin user found. Cannot create disputes without a valid opened_by_user_id.';
  END IF;
  RAISE NOTICE 'Admin user ID: %', v_admin_user_id;

  -- Find an agency user
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
  RAISE NOTICE 'Agency user ID: % (% )', v_agency_user_id, v_agency_name;

  -- Find a talent user (talent_profiles.id = profiles.id = auth.users.id)
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
  v_talent_profile_id := v_talent_user_id;  -- talent_profiles.id = profiles.id
  RAISE NOTICE 'Talent user ID: % (% )', v_talent_user_id, v_talent_name;

  -- Use admin as resolver (admin resolves disputes)
  v_resolver_user_id := v_admin_user_id;

  -- Try to find a Premium workspace (for the "open" dispute to show the Premium badge)
  SELECT id INTO v_workspace_id
  FROM premium_workspaces
  WHERE deleted_at IS NULL
  LIMIT 1;
  -- workspace_id is optional; NULL is fine if no workspace exists
  RAISE NOTICE 'Workspace ID (may be null): %', v_workspace_id;

  -- ── Step 2: Create or reuse a job for the disputes ─────────────────────────
  -- Check if our QA seed job already exists
  SELECT id INTO v_job_id
  FROM jobs
  WHERE description LIKE '%[QA seed]%'
    AND agency_id = v_agency_user_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_job_id IS NULL THEN
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
      'Campanha Verão Brisa — Testado [QA seed]',
      'Vaga criada automaticamente para testes do sistema de disputas. [QA seed]',
      'open',
      v_workspace_id,
      v_agency_user_id,
      now() - interval '10 days'
    )
    RETURNING id INTO v_job_id;
    RAISE NOTICE 'Created QA seed job ID: %', v_job_id;
  ELSE
    RAISE NOTICE 'Reusing existing QA seed job ID: %', v_job_id;
  END IF;

  -- ── Step 3: Create contracts for each dispute type ────────────────────────
  -- Note: We write status directly (no wallet mutations). This is test-only.

  -- Contract A: status = 'confirmed' → will have the 'open' dispute
  SELECT id INTO v_contract_open_id
  FROM contracts
  WHERE notes LIKE '%[QA seed dispute-open]%'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_contract_open_id IS NULL THEN
    INSERT INTO contracts (
      job_id,
      agency_id,
      talent_id,
      talent_user_id,
      workspace_id,
      status,
      payment_amount,
      commission_percent,
      commission_amount,
      net_amount,
      payment_status,
      job_date,
      notes,
      created_at,
      deposit_paid_at
    )
    VALUES (
      v_job_id,
      v_agency_user_id,
      v_talent_profile_id,
      v_talent_user_id,
      v_workspace_id,
      'confirmed',
      5000.00,
      10,
      500.00,
      4500.00,
      'escrowed',
      (current_date - interval '3 days')::date,
      'Contrato de campanha de verão. [QA seed dispute-open]',
      now() - interval '8 days',
      now() - interval '7 days'
    )
    RETURNING id INTO v_contract_open_id;
    RAISE NOTICE 'Created contract (open dispute) ID: %', v_contract_open_id;
  ELSE
    RAISE NOTICE 'Reusing contract (open dispute) ID: %', v_contract_open_id;
  END IF;

  -- Contract B: status = 'confirmed' → will have the 'under_review' dispute
  SELECT id INTO v_contract_review_id
  FROM contracts
  WHERE notes LIKE '%[QA seed dispute-review]%'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_contract_review_id IS NULL THEN
    INSERT INTO contracts (
      job_id,
      agency_id,
      talent_id,
      talent_user_id,
      workspace_id,
      status,
      payment_amount,
      commission_percent,
      commission_amount,
      net_amount,
      payment_status,
      job_date,
      notes,
      created_at,
      deposit_paid_at
    )
    VALUES (
      v_job_id,
      v_agency_user_id,
      v_talent_profile_id,
      v_talent_user_id,
      NULL,  -- no workspace for this one (shows no Premium badge)
      'confirmed',
      3200.00,
      20,
      640.00,
      2560.00,
      'escrowed',
      (current_date - interval '5 days')::date,
      'Contrato de evento corporativo. [QA seed dispute-review]',
      now() - interval '12 days',
      now() - interval '11 days'
    )
    RETURNING id INTO v_contract_review_id;
    RAISE NOTICE 'Created contract (under_review dispute) ID: %', v_contract_review_id;
  ELSE
    RAISE NOTICE 'Reusing contract (under_review dispute) ID: %', v_contract_review_id;
  END IF;

  -- Contract C: status = 'cancelled' → will have the 'resolved_refund' dispute
  SELECT id INTO v_contract_resolved_id
  FROM contracts
  WHERE notes LIKE '%[QA seed dispute-resolved]%'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_contract_resolved_id IS NULL THEN
    INSERT INTO contracts (
      job_id,
      agency_id,
      talent_id,
      talent_user_id,
      workspace_id,
      status,
      payment_amount,
      commission_percent,
      commission_amount,
      net_amount,
      payment_status,
      job_date,
      notes,
      created_at,
      deposit_paid_at
    )
    VALUES (
      v_job_id,
      v_agency_user_id,
      v_talent_profile_id,
      v_talent_user_id,
      NULL,
      'cancelled',
      8000.00,
      10,
      800.00,
      7200.00,
      'refunded',
      (current_date - interval '20 days')::date,
      'Contrato de produção audiovisual — encerrado via disputa. [QA seed dispute-resolved]',
      now() - interval '25 days',
      now() - interval '24 days'
    )
    RETURNING id INTO v_contract_resolved_id;
    RAISE NOTICE 'Created contract (resolved dispute) ID: %', v_contract_resolved_id;
  ELSE
    RAISE NOTICE 'Reusing contract (resolved dispute) ID: %', v_contract_resolved_id;
  END IF;

  -- ── Step 4: Create dispute rows ───────────────────────────────────────────

  -- Dispute 1: status = 'open' (primary QA target — blocks payout)
  SELECT id INTO v_dispute_open_id
  FROM contract_disputes
  WHERE contract_id = v_contract_open_id
    AND status = 'open'
  LIMIT 1;

  IF v_dispute_open_id IS NULL THEN
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
      'Talento relatou divergência nos termos de pagamento e solicitou revisão administrativa. O valor combinado verbalmente diferiu do registrado no contrato digital. [QA seed]',
      'open',
      now() - interval '2 days',
      now() - interval '2 days'
    )
    RETURNING id INTO v_dispute_open_id;
    RAISE NOTICE 'Created dispute (open) ID: %', v_dispute_open_id;
  ELSE
    RAISE NOTICE 'Reusing dispute (open) ID: %', v_dispute_open_id;
  END IF;

  -- Dispute 2: status = 'under_review' (for filter testing)
  SELECT id INTO v_dispute_review_id
  FROM contract_disputes
  WHERE contract_id = v_contract_review_id
    AND status = 'under_review'
  LIMIT 1;

  IF v_dispute_review_id IS NULL THEN
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
      'Agência alega que talento não compareceu no horário definido. Talento apresentou comprovante de presença. Admin aguarda documentação adicional de ambas as partes. [QA seed]',
      'under_review',
      now() - interval '6 days',
      now() - interval '1 day'
    )
    RETURNING id INTO v_dispute_review_id;
    RAISE NOTICE 'Created dispute (under_review) ID: %', v_dispute_review_id;
  ELSE
    RAISE NOTICE 'Reusing dispute (under_review) ID: %', v_dispute_review_id;
  END IF;

  -- Dispute 3: status = 'resolved_refund' (for filter testing — resolved)
  SELECT id INTO v_dispute_resolved_id
  FROM contract_disputes
  WHERE contract_id = v_contract_resolved_id
    AND status = 'resolved_refund'
  LIMIT 1;

  IF v_dispute_resolved_id IS NULL THEN
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
      'Produção audiovisual cancelada dois dias antes do evento. Agência solicitou reembolso integral do escrow. [QA seed]',
      'resolved_refund',
      now() - interval '18 days',
      v_resolver_user_id,
      'Reembolso aprovado: talento confirmou cancelamento com antecedência suficiente. Escrow devolvido à agência. [QA seed]',
      now() - interval '22 days',
      now() - interval '18 days'
    )
    RETURNING id INTO v_dispute_resolved_id;
    RAISE NOTICE 'Created dispute (resolved_refund) ID: %', v_dispute_resolved_id;
  ELSE
    RAISE NOTICE 'Reusing dispute (resolved_refund) ID: %', v_dispute_resolved_id;
  END IF;

  -- ── Summary ───────────────────────────────────────────────────────────────
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'QA Dispute Seed — Summary';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'Agency user ID  : %', v_agency_user_id;
  RAISE NOTICE 'Talent user ID  : %', v_talent_user_id;
  RAISE NOTICE 'Admin user ID   : %', v_admin_user_id;
  RAISE NOTICE 'Workspace ID    : %', v_workspace_id;
  RAISE NOTICE '--------------------------------------------------------';
  RAISE NOTICE 'Job ID          : %', v_job_id;
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
  RAISE NOTICE '  /admin/disputes  (filter Em análise -> 1 row)';
  RAISE NOTICE '  /admin/disputes  (filter Resolvida (reembolso) -> 1 row)';
  RAISE NOTICE '';
  RAISE NOTICE 'Payout blocking test:';
  RAISE NOTICE '  PATCH /api/contracts/%/  action=pay  → expect 409 (blocked)', v_contract_open_id;
  RAISE NOTICE '  PATCH /api/contracts/%/  action=pay  → expect 409 (blocked)', v_contract_review_id;
  RAISE NOTICE '';
  RAISE NOTICE 'CLEANUP when done:';
  RAISE NOTICE '  DELETE FROM contract_disputes WHERE resolution_note LIKE ''%%[QA seed]%%'' OR reason LIKE ''%%[QA seed]%%'';';
  RAISE NOTICE '  DELETE FROM contracts WHERE notes LIKE ''%%[QA seed]%%'';';
  RAISE NOTICE '  DELETE FROM jobs WHERE description LIKE ''%%[QA seed]%%'';';

END $$;
