import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { syncBooking } from "@/lib/syncBooking";
import { notify } from "@/lib/notify";

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

  // ── Agency: attach/update original contract file URL ─────────────────────
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

  // ── Fetch contract for all remaining actions ──────────────────────────────
  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
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
    await notify(contract.agency_id, "contract", "Talento recusou o seu contrato", "/agency/contracts");
    return NextResponse.json({ ok: true, status: "rejected" });
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

    if (contract.job_id && contract.talent_id) {
      await supabase
        .from("submissions")
        .delete()
        .eq("job_id", contract.job_id)
        .eq("talent_user_id", contract.talent_id);
    }

    await notify(contract.agency_id, "contract", "Talento cancelou a reserva", "/agency/bookings");
    return NextResponse.json({ ok: true, status: "cancelled" });
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

    const r = result as { ok: boolean; error?: string; required?: number; available?: number };

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

    await syncBooking(supabase, contract, "confirmed");

    if (required > 0) {
      await notify(
        contract.agency_id,
        "booking",
        `Reserva confirmada — R$ ${required.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} retidos em custódia`,
        "/agency/finances"
      );
    }
    await notify(
      contract.talent_id,
      "contract",
      "Agência confirmou o contrato e realizou o depósito",
      "/talent/contracts"
    );
    return NextResponse.json({ ok: true, status: "confirmed" });
  }

  // ── Agency: release payment after job (ATOMIC) ────────────────────────────
  // Records payout transaction + sets status = paid.
  // NEVER deducts wallet again — money was already locked at escrow time.
  if (action === "pay") {
    if (contract.status !== "confirmed") {
      return NextResponse.json(
        { error: "Contract must be confirmed before paying" },
        { status: 409 }
      );
    }

    const amount = Number(contract.payment_amount ?? 0);

    const { data: result, error: rpcErr } = await supabase.rpc("release_payment_payout", {
      p_contract_id: id,
      p_agency_id:   contract.agency_id,
      p_amount:      amount,
    });
    if (rpcErr) {
      console.error("[pay rpc]", rpcErr.message);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    const r = result as { ok: boolean; error?: string };

    if (!r.ok) {
      if (r.error === "contract_not_confirmed") {
        return NextResponse.json(
          { error: "Contract must be confirmed before paying" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: r.error ?? "Pay failed" }, { status: 400 });
    }

    await syncBooking(supabase, contract, "paid");
    await notify(
      contract.talent_id,
      "payment",
      "Agência liberou seu pagamento — a caminho!",
      "/talent/finances"
    );

    // Referral commission
    if (contract.talent_id && contract.payment_amount) {
      let inviteQuery = supabase
        .from("referral_invites")
        .select("id, referrer_id")
        .eq("referred_user_id", contract.talent_id)
        .neq("status", "fraud_reported");
      if (contract.job_id) inviteQuery = inviteQuery.eq("job_id", contract.job_id);
      const { data: invite } = await inviteQuery.maybeSingle();
      if (invite?.referrer_id) {
        const commission = parseFloat((contract.payment_amount * REFERRAL_RATE).toFixed(2));
        await supabase
          .from("referral_invites")
          .update({ commission_paid: commission, status: "commission_paid" })
          .eq("id", invite.id);
        const brl = new Intl.NumberFormat("pt-BR", {
          style: "currency", currency: "BRL", maximumFractionDigits: 0,
        }).format(commission);
        await notify(
          invite.referrer_id,
          "payment",
          `Comissão de indicação liberada: ${brl}`,
          "/talent/referrals"
        );
      }
    }

    return NextResponse.json({ ok: true, status: "paid" });
  }

  // ── Agency: cancel (ATOMIC) ───────────────────────────────────────────────
  // Refunds escrow if contract was confirmed, then sets status = cancelled.
  if (action === "cancel_job") {
    if (!["signed", "confirmed"].includes(contract.status)) {
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

    if (contract.job_id && contract.talent_id) {
      await supabase
        .from("submissions")
        .delete()
        .eq("job_id", contract.job_id)
        .eq("talent_user_id", contract.talent_id);
    }

    await notify(contract.talent_id, "contract", "Agência cancelou o contrato", "/talent/contracts");
    return NextResponse.json({ ok: true, status: "cancelled" });
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
  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ contract: data });
}
