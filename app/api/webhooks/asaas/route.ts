import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notifyAdmins } from "@/lib/notify";
import {
  parsePlanExternalReference,
  syncAgencyPlanFromAsaasPayment,
} from "@/lib/asaasPlanSync.server";

// POST /api/webhooks/asaas
//
// Security: validates asaas-access-token header against ASAAS_WEBHOOK_TOKEN.
// Idempotency: inserts into asaas_webhook_events and returns 200 immediately
// if the existing row has already been processed.

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
  dueDate?: string;
  subscriptionId?: string;
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
  eventId?: string;
  event: string;
  payment?: AsaasPayment;
  transfer?: AsaasTransfer;
}

const TERMINAL_STATUSES = new Set(["paid", "failed", "cancelled", "rejected"]);

const TRANSFER_EVENT_STATUS: Record<string, string> = {
  TRANSFER_CREATED: "processing",
  TRANSFER_PENDING: "processing",
  TRANSFER_IN_BANK_PROCESSING: "processing",
  TRANSFER_BLOCKED: "blocked",
  TRANSFER_DONE: "paid",
  TRANSFER_FAILED: "failed",
  TRANSFER_CANCELLED: "cancelled",
};

function isDuplicateKeyError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function POST(req: NextRequest) {
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
  const incoming = req.headers.get("asaas-access-token") ?? "";

  if (!webhookToken) {
    if (process.env.NODE_ENV === "production") {
      log("warn", "[asaas webhook] ASAAS_WEBHOOK_TOKEN missing in production");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    log("warn", "[asaas webhook] ASAAS_WEBHOOK_TOKEN missing in development; accepting request for local testing");
  } else if (incoming !== webhookToken) {
    log("warn", "[asaas webhook] invalid or missing token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AsaasWebhookBody;
  try {
    body = await req.json();
  } catch {
    log("warn", "[asaas webhook] malformed JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event ?? "";
  const eventId =
    body.id ||
    body.eventId ||
    body.payment?.id ||
    body.transfer?.id ||
    crypto.randomUUID();

  log("info", "[asaas webhook] received", { event, eventId });

  const supabase = createServerClient({ useServiceRole: true });
  const now = new Date().toISOString();

  async function findExistingWebhookEvent() {
    const byEventId = await supabase
      .from("asaas_webhook_events")
      .select("id, event_id, processed_at")
      .eq("event_id", eventId)
      .maybeSingle();

    if (byEventId.error) {
      return byEventId;
    }

    if (byEventId.data) {
      return byEventId;
    }

    return supabase
      .from("asaas_webhook_events")
      .select("id, event_id, processed_at")
      .eq("id", eventId)
      .maybeSingle();
  }

  async function markWebhookEventProcessed() {
    const byEventId = await supabase
      .from("asaas_webhook_events")
      .update({ processed_at: now } as Record<string, unknown>)
      .eq("event_id", eventId)
      .select("id");

    if (byEventId.error) {
      log("warn", "[asaas webhook] failed to mark event processed", {
        eventId,
        err: byEventId.error.message,
        match: "event_id",
      });
      return;
    }

    if ((byEventId.data?.length ?? 0) > 0) {
      return;
    }

    const byId = await supabase
      .from("asaas_webhook_events")
      .update({ processed_at: now } as Record<string, unknown>)
      .eq("id", eventId)
      .select("id");

    if (byId.error) {
      log("warn", "[asaas webhook] failed to mark event processed", {
        eventId,
        err: byId.error.message,
        match: "id",
      });
    }
  }

  async function okProcessed(payload: Record<string, unknown> = { ok: true }) {
    await markWebhookEventProcessed();
    return NextResponse.json(payload);
  }

  const { error: insertErr } = await supabase
    .from("asaas_webhook_events")
    .insert({
      id: eventId,
      event_id: eventId,
      event_type: event,
      payload: body as unknown as Record<string, unknown>,
      created_at: now,
      processed_at: null,
    } as Record<string, unknown>);

  if (insertErr) {
    if (isDuplicateKeyError(insertErr)) {
      const { data: existing, error: existingErr } = await findExistingWebhookEvent();

      if (existingErr) {
        console.error("[asaas webhook] failed to fetch duplicate event row", existingErr);
        return NextResponse.json({ error: "Webhook event lookup failed" }, { status: 500 });
      }

      if (existing?.processed_at) {
        log("info", "[asaas webhook] already processed - skipping", { eventId });
        return NextResponse.json({ ok: true });
      }
    } else {
      console.error("[asaas webhook] asaas_webhook_events insert failed", insertErr);
      return NextResponse.json({ error: "Webhook event logging failed" }, { status: 500 });
    }
  }

  if (event === "PAYMENT_CREATED") {
    const payment = body.payment;

    if (payment?.id) {
      const parsedPlanRef = parsePlanExternalReference(payment.externalReference);
      if (parsedPlanRef) {
        const { planKey, userId } = parsedPlanRef;
        const planLabel = planKey === "premium" ? "Premium" : "PRO";
        const { error: planInsertErr } = await supabase.from("wallet_transactions").insert({
          user_id: userId,
          type: "plan_charge",
          amount: payment.value,
          description: `Assinatura ${planLabel} - BrisaHub`,
          payment_id: payment.id,
          provider: "asaas",
          status: "pending",
        } as Record<string, unknown>);

        if (planInsertErr && planInsertErr.code !== "23505") {
          log("warn", "[asaas webhook] PAYMENT_CREATED plan_charge insert failed (non-fatal)", {
            userId,
            paymentId: payment.id,
            err: planInsertErr.message,
          });
        } else {
          log("info", "[asaas webhook] PAYMENT_CREATED - pending plan_charge recorded", {
            userId,
            planKey,
            paymentId: payment.id,
          });
        }
      }
    }

    return okProcessed();
  }

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    const payment = body.payment;

    if (!payment?.id) {
      log("warn", "[asaas webhook] ignored - missing payment object", { event, eventId });
      return okProcessed();
    }

    const asaasPaymentId = payment.id;
    const asaasStatus = payment.status;

    const { data: tx, error: txFetchErr } = await supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, type, status")
      .eq("asaas_payment_id", asaasPaymentId)
      .maybeSingle();

    if (txFetchErr) {
      log("error", "[asaas webhook] failed - wallet_transactions lookup", {
        asaasPaymentId,
        err: txFetchErr.message,
      });
      return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
    }

    if (!tx) {
      const parsedPlanRef = parsePlanExternalReference(payment.externalReference);
      if (parsedPlanRef) {
        try {
          const syncResult = await syncAgencyPlanFromAsaasPayment({
            supabase,
            payment: {
              id: payment.id,
              status: payment.status,
              value: payment.value,
              customer: payment.customer,
              dueDate: payment.dueDate,
              externalReference: payment.externalReference,
              subscriptionId: payment.subscriptionId,
            },
            now,
          });

          if (!syncResult.ok) {
            log("warn", "[asaas webhook] plan payment not synced", {
              asaasPaymentId,
              ...syncResult,
            });
          } else {
            log("info", "[asaas webhook] plan activated", {
              userId: syncResult.userId,
              planKey: syncResult.planKey,
              asaasPaymentId,
              planExpiresAt: syncResult.planExpiresAt,
            });
          }
        } catch (error) {
          log("error", "[asaas webhook] plan activation failed", {
            asaasPaymentId,
            extRef: payment.externalReference ?? "",
            err: error instanceof Error ? error.message : String(error),
          });
          return NextResponse.json({ error: "Plan activation failed" }, { status: 500 });
        }
        return okProcessed();
      }

      log("warn", "[asaas webhook] ignored - no matching wallet_transaction", { asaasPaymentId });
      return okProcessed();
    }

    if (tx.type !== "deposit") {
      log("info", "[asaas webhook] ignored - transaction is not a deposit", {
        txId: tx.id,
        type: tx.type,
      });
      return okProcessed();
    }

    if (tx.status === "paid") {
      log("info", "[asaas webhook] ignored - deposit already credited", { txId: tx.id });
      return okProcessed();
    }

    const creditAmount = Number(tx.amount);

    const { error: rpcErr } = await supabase.rpc("increment_wallet_balance", {
      p_user_id: tx.user_id,
      p_amount: creditAmount,
    });

    if (rpcErr) {
      log("error", "[asaas deposit] failed - increment_wallet_balance", {
        txId: tx.id,
        userId: tx.user_id,
        err: rpcErr.message,
      });
      return NextResponse.json({ error: "Balance update failed" }, { status: 500 });
    }

    await supabase
      .from("wallet_transactions")
      .update({
        status: "paid",
        asaas_status: asaasStatus,
        processed_at: now,
      } as Record<string, unknown>)
      .eq("id", tx.id);

    await markWebhookEventProcessed();

    log("info", "[asaas deposit] wallet credited", {
      userId: tx.user_id,
      txId: tx.id,
      amount: creditAmount,
      asaasPaymentId,
    });

      // Notify admins of confirmed deposit (non-fatal, fire-and-forget)
    void (async () => {
      const { data: agencyRow } = await supabase
        .from("agencies")
        .select("company_name")
        .eq("id", tx.user_id)
        .maybeSingle();
      const agencyName = (agencyRow as Record<string, unknown> | null)?.company_name as string | undefined;
      const displayName = agencyName?.trim() || "Agência";
      const amountStr = creditAmount.toFixed(2).replace(".", ",");
      await notifyAdmins(
        "payment",
        `Agência ${displayName} depositou R$ ${amountStr} via PIX.`,
        "/admin/finances?tab=depositos",
        `admin_deposit_${asaasPaymentId}`,
      );
    })().catch((err) => log("warn", "[asaas deposit] notifyAdmins failed (non-fatal)", { err: String(err) }));

    return NextResponse.json({ ok: true });
  }

  const newStatus = TRANSFER_EVENT_STATUS[event];
  if (newStatus !== undefined) {
    const transfer = body.transfer;

    if (!transfer?.id) {
      log("warn", "[asaas webhook] ignored - missing transfer object", { event, eventId });
      return okProcessed();
    }

    const asaasTransferId = transfer.id;
    const asaasStatus = transfer.status;

    const { data: tx, error: txFetchErr } = await supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, type, status")
      .eq("asaas_transfer_id", asaasTransferId)
      .maybeSingle();

    if (txFetchErr) {
      log("error", "[asaas webhook] failed - wallet_transactions lookup", {
        asaasTransferId,
        err: txFetchErr.message,
      });
      return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
    }

    if (!tx) {
      log("warn", "[asaas webhook] ignored - no matching withdrawal for transfer", {
        asaasTransferId,
      });
      return okProcessed();
    }

    if (tx.type !== "withdrawal") {
      log("info", "[asaas webhook] ignored - transaction is not a withdrawal", {
        txId: tx.id,
        type: tx.type,
      });
      return okProcessed();
    }

    const currentStatus = tx.status ?? "";

    if (newStatus === "paid") {
      if (currentStatus === "paid") {
        log("info", "[asaas transfer] already marked paid - skipping", { txId: tx.id });
        return okProcessed();
      }

      await supabase
        .from("wallet_transactions")
        .update({
          status: "paid",
          asaas_status: asaasStatus,
          provider_status: asaasStatus,
          processed_at: now,
        } as Record<string, unknown>)
        .eq("id", tx.id);

      await markWebhookEventProcessed();

      log("info", "[asaas transfer] withdrawal marked paid", {
        userId: tx.user_id,
        txId: tx.id,
        asaasTransferId,
      });

      // Notify admins — saque pago (non-fatal)
      void (async () => {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", tx.user_id)
          .maybeSingle();
        const name = (p as Record<string, unknown> | null)?.full_name as string | undefined;
        const displayName = name?.trim() || "Talent";
        const amountStr = Number(tx.amount).toFixed(2).replace(".", ",");
        await notifyAdmins(
          "payment",
          `Saque de R$ ${amountStr} para ${displayName} foi pago via PIX.`,
          "/admin/finances?tab=saques",
          `admin_withdraw_paid_${asaasTransferId}`,
        );
      })().catch((err) => log("warn", "[asaas transfer] notifyAdmins paid failed (non-fatal)", { err: String(err) }));

      return NextResponse.json({ ok: true });
    }

    if (newStatus === "failed" || newStatus === "cancelled") {
      if (TERMINAL_STATUSES.has(currentStatus)) {
        log("info", "[asaas transfer] already in terminal state - skipping refund", {
          txId: tx.id,
          currentStatus,
        });
        return okProcessed();
      }

      const refundAmount = Number(tx.amount);

      const { error: rpcErr } = await supabase.rpc("increment_wallet_balance", {
        p_user_id: tx.user_id,
        p_amount: refundAmount,
      });

      if (rpcErr) {
        log("error", "[asaas transfer] failed - increment_wallet_balance (refund)", {
          txId: tx.id,
          userId: tx.user_id,
          err: rpcErr.message,
        });
        return NextResponse.json({ error: "Refund failed" }, { status: 500 });
      }

      await supabase
        .from("wallet_transactions")
        .update({
          status: newStatus,
          asaas_status: asaasStatus,
          provider_status: asaasStatus,
          processed_at: now,
        } as Record<string, unknown>)
        .eq("id", tx.id);

      await markWebhookEventProcessed();

      log("info", `[asaas transfer] withdrawal ${newStatus} - wallet restored`, {
        userId: tx.user_id,
        txId: tx.id,
        refundAmount,
        asaasTransferId,
      });

      // Notify admins — saque falhou/cancelado (non-fatal)
      void (async () => {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", tx.user_id)
          .maybeSingle();
        const name = (p as Record<string, unknown> | null)?.full_name as string | undefined;
        const displayName = name?.trim() || "Talent";
        const amountStr = refundAmount.toFixed(2).replace(".", ",");
        const title = newStatus === "cancelled" ? "Saque cancelado" : "Saque falhou";
        const verb  = newStatus === "cancelled" ? "foi cancelado" : "falhou";
        await notifyAdmins(
          "payment",
          `${title}: Saque de R$ ${amountStr} para ${displayName} ${verb}.`,
          "/admin/finances?tab=saques",
          `admin_withdraw_${newStatus}_${asaasTransferId}`,
        );
      })().catch((err) => log("warn", "[asaas transfer] notifyAdmins failed/cancelled (non-fatal)", { err: String(err) }));

      return NextResponse.json({ ok: true });
    }

    if (TERMINAL_STATUSES.has(currentStatus)) {
      log("info", "[asaas transfer] already terminal - ignoring in-flight event", {
        txId: tx.id,
        currentStatus,
        newStatus,
      });
      return okProcessed();
    }

    await supabase
      .from("wallet_transactions")
      .update({
        status: newStatus,
        asaas_status: asaasStatus,
        provider_status: asaasStatus,
      } as Record<string, unknown>)
      .eq("id", tx.id);

    await markWebhookEventProcessed();

    log("info", `[asaas transfer] withdrawal status -> ${newStatus}`, {
      txId: tx.id,
      asaasTransferId,
    });

    return NextResponse.json({ ok: true });
  }

  log("info", "[asaas webhook] ignored - unhandled event", { event, eventId });
  return okProcessed();
}
