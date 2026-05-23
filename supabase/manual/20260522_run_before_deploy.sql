-- =============================================================================
-- RUN THIS BEFORE DEPLOYING — Consolidated pending migrations
-- Generated: 2026-05-22
--
-- Applies three migration files that exist in supabase/migrations/ but have
-- NOT yet been executed against the live Supabase instance:
--
--   1. 20260522_contracts_paid_by.sql
--   2. 20260522_admin_nav_seen.sql
--   3. 20260522_dispute_resolution_workflow.sql
--
-- EXECUTION ORDER MATTERS:
--   contracts.paid_by_user_id must exist before resolve_contract_dispute()
--   is called (the RPC references that column in an UPDATE statement).
--
-- SAFE TO RE-RUN:
--   All DDL uses IF NOT EXISTS / DROP...IF EXISTS / ADD COLUMN IF NOT EXISTS.
--   CREATE OR REPLACE FUNCTION is idempotent.
--
-- HOW TO RUN:
--   Paste the entire file into Supabase SQL editor → Run as service role.
--   You should see "Success. No rows returned."
--
-- VERIFICATION (run after to confirm):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'contracts'
--     AND column_name = 'paid_by_user_id';
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('admin_nav_seen', 'contract_dispute_notes');
--
--   SELECT proname FROM pg_proc WHERE proname = 'resolve_contract_dispute';
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'contract_disputes'
--     AND column_name IN ('resolution_action','talent_amount','agency_refund_amount');
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 1 — contracts.paid_by_user_id
-- (from 20260522_contracts_paid_by.sql)
-- Required by: payment actor attribution UI + resolve_contract_dispute() RPC
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS paid_by_user_id uuid;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 2 — admin_nav_seen
-- (from 20260522_admin_nav_seen.sql)
-- Required by: admin sidebar seen-state badges
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_nav_seen (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id   uuid        NOT NULL,
  nav_key         text        NOT NULL,
  seen_at         timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_nav_seen_user_key_unique UNIQUE (admin_user_id, nav_key)
);

CREATE INDEX IF NOT EXISTS admin_nav_seen_user_idx
  ON admin_nav_seen (admin_user_id);

ALTER TABLE admin_nav_seen ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 3 — contract_disputes schema expansion
-- (from 20260522_dispute_resolution_workflow.sql)
-- Adds resolved_split status and three resolution-outcome columns
-- ─────────────────────────────────────────────────────────────────────────────

-- Replace status CHECK to add resolved_split
ALTER TABLE contract_disputes
  DROP CONSTRAINT IF EXISTS contract_disputes_status_check;

ALTER TABLE contract_disputes
  ADD CONSTRAINT contract_disputes_status_check
  CHECK (status IN (
    'open',
    'under_review',
    'resolved_refund',
    'resolved_release',
    'resolved_split',
    'closed'
  ));

-- Add resolution outcome columns (safe if already present)
ALTER TABLE contract_disputes
  ADD COLUMN IF NOT EXISTS resolution_action       text,
  ADD COLUMN IF NOT EXISTS talent_amount           numeric(12,2),
  ADD COLUMN IF NOT EXISTS agency_refund_amount    numeric(12,2);

-- Replace resolved_check to include resolved_split
ALTER TABLE contract_disputes
  DROP CONSTRAINT IF EXISTS contract_disputes_resolved_check;

ALTER TABLE contract_disputes
  ADD CONSTRAINT contract_disputes_resolved_check
  CHECK (
    (status NOT IN ('resolved_refund','resolved_release','resolved_split','closed'))
    OR (resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL)
  );

