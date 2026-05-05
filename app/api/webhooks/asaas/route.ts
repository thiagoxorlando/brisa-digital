import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/webhooks/asaas
//
// Security  : validates asaas-access-token header against ASAAS_WEBHOOK_TOKEN.
// Idempotency: inserts into asaas_webhook_events (unique event_id).
//              If the row already exists with processed_at set, returns 200 immediately.
//
// Handled events:
//   PAYMENT_RECEIVED / PAYMENT_CONFIRMED
//     → credit agency wallet (PIX deposit settled)
//
//   TRANSFER_CREATED / TRANSFER_PENDING / TRANSFER_IN_BANK_PROCESSING
//     → update withdrawal status to "processing"
//   TRANSFER_BLOCKED
//     → update withdrawal status to "blocked"
//   TRANSFER_DONE
//     → update withdrawal status to "paid" (wallet already debited at request time)
//   TRANSFER_FAILED / TRANSFER_CANCELLED
//     → update withdrawal status to failed/cancelled AND restore wallet_balance once

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

interface AsaasTransfer {
  id: string;
  status: string;
  value: number;
  netValue?: number;
  transferFee?: number;
  type?: string;
}

interface AsaasWebhookBody {
  id?: string;
  event: string;
  payment?: AsaasPayment;
  transfer?: AsaasTransfer;
}

// Statuses from which a refund must NOT be issued again (terminal or already refunded)
const TERMINAL_STATUSES = new Set(["paid", "failed", "cancelled", "rejected"]);

// Mapping from Asaas transfer event to our internal withdrawal status
const TRANSFER_EVENT_STATUS: Record<string, string> = {
  TRANSFER_CREATED:            "processing",
  TRANSFER_PENDING:            "processing",
  TRANSFER_IN_BANK_PROCESSING: "processing",
  TRANSFER_BLOCKED:            "blocked",
  TRANSFER_DONE:               "paid",
  TRANSFER_FAILED:             "failed",
  TRANSFER_CANCELLED:          "cancelled",
};

