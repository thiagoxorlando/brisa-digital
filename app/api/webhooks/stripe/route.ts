import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { notify, notifyAdmins } from "@/lib/notify";

export const runtime = "nodejs";
type WalletDepositHandleResult =
  | { ok: true; reason: "credited" | "already_paid" | "ignored_missing_metadata" | "ignored_missing_transaction" | "ignored_not_pending" }
  | { ok: false; reason: "critical_failure"; transactionId: string | null };
const STRIPE_WALLET_DEPOSIT_DESCRIPTION = "Depósito via Stripe Checkout";

type Supabase = ReturnType<typeof createServerClient>;

function idFrom(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function amountFromCents(cents: number | null | undefined) {
  return cents && cents > 0 ? Math.round(cents) / 100 : 0;
}

async function hasProcessedEvent(supabase: Supabase, eventId: string) {
  const { data } = await supabase
    .from("stripe_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  return Boolean(data?.id);
}

async function markEventProcessed(supabase: Supabase, event: Stripe.Event) {
  const { error } = await supabase
    .from("stripe_events")
    .insert({
      id: event.id,
      type: event.type,
      livemode: event.livemode,
    });

  if (error && error.code !== "23505") {
    console.error("[stripe webhook] failed to record event", {
      eventId: event.id,
      type: event.type,
      error: error.message,
    });
  }
}

async function handleWalletDeposit(supabase: Supabase, session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};
  const transactionId = stringFrom(metadata.wallet_transaction_id);
  const paymentIntentId = idFrom(session.payment_intent) ?? session.id;
  const amount = amountFromCents(session.amount_total);
  const confirmedAdminNote = `Stripe Checkout confirmado. Session: ${session.id}`;

  console.log("[stripe deposit] session metadata", { sessionId: session.id, metadata });
  console.log("[stripe deposit] handling wallet deposit", {
    transactionId,
    paymentIntentId,
    amount,
    amountTotal: session.amount_total,
  });

  if (!transactionId || amount <= 0) {
    throw new Error("wallet_deposit metadata missing wallet_transaction_id or amount");
  }

  const { data: tx, error: txError } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, status, provider_status, payment_id")
    .eq("id", transactionId)
    .maybeSingle();

  console.log("[stripe deposit] lookup result", {
    sessionId: session.id,
    transactionId,
    lookupResult: tx,
    lookupError: txError?.message ?? null,
  });

  if (txError) {
    throw new Error(`failed to load wallet_transaction before credit: ${txError.message}`);
  }

  if (!tx?.user_id) {
    throw new Error(`wallet_transaction ${transactionId} missing user_id`);
  }

  const { data: creditResult, error: creditError } = await supabase.rpc("credit_stripe_wallet_deposit", {
    p_user_id: tx.user_id,
    p_transaction_id: transactionId,
    p_payment_id: paymentIntentId,
    p_amount: amount,
  });

  if (creditError) {
    console.error("[stripe deposit] RPC error full", {
      transactionId,
      sessionId: session.id,
      paymentIntentId,
      amount,
      error: creditError,
    });
    throw new Error(`credit_stripe_wallet_deposit failed: ${creditError.message}`);
  }

  const payload = creditResult as {
    ok?: boolean;
    already_processed?: boolean;
    wallet_balance_credited?: boolean;
    transaction_id?: string | null;
    error?: string;
  } | null;

  if (!payload?.ok) {
    console.error("[stripe deposit] RPC returned non-ok payload", {
      transactionId,
      sessionId: session.id,
      paymentIntentId,
      payload,
    });
    throw new Error(`credit_stripe_wallet_deposit returned ${payload?.error ?? "not ok"}`);
  }

  console.log("[stripe deposit] RPC result", {
    sessionId: session.id,
    transactionId,
    paymentIntentId,
    payload,
  });

  const confirmedTxId = payload.transaction_id ?? transactionId;

  const { data: finalUpdate, error: finalizeError } = await supabase
    .from("wallet_transactions")
    .update({
      status: "paid",
      provider: "stripe",
      provider_transfer_id: paymentIntentId,
      provider_status: "paid",
      payment_id: paymentIntentId,
      reference_id: session.id,
      description: STRIPE_WALLET_DEPOSIT_DESCRIPTION,
      admin_note: confirmedAdminNote,
      processed_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", confirmedTxId)
    .select("id, status, provider, provider_transfer_id, provider_status, payment_id, reference_id, processed_at")
    .maybeSingle();

  console.log("[stripe deposit] final update result", {
    sessionId: session.id,
    transactionId: confirmedTxId,
    finalUpdate,
    finalizeError: finalizeError?.message ?? null,
  });

  if (finalizeError) {
    throw new Error(`failed to finalize wallet_transaction: ${finalizeError.message}`);
  }

  if (payload.already_processed) {
    console.log("[stripe deposit] already processed", {
      transactionId: confirmedTxId,
      userId: tx.user_id,
      paymentIntentId,
      sessionId: session.id,
    });
    return;
  }

  console.log("[stripe deposit] wallet credited", {
    userId: tx.user_id,
    transactionId: confirmedTxId,
    paymentIntentId,
    sessionId: session.id,
    amount,
  });

  const brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(amount);

  await notifyAdmins(
    "payment",
    `Deposito de carteira confirmado: ${brl}`,
    "/admin/finances",
    `admin-stripe-wallet-deposit:${paymentIntentId}`,
  );
}

async function handleWalletDepositSafely(supabase: Supabase, session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};
  const transactionId = stringFrom(metadata.wallet_transaction_id);
  const paymentIntentId = idFrom(session.payment_intent) ?? session.id;
  const amountTotal = session.amount_total ?? null;

  console.log("[stripe deposit] session metadata", {
    sessionId: session.id,
    metadata,
  });
  console.log("[stripe deposit] wallet_transaction_id", {
    sessionId: session.id,
    walletTransactionId: transactionId,
  });
  console.log("[stripe deposit] payment_intent", {
    sessionId: session.id,
    paymentIntentId,
  });
  console.log("[stripe deposit] amount_total", {
    sessionId: session.id,
    amountTotal,
  });

  if (!transactionId) {
    console.error("[stripe deposit] CRITICAL skipped/failure reason", {
      reason: "missing_wallet_transaction_id",
      sessionId: session.id,
      paymentIntentId,
      metadata,
    });
    console.log("[stripe deposit] wallet_transaction_id missing on checkout.session.completed", {
      sessionId: session.id,
      paymentIntentId,
      metadata,
    });
    return { ok: true, reason: "ignored_missing_metadata" } satisfies WalletDepositHandleResult;
  }

  const { data: tx, error: txError } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, status, provider_status, payment_id, amount, provider, reference_id")
    .eq("id", transactionId)
    .maybeSingle();

  console.log("[stripe deposit] lookup result", {
    sessionId: session.id,
    transactionId,
    lookupResult: tx,
    lookupError: txError?.message ?? null,
  });

  if (txError) {
    console.error("[stripe deposit] CRITICAL failed to credit wallet", {
      transactionId,
      sessionId: session.id,
      paymentIntentId,
      reason: "load_wallet_transaction_failed",
      error: txError,
    });
    return { ok: false, reason: "critical_failure", transactionId };
  }

  if (!tx) {
    console.error("[stripe deposit] CRITICAL skipped/failure reason", {
      reason: "missing_wallet_transaction_row",
      transactionId,
      sessionId: session.id,
      paymentIntentId,
    });
    console.log("[stripe deposit] no matching transaction for checkout.session.completed", {
      transactionId,
      sessionId: session.id,
      paymentIntentId,
    });
    return { ok: true, reason: "ignored_missing_transaction" } satisfies WalletDepositHandleResult;
  }

  if (tx.status === "paid" || tx.provider_status === "paid") {
    console.error("[stripe deposit] CRITICAL skipped/failure reason", {
      reason: "already_paid_before_checkout_completed",
      transactionId,
      sessionId: session.id,
      paymentIntentId,
      tx,
    });
    console.log("[stripe deposit] transaction already paid before checkout.session.completed", {
      transactionId,
      sessionId: session.id,
      paymentIntentId,
      paymentId: tx.payment_id,
    });
    return { ok: true, reason: "already_paid" } satisfies WalletDepositHandleResult;
  }

  if (tx.status !== "pending") {
    console.error("[stripe deposit] CRITICAL skipped/failure reason", {
      reason: "transaction_not_pending",
      transactionId,
      sessionId: session.id,
      paymentIntentId,
      tx,
    });
    console.log("[stripe deposit] transaction not pending, skipping checkout.session.completed", {
      transactionId,
      sessionId: session.id,
      status: tx.status,
      providerStatus: tx.provider_status,
    });
    return { ok: true, reason: "ignored_not_pending" } satisfies WalletDepositHandleResult;
  }

  try {
    await handleWalletDeposit(supabase, session);
    return { ok: true, reason: "credited" } satisfies WalletDepositHandleResult;
  } catch (err) {
    console.error("[stripe deposit] CRITICAL failed to credit wallet", {
      transactionId,
      sessionId: session.id,
      paymentIntentId,
      tx,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return { ok: false, reason: "critical_failure", transactionId };
  }
}

async function handleContractFunding(supabase: Supabase, session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};
  const contractId = metadata.contract_id;
  const agencyId = metadata.agency_id;
  const paymentIntentId = idFrom(session.payment_intent);
  const amount = amountFromCents(session.amount_total);

  if (!contractId || !agencyId || !paymentIntentId || amount <= 0) {
    throw new Error("contract_funding metadata missing contract_id, agency_id, payment_intent, or amount");
  }

  let chargeId: string | null = null;
  try {
    const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
    chargeId = idFrom((paymentIntent as unknown as Record<string, unknown>).latest_charge);
  } catch (err) {
    console.error("[stripe contract funding] could not fetch payment intent charge", {
      paymentIntentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const { data: result, error } = await supabase.rpc("confirm_contract_stripe_funding", {
    p_contract_id: contractId,
    p_agency_id: agencyId,
    p_amount: amount,
    p_payment_intent_id: paymentIntentId,
    p_charge_id: chargeId,
    p_checkout_session_id: session.id,
  });

  if (error) throw new Error(`confirm_contract_stripe_funding failed: ${error.message}`);

  const payload = result as { ok?: boolean; already_processed?: boolean; error?: string; status?: string } | null;
  if (!payload?.ok) {
    throw new Error(`confirm_contract_stripe_funding returned ${payload?.error ?? "not ok"}`);
  }

  if (payload.already_processed) {
    console.log("[stripe contract funding] already confirmed", { contractId, paymentIntentId });
    return;
  }

  console.log("[stripe contract funding] confirmed", { contractId, paymentIntentId, amount });

  const { data: contract } = await supabase
    .from("contracts")
    .select("talent_id, agency_id")
    .eq("id", contractId)
    .maybeSingle();

  if (contract?.talent_id) {
    await notify(
      contract.talent_id,
      "contract",
      "Agencia confirmou o contrato e realizou o deposito",
      "/talent/contracts",
      `notif_stripe_escrow_talent_${contractId}`,
    );
  }

  if (contract?.agency_id) {
    await notify(
      contract.agency_id,
      "payment",
      "Pagamento do job confirmado via Stripe",
      "/agency/bookings",
      `notif_stripe_escrow_agency_${contractId}`,
    );
  }

  const brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(amount);

  await notifyAdmins(
    "payment",
    `Escrow Stripe confirmado: ${brl}`,
    "/admin/finances",
    `admin-stripe-escrow:${contractId}`,
  );
}

async function activateStripePlan(
  supabase: Supabase,
  params: {
    userId: string;
    plan: string;
    customerId: string | null;
    subscriptionId: string | null;
    subscriptionStatus: string | null;
    priceId: string | null;
    invoiceId: string;
    amount: number;
    periodEnd: string | null;
  },
) {
  const expiresAt = params.periodEnd ?? (() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString();
  })();

  await supabase
    .from("profiles")
    .update({
      plan: params.plan,
      plan_status: "active",
      plan_expires_at: expiresAt,
      stripe_customer_id: params.customerId,
      stripe_subscription_id: params.subscriptionId,
      stripe_subscription_status: params.subscriptionStatus ?? "active",
      stripe_price_id: params.priceId,
    })
    .eq("id", params.userId);

  await supabase
    .from("agencies")
    .update({ subscription_status: "active" })
    .eq("id", params.userId);

  await supabase
    .from("wallet_transactions")
    .upsert(
      {
        user_id: params.userId,
        type: "payment",
        amount: params.amount,
        description: `Plano ${params.plan.charAt(0).toUpperCase() + params.plan.slice(1)} - Stripe Billing`,
        payment_id: params.invoiceId,
        reference_id: params.subscriptionId,
        idempotency_key: `stripe_plan_invoice:${params.invoiceId}`,
        provider: "stripe",
        provider_status: "paid",
        status: "paid",
        processed_at: new Date().toISOString(),
      },
      { onConflict: "idempotency_key" },
    );

  console.log("[stripe billing] plan activated", {
    userId: params.userId,
    plan: params.plan,
    subscriptionId: params.subscriptionId,
    invoiceId: params.invoiceId,
  });
}

async function handlePlanCheckout(supabase: Supabase, session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};
  const userId = metadata.user_id;
  const plan = metadata.plan;
  const subscriptionId = idFrom(session.subscription);

  if (!userId || !plan || !subscriptionId) {
    throw new Error("plan_subscription metadata missing user_id, plan, or subscription");
  }

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const subscriptionRecord = subscription as unknown as Record<string, unknown>;
  const latestInvoiceId = idFrom(subscriptionRecord.latest_invoice) ?? idFrom(session.invoice) ?? session.id;
  const items = recordFrom(subscriptionRecord.items);
  const itemData = Array.isArray(items.data) ? items.data : [];
  const firstItem = recordFrom(itemData[0]);
  const priceId = idFrom(firstItem.price);
  const currentPeriodEnd = numberFrom(subscriptionRecord.current_period_end);

  await activateStripePlan(supabase, {
    userId,
    plan,
    customerId: idFrom(session.customer),
    subscriptionId,
    subscriptionStatus: stringFrom(subscriptionRecord.status) ?? "active",
    priceId,
    invoiceId: latestInvoiceId,
    amount: amountFromCents(session.amount_total),
    periodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
  });
}

async function handleInvoicePaid(supabase: Supabase, invoice: Stripe.Invoice) {
  const invoiceRecord = invoice as unknown as Record<string, unknown>;
  const directSubscriptionId = idFrom(invoiceRecord.subscription);
  const parent = recordFrom(invoiceRecord.parent);
  const subscriptionDetails = recordFrom(parent.subscription_details);
  const subscriptionId = directSubscriptionId ?? idFrom(subscriptionDetails.subscription);

  if (!subscriptionId) return;

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const subscriptionRecord = subscription as unknown as Record<string, unknown>;
  const metadata = recordFrom(subscriptionRecord.metadata);
  const userId = stringFrom(metadata.user_id);
  const plan = stringFrom(metadata.plan);

  if (!userId || !plan) return;

  const items = recordFrom(subscriptionRecord.items);
  const itemData = Array.isArray(items.data) ? items.data : [];
  const firstItem = recordFrom(itemData[0]);
  const priceId = idFrom(firstItem.price);
  const currentPeriodEnd = numberFrom(subscriptionRecord.current_period_end);

  await activateStripePlan(supabase, {
    userId,
    plan,
    customerId: idFrom(invoiceRecord.customer),
    subscriptionId,
    subscriptionStatus: stringFrom(subscriptionRecord.status) ?? "active",
    priceId,
    invoiceId: invoice.id,
    amount: amountFromCents(numberFrom(invoiceRecord.amount_paid)),
    periodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
  });
}

async function handleSubscriptionDeleted(supabase: Supabase, subscription: Stripe.Subscription) {
  await supabase
    .from("profiles")
    .update({
      plan: "free",
      plan_status: "inactive",
      plan_expires_at: null,
      stripe_subscription_status: "canceled",
    })
    .eq("stripe_subscription_id", subscription.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (profile?.id) {
    await supabase
      .from("agencies")
      .update({ subscription_status: "inactive" })
      .eq("id", profile.id);
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] invalid signature", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log("[stripe webhook] received", { type: event.type, eventId: event.id });

  const supabase = createServerClient({ useServiceRole: true });
  if (await hasProcessedEvent(supabase, event.id)) {
    console.log("[stripe webhook] duplicate event skipped", { eventId: event.id, type: event.type });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  let shouldMarkProcessed = true;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const type = session.metadata?.type;

        console.log("[stripe webhook] checkout.session.completed", { type, sessionId: session.id });

        if (type === "wallet_deposit") {
          const result = await handleWalletDepositSafely(supabase, session);
          if (!result.ok) {
            shouldMarkProcessed = false;
          }
        } else if (type === "contract_funding") {
          await handleContractFunding(supabase, session);
        } else if (type === "plan_subscription") {
          await handlePlanCheckout(supabase, session);
        }
        break;
      }

      case "invoice.payment_succeeded":
        await handleInvoicePaid(supabase, event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription);
        break;

      default:
        break;
    }
  } catch (err) {
    shouldMarkProcessed = false;
    console.error("[stripe webhook] processing failed", {
      eventId: event.id,
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  if (shouldMarkProcessed) {
    await markEventProcessed(supabase, event);
  }

  return NextResponse.json({ ok: true, processed: shouldMarkProcessed });
}
