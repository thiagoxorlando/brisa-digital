import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createServerClient } from "@/lib/supabase";
import { notifyAdmins } from "@/lib/notify";

// POST /api/webhooks/mercadopago
//
// Security layers:
//   1. HMAC-SHA256 signature validation with 5-min timestamp tolerance
//   2. webhook_events INSERT unique constraint — deduplication gate
//   3. pix_payment_id ownership          — payment must belong to this contract
//   4. Amount integrity                  — paid amount must match contract amount
//   5. Atomic DB guard                   — .eq("payment_status","pending") prevents race conditions

// ── Logger ────────────────────────────────────────────────────────────────────

type LogLevel = "info" | "warn" | "error";
function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, source: "webhook/mercadopago", msg, ...ctx };
  // eslint-disable-next-line no-console
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

const SUBSCRIPTION_TX_DESCRIPTION = "Assinatura Pro — Brisa Digital";

// ── Signature validation ──────────────────────────────────────────────────────
// Header: x-signature: ts=<ts>,v1=<hmac>
// Manifest: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"  (request-id omitted if absent)
// Timestamp tolerance: max 5 minutes old, max 60 seconds future

function verifySignature(req: NextRequest, dataId: string): boolean {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  // Fail closed: no bypass — reject if secret is missing or placeholder
  if (!secret || secret === "your_webhook_secret_here") return false;

  const xSignature = req.headers.get("x-signature") ?? "";
  const xRequestId = req.headers.get("x-request-id") ?? "";

  const ts = xSignature.match(/ts=([^,]+)/)?.[1];
  const v1 = xSignature.match(/v1=([^,]+)/)?.[1];
  if (!ts || !v1) return false;

  // Reject replayed or excessively future-dated signatures
  const tsNum  = Number(ts);
  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(tsNum) || tsNum < nowSec - 300 || tsNum > nowSec + 60) return false;

  const parts =
    [`id:${dataId}`, xRequestId ? `request-id:${xRequestId}` : null, `ts:${ts}`]
      .filter(Boolean)
      .join(";") + ";";

  const expected = createHmac("sha256", secret).update(parts).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false; // buffer length mismatch → invalid signature
  }
}

// ── Normalize MP status to payments table CHECK constraint values ──────────────

const MP_STATUS_MAP: Record<string, string> = {
  in_process:   "pending",
  in_mediation: "pending",
  charged_back: "refunded",
};
const VALID_STATUSES = new Set(["pending","approved","rejected","cancelled","refunded","expired","failed"]);

