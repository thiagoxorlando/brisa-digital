import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { notify, notifyAdmins } from "@/lib/notify";

export const runtime = "nodejs";

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
  const userId = metadata.user_id;
  const transactionId = metadata.wallet_transaction_id;
  const paymentIntentId = idFrom(session.payment_intent) ?? session.id;
  const amount = amountFromCents(session.amount_total);
  const confirmedDescription = "Deposito via Stripe Checkout confirmado";
  const confirmedAdminNote = `Stripe Checkout confirmado. Session: ${session.id}`;

  console.log("[stripe deposit] handling wallet deposit", { userId, transactionId, paymentIntentId, amount });

  if (!userId || !transactionId || amount <= 0) {
    throw new Error("wallet_deposit metadata missing user_id, wallet_transaction_id, or amount");
  }

  const { data: creditResult, error: creditError } = await supabase.rpc("credit_stripe_wallet_deposit", {
    p_user_id: userId,
    p_transaction_id: transactionId,
    p_payment_id: paymentIntentId,
    p_amount: amount,
  });

  if (creditError) {
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
    throw new Error(`credit_stripe_wallet_deposit returned ${payload?.error ?? "not ok"}`);
  }

  const confirmedTxId = payload.transaction_id ?? transactionId;

  const { error: finalizeError } = await supabase
    .from("wallet_transactions")
    .update({
      status: "paid",
      provider: "stripe",
      provider_status: "paid",
      payment_id: paymentIntentId,
      reference_id: session.id,
      description: confirmedDescription,
      admin_note: confirmedAdminNote,
    } as Record<string, unknown>)
    .eq("id", confirmedTxId);

  if (finalizeError) {
    throw new Error(`failed to finalize wallet_transaction: ${finalizeError.message}`);
  }

  if (payload.already_processed) {
    console.log("[stripe deposit] already processed", {
      transactionId: confirmedTxId,
      userId,
      paymentIntentId,
      sessionId: session.id,
    });
    return;
  }

  console.log("[stripe deposit] wallet credited", {
    userId,
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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const type = session.metadata?.type;

        console.log("[stripe webhook] checkout.session.completed", { type, sessionId: session.id });

        if (type === "wallet_deposit") {
          await handleWalletDeposit(supabase, session);
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

    await markEventProcessed(supabase, event);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe webhook] processing failed", {
      eventId: event.id,
      type: event.type,
      error: message,
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
