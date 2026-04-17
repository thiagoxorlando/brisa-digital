import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

const ALLOWED_ACTIONS = ["accept", "reject", "agency_sign", "pay", "cancel_job", "withdraw", "set_file_url", "upload_signed"];
const REFERRAL_RATE   = 0.02; // 2% referral commission

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { action, contract_file_url } = body;

  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${ALLOWED_ACTIONS.join(", ")}` }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  // ── Agency: attach/update original contract file URL ─────────────────────
  if (action === "set_file_url") {
    if (!contract_file_url) {
      return NextResponse.json({ error: "contract_file_url is required" }, { status: 400 });
    }
    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ contract_file_url })
      .eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // ── Talent: upload signed version of the contract ────────────────────────
  if (action === "upload_signed") {
    const { signed_contract_url } = body as { signed_contract_url?: string };
    if (!signed_contract_url) {
      return NextResponse.json({ error: "signed_contract_url is required" }, { status: 400 });
    }

    // Fetch contract first so we can update the booking
    const { data: c } = await supabase
      .from("contracts")
      .select("agency_id, talent_id, job_id")
      .eq("id", id)
      .single();

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ signed_contract_url, status: "signed", signed_at: new Date().toISOString() })
      .eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    // Upgrade the pending booking to pending_payment (same as the accept action)
    if (c?.talent_id && c?.agency_id) {
      let bookingQuery = supabase
        .from("bookings")
        .update({ status: "pending_payment" })
        .eq("talent_user_id", c.talent_id)
        .eq("agency_id", c.agency_id)
        .eq("status", "pending")
        .select("id");

      if (c.job_id) {
        bookingQuery = bookingQuery.eq("job_id", c.job_id);
      } else {
        bookingQuery = bookingQuery.is("job_id", null);
      }

      await bookingQuery;
    }

    if (c?.agency_id) {
      await notify(c.agency_id, "contract", "Talento enviou o contrato assinado", "/agency/contracts");
    }
    return NextResponse.json({ ok: true });
  }

  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // ── Talent: accept (sign) ──────────────────────────────────────────────────
  if (action === "accept") {
    if (contract.status !== "sent") {
      return NextResponse.json({ error: "Contract is no longer pending" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "signed", signed_at: now })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    // Upgrade the pending booking to pending_payment
    let bookingQuery = supabase
      .from("bookings")
      .update({ status: "pending_payment" })
      .eq("talent_user_id", contract.talent_id)
      .eq("agency_id", contract.agency_id)
      .eq("status", "pending")
      .select("id");

    if (contract.job_id) {
      bookingQuery = bookingQuery.eq("job_id", contract.job_id);
    } else {
      bookingQuery = bookingQuery.is("job_id", null);
    }

    const upgraded = await bookingQuery;

    // If no existing pending booking was updated, create one
    if (upgraded.error || !upgraded.data || upgraded.data.length === 0) {
      await supabase.from("bookings").insert({
        job_id:         contract.job_id    ?? null,
        agency_id:      contract.agency_id ?? null,
        talent_user_id: contract.talent_id,
        job_title:      contract.job_description?.slice(0, 100) ?? "Contract Job",
        price:          contract.payment_amount ?? 0,
        status:         "pending_payment",
      });
    }

    await notify(contract.agency_id, "contract", "Talento assinou o contrato", "/agency/contracts");
    await notify(contract.talent_id, "booking", "Você foi reservado!", "/talent/bookings");

    return NextResponse.json({ ok: true, status: "signed" });
  }

  // ── Talent: reject ────────────────────────────────────────────────────────
  if (action === "reject") {
    if (contract.status !== "sent") {
      return NextResponse.json({ error: "Contract is no longer pending" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "rejected" })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    let deleteQuery = supabase
      .from("bookings")
      .delete()
      .eq("talent_user_id", contract.talent_id)
      .eq("agency_id", contract.agency_id)
      .eq("status", "pending");

    if (contract.job_id) {
      deleteQuery = deleteQuery.eq("job_id", contract.job_id);
    } else {
      deleteQuery = deleteQuery.is("job_id", null);
    }

    await deleteQuery;
    await notify(contract.agency_id, "contract", "Talento recusou o seu contrato", "/agency/contracts");

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // ── Agency: deposit + sign → confirmed ────────────────────────────────────
  if (action === "agency_sign") {
    if (contract.status !== "signed") {
      return NextResponse.json({ error: "Contract must be signed by talent first" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "confirmed", agency_signed_at: now, deposit_paid_at: now })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    await notify(contract.talent_id, "contract", "Agência confirmou o contrato e realizou o depósito", "/talent/contracts");

    return NextResponse.json({ ok: true, status: "confirmed" });
  }

  // ── Agency: pay talent after job ──────────────────────────────────────────
  if (action === "pay") {
    if (contract.status !== "confirmed") {
      return NextResponse.json({ error: "Contract must be confirmed before paying" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "paid", paid_at: now })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    // Update booking to paid — only match active (pending_payment) booking for this contract
    let bookingQuery = supabase
      .from("bookings")
      .update({ status: "paid" })
      .eq("talent_user_id", contract.talent_id)
      .eq("agency_id", contract.agency_id)
      .eq("status", "pending_payment");

    if (contract.job_id) {
      bookingQuery = bookingQuery.eq("job_id", contract.job_id);
    }

    await bookingQuery;

    await notify(contract.talent_id, "payment", "Agência liberou seu pagamento — a caminho!", "/talent/finances");

    // Notify referrer (if any) of their 2% commission
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
        const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(commission);
        await notify(invite.referrer_id, "payment", `Comissão de indicação liberada: ${brl}`, "/talent/referrals");
      }
    }

    return NextResponse.json({ ok: true, status: "paid" });
  }

  // ── Agency: cancel after contract was signed ──────────────────────────────
  if (action === "cancel_job") {
    if (!["signed", "confirmed"].includes(contract.status)) {
      return NextResponse.json({ error: "Contract cannot be cancelled at this stage" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    // Cancel associated booking — only match active booking for this contract
    let bookingQuery = supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("talent_user_id", contract.talent_id)
      .eq("agency_id", contract.agency_id)
      .in("status", ["pending", "pending_payment"]);

    if (contract.job_id) {
      bookingQuery = bookingQuery.eq("job_id", contract.job_id);
    }

    await bookingQuery;

    // Remove the talent's submission for this job so they can re-apply
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

  // ── Talent: withdraw funds after payment released ─────────────────────
  if (action === "withdraw") {
    if (contract.status !== "paid") {
      return NextResponse.json({ error: "Contract must be paid before withdrawal" }, { status: 409 });
    }
    if (contract.withdrawn_at) {
      return NextResponse.json({ error: "Already withdrawn" }, { status: 409 });
    }

    const { error: updateErr } = await supabase
      .from("contracts")
      .update({ withdrawn_at: now })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

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
