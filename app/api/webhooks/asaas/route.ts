import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notifyAdmins } from "@/lib/notify";

// POST /api/webhooks/asaas
//
// Security: validates asaas-access-token header against ASAAS_WEBHOOK_TOKEN env var.
// Deduplication: webhook_events table with unique (provider, provider_event_id).
//
// Handled events:
//   PAYMENT_RECEIVED / PAYMENT_CONFIRMED → credit agency wallet (PIX deposits)
//   TRANSFER_DONE / TRANSFER_FINISHED    → update withdrawal provider_status

type LogLevel = "info" | "warn" | "error";
function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, source: "webhook/asaas", msg, ...ctx };
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

interface AsaasPaymentObject {
  id: string;
  customer: string;
  billingType: string;
  value: number;
  netValue?: number;
  status: string;
  externalReference?: string;
  description?: string;
}

interface AsaasTransferObject {
  id: string;
  status: string;
  value: number;
  externalReference?: string;
}

interface AsaasWebhookBody {
  id?: string;
  event: string;
  payment?: AsaasPaymentObject;
  transfer?: AsaasTransferObject;
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (webhookToken) {
    const incoming = req.headers.get("asaas-access-token") ?? "";
    if (incoming !== webhookToken) {
      log("warn", "Invalid asaas-access-token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    log("warn", "ASAAS_WEBHOOK_TOKEN not configured — accepting without token validation");
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: AsaasWebhookBody;
  try {
    body = await req.json();
  } catch {
    log("warn", "Malformed JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event   = body.event ?? "";
  const eventId = body.id ?? `asaas:${event}:${Date.now()}`;

  log("info", "Asaas webhook received", { event, eventId });

  const supabase = createServerClient({ useServiceRole: true });

  // ── Deduplication gate ────────────────────────────────────────────────────────
  const { error: weErr } = await supabase
    .from("webhook_events")
    .insert({
      provider:          "asaas",
      event_id:          eventId,
      provider_event_id: eventId,
      topic:             event,
      raw_payload:       body as unknown as Record<string, unknown>,
      processed:         false,
    })
    .select("id")
    .single();

  if (weErr) {
    if (weErr.code === "23505") {
      log("info", "Duplicate event — skipping", { eventId });
      return NextResponse.json({ ok: true });
    }
    log("warn", "webhook_events insert failed (non-fatal)", { err: weErr.message });
  }

  // ── PAYMENT_RECEIVED / PAYMENT_CONFIRMED → wallet deposit ────────────────────
  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    const payment = body.payment;
    if (!payment) {
      log("warn", "No payment object in event", { event });
      return NextResponse.json({ ok: true });
    }

    const { id: asaasPaymentId, value, netValue, externalReference } = payment;
    // Use netValue when available (net of Asaas fees); fall back to gross value.
    const creditAmount = netValue && netValue > 0 ? netValue : value;

    // Look up wallet_transaction — try by payment_id first, then externalReference
    let userId: string | null        = null;
    let txAmount: number             = creditAmount;

    const { data: txByPaymentId } = await supabase
      .from("wallet_transactions")
      .select("user_id, amount")
      .eq("payment_id", asaasPaymentId)
      .eq("provider", "asaas")
      .maybeSingle();

    if (txByPaymentId) {
      userId   = txByPaymentId.user_id;
      txAmount = Number(txByPaymentId.amount);
    } else if (externalReference) {
      const { data: txByRef } = await supabase
        .from("wallet_transactions")
        .select("user_id, amount")
        .eq("id", externalReference)
        .eq("provider", "asaas")
        .maybeSingle();

      if (txByRef) {
        userId   = txByRef.user_id;
        txAmount = Number(txByRef.amount);

        // Attach payment_id retroactively (webhook arrived before route could update it)
        await supabase
          .from("wallet_transactions")
          .update({ payment_id: asaasPaymentId })
          .eq("id", externalReference)
          .is("payment_id", null);
      }
    }

    if (!userId) {
      log("warn", "No wallet_transaction matched — ignoring", { asaasPaymentId, externalReference });
      return NextResponse.json({ ok: true });
    }

    // credit_wallet_deposit is atomic and idempotent:
    //   - claims the pending row by updating description to "Depósito via PIX"
    //   - credits profiles.wallet_balance atomically
    //   - the unique index on payment_id ensures only one concurrent call wins
    const { data: credited, error: rpcErr } = await supabase.rpc("credit_wallet_deposit", {
      p_user_id:    userId,
      p_payment_id: asaasPaymentId,
      p_amount:     txAmount,
    });

    if (rpcErr) {
      log("error", "credit_wallet_deposit failed", {
        userId,
        asaasPaymentId,
        err: rpcErr.message,
      });
      return NextResponse.json({ error: "Balance update failed" }, { status: 500 });
    }

    if (credited) {
      log("info", "Wallet deposit credited via Asaas", {
        userId,
        amount: txAmount,
        asaasPaymentId,
      });
      const brl = new Intl.NumberFormat("pt-BR", {
        style:                 "currency",
        currency:              "BRL",
        maximumFractionDigits: 0,
      }).format(txAmount);
      await notifyAdmins(
        "payment",
        `Depósito de carteira confirmado (Asaas PIX): ${brl}`,
        "/admin/finances",
        `admin-wallet-deposit-asaas:${asaasPaymentId}`,
      );
    } else {
      log("info", "Wallet deposit already credited — skipping", { asaasPaymentId, userId });
    }

    return NextResponse.json({ ok: true });
  }

  // ── TRANSFER_DONE / TRANSFER_FINISHED → withdrawal status update ─────────────
  if (event === "TRANSFER_DONE" || event === "TRANSFER_FINISHED") {
    const transfer = body.transfer;
    if (!transfer) {
      log("warn", "No transfer object in event", { event });
      return NextResponse.json({ ok: true });
    }

    log("info", "Asaas transfer completed", {
      transferId: transfer.id,
      status:     transfer.status,
    });

    await supabase
      .from("wallet_transactions")
      .update({ provider_status: transfer.status })
      .eq("provider_transfer_id", transfer.id)
      .eq("provider", "asaas");

    return NextResponse.json({ ok: true });
  }

  // ── All other events — ack without processing ─────────────────────────────────
  log("info", "Unhandled event type — acking", { event });
  return NextResponse.json({ ok: true });
}