function normalizeStatus(mpStatus: string | null | undefined): string {
  const s   = mpStatus ?? "failed";
  const out = MP_STATUS_MAP[s] ?? s;
  return VALID_STATUSES.has(out) ? out : "failed";
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type Supa = ReturnType<typeof createServerClient>;

async function markEventProcessed(db: Supa, id: string | null, error?: string) {
  if (!id) return;
  await db.from("webhook_events").update({
    processed:    !error,
    processed_at: error ? null : new Date().toISOString(),
    ...(error ? { error } : {}),
  }).eq("id", id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertPaymentRow(
  db: Supa,
  payment: any,
  dataId: string,
  refs: { agency_id?: string | null; booking_id?: string | null; contract_id?: string | null } = {}
) {
  const { error } = await db.from("payments").upsert(
    {
      provider:             "mercadopago",
      provider_payment_id:  dataId,
      idempotency_key:      `mercadopago:${dataId}`,
      agency_id:            refs.agency_id   ?? null,
      booking_id:           refs.booking_id  ?? null,
      contract_id:          refs.contract_id ?? null,
      amount:               payment.transaction_amount ?? 0,
      currency:             "BRL",
      status:               normalizeStatus(payment.status),
      raw_provider_payload: payment,
      processed_at:         new Date().toISOString(),
    },
    { onConflict: "provider,provider_payment_id" }
  );
  if (error) log("warn", "payments upsert failed", { dataId, err: error.message });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    log("warn", "Malformed JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Ack test pings and non-payment events immediately.
  // Signature requires data.id which these events don't provide.
  if (body.type !== "payment") {
    return NextResponse.json({ ok: true });
  }

  // Fail closed: secret must be configured and not placeholder
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret || secret === "your_webhook_secret_here") {
    log("error", "MERCADO_PAGO_WEBHOOK_SECRET not configured — rejecting webhook");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const dataId = String((body.data as Record<string, unknown>)?.id ?? "");
  if (!dataId) {
    log("warn", "Missing data.id");
    return NextResponse.json({ error: "Missing data.id" }, { status: 400 });
  }

  // ── Validate HMAC signature + timestamp ──────────────────────────────────────
  if (!verifySignature(req, dataId)) {
    log("warn", "Signature validation failed", { dataId });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const supabase   = createServerClient({ useServiceRole: true });
  const xRequestId = req.headers.get("x-request-id") ?? "";

  // ts is guaranteed non-empty here: verifySignature already validated it.
  const sigTs = (req.headers.get("x-signature") ?? "").match(/ts=([^,]+)/)?.[1] ?? "";

  // ── Insert webhook_event — deduplication gate ─────────────────────────────────
  // Dedup key must be the webhook NOTIFICATION id, not the payment id.
  // MP sends multiple notifications for the same payment as status changes
  // (e.g. pending → approved). Using payment id here blocks approved updates.
  // Primary:  x-request-id — unique per delivery from MP.
  // Fallback: "paymentId:ts" — ts from the validated HMAC, stable per delivery.
  const notificationId = xRequestId || `${dataId}:${sigTs}`;

  const { data: webhookEvent, error: weErr } = await supabase
    .from("webhook_events")
    .insert({
      provider:          "mercadopago",
      event_id:          xRequestId || dataId,
      provider_event_id: notificationId,
      topic:             String(body.type ?? ""),
      raw_payload:       body,
      processed:         false,
    })
    .select("id")
    .single();

  if (weErr) {
    if (weErr.code === "23505") {
      log("info", "Duplicate webhook event — skipping", { dataId });
      return NextResponse.json({ ok: true });
    }
    // Non-fatal: log but continue so a DB hiccup doesn't lose a valid payment
    log("warn", "Failed to insert webhook_event", { dataId, err: weErr.message });
  }

  const webhookEventId = webhookEvent?.id ?? null;

  // ── Fetch payment from Mercado Pago ──────────────────────────────────────────
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    log("error", "MERCADO_PAGO_ACCESS_TOKEN not configured");
    await markEventProcessed(supabase, webhookEventId, "MERCADO_PAGO_ACCESS_TOKEN not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  let payment;
  try {
    const client = new MercadoPagoConfig({ accessToken });
    payment = await new Payment(client).get({ id: Number(dataId) });
  } catch (err) {
    log("error", "Failed to fetch payment from MP", { paymentId: dataId, err: String(err) });
    await markEventProcessed(supabase, webhookEventId, `MP fetch failed: ${String(err)}`);
    return NextResponse.json({ error: "Could not fetch payment" }, { status: 502 });
  }

  log("info", "Payment event", { paymentId: dataId, status: payment.status });

  const meta = payment.metadata as Record<string, string> | undefined;

  // ── Subscription failure branch (fires even on non-approved) ─────────────────
  if (meta?.type === "subscription" && payment.status !== "approved") {
    const userId = meta.user_id;
    if (userId) {
      await supabase
        .from("profiles")
        .update({ plan_status: "past_due" })
        .eq("id", userId);
      log("info", "Subscription payment failed — plan set to past_due", { paymentId: dataId, userId, status: payment.status });
    }
    await upsertPaymentRow(supabase, payment, dataId, { agency_id: userId ?? null });
    await markEventProcessed(supabase, webhookEventId);
    return NextResponse.json({ ok: true });
  }

  // Only proceed on approved payments
  if (payment.status !== "approved") {
    await upsertPaymentRow(supabase, payment, dataId);
    await markEventProcessed(supabase, webhookEventId);
    return NextResponse.json({ ok: true });
  }

  // ── Subscription approved branch ──────────────────────────────────────────────
  if (meta?.type === "subscription") {
    const userId = meta.user_id;
    if (!userId) {
      log("warn", "subscription missing user_id", { paymentId: dataId });
      await upsertPaymentRow(supabase, payment, dataId);
      await markEventProcessed(supabase, webhookEventId);
      return NextResponse.json({ ok: true });
    }

    // Idempotency is now guaranteed by the webhook_events unique INSERT above.
    // The 10-minute wallet_transactions window check is no longer needed.

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await supabase
      .from("profiles")
      .update({
        plan:            "pro",
        plan_status:     "active",
        plan_expires_at: expiresAt.toISOString(),
      })
      .eq("id", userId);

    await supabase.from("wallet_transactions").insert({
      user_id:     userId,
      type:        "payment",
      amount:      payment.transaction_amount ?? 0,
      description: SUBSCRIPTION_TX_DESCRIPTION,
    });

    log("info", "Subscription activated", { userId, paymentId: dataId, expiresAt: expiresAt.toISOString() });
    await upsertPaymentRow(supabase, payment, dataId, { agency_id: userId });
    await markEventProcessed(supabase, webhookEventId);
    return NextResponse.json({ ok: true });
  }

  // ── Wallet deposit branch ─────────────────────────────────────────────────────
  if (meta?.type === "wallet_deposit") {
    const userId = meta.user_id;
    if (!userId) {
      log("warn", "wallet_deposit missing user_id", { paymentId: dataId });
      await upsertPaymentRow(supabase, payment, dataId);
      await markEventProcessed(supabase, webhookEventId);
      return NextResponse.json({ ok: true });
    }

    // Use intended_credit_amount from metadata when set (fee pass-through mode).
    // The creation route stores the net-to-wallet value so that even when the
    // gross charged amount > creditAmount, the wallet receives the right value.
    // Falls back to transaction_amount (platform fee-absorption mode, default).
    const rawIntended = Number(meta?.intended_credit_amount);
    const depositAmount = (rawIntended > 0 ? rawIntended : null) ?? payment.transaction_amount ?? 0;

    // credit_wallet_deposit is atomic and idempotent:
    //   - claims the pending tx row via UPDATE or INSERT
    //   - the unique index on payment_id means only one concurrent call can claim it
    //   - credits wallet only after claiming; returns false if already processed
    const { data: credited, error: rpcErr } = await supabase.rpc("credit_wallet_deposit", {
      p_user_id:    userId,
      p_payment_id: dataId,
      p_amount:     depositAmount,
    });

    if (rpcErr) {
      log("error", "credit_wallet_deposit failed", { userId, err: rpcErr.message });
      await upsertPaymentRow(supabase, payment, dataId, { agency_id: userId });
      await markEventProcessed(supabase, webhookEventId, `credit_wallet_deposit failed: ${rpcErr.message}`);
      return NextResponse.json({ error: "Balance update failed" }, { status: 500 });
    }

    if (credited) {
      log("info", "Wallet deposit credited", { userId, amount: depositAmount, paymentId: dataId });
      const brl = new Intl.NumberFormat("pt-BR", {
        style:                 "currency",
        currency:              "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(depositAmount);
      await notifyAdmins(
        "payment",
        `Depósito de carteira confirmado: ${brl}`,
        "/admin/finances",
        `admin-wallet-deposit:${dataId}`,
      );
    } else {
      log("info", "Wallet deposit already credited — skipping", { paymentId: dataId, userId });
    }

    await upsertPaymentRow(supabase, payment, dataId, { agency_id: userId });
    await markEventProcessed(supabase, webhookEventId);
    return NextResponse.json({ ok: true });
  }

  // ── Step 1: Find contract by pix_payment_id ──────────────────────────────────
  // Primary: look up by pix_payment_id stored at QR generation time
  // Fallback: use contract_id from payment metadata (if set during PIX creation)
  let contractId: string | null = null;

  const { data: contractByPix } = await supabase
    .from("contracts")
    .select("id")
    .eq("pix_payment_id", dataId)
    .maybeSingle();

  if (contractByPix) {
    contractId = contractByPix.id;
  } else {
    const metaId = (payment.metadata as Record<string, string> | undefined)?.contract_id;
    if (metaId) contractId = metaId;
  }

  if (!contractId) {
    log("info", "No contract matched — ignoring", { paymentId: dataId });
    await upsertPaymentRow(supabase, payment, dataId);
    await markEventProcessed(supabase, webhookEventId);
    return NextResponse.json({ ok: true });
  }

  // ── Step 2: Fetch contract ───────────────────────────────────────────────────
  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("id, status, payment_status, pix_payment_id, payment_amount, talent_id, agency_id, job_id, job_description")
    .eq("id", contractId)
    .single();

  if (fetchErr || !contract) {
    log("error", "Contract not found", { contractId, err: fetchErr?.message });
    await upsertPaymentRow(supabase, payment, dataId, { contract_id: contractId });
    await markEventProcessed(supabase, webhookEventId, `Contract not found: ${fetchErr?.message}`);
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  // ── Step 3: Idempotency — ignore if already paid ─────────────────────────────
  if (contract.payment_status === "paid") {
    log("info", "Already paid — skipping", { contractId, paymentId: dataId });
    await upsertPaymentRow(supabase, payment, dataId, { agency_id: contract.agency_id, contract_id: contractId });
    await markEventProcessed(supabase, webhookEventId);
    return NextResponse.json({ ok: true });
  }

  // ── Ownership: payment ID must match what was stored ─────────────────────────
  if (contract.pix_payment_id && contract.pix_payment_id !== dataId) {
    log("warn", "Payment ID mismatch — possible replay attack", {
      contractId,
      expected: contract.pix_payment_id,
      received: dataId,
    });
    await markEventProcessed(supabase, webhookEventId, "Payment ID mismatch");
    return NextResponse.json({ error: "Payment mismatch" }, { status: 409 });
  }

  // ── Amount integrity ─────────────────────────────────────────────────────────
  const paidAmount     = payment.transaction_amount ?? 0;
  const contractAmount = Number(contract.payment_amount ?? 0);
  if (Math.abs(paidAmount - contractAmount) > 0.01) {
    log("warn", "Amount mismatch", { contractId, paidAmount, contractAmount });
    await upsertPaymentRow(supabase, payment, dataId, { agency_id: contract.agency_id, contract_id: contractId });
    await markEventProcessed(supabase, webhookEventId, `Amount mismatch: paid=${paidAmount} contract=${contractAmount}`);
    return NextResponse.json({ error: "Amount mismatch" }, { status: 409 });
  }

  // ── Pre-confirm capacity check ───────────────────────────────────────────────
  // Count already-paid contracts for this job BEFORE writing anything.
  // If the job is already at or over capacity, reject without touching the DB.
  if (contract.job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("number_of_talents_required")
      .eq("id", contract.job_id)
      .single();

    if (job) {
      const talentsNeeded = job.number_of_talents_required ?? 1;

      const { count: confirmedCount } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("job_id",         contract.job_id)
        .eq("payment_status", "paid")
        .is("deleted_at",     null);

      if ((confirmedCount ?? 0) >= talentsNeeded) {
        log("warn", "Job at capacity — rejecting before update", {
          contractId,
          jobId:         contract.job_id,
          confirmed:     confirmedCount,
          talentsNeeded,
        });
        // Return 200 so Mercado Pago stops retrying — this is a business rule rejection
        await upsertPaymentRow(supabase, payment, dataId, { agency_id: contract.agency_id, contract_id: contractId });
        await markEventProcessed(supabase, webhookEventId, "Job at capacity");
        return NextResponse.json({ ok: true, reason: "job_at_capacity" });
      }
    }
  }

  // ── Update contract atomically ────────────────────────────────────────────────
  // .eq("payment_status","pending") is the race-condition guard:
  // if two webhook calls arrive simultaneously, only one UPDATE will match.
  const now = new Date().toISOString();

  const { data: updatedRows, error: updateErr } = await supabase
    .from("contracts")
    .update({
      payment_status: "paid",
      status:         "confirmed",
      paid_at:        now,
    })
    .eq("id", contractId)
    .eq("payment_status", "pending") // atomic guard — only matches if still pending
    .select("id");

  if (updateErr) {
    log("error", "Failed to update contract", { contractId, err: updateErr.message });
    await upsertPaymentRow(supabase, payment, dataId, { agency_id: contract.agency_id, contract_id: contractId });
    await markEventProcessed(supabase, webhookEventId, `Contract update failed: ${updateErr.message}`);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 0 rows returned → another concurrent webhook already processed this payment
  if (!updatedRows || updatedRows.length === 0) {
    log("info", "Concurrent update detected — skipping", { contractId });
    await upsertPaymentRow(supabase, payment, dataId, { agency_id: contract.agency_id, contract_id: contractId });
    await markEventProcessed(supabase, webhookEventId);
    return NextResponse.json({ ok: true });
  }

  log("info", "Contract confirmed", { contractId, paymentId: dataId, amount: paidAmount });

  // ── Job fill check (post-confirm) ────────────────────────────────────────────
  // Re-count now that this contract is paid and mark job filled if at capacity.
  const { job_id, talent_id, agency_id } = contract;

  if (job_id) {
    const [{ count: filledCount }, { data: job }] = await Promise.all([
      supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("job_id",         job_id)
        .eq("payment_status", "paid")
        .is("deleted_at",     null),
      supabase
        .from("jobs")
        .select("number_of_talents_required, status")
        .eq("id", job_id)
        .single(),
    ]);

    if (job) {
      const talentsNeeded = job.number_of_talents_required ?? 1;
      const filled        = filledCount ?? 0;

      log("info", "Job fill check", { job_id, filled, talentsNeeded });

      if (filled >= talentsNeeded && job.status !== "filled" && job.status !== "closed") {
        const { error: jobErr } = await supabase
          .from("jobs")
          .update({ status: "filled" })
          .eq("id", job_id);

        if (jobErr) {
          log("error", "Failed to fill job", { job_id, err: jobErr.message });
        } else {
          log("info", "Job marked as filled", { job_id, filled, talentsNeeded });
        }
      }
    }
  }

  // ── Upsert booking ────────────────────────────────────────────────────────────
  // Update an existing pending_payment booking, or create one if missing.
  let resolvedBookingId: string | null = null;

  if (talent_id && agency_id) {
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("talent_user_id", talent_id)
      .eq("agency_id",      agency_id)
      .eq("status",         "pending_payment")
      .maybeSingle();

    if (existing) {
      await supabase
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", existing.id);

      resolvedBookingId = existing.id;
      log("info", "Booking confirmed", { bookingId: existing.id, contractId });
    } else {
      // Guard against duplicate confirmed bookings for this talent + job
      const { count: dupCount } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("talent_user_id", talent_id)
        .eq("agency_id",      agency_id)
        .in("status",         ["confirmed", "paid"]);

      if ((dupCount ?? 0) === 0) {
        const { data: jobRow } = job_id
          ? await supabase.from("jobs").select("title").eq("id", job_id).single()
          : { data: null };

        const { data: createdBooking, error: bookingErr } = await supabase
          .from("bookings")
          .insert({
            job_id:         job_id ?? null,
            agency_id,
            talent_user_id: talent_id,
            job_title:      jobRow?.title ?? contract.job_description?.slice(0, 100) ?? "Contract Job",
            price:          contractAmount,
            status:         "confirmed",
          })
          .select("id, job_title")
          .single();

        if (bookingErr) {
          log("error", "Failed to create booking", { contractId, err: bookingErr.message });
        } else {
          resolvedBookingId = createdBooking.id;
          log("info", "Booking created", { contractId });
          await notifyAdmins(
            "booking",
            `Nova reserva criada: ${createdBooking.job_title ?? "sem titulo"}`,
            "/admin/bookings",
            `admin-booking-created:${createdBooking.id}`,
          );
        }
      } else {
        log("info", "Duplicate booking skipped", { contractId, talentId: talent_id });
      }
    }
  }

  log("info", "Webhook processing complete", {
    contractId,
    paymentId: dataId,
    jobId:     job_id,
    talentId:  talent_id,
  });

  // ── Upsert forensic payments row and mark event processed ─────────────────────
  await upsertPaymentRow(supabase, payment, dataId, {
    agency_id:   agency_id   ?? null,
    booking_id:  resolvedBookingId,
    contract_id: contractId,
  });
  await markEventProcessed(supabase, webhookEventId);

  return NextResponse.json({ ok: true });
}
