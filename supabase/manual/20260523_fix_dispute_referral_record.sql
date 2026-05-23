-- Hotfix: guard v_referral_invite field access with v_action = 'release'.
--
-- The original resolve_contract_dispute function declared v_referral_invite as
-- an untyped record and only assigned it inside the v_action = 'release' branch.
-- Line 370 of the original migration accessed v_referral_invite.referrer_id
-- outside that branch, which caused PL/pgSQL to attempt tuple-descriptor
-- resolution on an unassigned record — throwing
--   "record "v_referral_invite" is not assigned yet"
-- for refund / split / close actions.
--
-- Fix: prefix that IF with v_action = 'release' so the field is never read
-- for non-release actions.

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
  v_referral_invite record;
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
    RETURN jsonb_build_object('ok', false, 'error', 'dispute_not_actionable', 'current_status', v_dispute.status);
  END IF;

  SELECT *
  INTO v_contract
  FROM contracts
  WHERE id = v_dispute.contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;

  v_gross          := coalesce(v_contract.payment_amount, 0);
  v_commission     := coalesce(v_contract.commission_amount, 0);
  v_contract_net   := coalesce(v_contract.net_amount, v_gross - v_commission);
  v_talent_user_id := v_contract.talent_user_id;

  IF v_action = 'split' THEN
    v_talent_amount        := round(coalesce(p_talent_amount, 0)::numeric, 2);
    v_agency_refund_amount := round(coalesce(p_agency_refund_amount, 0)::numeric, 2);
    IF (v_talent_amount + v_agency_refund_amount) > v_gross THEN
      RETURN jsonb_build_object('ok', false, 'error', 'split_exceeds_escrow');
    END IF;
    v_platform_retained := v_gross - v_talent_amount - v_agency_refund_amount;
  ELSIF v_action = 'release' THEN
    v_talent_amount := v_contract_net;
  ELSIF v_action = 'refund' THEN
    v_agency_refund_amount := v_gross;
  END IF;

  IF v_action = 'release' THEN
    v_resolution_status := 'resolved_release';
    v_contract_status   := 'paid';
    v_payment_status    := 'paid';
    v_booking_status    := 'completed';
  ELSIF v_action = 'refund' THEN
    v_resolution_status := 'resolved_refund';
    v_contract_status   := 'cancelled';
    v_payment_status    := 'refunded';
    v_booking_status    := 'cancelled';
  ELSIF v_action = 'split' THEN
    v_resolution_status := 'resolved_split';
    v_contract_status   := 'paid';
    v_payment_status    := 'split';
    v_booking_status    := 'completed';
  ELSIF v_action = 'close' THEN
    v_resolution_status := 'closed';
    v_contract_status   := v_contract.status;
    v_payment_status    := v_contract.payment_status;
    v_booking_status    := NULL;
  END IF;

  IF v_action = 'release' THEN
    SELECT ri.*
    INTO v_referral_invite
    FROM referral_invites ri
    WHERE ri.invited_user_id = v_talent_user_id
      AND ri.status IN ('joined', 'commission_pending')
    LIMIT 1;

    IF FOUND THEN
      v_referral_found := true;
      IF v_referral_invite.referrer_id IS NOT NULL THEN
        v_referral_commission := round((v_gross * coalesce(v_referral_invite.commission_rate, 0.02))::numeric, 2);
      END IF;
    END IF;
  END IF;

  SELECT exists(
    SELECT 1 FROM wallet_transactions
    WHERE idempotency_key = 'escrow_' || v_contract.id::text
      AND type = 'escrow_lock'
  ) INTO v_has_wallet_escrow;

  SELECT exists(
    SELECT 1 FROM premium_agent_wallet_transactions
    WHERE related_contract_id = v_contract.id
      AND type = 'job_commitment'
  ) INTO v_has_agent_commitment;

  IF v_has_agent_commitment THEN
    SELECT *
    INTO v_agent_commitment
    FROM premium_agent_wallet_transactions
    WHERE related_contract_id = v_contract.id
      AND type = 'job_commitment'
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_action IN ('release', 'split') AND v_talent_amount > 0 AND v_talent_user_id IS NOT NULL THEN
    UPDATE profiles
    SET wallet_balance = round((coalesce(wallet_balance, 0) + v_talent_amount)::numeric, 2)
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
      CASE v_action
        WHEN 'split' THEN 'Pagamento parcial por resolucao de disputa'
        ELSE 'Pagamento por resolucao de disputa'
      END,
      v_contract.id::text,
      'dispute:payout:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_payout_tx_id;
  END IF;

  IF v_action IN ('refund', 'split') AND v_agency_refund_amount > 0 THEN
    UPDATE profiles
    SET wallet_balance = round((coalesce(wallet_balance, 0) + v_agency_refund_amount)::numeric, 2)
    WHERE id = v_contract.agency_user_id;

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
      v_contract.agency_user_id,
      'refund',
      v_agency_refund_amount,
      CASE v_action
        WHEN 'split' THEN 'Reembolso parcial por resolucao de disputa'
        ELSE 'Reembolso por resolucao de disputa'
      END,
      v_contract.id::text,
      'dispute:refund:' || p_dispute_id::text,
      'completed'
    )
    RETURNING id INTO v_refund_tx_id;
  END IF;

  -- Only pay referral commission when the talent is actually being paid (release action).
  -- Accessing v_referral_invite fields is safe here because the guard ensures the
  -- variable was assigned in the release branch above.
  IF v_action = 'release' AND v_referral_found AND v_referral_commission > 0 AND v_referral_invite.referrer_id IS NOT NULL THEN
    UPDATE profiles
    SET wallet_balance = round((coalesce(wallet_balance, 0) + v_referral_commission)::numeric, 2)
    WHERE id = v_referral_invite.referrer_id;

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
      v_referral_invite.referrer_id,
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
    WHERE id = v_referral_invite.id;
  END IF;

  IF v_action IN ('release', 'refund', 'split') THEN
    UPDATE contracts
    SET
      status = v_contract_status,
      payment_status = v_payment_status,
      paid_at = CASE WHEN v_talent_amount > 0 THEN coalesce(paid_at, v_now) ELSE paid_at END,
      paid_by_user_id = CASE WHEN v_talent_amount > 0 THEN p_admin_user_id ELSE paid_by_user_id END
    WHERE id = v_contract.id;

    UPDATE bookings
    SET status = v_booking_status
    WHERE contract_id = v_contract.id
      AND status NOT IN ('cancelled', 'completed');
  END IF;

  IF v_has_wallet_escrow AND v_action IN ('release', 'refund', 'split') THEN
    UPDATE wallet_transactions
    SET
      status = 'completed',
      updated_at = v_now
    WHERE idempotency_key = 'escrow_' || v_contract.id::text
      AND type = 'escrow_lock';
  END IF;

  IF v_has_agent_commitment AND v_action IN ('release', 'refund', 'split') THEN
    v_settle_amount  := CASE WHEN v_action IN ('release', 'split') THEN v_commission ELSE 0 END;
    v_release_amount := CASE WHEN v_action = 'refund' THEN coalesce((v_agent_commitment).amount, 0) ELSE 0 END;

    IF v_settle_amount > 0 THEN
      INSERT INTO premium_agent_wallet_transactions (
        workspace_id,
        agent_user_id,
        type,
        amount,
        status,
        related_contract_id,
        related_job_id,
        note
      )
      SELECT
        workspace_id,
        agent_user_id,
        'job_settlement',
        v_settle_amount,
        'completed',
        v_contract.id,
        job_id,
        'Liquidacao por resolucao de disputa'
      FROM contracts WHERE id = v_contract.id;
    END IF;

    IF v_release_amount > 0 THEN
      INSERT INTO premium_agent_wallet_transactions (
        workspace_id,
        agent_user_id,
        type,
        amount,
        status,
        related_contract_id,
        related_job_id,
        note
      )
      SELECT
        workspace_id,
        agent_user_id,
        'job_release',
        v_release_amount,
        'completed',
        v_contract.id,
        job_id,
        'Liberacao de comprometido por reembolso de disputa'
      FROM contracts WHERE id = v_contract.id;
    END IF;
  END IF;

  UPDATE contract_disputes
  SET
    status           = v_resolution_status,
    resolution_action = v_action,
    talent_amount    = v_talent_amount,
    agency_refund_amount = v_agency_refund_amount,
    resolved_at      = v_now,
    resolved_by_user_id = p_admin_user_id,
    updated_at       = v_now
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
    'resolution', v_resolution_status,
    'talent_amount', v_talent_amount,
    'agency_refund_amount', v_agency_refund_amount,
    'platform_retained', v_platform_retained,
    'referral_commission', v_referral_commission,
    'payout_tx_id', v_payout_tx_id,
    'refund_tx_id', v_refund_tx_id,
    'referral_tx_id', v_referral_tx_id
  );
END;
$$;
