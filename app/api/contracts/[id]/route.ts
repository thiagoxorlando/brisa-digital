import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { syncBooking } from "@/lib/syncBooking";
import { notify, notifyAdmins } from "@/lib/notify";
import { getUnifiedBookingStatus } from "@/lib/bookingStatus";
import { resolveContractCreationAccess } from "@/lib/contractCreationAccess.server";
import {
  agencyWorkspaceBookingsHref,
  agencyWorkspaceContractsHref,
  agencyWorkspaceWalletHref,
  resolveWorkspaceLifecycleByJobId,
  talentWorkspaceContractsHref,
} from "@/lib/workspaceLifecycle";
import { REFERRAL_RATE } from "@/lib/plans";
import { brl } from "@/lib/brl";
import { checkPaymentReleaseEligibility, checkDisputeBlockingPayout } from "@/lib/paymentReleasePolicy";
import { type DisputeStatus } from "@/lib/disputePolicy";
import { getCancellationOutcome } from "@/lib/cancellationPolicy";
import { logAdminAction } from "@/lib/auditLog";
import { renderNotificationTemplate } from "@/lib/notificationTemplates";
import { isEscrowFlow } from "@/lib/isEscrowFlow.server";

const ALLOWED_ACTIONS = [
  "reject", "agency_sign", "pay",
  "cancel_job", "talent_cancel",
  "set_file_url",
  "agent_pay",   // pay from signed when job is backed by agent job_commitment (no real escrow needed)
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { action, contract_file_url } = body;

  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${ALLOWED_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch contract before authorizing any mutation.
  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const contractTalentUserId = contract.talent_user_id ?? contract.talent_id ?? null;

  const workspaceLifecycle = await resolveWorkspaceLifecycleByJobId(supabase, contract.job_id ?? null);
  const agencyBookingsHref = agencyWorkspaceBookingsHref(workspaceLifecycle?.workspaceSlug);
  const agencyContractsHref = agencyWorkspaceContractsHref(workspaceLifecycle?.workspaceSlug);
  const agencyWalletHref = agencyWorkspaceWalletHref(workspaceLifecycle?.workspaceSlug);
  const talentContractsHref = talentWorkspaceContractsHref(workspaceLifecycle?.workspaceSlug);

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const agencyAccess = caller?.role === "agency"
    ? await resolveContractCreationAccess({
        userId: user.id,
        jobId: contract.job_id ?? null,
        requestedAgencyId: contract.agency_id ?? null,
      })
    : null;

  const isAgencyOwner = caller?.role === "agency" && !!agencyAccess?.allowed;
  const isTalentOwner = caller?.role === "talent" && contractTalentUserId === user.id;
  const agencyActions = ["set_file_url", "agency_sign", "pay", "cancel_job", "agent_pay"];
  const talentActions = ["reject", "talent_cancel"];

  if (agencyActions.includes(action) && !isAgencyOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (talentActions.includes(action) && !isTalentOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Agency-owned file attachment is allowed only after ownership is verified.
  if (action === "set_file_url") {
    if (!contract_file_url) {
      return NextResponse.json({ error: "contract_file_url is required" }, { status: 400 });
    }
    const { error } = await supabase
      .from("contracts")
      .update({ contract_file_url })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();

  // ── Talent: reject ────────────────────────────────────────────────────────
  if (action === "reject") {
    if (contract.status !== "sent") {
      return NextResponse.json({ error: "Contract is no longer pending" }, { status: 409 });
    }
    const { error } = await supabase
      .from("contracts")
      .update({ status: "rejected" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await syncBooking(supabase, contract, "cancelled");
    await notify(contract.agency_id, "contract", "Talento recusou o seu contrato", agencyContractsHref);
    return NextResponse.json({ ok: true, status: "rejected", derived_status: getUnifiedBookingStatus("cancelled", "rejected") });
  }

  // ── Talent: cancel before agency confirms ────────────────────────────────
  // Talent may only cancel from sent or signed — escrow is not yet locked.
  if (action === "talent_cancel") {
    if (!["sent", "signed"].includes(contract.status)) {
      return NextResponse.json({ error: "Cannot cancel at this stage" }, { status: 409 });
    }

    // Block: agency already sent/confirmed payment (internal mode).
    // Once agency_payment_sent_at is set the talent can only confirm receipt, not cancel.
    const agencyPaymentSentAt = (contract as Record<string, unknown>).agency_payment_sent_at as string | null;
    const paymentReceiptUrl   = (contract as Record<string, unknown>).payment_receipt_url as string | null;
    if (agencyPaymentSentAt || paymentReceiptUrl) {
      return NextResponse.json(
        { error: "Não é possível cancelar após a agência ter confirmado o envio do pagamento." },
        { status: 422 },
      );
    }

    // ATOMIC: cancel contract (no refund needed — pre-escrow states)
    const { data: result, error: rpcErr } = await supabase.rpc("cancel_contract_safe", {
      p_contract_id: id,
      p_agency_id:   null,
    });
    if (rpcErr) {
      console.error("[talent_cancel rpc]", rpcErr.message);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }
    const r = result as { ok: boolean; error?: string };
    if (!r.ok) return NextResponse.json({ error: r.error ?? "Cannot cancel" }, { status: 409 });

    await syncBooking(supabase, contract, "cancelled");

    // Mark as talent-cancelled so the reliability trigger can increment jobs_cancelled
    if (contract.booking_id) {
      await supabase
        .from("bookings")
        .update({ cancelled_by: "talent" })
        .eq("id", contract.booking_id);
    }

    if (contract.job_id && contractTalentUserId) {
      await supabase
        .from("submissions")
        .delete()
        .eq("job_id", contract.job_id)
        .eq("talent_user_id", contractTalentUserId);
    }

    await notify(contract.agency_id, "contract", "Talento cancelou a reserva", agencyBookingsHref);
    return NextResponse.json({ ok: true, status: "cancelled", derived_status: getUnifiedBookingStatus("cancelled", "cancelled") });
  }

  // ── Agency: confirm + escrow lock (ATOMIC) ────────────────────────────────
  // Deducts wallet, records escrow_lock transaction, sets status = confirmed.
  // All three operations succeed or fail together via Postgres function.
  if (action === "agency_sign") {
    if (contract.status !== "signed") {
      return NextResponse.json(
        { error: "Contract must be signed by talent first" },
        { status: 409 }
      );
    }

    // Guard: internal-payment agencies do not use escrow deposit.
    // isEscrowFlow() handles missing columns (PGRST204) gracefully by
    // failing open (treating unknown agencies as escrow-mode).
    const escrow = await isEscrowFlow(supabase, contract.agency_id ?? null);
    if (!escrow) {
      return NextResponse.json(
        { error: "Este contrato usa pagamento direto. Use 'Marcar pagamento enviado' em vez de depósito em garantia." },
        { status: 422 },
      );
    }

    const required = Number(contract.payment_amount ?? 0);

    const { data: result, error: rpcErr } = await supabase.rpc("confirm_booking_escrow", {
      p_contract_id: id,
      p_agency_id:   contract.agency_id,
      p_amount:      required,
    });
    if (rpcErr) {
      console.error("[agency_sign rpc]", rpcErr.message);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    const r = result as { ok: boolean; already_processed?: boolean; error?: string; required?: number; available?: number };

    if (!r.ok) {
      if (r.error === "internal_payment_mode") {
        // RPC-level guard (defence in depth): agency is internal-payment mode.
        return NextResponse.json(
          { error: "Este contrato usa pagamento direto. Use 'Marcar pagamento enviado' em vez de depósito em garantia." },
          { status: 422 }
        );
      }
      if (r.error === "insufficient_balance") {
        return NextResponse.json(
          { error: "insufficient_balance", required: r.required, available: r.available },
          { status: 402 }
        );
      }
      if (r.error === "contract_not_signed") {
        return NextResponse.json(
          { error: "Contract must be signed by talent first" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: r.error ?? "Confirm failed" }, { status: 400 });
    }

    // already_processed: RPC was a no-op (idempotent retry) — skip side effects
    if (!r.already_processed) {
      await syncBooking(supabase, contract, "confirmed");
      await notifyAdmins(
        "payment",
        `Escrow bloqueado: ${brl(required)} em garantia`,
        "/admin/finances",
        `admin-escrow-locked:${id}`,
      );
    }

    // Notify talent about the confirmation + escrow deposit.
    // Uses the same idempotency_key as the RPC insert so the DB deduplicates
    // automatically — no double notification even if the RPC already sent it.
    if (contractTalentUserId) {
      await notify(
        contractTalentUserId,
        "contract",
        "Agência confirmou o contrato e realizou o depósito",
        talentContractsHref,
        `notif_escrow_talent_${id}`,
      );
    }

    // Notify agency that escrow was locked successfully
    if (contract.agency_id) {
      await notify(
        contract.agency_id,
        "payment",
        `Escrow realizado: ${brl(required)} movidos para garantia`,
        agencyWalletHref,
        `notif_escrow_agency_${id}`,
      );
    }

    return NextResponse.json({ ok: true, status: "confirmed", derived_status: getUnifiedBookingStatus("confirmed", "confirmed") });
  }

  // ── Agency: release payment after job (ATOMIC) ────────────────────────────
  // Records payout transaction + sets status = paid.
  // NEVER deducts wallet again — money was already locked at escrow time.
  // If the job has a referral invite, the referral commission is deducted from
  // the talent payout and credited to the referrer via credit_referral_commission.
  if (action === "pay") {
    if (contract.status !== "confirmed") {
      return NextResponse.json(
        { error: "Contract must be confirmed before paying" },
        { status: 409 }
      );
    }

    // Policy 6 — release eligibility. Centralised in lib/paymentReleasePolicy.ts.
    // The workspace owner (or admin) may opt into early release by passing
    // `{ manual_override: true, override_reason: "..." }`. The override is
    // gated to owners/admins and requires an audit-logged reason.
    const manualOverride = body?.manual_override === true;
    const overrideReason = typeof body?.override_reason === "string" ? body.override_reason.trim() : "";

    // Determine whether the caller is the workspace owner (for workspace
    // contracts) or admin. Open Space agency contracts: the agency itself IS
    // the owner, so isAgencyOwner already suffices.
    const contractWorkspaceId =
      (contract as { workspace_id?: string | null }).workspace_id ?? null;

    let isWorkspaceOwnerOrAdmin = caller?.role === "admin";
    if (!isWorkspaceOwnerOrAdmin && caller?.role === "agency") {
      if (!contractWorkspaceId) {
        // Open Space — agency owner equals workspace owner conceptually.
        isWorkspaceOwnerOrAdmin = isAgencyOwner;
      } else {
        const { data: ws } = await supabase
          .from("premium_workspaces")
          .select("owner_user_id")
          .eq("id", contractWorkspaceId)
          .maybeSingle();
        isWorkspaceOwnerOrAdmin = !!ws && ws.owner_user_id === user.id;
      }
    }

    // Invited workspace agents are gated by job date; everyone else can pay early.
    const isInvitedAgent = caller?.role === "agency" && !!contractWorkspaceId && !isWorkspaceOwnerOrAdmin;

    if (manualOverride) {
      if (!isWorkspaceOwnerOrAdmin) {
        return NextResponse.json(
          { error: "Apenas o dono do workspace pode liberar pagamento manualmente." },
          { status: 403 },
        );
      }
      if (!overrideReason || overrideReason.length < 1) {
        return NextResponse.json(
          { error: "Motivo obrigatório para liberação manual." },
          { status: 400 },
        );
      }
    }

    // Dispute gate — block payout while any open/under_review dispute exists.
    const { data: openDispute } = await supabase
      .from("contract_disputes")
      .select("status")
      .eq("contract_id", id)
      .in("status", ["open", "under_review"])
      .maybeSingle();
    const disputeCheck = checkDisputeBlockingPayout(
      openDispute ? { status: openDispute.status as DisputeStatus } : null,
    );
    if (disputeCheck.blocked) {
      return NextResponse.json({ error: disputeCheck.reason }, { status: 409 });
    }

    const release = checkPaymentReleaseEligibility(
      {
        status: contract.status,
        job_date: (contract as { job_date?: string | null }).job_date ?? null,
        confirmed_at: (contract as { confirmed_at?: string | null }).confirmed_at ?? null,
      },
      { manualOverride, isInvitedAgent },
    );
    if (!release.eligible) {
      return NextResponse.json(
        { error: release.reason ?? "Contract is not eligible for payment release." },
        { status: 403 },
      );
    }

    if (manualOverride) {
      await logAdminAction({
        adminId: user.id,
        action: "payment_manual_override",
        entityType: "contract",
        entityId: id,
        before: {
          status: contract.status,
          job_date: (contract as { job_date?: string | null }).job_date ?? null,
        },
        after: { manual_override: true, reason: overrideReason },
      });
    }

    // ── 1. Look up referral invite BEFORE payout ────────────────────────────
    // Must happen first so we can reduce talentPayout by the commission.
    let referralInvite: { id: string; referrer_id: string; commission_rate: number } | null = null;
    let referralCommission = 0;
    let referralJobTitle   = "";

    if (contractTalentUserId && contract.payment_amount && contract.job_id) {
      const [jobRes, inviteRes] = await Promise.all([
        supabase.from("jobs").select("title").eq("id", contract.job_id).maybeSingle(),
        supabase
          .from("referral_invites")
          .select("id, referrer_id, commission_rate")
          .eq("referred_user_id", contractTalentUserId)
          .eq("job_id", contract.job_id)
          .neq("status", "fraud_reported")
          .neq("status", "commission_paid")
          .maybeSingle(),
      ]);

      referralJobTitle = jobRes.data?.title ?? "trabalho";

      if (inviteRes.data?.referrer_id) {
        const inv = inviteRes.data;
        referralInvite = {
          id:              inv.id,
          referrer_id:     inv.referrer_id,
          commission_rate: Number(inv.commission_rate ?? REFERRAL_RATE),
        };
        referralCommission = parseFloat(
          (Number(contract.payment_amount) * referralInvite.commission_rate).toFixed(2)
        );
        console.log("[referral commission] matched referral", {
          inviteId:   inv.id,
          referrerId: inv.referrer_id,
          commission: referralCommission,
          contractId: id,
        });
      } else {
        console.log("[referral commission] no referral found", {
          talentId: contractTalentUserId,
          jobId:    contract.job_id,
        });
      }
    }

    // ── 2. Compute talent payout (net minus referral commission) ────────────
    const grossAmount   = Number(contract.payment_amount ?? 0);
    const baseNetAmount = Number(contract.net_amount ?? grossAmount);
    const talentPayout  = parseFloat((baseNetAmount - referralCommission).toFixed(2));

    console.log("[plan] payout_calculation", {
      contractId:        id,
      agencyId:          contract.agency_id,
      grossAmount,
      commissionAmount:  Number(contract.commission_amount ?? 0),
      referralCommission,
      baseNetAmount,
      talentPayout,
    });

    // ── 3. Release payout — talent receives talentPayout ───────────────────
    const { data: result, error: rpcErr } = await supabase.rpc("release_payment_payout", {
      p_contract_id: id,
      p_agency_id:   contract.agency_id,
      p_amount:      talentPayout,
    });
    if (rpcErr) {
      console.error("[pay rpc]", rpcErr.message);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    const r = result as { ok: boolean; already_processed?: boolean; error?: string };

    if (!r.ok) {
      if (r.error === "contract_not_confirmed") {
        return NextResponse.json(
          { error: "Contract must be confirmed before paying" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: r.error ?? "Pay failed" }, { status: 400 });
    }

    if (!r.already_processed) {
      // Record who released the payment (owner, agent, or admin).
      // Best-effort: never block the response on this write.
      supabase
        .from("contracts")
        .update({ paid_by_user_id: user.id })
        .eq("id", id)
        .then(({ error: pbErr }) => {
          if (pbErr) console.error("[pay] paid_by_user_id update failed", pbErr.message);
        });

      await syncBooking(supabase, contract, "paid");
      await notifyAdmins(
        "payment",
        `Pagamento liberado ao talento: ${brl(talentPayout)}`,
        "/admin/finances",
        `admin-payment-released:${id}`,
      );
      // Talent payment notification is inserted inside the RPC atomically.

      // ── 3c. Settle Premium agent allocation if job was agent-created ────────
      // Inserts job_settlement so the committed ledger entry is permanently
      // consumed and cannot be restored as phantom "available" when the job closes.
      // Idempotent via related_contract_id uniqueness check.
      if (contract.job_id) {
        const { data: jobRow } = await supabase
          .from("jobs")
          .select("workspace_id, created_by_user_id, agency_id")
          .eq("id", contract.job_id)
          .maybeSingle();

        const jobWorkspaceId = (jobRow as { workspace_id?: string | null } | null)?.workspace_id ?? null;
        const jobCreatorId   = (jobRow as { created_by_user_id?: string | null } | null)?.created_by_user_id ?? null;

        // Only settle when a workspace agent (not the owner) created the job
        if (jobWorkspaceId && jobCreatorId && jobCreatorId !== (jobRow as { agency_id?: string | null } | null)?.agency_id) {
          const settlementAmount = Number(contract.payment_amount ?? 0);
          if (settlementAmount > 0) {
            // Idempotency: skip if already settled for this contract
            const { data: existingSettlement } = await supabase
              .from("premium_agent_wallet_transactions")
              .select("id")
              .eq("related_contract_id", id)
              .eq("type", "job_settlement")
              .maybeSingle();

            if (!existingSettlement) {
              const { data: wsRow } = await supabase
                .from("premium_workspaces")
                .select("owner_user_id")
                .eq("id", jobWorkspaceId)
                .maybeSingle();

              const { data: memberRow } = await supabase
                .from("premium_workspace_members")
                .select("role")
                .eq("workspace_id", jobWorkspaceId)
                .eq("user_id", jobCreatorId)
                .eq("status", "active")
                .maybeSingle();

              if (wsRow && memberRow?.role === "agent") {
                // job_settlement: converts committed→spent in the agent ledger.
                // available = allocated − committed − spent
                // Owner's activelyAllocated = totalAllocated − totalSettled decreases here,
                // removing the phantom "Reservado a agentes" balance after payment.
                const { error: settlementErr } = await supabase.from("premium_agent_wallet_transactions").insert({
                  workspace_id:        jobWorkspaceId,
                  agent_user_id:       jobCreatorId,
                  owner_user_id:       wsRow.owner_user_id,
                  type:                "job_settlement",
                  amount:              settlementAmount,
                  status:              "completed",
                  related_job_id:      contract.job_id,
                  related_contract_id: id,
                  created_by:          contract.agency_id,
                  note:                "Pagamento liberado ao talento.",
                });
                if (settlementErr) {
                  console.error("[premium agent settlement] failed to insert job_settlement", {
                    contractId: id,
                    agentUserId: jobCreatorId,
                    workspaceId: jobWorkspaceId,
                    amount: settlementAmount,
                    error: settlementErr,
                  });
                } else {
                  console.log("[premium agent settlement] job_settlement recorded", {
                    contractId: id,
                    agentUserId: jobCreatorId,
                    workspaceId: jobWorkspaceId,
                    amount: settlementAmount,
                  });
                }
              }
            }
          }
        }
      }
    }

    // ── 4. Referral commission (always attempt — RPC is idempotent) ─────────
    if (referralInvite && referralCommission > 0) {
      console.log("[referral commission] commission calculated", {
        gross:       grossAmount,
        rate:        referralInvite.commission_rate,
        commission:  referralCommission,
        talentPayout,
      });

      const { data: commResult, error: commErr } = await supabase.rpc("credit_referral_commission", {
        p_referrer_id: referralInvite.referrer_id,
        p_invite_id:   referralInvite.id,
        p_contract_id: id,
        p_commission:  referralCommission,
        p_job_title:   referralJobTitle,
      });

      if (commErr) {
        console.error("[referral commission] rpc failed", {
          err:       commErr.message,
          inviteId:  referralInvite.id,
          contractId: id,
        });
      } else {
        const cr = commResult as {
          ok: boolean;
          already_processed?: boolean;
          wallet_balance_credited?: boolean;
        };
        if (cr.already_processed) {
          console.log("[referral commission] already credited", {
            inviteId:   referralInvite.id,
            contractId: id,
          });
        } else {
          console.log("[referral commission] credited referrer", {
            referrerId: referralInvite.referrer_id,
            commission: referralCommission,
            contractId: id,
          });
        }
        if (cr.wallet_balance_credited) {
          console.log("[referral commission] wallet balance credited", {
            referrerId: referralInvite.referrer_id,
            commission: referralCommission,
            contractId: id,
          });
        }
        await notify(
          referralInvite.referrer_id,
          "payment",
          `Comissão de indicação liberada: ${brl(referralCommission)}`,
          "/talent/referrals",
          `notif_referral_comm_${referralInvite.id}_${id}`,
        );
      }
    }

    if (contract.payment_provider === "stripe") {
      const { data: finalizeResult, error: finalizeErr } = await supabase.rpc("finalize_contract_platform_revenue", {
        p_contract_id: id,
      });

      if (finalizeErr) {
        console.error("[contract funding] finalize platform revenue failed", {
          contractId: id,
          error: finalizeErr.message,
        });
      } else {
        console.log("[contract funding] finalized platform revenue", {
          contractId: id,
          result: finalizeResult,
        });
      }
    }

    return NextResponse.json({ ok: true, status: "paid", derived_status: getUnifiedBookingStatus("paid", "paid") });
  }

  // ── Agency: cancel (ATOMIC) ───────────────────────────────────────────────
  // Cancels pre-payment contracts safely. If escrow was already locked on a
  // confirmed contract, the RPC refunds it atomically before cancelling.
  if (action === "cancel_job") {
    if (!["sent", "signed", "confirmed"].includes(contract.status)) {
      return NextResponse.json(
        { error: "Contract cannot be cancelled at this stage" },
        { status: 409 }
      );
    }

    // Policy 7 — classify cancellation outcome.
    // Today: every allowed cancellation auto-releases via cancel_contract_safe.
    // TODO(dispute): when outcome.requiresReview is true (cancellation on/after
    // the scheduled job date), do NOT auto-refund. Instead, mark the contract
    // as "dispute_pending" and notify an admin for manual review. The dispute
    // table + admin workflow are not yet built — see lib/cancellationPolicy.ts
    // for the canonical rule. For now this is informational only.
    const cancellationOutcome = getCancellationOutcome({
      status: contract.status,
      job_date: (contract as { job_date?: string | null }).job_date ?? null,
      confirmed_at: (contract as { confirmed_at?: string | null }).confirmed_at ?? null,
    });
    if (cancellationOutcome.requiresReview) {
      console.log("[cancel_job] post-work-date cancellation — auto-refunding pending dispute workflow", {
        contractId: id,
        reason: cancellationOutcome.reason,
      });
    }

    const { data: result, error: rpcErr } = await supabase.rpc("cancel_contract_safe", {
      p_contract_id: id,
      p_agency_id:   contract.agency_id,
    });
    if (rpcErr) {
      console.error("[cancel_job rpc]", rpcErr.message);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    const r = result as { ok: boolean; error?: string };

    if (!r.ok) {
      if (r.error === "cannot_cancel_paid") {
        return NextResponse.json({ error: "Paid contracts cannot be cancelled" }, { status: 409 });
      }
      return NextResponse.json({ error: r.error ?? "Cannot cancel at this stage" }, { status: 409 });
    }

    await syncBooking(supabase, contract, "cancelled");

    // Mark as agency-cancelled so the trigger does NOT count against talent reliability
    if (contract.booking_id) {
      await supabase
        .from("bookings")
        .update({ cancelled_by: "agency" })
        .eq("id", contract.booking_id);
    }

    if (contract.job_id && contractTalentUserId) {
      await supabase
        .from("submissions")
        .delete()
        .eq("job_id", contract.job_id)
        .eq("talent_user_id", contractTalentUserId);
    }

    if (contractTalentUserId) {
      await notify(contractTalentUserId, "contract", "Agência cancelou o contrato", talentContractsHref);
    }

    // Release committed agent allocation when a workspace contract is cancelled
    // Mirrors job_settlement on pay — prevents the committed amount from staying
    // locked in activelyAllocated / agent ledger after the job is gone.
    if (contract.job_id) {
      const { data: jobRow } = await supabase
        .from("jobs")
        .select("workspace_id, created_by_user_id, agency_id")
        .eq("id", contract.job_id)
        .maybeSingle();

      const jobWorkspaceId = (jobRow as { workspace_id?: string | null } | null)?.workspace_id ?? null;
      const jobCreatorId   = (jobRow as { created_by_user_id?: string | null } | null)?.created_by_user_id ?? null;

      if (jobWorkspaceId && jobCreatorId && jobCreatorId !== (jobRow as { agency_id?: string | null } | null)?.agency_id) {
        const releaseAmount = Number(contract.payment_amount ?? 0);
        if (releaseAmount > 0) {
          const { data: existingRelease } = await supabase
            .from("premium_agent_wallet_transactions")
            .select("id")
            .eq("related_contract_id", id)
            .eq("type", "job_release")
            .maybeSingle();

          if (!existingRelease) {
            const { data: wsRow } = await supabase
              .from("premium_workspaces")
              .select("owner_user_id")
              .eq("id", jobWorkspaceId)
              .maybeSingle();

            const { data: memberRow } = await supabase
              .from("premium_workspace_members")
              .select("role")
              .eq("workspace_id", jobWorkspaceId)
              .eq("user_id", jobCreatorId)
              .eq("status", "active")
              .maybeSingle();

            if (wsRow && memberRow?.role === "agent") {
              await supabase.from("premium_agent_wallet_transactions").insert({
                workspace_id:        jobWorkspaceId,
                agent_user_id:       jobCreatorId,
                owner_user_id:       wsRow.owner_user_id,
                type:                "job_release",
                amount:              releaseAmount,
                status:              "completed",
                related_job_id:      contract.job_id,
                related_contract_id: id,
                created_by:          contract.agency_id,
                note:                "Contrato cancelado.",
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true, status: "cancelled", derived_status: getUnifiedBookingStatus("cancelled", "cancelled") });
  }

  // ── Agent-reservation pay: signed → paid without real escrow ─────────────
  // Used when the job was created by a workspace agent whose job_commitment
  // already reserved the funds from their allocated budget.
  // Bypasses the confirm_booking_escrow RPC (no real wallet_transactions escrow_lock).
  // Performs direct writes; idempotent via payout_${id} key on wallet_transactions.
  if (action === "agent_pay") {
    if (contract.status !== "signed") {
      return NextResponse.json({ error: "agent_pay requer contrato assinado." }, { status: 409 });
    }

    // Policy 6 — same job-date gating as the `pay` action. The agent ledger
    // already reserves funds, but the date guard still applies so payments
    // cannot be released before the work is delivered. Workspace owner /
    // admin may override with an audit-logged reason.
    const agentManualOverride = body?.manual_override === true;
    const agentOverrideReason = typeof body?.override_reason === "string" ? body.override_reason.trim() : "";

    const agentContractWorkspaceId =
      (contract as { workspace_id?: string | null }).workspace_id ?? null;

    let agentIsOwnerOrAdmin = caller?.role === "admin";
    if (!agentIsOwnerOrAdmin && caller?.role === "agency") {
      if (!agentContractWorkspaceId) {
        agentIsOwnerOrAdmin = isAgencyOwner;
      } else {
        const { data: ws } = await supabase
          .from("premium_workspaces")
          .select("owner_user_id")
          .eq("id", agentContractWorkspaceId)
          .maybeSingle();
        agentIsOwnerOrAdmin = !!ws && ws.owner_user_id === user.id;
      }
    }

    const isInvitedAgentCaller = caller?.role === "agency" && !!agentContractWorkspaceId && !agentIsOwnerOrAdmin;

    if (agentManualOverride) {
      if (!agentIsOwnerOrAdmin) {
        return NextResponse.json(
          { error: "Apenas o dono do workspace pode liberar pagamento manualmente." },
          { status: 403 },
        );
      }
      if (!agentOverrideReason) {
        return NextResponse.json(
          { error: "Motivo obrigatório para liberação manual." },
          { status: 400 },
        );
      }
    }

    // Dispute gate — same rule as the `pay` action.
    const { data: openDisputeAgent } = await supabase
      .from("contract_disputes")
      .select("status")
      .eq("contract_id", id)
      .in("status", ["open", "under_review"])
      .maybeSingle();
    const agentDisputeCheck = checkDisputeBlockingPayout(
      openDisputeAgent ? { status: openDisputeAgent.status as DisputeStatus } : null,
    );
    if (agentDisputeCheck.blocked) {
      return NextResponse.json({ error: agentDisputeCheck.reason }, { status: 409 });
    }

    // Eligibility check uses "signed" status here; we adapt by temporarily
    // mapping to "confirmed" semantics — the agent commitment is the escrow.
    const agentRelease = checkPaymentReleaseEligibility(
      {
        status: "confirmed",
        job_date: (contract as { job_date?: string | null }).job_date ?? null,
        confirmed_at: (contract as { confirmed_at?: string | null }).confirmed_at ?? null,
      },
      { manualOverride: agentManualOverride, isInvitedAgent: isInvitedAgentCaller },
    );
    if (!agentRelease.eligible) {
      return NextResponse.json(
        { error: agentRelease.reason ?? "Contract is not eligible for payment release." },
        { status: 403 },
      );
    }

    if (agentManualOverride) {
      await logAdminAction({
        adminId: user.id,
        action: "payment_manual_override",
        entityType: "contract",
        entityId: id,
        before: {
          status: contract.status,
          job_date: (contract as { job_date?: string | null }).job_date ?? null,
        },
        after: { manual_override: true, reason: agentOverrideReason, via: "agent_pay" },
      });
    }

    if (!contract.job_id) {
      return NextResponse.json({ error: "Contrato sem vaga associada." }, { status: 400 });
    }
    if (!contractTalentUserId) {
      return NextResponse.json({ error: "Contrato sem talento associado." }, { status: 400 });
    }

    // Validate: active job_commitment exists for this job
    const { data: commitRow } = await supabase
      .from("premium_agent_wallet_transactions")
      .select("id")
      .eq("related_job_id", contract.job_id)
      .eq("type", "job_commitment")
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();

    if (!commitRow) {
      return NextResponse.json(
        { error: "Nenhuma reserva de agente ativa encontrada para esta vaga." },
        { status: 409 }
      );
    }

    // Idempotency: if payout wallet_transaction already exists, return early
    const { data: existingPayout } = await supabase
      .from("wallet_transactions")
      .select("id")
      .eq("idempotency_key", `payout_${id}`)
      .maybeSingle();

    if (existingPayout) {
      return NextResponse.json({
        ok: true, already_processed: true, status: "paid",
        derived_status: getUnifiedBookingStatus("paid", "paid"),
      });
    }

    // ── 1. Referral lookup (mirrors pay action) ───────────────────────────
    let referralInvite: { id: string; referrer_id: string; commission_rate: number } | null = null;
    let referralCommission = 0;
    let referralJobTitle = "";

    if (contract.payment_amount && contract.job_id) {
      const [jobRes, inviteRes] = await Promise.all([
        supabase.from("jobs").select("title").eq("id", contract.job_id).maybeSingle(),
        supabase.from("referral_invites").select("id, referrer_id, commission_rate")
          .eq("referred_user_id", contractTalentUserId)
          .eq("job_id", contract.job_id)
          .neq("status", "fraud_reported")
          .neq("status", "commission_paid")
          .maybeSingle(),
      ]);
      referralJobTitle = jobRes.data?.title ?? "trabalho";
      if (inviteRes.data?.referrer_id) {
        const inv = inviteRes.data;
        referralInvite = {
          id:              inv.id,
          referrer_id:     inv.referrer_id,
          commission_rate: Number(inv.commission_rate ?? REFERRAL_RATE),
        };
        referralCommission = parseFloat(
          (Number(contract.payment_amount) * referralInvite.commission_rate).toFixed(2)
        );
      }
    }

    // ── 2. Compute payout ─────────────────────────────────────────────────
    const grossAmount   = Number(contract.payment_amount ?? 0);
    const baseNetAmount = Number(contract.net_amount ?? grossAmount);
    const talentPayout  = parseFloat((baseNetAmount - referralCommission).toFixed(2));

    // ── 3. Direct DB writes (no RPC — agent reservation is the escrow) ────
    const nowIso = new Date().toISOString();

    // 3a. Update contract to paid (record who released the payment)
    const { error: contractErr } = await supabase
      .from("contracts")
      .update({ status: "paid", paid_at: nowIso, payment_status: "paid", paid_by_user_id: user.id })
      .eq("id", id);
    if (contractErr) {
      console.error("[agent_pay] contract update failed", contractErr.message);
      return NextResponse.json({ error: contractErr.message }, { status: 500 });
    }

    // 3b. Credit talent wallet transaction (idempotent via unique idempotency_key)
    const { error: txErr } = await supabase.from("wallet_transactions").insert({
      user_id:         contractTalentUserId,
      type:            "payout",
      amount:          talentPayout,
      status:          "completed",
      reference_id:    id,
      idempotency_key: `payout_${id}`,
    });
    if (txErr && !txErr.message.includes("duplicate")) {
      console.error("[agent_pay] wallet_transactions insert failed", txErr.message);
    }

    // 3c. Increment talent profile wallet_balance
    const { data: talentProfile } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", contractTalentUserId)
      .single();
    const currentBalance = Number(talentProfile?.wallet_balance ?? 0);
    await supabase
      .from("profiles")
      .update({ wallet_balance: currentBalance + talentPayout })
      .eq("id", contractTalentUserId);

    // 3d. Sync booking to paid
    await syncBooking(supabase, contract, "paid");

    // ── 4. Job settlement (consume agent commitment) ──────────────────────
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("workspace_id, created_by_user_id, agency_id")
      .eq("id", contract.job_id)
      .maybeSingle();

    const jobWorkspaceId = (jobRow as { workspace_id?: string | null } | null)?.workspace_id ?? null;
    const jobCreatorId   = (jobRow as { created_by_user_id?: string | null } | null)?.created_by_user_id ?? null;

    if (jobWorkspaceId && jobCreatorId && jobCreatorId !== (jobRow as { agency_id?: string | null } | null)?.agency_id) {
      const settlementAmount = Number(contract.payment_amount ?? 0);
      if (settlementAmount > 0) {
        const { data: existingSettlement } = await supabase
          .from("premium_agent_wallet_transactions")
          .select("id")
          .eq("related_contract_id", id)
          .eq("type", "job_settlement")
          .maybeSingle();

        if (!existingSettlement) {
          const [wsRow, memberRow] = await Promise.all([
            supabase.from("premium_workspaces").select("owner_user_id").eq("id", jobWorkspaceId).maybeSingle(),
            supabase.from("premium_workspace_members").select("role")
              .eq("workspace_id", jobWorkspaceId).eq("user_id", jobCreatorId).eq("status", "active").maybeSingle(),
          ]);
          if (wsRow.data && memberRow.data?.role === "agent") {
            await supabase.from("premium_agent_wallet_transactions").insert({
              workspace_id:        jobWorkspaceId,
              agent_user_id:       jobCreatorId,
              owner_user_id:       wsRow.data.owner_user_id,
              type:                "job_settlement",
              amount:              settlementAmount,
              status:              "completed",
              related_job_id:      contract.job_id,
              related_contract_id: id,
              created_by:          contract.agency_id,
              note:                "Pagamento liberado ao talento (via reserva do agente).",
            });
          }
        }
      }
    }

    // ── 5. Notifications ─────────────────────────────────────────────────
    if (contractTalentUserId) {
      const tpl = renderNotificationTemplate("payout_released", { amount: brl(talentPayout) });
      await notify(
        contractTalentUserId,
        tpl.channel,
        tpl.body,
        talentContractsHref,
        `notif_payout_talent_${id}`,
      );
    }
    await notifyAdmins(
      "payment",
      `Pagamento liberado ao talento (agente): ${brl(talentPayout)}`,
      "/admin/finances",
      `admin-payment-released:${id}`,
    );

    // ── 6. Referral commission (idempotent RPC) ───────────────────────────
    if (referralInvite && referralCommission > 0) {
      await supabase.rpc("credit_referral_commission", {
        p_referrer_id: referralInvite.referrer_id,
        p_invite_id:   referralInvite.id,
        p_contract_id: id,
        p_commission:  referralCommission,
        p_job_title:   referralJobTitle,
      }).then(
        ({ error: e }) => { if (e) console.error("[agent_pay referral]", e.message); }
      );
    }

    return NextResponse.json({
      ok: true, status: "paid",
      derived_status: getUnifiedBookingStatus("paid", "paid"),
    });
  }

  if (action === "withdraw") {
    return NextResponse.json(
      { error: "Este fluxo de saque foi desativado. Use a área de finanças." },
      { status: 410 }
    );
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const agencyAccess = caller?.role === "agency"
    ? await resolveContractCreationAccess({
        userId: user.id,
        jobId: data.job_id ?? null,
        requestedAgencyId: data.agency_id ?? null,
      })
    : null;

  const canRead =
    caller?.role === "admin" ||
    (caller?.role === "agency" && !!agencyAccess?.allowed) ||
    (caller?.role === "talent" && (data.talent_user_id ?? data.talent_id) === user.id);

  if (!canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ contract: data });
}
