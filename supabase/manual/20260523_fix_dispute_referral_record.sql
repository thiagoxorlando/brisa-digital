-- Hotfix: guard v_referral_invite field access with v_action = 'release'.
--
-- v_referral_invite is an untyped record only assigned inside the release branch.
-- The original line 370 accessed .referrer_id outside that branch, causing PL/pgSQL
-- to throw "record is not assigned yet" for refund / split / close actions.
--
-- Fix: prefix that IF with v_action = 'release' so the field is never read
-- when the record was never populated.

CREATE OR REPLACE FUNCTION resolve_contract_dispute(
  p_dispute_id uuid,
  p_admin_user_id uuid,
  p_action text,
  p_admin_note text,
  p_talent_amount numeric DEFAULT NULL,
  p_agency_refund_amount numeric DEFAULT NULL,
  p_note_visibility text DEFAULT 'internal'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispute contract_disputes%ROWTYPE;
  v_contract contracts%ROWTYPE;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_note text := trim(coalesce(p_admin_note, ''));
  v_visibility text := lower(trim(coalesce(p_note_visibility, 'internal')));
  v_gross numeric(12,2);
  v_commission numeric(12,2);
  v_contract_net numeric(12,2);
  v_talent_user_id uuid;
  v_talent_amount numeric(12,2) := 0;
  v_agency_refund_amount numeric(12,2) := 0;
  v_platform_retained numeric(12,2) := 0;
  v_resolution_status text;
  v_contract_status text;
  v_payment_status text;
  v_booking_status text;
  v_talent_balance numeric(12,2);
  v_agency_balance numeric(12,2);
  v_payout_tx_id uuid;
  v_refund_tx_id uuid;
  v_referral_id uuid;
  v_referrer_id uuid;
  v_referral_commission_rate numeric;
  v_referral_found boolean := false;
  v_referral_commission numeric(12,2) := 0;
  v_referral_tx_id uuid;
  v_has_wallet_escrow boolean := false;
  v_has_agent_commitment boolean := false;
  v_agent_commitment record;
  v_settle_amount numeric(12,2) := 0;
  v_release_amount numeric(12,2) := 0;
  v_now timestamptz := now();
BEGIN
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

  SELECT *
  INTO v_dispute
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

  SELECT *
  INTO v_contract
  FROM contracts
  WHERE id = v_dispute.contract_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  v_gross := round(coalesce(v_contract.payment_amount, 0)::numeric, 2);
  v_commission := round(coalesce(v_contract.commission_amount, 0)::numeric, 2);
  v_contract_net := round(coalesce(v_contract.net_amount, greatest(v_gross - v_commission, 0))::numeric, 2);
  v_talent_user_id := coalesce(v_contract.talent_user_id, v_contract.talent_id);

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
      SELECT 1
      FROM wallet_transactions
      WHERE type = 'escrow_lock'
        AND (status = 'completed' OR status IS NULL)
        AND (
          reference_id = v_contract.id::text
          OR idempotency_key = 'escrow_' || v_contract.id::text
        )
    )
    INTO v_has_wallet_escrow;

    SELECT *
    INTO v_agent_commitment
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

  IF v_action IN ('release', 'refund', 'split') THEN
    IF EXISTS (
      SELECT 1
      FROM wallet_transactions
      WHERE reference_id = v_contract.id::text
        AND type = 'payout'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'payout_already_exists');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM wallet_transactions
      WHERE reference_id = v_contract.id::text
        AND type = 'refund'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'refund_already_exists');
    END IF;
  END IF;

  IF v_action = 'release' THEN
    SELECT id, referrer_id, commission_rate
    INTO v_referral_id, v_referrer_id, v_referral_commission_rate
    FROM referral_invites
    WHERE referred_user_id = v_talent_user_id
      AND job_id = v_contract.job_id
      AND status <> 'fraud_reported'
      AND status <> 'commission_paid'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    v_referral_found := FOUND;

    IF v_referral_found AND v_referrer_id IS NOT NULL THEN
      v_referral_commission := round((v_gross * coalesce(v_referral_commission_rate, 0.02))::numeric, 2);
    END IF;

    v_talent_amount := greatest(round((v_contract_net - v_referral_commission)::numeric, 2), 0);
    v_agency_refund_amount := 0;
    v_resolution_status := 'resolved_release';
    v_contract_status := 'paid';
    v_payment_status := 'paid';
    v_booking_status := 'paid';
  ELSIF v_action = 'refund' THEN
    v_talent_amount := 0;
    v_agency_refund_amount := v_gross;
    v_resolution_status := 'resolved_refund';
    v_contract_status := 'cancelled';
    v_payment_status := 'refunded';
    v_booking_status := 'cancelled';
  ELSIF v_action = 'split' THEN
    v_talent_amount := round(coalesce(p_talent_amount, 0)::numeric, 2);
    v_agency_refund_amount := round(coalesce(p_agency_refund_amount, 0)::numeric, 2);

    IF v_talent_amount < 0 OR v_agency_refund_amount < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_split_amount');
    END IF;

    IF v_talent_amount = 0 AND v_agency_refund_amount = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'split_requires_amount');
    END IF;

    IF round((v_talent_amount + v_agency_refund_amount)::numeric, 2) > v_gross THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'split_exceeds_escrow',
        'escrow_amount', v_gross
      );
    END IF;

    v_resolution_status := 'resolved_split';
    v_contract_status := CASE WHEN v_talent_amount > 0 THEN 'paid' ELSE 'cancelled' END;
    v_payment_status := 'split';
    v_booking_status := CASE WHEN v_talent_amount > 0 THEN 'paid' ELSE 'cancelled' END;
  ELSE
    v_talent_amount := 0;
    v_agency_refund_amount := 0;
    v_resolution_status := 'closed';
  END IF;

  v_platform_retained := greatest(round((v_gross - v_talent_amount - v_agency_refund_amount - v_referral_commission)::numeric, 2), 0);

  IF v_talent_amount > 0 THEN
    SELECT coalesce(wallet_balance, 0)
    INTO v_talent_balance
    FROM profiles
    WHERE id = v_talent_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'talent_profile_not_found');
    END IF;

    UPDATE profiles
    SET wallet_balance = round((v_talent_balance + v_talent_amount)::numeric, 2)
    WHERE id = v_talent_user_id;

    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount,
      description,
      reference_id,
      idempotency_key,
      status
    )
    VALUES (
      v_talent_user_id,
      'payout',
      v_talent_amount,
      CASE
        WHEN v_action = 'split' THEN 'Pagamento parcial por resolucao de disputa'
        ELSE 'Pagamento liberado por resolucao de disputa'
      END,
      v_contract.id::text,
      'dispute:payout:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_payout_tx_id;
  END IF;

  IF v_agency_refund_amount > 0 THEN
    SELECT coalesce(wallet_balance, 0)
    INTO v_agency_balance
    FROM profiles
    WHERE id = v_contract.agency_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'agency_profile_not_found');
    END IF;

    UPDATE profiles
    SET wallet_balance = round((v_agency_balance + v_agency_refund_amount)::numeric, 2)
    WHERE id = v_contract.agency_id;

    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount,
      description,
      reference_id,
      idempotency_key,
      status
    )
    VALUES (
      v_contract.agency_id,
      'refund',
      v_agency_refund_amount,
      CASE
        WHEN v_action = 'split' THEN 'Reembolso parcial por resolucao de disputa'
        ELSE 'Reembolso por resolucao de disputa'
      END,
      v_contract.id::text,
      'dispute:refund:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_refund_tx_id;
  END IF;

  IF v_referral_found AND v_referral_commission > 0 AND v_referrer_id IS NOT NULL THEN
    UPDATE profiles
    SET wallet_balance = round((coalesce(wallet_balance, 0) + v_referral_commission)::numeric, 2)
    WHERE id = v_referrer_id;

    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount,
      description,
      reference_id,
      idempotency_key,
      status
    )
    VALUES (
      v_referrer_id,
      'referral_commission',
      v_referral_commission,
      'Comissao de indicacao por resolucao de disputa',
      v_contract.id::text,
      'dispute:referral:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_referral_tx_id;

    UPDATE referral_invites
    SET
      status = 'commission_paid',
      commission_amount = coalesce(commission_amount, v_referral_commission),
      commission_paid = coalesce(commission_paid, v_referral_commission),
      commission_paid_at = coalesce(commission_paid_at, v_now),
      paid_contract_id = v_contract.id,
      updated_at = v_now
    WHERE id = v_referral_id;
  END IF;

  IF v_action IN ('release', 'refund', 'split') THEN
    UPDATE contracts
    SET
      status = v_contract_status,
      payment_status = v_payment_status,
      paid_at = CASE WHEN v_talent_amount > 0 THEN coalesce(paid_at, v_now) ELSE paid_at END,
      paid_by_user_id = CASE WHEN v_talent_amount > 0 THEN p_admin_user_id ELSE paid_by_user_id END
    WHERE id = v_contract.id;

    IF v_contract.booking_id IS NOT NULL THEN
      UPDATE bookings
      SET status = v_booking_status
      WHERE id = v_contract.booking_id;
    END IF;

    IF v_has_agent_commitment THEN
      v_settle_amount := CASE
        WHEN v_action = 'release' THEN v_gross
        WHEN v_action = 'split' THEN greatest(round((v_gross - v_agency_refund_amount)::numeric, 2), 0)
        ELSE 0
      END;
      v_release_amount := CASE
        WHEN v_action = 'refund' THEN v_gross
        WHEN v_action = 'split' THEN v_agency_refund_amount
        ELSE 0
      END;

      IF v_settle_amount > 0 AND NOT EXISTS (
        SELECT 1
        FROM premium_agent_wallet_transactions
        WHERE related_contract_id = v_contract.id
          AND type = 'job_settlement'
      ) THEN
        INSERT INTO premium_agent_wallet_transactions (
          workspace_id,
          agent_user_id,
          owner_user_id,
          type,
          amount,
          status,
          related_job_id,
          related_contract_id,
          created_by,
          note,
          metadata
        )
        VALUES (
          v_agent_commitment.workspace_id,
          v_agent_commitment.agent_user_id,
          v_agent_commitment.owner_user_id,
          'job_settlement',
          v_settle_amount,
          'completed',
          v_contract.job_id,
          v_contract.id,
          p_admin_user_id,
          'Resolucao de disputa: valor consumido da reserva do agente.',
          jsonb_build_object('dispute_id', p_dispute_id, 'action', v_action)
        );
      END IF;

      IF v_release_amount > 0 AND NOT EXISTS (
        SELECT 1
        FROM premium_agent_wallet_transactions
        WHERE related_contract_id = v_contract.id
          AND type IN ('job_release', 'refund')
      ) THEN
        INSERT INTO premium_agent_wallet_transactions (
          workspace_id,
          agent_user_id,
          owner_user_id,
          type,
          amount,
          status,
          related_job_id,
          related_contract_id,
          created_by,
          note,
          metadata
        )
        VALUES (
          v_agent_commitment.workspace_id,
          v_agent_commitment.agent_user_id,
          v_agent_commitment.owner_user_id,
          'job_release',
          v_release_amount,
          'completed',
          v_contract.job_id,
          v_contract.id,
          p_admin_user_id,
          'Resolucao de disputa: valor devolvido da reserva do agente.',
          jsonb_build_object('dispute_id', p_dispute_id, 'action', v_action)
        );
      END IF;
    END IF;
  END IF;

  UPDATE contract_disputes
  SET
    status = v_resolution_status,
    resolved_at = v_now,
    resolved_by_user_id = p_admin_user_id,
    resolution_note = v_note,
    resolution_action = v_action,
    talent_amount = v_talent_amount,
    agency_refund_amount = v_agency_refund_amount
  WHERE id = p_dispute_id;

  INSERT INTO contract_dispute_notes (
    dispute_id,
    admin_user_id,
    visibility,
    body
  )
  VALUES (
    p_dispute_id,
    p_admin_user_id,
    v_visibility,
    v_note
  );

  RETURN jsonb_build_object(
    'ok', true,
    'dispute_id', p_dispute_id,
    'contract_id', v_contract.id,
    'status', v_resolution_status,
    'action', v_action,
    'talent_amount', v_talent_amount,
    'agency_refund_amount', v_agency_refund_amount,
    'referral_commission', v_referral_commission,
    'platform_retained', v_platform_retained,
    'payout_transaction_id', v_payout_tx_id,
    'refund_transaction_id', v_refund_tx_id,
    'referral_transaction_id', v_referral_tx_id
  );
END;
$$;
