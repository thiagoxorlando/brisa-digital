import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { syncBooking } from "@/lib/syncBooking";
import { notify, notifyAdmins } from "@/lib/notify";
import { getUnifiedBookingStatus } from "@/lib/bookingStatus";

const ALLOWED_ACTIONS = [
  "reject", "agency_sign", "pay",
  "cancel_job", "talent_cancel", "withdraw",
  "set_file_url",
];
const REFERRAL_RATE = 0.02;

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

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAgencyOwner = caller?.role === "agency" && contract.agency_id === user.id;
  const isTalentOwner = caller?.role === "talent" && contract.talent_id === user.id;
  const agencyActions = ["set_file_url", "agency_sign", "pay", "cancel_job"];
  const talentActions = ["reject", "talent_cancel", "withdraw"];

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

  if (action === "agency_sign") {
    return NextResponse.json(
      {
        error: "Contract funding must use Stripe Checkout.",
        checkout_route: `/api/contracts/${id}/stripe-checkout`,
      },
      { status: 409 },
    );
  }

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
    await notify(contract.agency_id, "contract", "Talento recusou o seu contrato", "/agency/contracts");
    return NextResponse.json({ ok: true, status: "rejected", derived_status: getUnifiedBookingStatus("cancelled", "rejected") });
  }

  // ── Talent: cancel before agency confirms ────────────────────────────────
  // Talent may only cancel from sent or signed — escrow is not yet locked.
  if (action === "talent_cancel") {
    if (!["sent", "signed"].includes(contract.status)) {
      return NextResponse.json({ error: "Cannot cancel at this stage" }, { status: 409 });
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

    if (contract.job_id && contract.talent_id) {
      await supabase
        .from("submissions")
        .delete()
        .eq("job_id", contract.job_id)
        .eq("talent_user_id", contract.talent_id);
    }

    await notify(contract.agency_id, "contract", "Talento cancelou a reserva", "/agency/bookings");
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
      const brl = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }).format(required);
      await notifyAdmins(
        "payment",
        `Escrow bloqueado: ${brl} em garantia`,
        "/admin/finances",
        `admin-escrow-locked:${id}`,
      );
    }

    // Notify talent about the confirmation + escrow deposit.
    // Uses the same idempotency_key as the RPC insert so the DB deduplicates
    // automatically — no double notification even if the RPC already sent it.
    if (contract.talent_id) {
      await notify(
        contract.talent_id,
        "contract",
        "Agência confirmou o contrato e realizou o depósito",
        "/talent/contracts",
        `notif_escrow_talent_${id}`,
      );
    }

    // Notify agency that escrow was locked successfully
    if (contract.agency_id) {
      const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(required);
      await notify(
        contract.agency_id,
        "payment",
        `Escrow realizado: ${brl} movidos para garantia`,
        "/agency/finances",
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

    // ── 1. Look up referral invite BEFORE payout ────────────────────────────
    // Must happen first so we can reduce talentPayout by the commission.
    let referralInvite: { id: string; referrer_id: string; commission_rate: number } | null = null;
    let referralCommission = 0;
    let referralJobTitle   = "";

    if (contract.talent_id && contract.payment_amount && contract.job_id) {
      const [jobRes, inviteRes] = await Promise.all([
        supabase.from("jobs").select("title").eq("id", contract.job_id).maybeSingle(),
        supabase
          .from("referral_invites")
          .select("id, referrer_id, commission_rate")
          .eq("referred_user_id", contract.talent_id)
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
          talentId: contract.talent_id,
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
      await syncBooking(supabase, contract, "paid");
      const brl = new Intl.NumberFormat("pt-BR", {
        style: "currency", currency: "BRL", maximumFractionDigits: 0,
      }).format(talentPayout);
      await notifyAdmins(
        "payment",
        `Pagamento liberado ao talento: ${brl}`,
        "/admin/finances",
        `admin-payment-released:${id}`,
      );
      // Talent payment notification is inserted inside the RPC atomically.
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
        const commBrl = new Intl.NumberFormat("pt-BR", {
          style: "currency", currency: "BRL", maximumFractionDigits: 0,
        }).format(referralCommission);
        await notify(
          referralInvite.referrer_id,
          "payment",
          `Comissão de indicação liberada: ${commBrl}`,
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

    if (contract.job_id && contract.talent_id) {
      await supabase
        .from("submissions")
        .delete()
        .eq("job_id", contract.job_id)
        .eq("talent_user_id", contract.talent_id);
    }

    await notify(contract.talent_id, "contract", "Agência cancelou o contrato", "/talent/contracts");
    return NextResponse.json({ ok: true, status: "cancelled", derived_status: getUnifiedBookingStatus("cancelled", "cancelled") });
  }

  // ── Talent: withdraw funds after payment ─────────────────────────────────
  if (action === "withdraw") {
    if (contract.status !== "paid") {
      return NextResponse.json({ error: "Contract must be paid before withdrawal" }, { status: 409 });
    }
    if (contract.withdrawn_at) {
      return NextResponse.json({ error: "Already withdrawn" }, { status: 409 });
    }
    const { error } = await supabase
      .from("contracts")
      .update({ withdrawn_at: now })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await notify(contract.talent_id, "payment", "Seu saque foi processado", "/talent/finances");
    return NextResponse.json({ ok: true, withdrawn_at: now });
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

  const canRead =
    caller?.role === "admin" ||
    (caller?.role === "agency" && data.agency_id === user.id) ||
    (caller?.role === "talent" && data.talent_id === user.id);

  if (!canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ contract: data });
}
