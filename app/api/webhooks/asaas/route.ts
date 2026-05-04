import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/webhooks/asaas
//
// Security  : validates asaas-access-token header against ASAAS_WEBHOOK_TOKEN.
// Idempotency: inserts into asaas_webhook_events (unique event_id).
//              If the row already exists with processed_at set, returns 200 immediately.
//
// Handled events:
//   PAYMENT_RECEIVED  → credit agency wallet (PIX deposit settled)
//   PAYMENT_CONFIRMED → credit agency wallet (PIX deposit confirmed; idempotent with RECEIVED)

function log(level: "info" | "warn" | "error", msg: string, ctx?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, source: "webhook/asaas", msg, ...ctx };
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  netValue?: number;
  billingType?: string;
  customer?: string;
  externalReference?: string;
}

interface AsaasWebhookBody {
  id?: string;
  event: string;
  payment?: AsaasPayment;
}

export async function POST(req: NextRequest) {
  // ── Token validation (always enforced) ───────────────────────────────────────
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
  const incoming     = req.headers.get("asaas-access-token") ?? "";

  if (!webhookToken || incoming !== webhookToken) {
    log("warn", "[asaas webhook] invalid or missing token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: AsaasWebhookBody;
  try {
    body = await req.json();
  } catch {
    log("warn", "[asaas webhook] malformed JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event   = body.event ?? "";
  // Prefer top-level id; fall back to payment.id + ":" + event
  const eventId = body.id ?? `${body.payment?.id ?? ""}:${event}`;

  log("info", "[asaas webhook] received", { event, eventId });

  const supabase = createServerClient({ useServiceRole: true });
  const now      = new Date().toISOString();

  // ── Idempotency gate ──────────────────────────────────────────────────────────
  const { error: insertErr } = await supabase
    .from("asaas_webhook_events")
    .insert({
      event_id:    eventId,
      event_type:  event,
      raw_payload: body as unknown as Record<string, unknown>,
    } as Record<string, unknown>);

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Row exists — check whether it was already fully processed
      const { data: existing } = await supabase
        .from("asaas_webhook_events")
        .select("processed_at")
        .eq("event_id", eventId)
        .single();

      if (existing?.processed_at) {
        log("info", "[asaas webhook] already processed — skipping", { eventId });
        return NextResponse.json({ ok: true });
      }
      // processed_at is null: logged but processing failed previously — retry
    } else {
      log("warn", "[asaas webhook] asaas_webhook_events insert failed (non-fatal)", { err: insertErr.message });
    }
  }

  // ── PAYMENT_RECEIVED / PAYMENT_CONFIRMED → credit wallet ─────────────────────
  // Both events are handled identically. The wallet_transactions.status check
  // makes this idempotent: whichever fires first credits the wallet, the second
  // is ignored.
  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    const payment = body.payment;

    if (!payment?.id) {
      log("warn", "[asaas webhook] ignored — missing payment object", { event, eventId });
      return NextResponse.json({ ok: true });
    }

    const asaasPaymentId = payment.id;
    const asaasStatus    = payment.status;

    // Find the pending deposit by asaas_payment_id
    const { data: tx, error: txFetchErr } = await supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, type, status")
      .eq("asaas_payment_id", asaasPaymentId)
      .maybeSingle();

    if (txFetchErr) {
      log("error", "[asaas webhook] failed — wallet_transactions lookup", {
        asaasPaymentId, err: txFetchErr.message,
      });
      return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
    }

    if (!tx) {
      log("warn", "[asaas webhook] ignored — no matching wallet_transaction", { asaasPaymentId });
      return NextResponse.json({ ok: true });
    }

    if (tx.type !== "deposit") {
      log("info", "[asaas webhook] ignored — transaction is not a deposit", {
        txId: tx.id, type: tx.type,
      });
      return NextResponse.json({ ok: true });
    }

    if (tx.status === "paid") {
      log("info", "[asaas webhook] ignored — deposit already credited", { txId: tx.id });
      return NextResponse.json({ ok: true });
    }

    const creditAmount = Number(tx.amount);

    // Atomically increment wallet_balance using existing RPC
    const { error: rpcErr } = await supabase.rpc("increment_wallet_balance", {
      p_user_id: tx.user_id,
      p_amount:  creditAmount,
    });

    if (rpcErr) {
      log("error", "[asaas deposit] failed — increment_wallet_balance", {
        txId: tx.id, userId: tx.user_id, err: rpcErr.message,
      });
      return NextResponse.json({ error: "Balance update failed" }, { status: 500 });
    }

    // Mark transaction paid
    await supabase
      .from("wallet_transactions")
      .update({
        status:       "paid",
        asaas_status: asaasStatus,
        processed_at: now,
      } as Record<string, unknown>)
      .eq("id", tx.id);

    // Mark webhook event processed
    await supabase
      .from("asaas_webhook_events")
      .update({ processed_at: now } as Record<string, unknown>)
      .eq("event_id", eventId);

    log("info", "[asaas deposit] wallet credited", {
      userId: tx.user_id, txId: tx.id, amount: creditAmount, asaasPaymentId,
    });

    return NextResponse.json({ ok: true });
  }

  // ── All other events ──────────────────────────────────────────────────────────
  log("info", "[asaas webhook] ignored — unhandled event", { event, eventId });
  return NextResponse.json({ ok: true });
}