-- Partial index for active-dispute payout gate (fast per-contract lookup)
CREATE INDEX IF NOT EXISTS contract_disputes_active_contract_idx
  ON contract_disputes (contract_id)
  WHERE status IN ('open', 'under_review');


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 4 — contract_dispute_notes
-- (from 20260522_dispute_resolution_workflow.sql)
-- Required by: /admin/disputes/[id] detail page, notes API route
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_dispute_notes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id     uuid        NOT NULL REFERENCES contract_disputes(id) ON DELETE CASCADE,
  admin_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility     text        NOT NULL DEFAULT 'internal'
                             CHECK (visibility IN ('internal', 'public')),
  body           text        NOT NULL CHECK (length(trim(body)) > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
  -- No updated_at: notes are immutable once written.
);

CREATE INDEX IF NOT EXISTS contract_dispute_notes_dispute_id_idx
  ON contract_dispute_notes (dispute_id, created_at DESC);

CREATE INDEX IF NOT EXISTS contract_dispute_notes_admin_user_id_idx
  ON contract_dispute_notes (admin_user_id, created_at DESC);

ALTER TABLE contract_dispute_notes ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 5 — resolve_contract_dispute() RPC
-- (from 20260522_dispute_resolution_workflow.sql)
-- Called by POST /api/admin/disputes/[id]/resolve
-- Runs inside one Postgres transaction: dispute update + wallet mutations +
-- agent commitment settlement + referral commission + audit note insert.
--
-- IMPORTANT: BLOCK 1 (contracts.paid_by_user_id) must exist before this
-- function is CALLED (not before it is created — plpgsql compiles lazily).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resolve_contract_dispute(
  p_dispute_id          uuid,
  p_admin_user_id       uuid,
  p_action              text,
  p_admin_note          text,
  p_talent_amount       numeric DEFAULT NULL,
  p_agency_refund_amount numeric DEFAULT NULL,
  p_note_visibility     text    DEFAULT 'internal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispute              contract_disputes%ROWTYPE;
  v_contract             contracts%ROWTYPE;
  v_action               text      := lower(trim(coalesce(p_action, '')));
  v_note                 text      := trim(coalesce(p_admin_note, ''));
  v_visibility           text      := lower(trim(coalesce(p_note_visibility, 'internal')));
  v_gross                numeric(12,2);
  v_commission           numeric(12,2);
  v_contract_net         numeric(12,2);
  v_talent_user_id       uuid;
  v_talent_amount        numeric(12,2) := 0;
  v_agency_refund_amount numeric(12,2) := 0;
  v_platform_retained    numeric(12,2) := 0;
  v_resolution_status    text;
  v_contract_status      text;
  v_payment_status       text;
  v_booking_status       text;
  v_talent_balance       numeric(12,2);
  v_agency_balance       numeric(12,2);
  v_payout_tx_id         uuid;
  v_refund_tx_id         uuid;
  v_referral_invite      record;
  v_referral_found       boolean       := false;
  v_referral_commission  numeric(12,2) := 0;
  v_referral_tx_id       uuid;
  v_has_wallet_escrow    boolean       := false;
  v_has_agent_commitment boolean       := false;
  v_agent_commitment     record;
  v_settle_amount        numeric(12,2) := 0;
  v_release_amount       numeric(12,2) := 0;
  v_now                  timestamptz   := now();
BEGIN
  -- ── Input validation ───────────────────────────────────────────────────────
  IF p_dispute_id IS NULL OR p_admin_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_required_argument');
  END IF;

  IF v_action NOT IN ('release', 'refund', 'split', 'close') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  IF length(v_note) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_note_required');
  END IF;

  IF v_visibility NOT IN ('internal', 'public') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_note_visibility');
  END IF;

  -- ── Load and lock dispute ──────────────────────────────────────────────────
  SELECT * INTO v_dispute
  FROM contract_disputes
  WHERE id = p_dispute_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dispute_not_found');
  END IF;

  IF v_dispute.status NOT IN ('open', 'under_review') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'dispute_not_open',
      'status', v_dispute.status
    );
  END IF;

  -- ── Load and lock contract ─────────────────────────────────────────────────
  SELECT * INTO v_contract
  FROM contracts
  WHERE id = v_dispute.contract_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  v_gross          := round(coalesce(v_contract.payment_amount,  0)::numeric, 2);
  v_commission     := round(coalesce(v_contract.commission_amount, 0)::numeric, 2);
  v_contract_net   := round(coalesce(v_contract.net_amount, greatest(v_gross - v_commission, 0))::numeric, 2);
  v_talent_user_id := coalesce(v_contract.talent_user_id, v_contract.talent_id);

  -- ── Validate escrow exists for money-moving actions ───────────────────────
  IF v_action IN ('release', 'refund', 'split') THEN
    IF v_contract.status <> 'confirmed' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'contract_not_confirmed',
        'status', v_contract.status
      );
    END IF;

    IF v_gross <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_escrow_amount');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM wallet_transactions
      WHERE type = 'escrow_lock'
        AND status = 'completed'
        AND (
          reference_id = v_contract.id::text
          OR idempotency_key = 'escrow_' || v_contract.id::text
        )
    ) INTO v_has_wallet_escrow;

    SELECT * INTO v_agent_commitment
    FROM premium_agent_wallet_transactions
    WHERE type = 'job_commitment'
      AND status = 'completed'
      AND (
        related_contract_id = v_contract.id
        OR (v_contract.job_id IS NOT NULL AND related_job_id = v_contract.job_id)
      )
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    v_has_agent_commitment := FOUND;

    IF NOT v_has_wallet_escrow AND NOT v_has_agent_commitment THEN
      RETURN jsonb_build_object('ok', false, 'error', 'escrow_not_found');
    END IF;
  END IF;

  IF v_action IN ('release', 'split') THEN
    IF v_talent_user_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'talent_not_found');
    END IF;
  END IF;

  IF v_action IN ('refund', 'split') THEN
    IF v_contract.agency_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'agency_not_found');
    END IF;
  END IF;

  -- Idempotency guards: prevent double-payout / double-refund
  IF v_action IN ('release', 'refund', 'split') THEN
    IF EXISTS (
      SELECT 1 FROM wallet_transactions
      WHERE reference_id = v_contract.id::text AND type = 'payout'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'payout_already_exists');
    END IF;

    IF EXISTS (
      SELECT 1 FROM wallet_transactions
      WHERE reference_id = v_contract.id::text AND type = 'refund'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'refund_already_exists');
    END IF;
  END IF;

  -- ── Compute outcome amounts ────────────────────────────────────────────────
  IF v_action = 'release' THEN
    SELECT id, referrer_id, commission_rate INTO v_referral_invite
    FROM referral_invites
    WHERE referred_user_id = v_talent_user_id
      AND job_id = v_contract.job_id
      AND status <> 'fraud_reported'
      AND status <> 'commission_paid'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    v_referral_found := FOUND;

    IF v_referral_found AND v_referral_invite.referrer_id IS NOT NULL THEN
      v_referral_commission :=
        round((v_gross * coalesce(v_referral_invite.commission_rate, 0.02))::numeric, 2);
    END IF;

    v_talent_amount        := greatest(round((v_contract_net - v_referral_commission)::numeric, 2), 0);
    v_agency_refund_amount := 0;
    v_resolution_status    := 'resolved_release';
    v_contract_status      := 'paid';
    v_payment_status       := 'paid';
    v_booking_status       := 'paid';

  ELSIF v_action = 'refund' THEN
    v_talent_amount        := 0;
    v_agency_refund_amount := v_gross;
    v_resolution_status    := 'resolved_refund';
    v_contract_status      := 'cancelled';
    v_payment_status       := 'refunded';
    v_booking_status       := 'cancelled';

  ELSIF v_action = 'split' THEN
    v_talent_amount        := round(coalesce(p_talent_amount,        0)::numeric, 2);
    v_agency_refund_amount := round(coalesce(p_agency_refund_amount, 0)::numeric, 2);

    IF v_talent_amount < 0 OR v_agency_refund_amount < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_split_amount');
    END IF;
    IF v_talent_amount = 0 AND v_agency_refund_amount = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'split_requires_amount');
    END IF;
    IF round((v_talent_amount + v_agency_refund_amount)::numeric, 2) > v_gross THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'split_exceeds_escrow', 'escrow_amount', v_gross
      );
    END IF;

    v_resolution_status := 'resolved_split';
    v_contract_status   := CASE WHEN v_talent_amount > 0 THEN 'paid' ELSE 'cancelled' END;
    v_payment_status    := 'split';
    v_booking_status    := CASE WHEN v_talent_amount > 0 THEN 'paid' ELSE 'cancelled' END;

  ELSE  -- close
    v_talent_amount        := 0;
    v_agency_refund_amount := 0;
    v_resolution_status    := 'closed';
  END IF;

  v_platform_retained := greatest(
    round((v_gross - v_talent_amount - v_agency_refund_amount - v_referral_commission)::numeric, 2),
    0
  );

  -- ── Wallet mutations (payout / refund / referral commission) ──────────────
  IF v_talent_amount > 0 THEN
    SELECT coalesce(wallet_balance, 0) INTO v_talent_balance
    FROM profiles WHERE id = v_talent_user_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'talent_profile_not_found');
    END IF;

    UPDATE profiles
    SET wallet_balance = round((v_talent_balance + v_talent_amount)::numeric, 2)
    WHERE id = v_talent_user_id;

    INSERT INTO wallet_transactions (user_id, type, amount, description, reference_id, idempotency_key, status)
    VALUES (
      v_talent_user_id, 'payout', v_talent_amount,
      CASE WHEN v_action = 'split'
        THEN 'Pagamento parcial por resolucao de disputa'
        ELSE 'Pagamento liberado por resolucao de disputa'
      END,
      v_contract.id::text,
      'dispute:payout:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_payout_tx_id;
  END IF;

  IF v_agency_refund_amount > 0 THEN
    SELECT coalesce(wallet_balance, 0) INTO v_agency_balance
    FROM profiles WHERE id = v_contract.agency_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'agency_profile_not_found');
    END IF;

    UPDATE profiles
    SET wallet_balance = round((v_agency_balance + v_agency_refund_amount)::numeric, 2)
    WHERE id = v_contract.agency_id;

    INSERT INTO wallet_transactions (user_id, type, amount, description, reference_id, idempotency_key, status)
    VALUES (
      v_contract.agency_id, 'refund', v_agency_refund_amount,
      CASE WHEN v_action = 'split'
        THEN 'Reembolso parcial por resolucao de disputa'
        ELSE 'Reembolso por resolucao de disputa'
      END,
      v_contract.id::text,
      'dispute:refund:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_refund_tx_id;
  END IF;

  IF v_referral_found AND v_referral_commission > 0 AND v_referral_invite.referrer_id IS NOT NULL THEN
    UPDATE profiles
    SET wallet_balance = round((coalesce(wallet_balance, 0) + v_referral_commission)::numeric, 2)
    WHERE id = v_referral_invite.referrer_id;

    INSERT INTO wallet_transactions (user_id, type, amount, description, reference_id, idempotency_key, status)
    VALUES (
      v_referral_invite.referrer_id, 'referral_commission', v_referral_commission,
      'Comissao de indicacao por resolucao de disputa',
      v_contract.id::text,
      'dispute:referral:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_referral_tx_id;

    UPDATE referral_invites
    SET
      status             = 'commission_paid',
      commission_amount  = coalesce(commission_amount,  v_referral_commission),
      commission_paid    = coalesce(commission_paid,    v_referral_commission),
      commission_paid_at = coalesce(commission_paid_at, v_now),
      paid_contract_id   = v_contract.id,
      updated_at         = v_now
    WHERE id = v_referral_invite.id;
  END IF;

  -- ── Contract + booking status update ──────────────────────────────────────
  IF v_action IN ('release', 'refund', 'split') THEN
    UPDATE contracts
    SET
      status         = v_contract_status,
      payment_status = v_payment_status,
      paid_at        = CASE WHEN v_talent_amount > 0 THEN coalesce(paid_at, v_now) ELSE paid_at END,
      paid_by_user_id = CASE WHEN v_talent_amount > 0 THEN p_admin_user_id ELSE paid_by_user_id END
    WHERE id = v_contract.id;

    IF v_contract.booking_id IS NOT NULL THEN
      UPDATE bookings SET status = v_booking_status WHERE id = v_contract.booking_id;
    END IF;

    -- ── Premium agent commitment settlement ───────────────────────────────
    IF v_has_agent_commitment THEN
      v_settle_amount := CASE
        WHEN v_action = 'release' THEN v_gross
        WHEN v_action = 'split'   THEN greatest(round((v_gross - v_agency_refund_amount)::numeric, 2), 0)
        ELSE 0
      END;
      v_release_amount := CASE
        WHEN v_action = 'refund' THEN v_gross
        WHEN v_action = 'split'  THEN v_agency_refund_amount
        ELSE 0
      END;

      IF v_settle_amount > 0 AND NOT EXISTS (
        SELECT 1 FROM premium_agent_wallet_transactions
        WHERE related_contract_id = v_contract.id AND type = 'job_settlement'
      ) THEN
        INSERT INTO premium_agent_wallet_transactions
          (workspace_id, agent_user_id, owner_user_id, type, amount, status,
           related_job_id, related_contract_id, created_by, note, metadata)
        VALUES (
          v_agent_commitment.workspace_id,
          v_agent_commitment.agent_user_id,
          v_agent_commitment.owner_user_id,
          'job_settlement', v_settle_amount, 'completed',
          v_contract.job_id, v_contract.id, p_admin_user_id,
          'Resolucao de disputa: valor consumido da reserva do agente.',
          jsonb_build_object('dispute_id', p_dispute_id, 'action', v_action)
        );
      END IF;

      IF v_release_amount > 0 AND NOT EXISTS (
        SELECT 1 FROM premium_agent_wallet_transactions
        WHERE related_contract_id = v_contract.id AND type IN ('job_release', 'refund')
      ) THEN
        INSERT INTO premium_agent_wallet_transactions
          (workspace_id, agent_user_id, owner_user_id, type, amount, status,
           related_job_id, related_contract_id, created_by, note, metadata)
        VALUES (
          v_agent_commitment.workspace_id,
          v_agent_commitment.agent_user_id,
          v_agent_commitment.owner_user_id,
          'job_release', v_release_amount, 'completed',
          v_contract.job_id, v_contract.id, p_admin_user_id,
          'Resolucao de disputa: valor devolvido da reserva do agente.',
          jsonb_build_object('dispute_id', p_dispute_id, 'action', v_action)
        );
      END IF;
    END IF;
  END IF;

  -- ── Finalize dispute + write admin note ───────────────────────────────────
  UPDATE contract_disputes
  SET
    status                = v_resolution_status,
    resolved_at           = v_now,
    resolved_by_user_id   = p_admin_user_id,
    resolution_note       = v_note,
    resolution_action     = v_action,
    talent_amount         = v_talent_amount,
    agency_refund_amount  = v_agency_refund_amount
  WHERE id = p_dispute_id;

  INSERT INTO contract_dispute_notes (dispute_id, admin_user_id, visibility, body)
  VALUES (p_dispute_id, p_admin_user_id, v_visibility, v_note);

  -- ── Return result ─────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok',                     true,
    'dispute_id',             p_dispute_id,
    'contract_id',            v_contract.id,
    'status',                 v_resolution_status,
    'action',                 v_action,
    'talent_amount',          v_talent_amount,
    'agency_refund_amount',   v_agency_refund_amount,
    'referral_commission',    v_referral_commission,
    'platform_retained',      v_platform_retained,
    'payout_transaction_id',  v_payout_tx_id,
    'refund_transaction_id',  v_refund_tx_id,
    'referral_transaction_id', v_referral_tx_id
  );
END;
$$;