export async function POST(req: NextRequest) {
  // ── Token validation ──────────────────────────────────────────────────────────
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

  const event = body.event ?? "";
  // Use top-level id when present; otherwise compose from the relevant object id + event
  const eventId = body.id
    ?? `${body.payment?.id ?? body.transfer?.id ?? ""}:${event}`;

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
      const { data: existing } = await supabase
        .from("asaas_webhook_events")
        .select("processed_at")
        .eq("event_id", eventId)
        .single();

      if (existing?.processed_at) {
        log("info", "[asaas webhook] already processed — skipping", { eventId });
        return NextResponse.json({ ok: true });
      }
      // processed_at is null: a previous attempt logged but failed — retry
    } else {
      log("warn", "[asaas webhook] asaas_webhook_events insert failed (non-fatal)", {
        err: insertErr.message,
      });
    }
  }

  // ── PAYMENT_RECEIVED / PAYMENT_CONFIRMED → credit deposit wallet ──────────────
  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    const payment = body.payment;

    if (!payment?.id) {
      log("warn", "[asaas webhook] ignored — missing payment object", { event, eventId });
      return NextResponse.json({ ok: true });
    }

    const asaasPaymentId = payment.id;
    const asaasStatus    = payment.status;

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
      // Check if this is a plan subscription payment (externalReference = "plan:{planKey}:{userId}")
      const extRef = payment.externalReference ?? "";
      if (extRef.startsWith("plan:")) {
        const parts  = extRef.split(":");
        const planKey = parts[1] ?? "";
        const userId  = parts[2] ?? "";

        if ((planKey === "pro" || planKey === "premium") && userId) {
          const { error: planErr } = await supabase
            .from("profiles")
            .update({ plan: planKey, plan_status: "active" } as Record<string, unknown>)
            .eq("id", userId);

          if (planErr) {
            log("error", "[asaas webhook] plan activation failed", {
              userId, planKey, asaasPaymentId, err: planErr.message,
            });
            return NextResponse.json({ error: "Plan activation failed" }, { status: 500 });
          }

          await supabase
            .from("asaas_webhook_events")
            .update({ processed_at: now } as Record<string, unknown>)
            .eq("event_id", eventId);

          log("info", "[asaas webhook] plan activated", { userId, planKey, asaasPaymentId });
        } else {
          log("warn", "[asaas webhook] ignored — unrecognized plan ref", { extRef, asaasPaymentId });
        }

        return NextResponse.json({ ok: true });
      }

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

    await supabase
      .from("wallet_transactions")
      .update({
        status:       "paid",
        asaas_status: asaasStatus,
        processed_at: now,
      } as Record<string, unknown>)
      .eq("id", tx.id);

    await supabase
      .from("asaas_webhook_events")
      .update({ processed_at: now } as Record<string, unknown>)
      .eq("event_id", eventId);

    log("info", "[asaas deposit] wallet credited", {
      userId: tx.user_id, txId: tx.id, amount: creditAmount, asaasPaymentId,
    });

    return NextResponse.json({ ok: true });
  }

  // ── TRANSFER_* → update withdrawal status ─────────────────────────────────────
  const newStatus = TRANSFER_EVENT_STATUS[event];
  if (newStatus !== undefined) {
    const transfer = body.transfer;

    if (!transfer?.id) {
      log("warn", "[asaas webhook] ignored — missing transfer object", { event, eventId });
      return NextResponse.json({ ok: true });
    }

    const asaasTransferId = transfer.id;
    const asaasStatus     = transfer.status;

    // Look up withdrawal by asaas_transfer_id
    const { data: tx, error: txFetchErr } = await supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, type, status")
      .eq("asaas_transfer_id", asaasTransferId)
      .maybeSingle();

    if (txFetchErr) {
      log("error", "[asaas webhook] failed — wallet_transactions lookup", {
        asaasTransferId, err: txFetchErr.message,
      });
      return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
    }

    if (!tx) {
      log("warn", "[asaas webhook] ignored — no matching withdrawal for transfer", {
        asaasTransferId,
      });
      return NextResponse.json({ ok: true });
    }

    if (tx.type !== "withdrawal") {
      log("info", "[asaas webhook] ignored — transaction is not a withdrawal", {
        txId: tx.id, type: tx.type,
      });
      return NextResponse.json({ ok: true });
    }

    const currentStatus = tx.status ?? "";

    // ── TRANSFER_DONE: mark paid (wallet already debited at request time) ─────
    if (newStatus === "paid") {
      if (currentStatus === "paid") {
        log("info", "[asaas transfer] already marked paid — skipping", { txId: tx.id });
        return NextResponse.json({ ok: true });
      }

      await supabase
        .from("wallet_transactions")
        .update({
          status:          "paid",
          asaas_status:    asaasStatus,
          provider_status: asaasStatus,
          processed_at:    now,
        } as Record<string, unknown>)
        .eq("id", tx.id);

      await supabase
        .from("asaas_webhook_events")
        .update({ processed_at: now } as Record<string, unknown>)
        .eq("event_id", eventId);

      log("info", "[asaas transfer] withdrawal marked paid", {
        userId: tx.user_id, txId: tx.id, asaasTransferId,
      });

      return NextResponse.json({ ok: true });
    }

    // ── TRANSFER_FAILED / TRANSFER_CANCELLED: restore wallet exactly once ─────
    if (newStatus === "failed" || newStatus === "cancelled") {
      if (TERMINAL_STATUSES.has(currentStatus)) {
        log("info", "[asaas transfer] already in terminal state — skipping refund", {
          txId: tx.id, currentStatus,
        });
        return NextResponse.json({ ok: true });
      }

      const refundAmount = Number(tx.amount);

      const { error: rpcErr } = await supabase.rpc("increment_wallet_balance", {
        p_user_id: tx.user_id,
        p_amount:  refundAmount,
      });

      if (rpcErr) {
        log("error", "[asaas transfer] failed — increment_wallet_balance (refund)", {
          txId: tx.id, userId: tx.user_id, err: rpcErr.message,
        });
        return NextResponse.json({ error: "Refund failed" }, { status: 500 });
      }

      await supabase
        .from("wallet_transactions")
        .update({
          status:          newStatus,
          asaas_status:    asaasStatus,
          provider_status: asaasStatus,
          processed_at:    now,
        } as Record<string, unknown>)
        .eq("id", tx.id);

      await supabase
        .from("asaas_webhook_events")
        .update({ processed_at: now } as Record<string, unknown>)
        .eq("event_id", eventId);

      log("info", `[asaas transfer] withdrawal ${newStatus} — wallet restored`, {
        userId: tx.user_id, txId: tx.id, refundAmount, asaasTransferId,
      });

      return NextResponse.json({ ok: true });
    }

    // ── In-flight statuses (processing, blocked): status update only ──────────
    if (TERMINAL_STATUSES.has(currentStatus)) {
      log("info", "[asaas transfer] already terminal — ignoring in-flight event", {
        txId: tx.id, currentStatus, newStatus,
      });
      return NextResponse.json({ ok: true });
    }

    await supabase
      .from("wallet_transactions")
      .update({
        status:          newStatus,
        asaas_status:    asaasStatus,
        provider_status: asaasStatus,
      } as Record<string, unknown>)
      .eq("id", tx.id);

    await supabase
      .from("asaas_webhook_events")
      .update({ processed_at: now } as Record<string, unknown>)
      .eq("event_id", eventId);

    log("info", `[asaas transfer] withdrawal status → ${newStatus}`, {
      txId: tx.id, asaasTransferId,
    });

    return NextResponse.json({ ok: true });
  }

  // ── All other events ──────────────────────────────────────────────────────────
  log("info", "[asaas webhook] ignored — unhandled event", { event, eventId });
  return NextResponse.json({ ok: true });
}
