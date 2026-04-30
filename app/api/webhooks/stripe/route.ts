import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { notify, notifyAdmins } from "@/lib/notify";
import { PLAN_KEYS, type Plan } from "@/lib/plans";
import { syncStripeConnectAccountStatus } from "@/lib/stripeConnect";

export const runtime = "nodejs";

type Supabase = ReturnType<typeof createServerClient>;

type ProfileIdentity = {
  id: string;
  plan: string | null;
};

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

function formatBrl(amount: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function planFrom(value: unknown): Plan | null {
  return typeof value === "string" && PLAN_KEYS.includes(value as Plan) ? (value as Plan) : null;
}

function isMissingProfileColumnError(error: { message?: string } | null, column: string) {
  return !!error?.message?.includes(column);
}

function isIgnorableStripeProfileColumnError(error: { message?: string } | null) {
  const message = error?.message;
  if (!message) return false;
  return [
    "stripe_customer_id",
    "stripe_subscription_id",
    "stripe_subscription_status",
    "stripe_price_id",
  ].some((column) => message.includes(column));
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

async function updateProfileSubscriptionState(
  supabase: Supabase,
  params: {
    userId: string;
    plan?: Plan | "free" | null;
    planStatus: string;
    planExpiresAt: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripeSubscriptionStatus?: string | null;
    stripePriceId?: string | null;
    reason: string;
  },
) {
  const coreUpdate: Record<string, unknown> = {
    plan_status: params.planStatus,
    plan_expires_at: params.planExpiresAt,
  };
  if (params.plan) {
    coreUpdate.plan = params.plan;
  }

  let coreResult = await supabase
    .from("profiles")
    .update(coreUpdate)
    .eq("id", params.userId)
    .select("id, plan, plan_status, plan_expires_at")
    .maybeSingle();

  if (coreResult.error && isMissingProfileColumnError(coreResult.error, "plan_expires_at")) {
    coreResult = await supabase
      .from("profiles")
      .update(params.plan ? { plan: params.plan, plan_status: params.planStatus } : { plan_status: params.planStatus })
      .eq("id", params.userId)
      .select("id, plan, plan_status")
      .maybeSingle();
  }

  if (coreResult.error && isMissingProfileColumnError(coreResult.error, "plan_status")) {
    if (!params.plan) {
      console.error("[stripe subscription] update failed", {
        reason: params.reason,
        userId: params.userId,
        error: coreResult.error.message,
        coreUpdate,
      });
      throw new Error(`profile status update failed during ${params.reason}`);
    }

    coreResult = await supabase
      .from("profiles")
      .update({ plan: params.plan })
      .eq("id", params.userId)
      .select("id, plan")
      .maybeSingle();
  }

  if (coreResult.error || !coreResult.data) {
    console.error("[stripe subscription] update failed", {
      reason: params.reason,
      userId: params.userId,
      error: coreResult.error?.message ?? "profile_not_found",
      coreUpdate,
    });
    throw new Error(`profile update failed during ${params.reason}`);
  }

  const stripeUpdate = {
    stripe_customer_id: params.stripeCustomerId ?? null,
    stripe_subscription_id: params.stripeSubscriptionId ?? null,
    stripe_subscription_status: params.stripeSubscriptionStatus ?? null,
    stripe_price_id: params.stripePriceId ?? null,
  };

  const stripeResult = await supabase
    .from("profiles")
    .update(stripeUpdate)
    .eq("id", params.userId)
    .select("id, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_price_id")
    .maybeSingle();

  if (stripeResult.error) {
    if (isIgnorableStripeProfileColumnError(stripeResult.error)) {
      console.warn("[stripe subscription] optional stripe columns unavailable", {
        reason: params.reason,
        userId: params.userId,
        error: stripeResult.error.message,
      });
    } else {
      console.error("[stripe subscription] update failed", {
        reason: params.reason,
        userId: params.userId,
        error: stripeResult.error.message,
        stripeUpdate,
      });
      throw new Error(`stripe profile field update failed during ${params.reason}`);
    }
  }

  const agencyResult = await supabase
    .from("agencies")
    .update({ subscription_status: params.planStatus })
    .eq("id", params.userId);

  if (agencyResult.error) {
    console.warn("[stripe subscription] agency status update failed", {
      reason: params.reason,
      userId: params.userId,
      error: agencyResult.error.message,
    });
  }

  console.log("[stripe subscription] profile updated", {
    reason: params.reason,
    userId: params.userId,
    plan: params.plan ?? null,
    planStatus: params.planStatus,
    planExpiresAt: params.planExpiresAt,
    stripeCustomerId: params.stripeCustomerId ?? null,
    stripeSubscriptionId: params.stripeSubscriptionId ?? null,
    stripeSubscriptionStatus: params.stripeSubscriptionStatus ?? null,
    stripePriceId: params.stripePriceId ?? null,
  });
}

async function handleWalletDeposit(supabase: Supabase, session: Stripe.Checkout.Session) {
  const sessionId = session.id;
  const metadata = session.metadata ?? {};
  const paymentIntentId = idFrom(session.payment_intent) ?? sessionId;
  const amount = amountFromCents(session.amount_total);

  // 1. Log everything raw — so we can see exactly what Stripe sent
  console.log("[stripe deposit] session metadata", { sessionId, metadata });
  console.log("[stripe deposit] extracted values", {
    wallet_transaction_id: metadata.wallet_transaction_id ?? null,
    session_id: sessionId,
    payment_intent: paymentIntentId,
    amount_total: session.amount_total,
    amount_brl: amount,
  });

  type TxRow = { id: string; user_id: string; status: string; provider_status: string | null; payment_id: string | null };
  let tx: TxRow | null = null;

  const explicitTxId = stringFrom(metadata.wallet_transaction_id);

  // 2. Primary lookup: by wallet_transaction_id from metadata
  if (explicitTxId) {
    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("id, user_id, status, provider_status, payment_id")
      .eq("id", explicitTxId)
      .maybeSingle();

    if (error) {
      console.error("[stripe deposit] CRITICAL DB error loading transaction by id", {
        transactionId: explicitTxId,
        sessionId,
        error: error.message,
      });
      return false;
    }

    if (data) {
      console.log("[stripe deposit] matched transaction", {
        transactionId: data.id,
        status: data.status,
        providerStatus: data.provider_status,
        userId: data.user_id,
      });
      tx = data;
    } else {
      console.error("[stripe deposit] CRITICAL transaction not found by id", {
        transactionId: explicitTxId,
        sessionId,
        paymentIntentId,
      });
    }
  } else {
    console.error("[stripe deposit] CRITICAL wallet_transaction_id missing from metadata", {
      sessionId,
      paymentIntentId,
      metadataKeys: Object.keys(metadata),
      metadata,
    });
  }

  // 3. Fallback: find by reference_id = session.id (set in wallet-deposit route after checkout creation)
  if (!tx) {
    console.log("[stripe deposit] attempting fallback lookup via reference_id", { reference_id: sessionId });
    const { data: fallbackTx, error: fallbackErr } = await supabase
      .from("wallet_transactions")
      .select("id, user_id, status, provider_status, payment_id")
      .eq("reference_id", sessionId)
      .eq("provider", "stripe")
      .maybeSingle();

    if (fallbackErr) {
      console.error("[stripe deposit] fallback lookup DB error", { sessionId, error: fallbackErr.message });
    }

    if (fallbackTx) {
      console.log("[stripe deposit] matched transaction via reference_id fallback", {
        transactionId: fallbackTx.id,
        status: fallbackTx.status,
        userId: fallbackTx.user_id,
        sessionId,
      });
      tx = fallbackTx;
    } else {
      console.error("[stripe deposit] CRITICAL no matching transaction found", {
        sessionId,
        paymentIntentId,
        wallet_transaction_id_in_metadata: explicitTxId ?? "missing",
        fallback_reference_id: sessionId,
      });
      return false;
    }
  }

  // 4. Validate amount
  if (amount <= 0) {
    console.error("[stripe deposit] CRITICAL invalid amount", {
      sessionId,
      amount,
      amount_total: session.amount_total,
    });
    return false;
  }

  // 5. Idempotency guard
  if (tx.status === "paid" || tx.provider_status === "paid") {
    console.log("[stripe deposit] already processed", {
      transactionId: tx.id,
      userId: tx.user_id,
      paymentIntentId,
      status: tx.status,
      providerStatus: tx.provider_status,
    });
    return;
  }

  // 6. Call the RPC — it locks the row, credits wallet_balance, marks transaction paid
  const { data: creditResult, error: creditError } = await supabase.rpc("credit_stripe_wallet_deposit", {
    p_user_id: tx.user_id,
    p_transaction_id: tx.id,
    p_payment_id: paymentIntentId,
    p_amount: amount,
  });

  if (creditError) {
    console.error("[stripe deposit] RPC error full", {
      transactionId: tx.id,
      sessionId,
      paymentIntentId,
      amount,
      error: creditError.message,
      details: creditError,
    });
    return false;
  }

  const payload = creditResult as {
    ok?: boolean;
    already_processed?: boolean;
    wallet_balance_credited?: boolean;
    transaction_id?: string | null;
    error?: string;
  } | null;

  console.log("[stripe deposit] RPC result", { sessionId, transactionId: tx.id, payload });

  if (!payload?.ok) {
    console.error("[stripe deposit] CRITICAL RPC returned not ok", {
      transactionId: tx.id,
      sessionId,
      payload,
    });
    return false;
  }

  if (payload.already_processed) {
    console.log("[stripe deposit] already processed (RPC)", {
      transactionId: tx.id,
      userId: tx.user_id,
      paymentIntentId,
    });
    return;
  }

  // 7. Stamp transfer reference — RPC already set status/provider/payment_id; we add provider_transfer_id + reference_id
  const { data: finalUpdate, error: finalUpdateError } = await supabase
    .from("wallet_transactions")
    .update({
      provider_transfer_id: paymentIntentId,
      reference_id: sessionId,
      processed_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq("id", payload.transaction_id ?? tx.id)
    .select("id, status, provider, provider_transfer_id, provider_status, payment_id, reference_id, processed_at")
    .maybeSingle();

  console.log("[stripe deposit] final update result", {
    sessionId,
    transactionId: payload.transaction_id ?? tx.id,
    finalUpdate,
    finalUpdateError: finalUpdateError?.message ?? null,
  });

  if (finalUpdateError) {
    console.error("[stripe deposit] CRITICAL final update failed", {
      transactionId: payload.transaction_id ?? tx.id,
      sessionId,
      paymentIntentId,
      error: finalUpdateError.message,
    });
    return false;
  }

  console.log("[stripe deposit] wallet credited successfully", {
    userId: tx.user_id,
    transactionId: payload.transaction_id ?? tx.id,
    paymentIntentId,
    sessionId,
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

  return true;
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

  await updateProfileSubscriptionState(supabase, {
    userId: params.userId,
    plan: planFrom(params.plan) ?? "free",
    planStatus: "active",
    planExpiresAt: expiresAt,
    stripeCustomerId: params.customerId,
    stripeSubscriptionId: params.subscriptionId,
    stripeSubscriptionStatus: params.subscriptionStatus ?? "active",
    stripePriceId: params.priceId,
    reason: "activateStripePlan",
  });

  const billingTxResult = await supabase
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

  if (billingTxResult.error) {
    console.error("[stripe subscription] update failed", {
      reason: "activateStripePlan.wallet_transaction",
      userId: params.userId,
      invoiceId: params.invoiceId,
      error: billingTxResult.error.message,
    });
    throw new Error(`wallet transaction upsert failed for invoice ${params.invoiceId}`);
  }

  console.log("[stripe billing] plan activated", {
    userId: params.userId,
    plan: params.plan,
    subscriptionId: params.subscriptionId,
    invoiceId: params.invoiceId,
  });
}

async function handlePlanCheckout(supabase: Supabase, session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") {
    throw new Error(`plan_subscription checkout completed with invalid mode: ${session.mode}`);
  }

  const metadata = session.metadata ?? {};
  const userId = metadata.user_id;
  const plan = metadata.plan;
  const subscriptionId = idFrom(session.subscription);
  const customerId = idFrom(session.customer);

  console.log("[stripe subscription] checkout completed", {
    sessionId: session.id,
    userId,
    plan,
    customerId,
    subscriptionId,
    mode: session.mode,
  });
  console.log("[stripe subscription] metadata", {
    sessionId: session.id,
    metadata,
  });

  if (!userId || !plan || !subscriptionId || !customerId) {
    console.error("[stripe subscription] CRITICAL missing checkout metadata", {
      sessionId: session.id,
      metadata,
      customerId,
      subscriptionId,
    });
    throw new Error("plan_subscription metadata missing user_id, plan, customer, or subscription");
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
    customerId,
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
  const resolvedProfile = await resolveProfileByStripeRefs(supabase, {
    subscriptionId,
    customerId: idFrom(invoiceRecord.customer),
  });
  const userId = stringFrom(metadata.user_id) ?? resolvedProfile?.id ?? null;
  const plan = planFrom(metadata.plan) ?? planFrom(resolvedProfile?.plan ?? null);

  if (!userId || !plan) {
    console.error("[stripe subscription] update failed", {
      reason: "invoice.paid",
      invoiceId: invoice.id,
      subscriptionId,
      metadata,
      resolvedProfile,
    });
    return;
  }

  const items = recordFrom(subscriptionRecord.items);
  const itemData = Array.isArray(items.data) ? items.data : [];
  const firstItem = recordFrom(itemData[0]);
  const priceId = idFrom(firstItem.price);
  const currentPeriodEnd = numberFrom(subscriptionRecord.current_period_end);

  console.log("[stripe subscription] invoice paid", {
    invoiceId: invoice.id,
    subscriptionId,
    userId,
    plan,
    customerId: idFrom(invoiceRecord.customer),
    currentPeriodEnd,
  });

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

async function resolveUserIdFromSubscription(
  supabase: Supabase,
  subscriptionId: string,
  metadata: Record<string, unknown>,
  customerId?: string | null,
): Promise<string | null> {
  const metadataUserId = stringFrom(metadata.user_id);
  if (metadataUserId) return metadataUserId;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (profile?.id) return profile.id;

  if (!customerId) return null;

  const { data: fallbackProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return fallbackProfile?.id ?? null;
}

async function resolveProfileByStripeRefs(
  supabase: Supabase,
  params: {
    subscriptionId?: string | null;
    customerId?: string | null;
  },
): Promise<ProfileIdentity | null> {
  if (params.subscriptionId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, plan")
      .eq("stripe_subscription_id", params.subscriptionId)
      .maybeSingle();

    if (data?.id) return data as ProfileIdentity;
  }

  if (params.customerId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, plan")
      .eq("stripe_customer_id", params.customerId)
      .maybeSingle();

    if (data?.id) return data as ProfileIdentity;
  }

  return null;
}

async function syncSubscriptionState(
  supabase: Supabase,
  params: {
    userId: string;
    plan: Plan | null;
    customerId: string | null;
    subscriptionId: string;
    subscriptionStatus: string | null;
    priceId: string | null;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: number | null;
  },
) {
  let planStatus: string;
  let planExpiresAt: string | null = null;

  if (params.cancelAtPeriodEnd) {
    planStatus = "cancelling";
    const expireTs = params.cancelAt ?? params.currentPeriodEnd;
    planExpiresAt = expireTs ? new Date(expireTs * 1000).toISOString() : null;
  } else if (params.subscriptionStatus === "past_due") {
    planStatus = "past_due";
  } else if (params.subscriptionStatus === "unpaid") {
    planStatus = "unpaid";
  } else if (params.subscriptionStatus === "active") {
    planStatus = "active";
    planExpiresAt = params.currentPeriodEnd ? new Date(params.currentPeriodEnd * 1000).toISOString() : null;
  } else if (params.subscriptionStatus === "canceled") {
    planStatus = "inactive";
  } else {
    planStatus = params.subscriptionStatus ?? "inactive";
  }

  await updateProfileSubscriptionState(supabase, {
    userId: params.userId,
    plan:
      params.subscriptionStatus === "canceled"
        ? "free"
        : params.plan ?? null,
    planStatus,
    planExpiresAt,
    stripeCustomerId: params.customerId,
    stripeSubscriptionId: params.subscriptionId,
    stripeSubscriptionStatus: params.subscriptionStatus,
    stripePriceId: params.priceId,
    reason: "syncSubscriptionState",
  });

  return { planStatus, planExpiresAt };
}

async function handleSubscriptionCreated(supabase: Supabase, subscription: Stripe.Subscription) {
  const subscriptionRecord = subscription as unknown as Record<string, unknown>;
  const metadata = recordFrom(subscriptionRecord.metadata);
  const userId = stringFrom(metadata.user_id);
  const plan = planFrom(metadata.plan);
  const items = recordFrom(subscriptionRecord.items);
  const itemData = Array.isArray(items.data) ? items.data : [];
  const firstItem = recordFrom(itemData[0]);
  const priceId = idFrom(firstItem.price);
  const currentPeriodEnd = numberFrom(subscriptionRecord.current_period_end);
  const cancelAtPeriodEnd = Boolean(subscriptionRecord.cancel_at_period_end);
  const cancelAt = numberFrom(subscriptionRecord.cancel_at);
  const status = stringFrom(subscriptionRecord.status);

  if (!userId) {
    console.error("[stripe subscription] update failed", {
      reason: "customer.subscription.created",
      subscriptionId: subscription.id,
      metadata,
      error: "missing metadata.user_id",
    });
    return;
  }

  await syncSubscriptionState(supabase, {
    userId,
    plan,
    customerId: idFrom(subscription.customer),
    subscriptionId: subscription.id,
    subscriptionStatus: status,
    priceId,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    cancelAt,
  });

  console.log("[stripe subscription] created", {
    userId,
    subscriptionId: subscription.id,
    plan,
    status,
    currentPeriodEnd,
  });
}

async function handleSubscriptionUpdated(supabase: Supabase, subscription: Stripe.Subscription) {
  const subscriptionRecord = subscription as unknown as Record<string, unknown>;
  const status = stringFrom(subscriptionRecord.status);
  const cancelAtPeriodEnd = Boolean(subscriptionRecord.cancel_at_period_end);
  const cancelAt = numberFrom(subscriptionRecord.cancel_at);
  const currentPeriodEnd = numberFrom(subscriptionRecord.current_period_end);
  const metadata = recordFrom(subscriptionRecord.metadata);
  const plan = planFrom(metadata.plan);
  const items = recordFrom(subscriptionRecord.items);
  const itemData = Array.isArray(items.data) ? items.data : [];
  const firstItem = recordFrom(itemData[0]);
  const priceId = idFrom(firstItem.price);

  const customerId = idFrom(subscription.customer);
  const userId = await resolveUserIdFromSubscription(supabase, subscription.id, metadata, customerId);
  if (!userId) {
    console.error("[stripe subscription] update failed", {
      reason: "customer.subscription.updated",
      subscriptionId: subscription.id,
      customerId,
      metadata,
      error: "no user found",
    });
    return;
  }

  const { planStatus, planExpiresAt } = await syncSubscriptionState(supabase, {
    userId,
    plan,
    customerId,
    subscriptionId: subscription.id,
    subscriptionStatus: status,
    priceId,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    cancelAt,
  });

  console.log("[stripe subscription] updated", {
    userId,
    subscriptionId: subscription.id,
    plan,
    status,
    cancelAtPeriodEnd,
    planStatus,
    planExpiresAt,
  });
}

async function handleInvoicePaymentFailed(supabase: Supabase, invoice: Stripe.Invoice) {
  const invoiceRecord = invoice as unknown as Record<string, unknown>;
  const subscriptionId = idFrom(invoiceRecord.subscription);
  if (!subscriptionId) return;

  let userId: string | null = null;
  try {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const subscriptionRecord = subscription as unknown as Record<string, unknown>;
    const metadata = recordFrom(subscriptionRecord.metadata);
    userId = await resolveUserIdFromSubscription(
      supabase,
      subscriptionId,
      metadata,
      idFrom(invoiceRecord.customer),
    );
    const subStatus = stringFrom(subscriptionRecord.status);
    const planStatus = subStatus === "unpaid" ? "unpaid" : "past_due";

    if (!userId) {
      console.error("[stripe subscription] update failed", {
        reason: "invoice.payment_failed",
        subscriptionId,
        invoiceId: invoice.id,
        metadata,
        error: "no user found",
      });
      return;
    }

    let profileResult = await supabase.from("profiles").update({
      plan_status: planStatus,
      stripe_subscription_status: subStatus,
    }).eq("id", userId);

    if (profileResult.error && isMissingProfileColumnError(profileResult.error, "stripe_subscription_status")) {
      profileResult = await supabase
        .from("profiles")
        .update({ plan_status: planStatus })
        .eq("id", userId);
    }

    if (profileResult.error) {
      console.error("[stripe subscription] update failed", {
        reason: "invoice.payment_failed",
        subscriptionId,
        invoiceId: invoice.id,
        userId,
        error: profileResult.error.message,
      });
      throw new Error(`invoice.payment_failed profile update failed: ${profileResult.error.message}`);
    }

    const agencyResult = await supabase
      .from("agencies")
      .update({ subscription_status: planStatus })
      .eq("id", userId);

    if (agencyResult.error) {
      console.warn("[stripe subscription] agency status update failed", {
        reason: "invoice.payment_failed",
        userId,
        error: agencyResult.error.message,
      });
    }

    console.log("[stripe subscription] payment failed", {
      userId,
      subscriptionId,
      invoiceId: invoice.id,
      planStatus,
    });
  } catch (err) {
    console.error("[stripe subscription] update failed", {
      reason: "invoice.payment_failed.handler",
      subscriptionId,
      invoiceId: invoice.id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function handleSubscriptionDeleted(supabase: Supabase, subscription: Stripe.Subscription) {
  const subscriptionRecord = subscription as unknown as Record<string, unknown>;
  const metadata = recordFrom(subscriptionRecord.metadata);
  const userId = await resolveUserIdFromSubscription(
    supabase,
    subscription.id,
    metadata,
    idFrom(subscription.customer),
  );
  if (!userId) {
    console.error("[stripe subscription] update failed", {
      reason: "customer.subscription.deleted",
      subscriptionId: subscription.id,
      customerId: idFrom(subscription.customer),
      metadata,
      error: "no user found",
    });
    return;
  }

  await syncSubscriptionState(supabase, {
    userId,
    plan: "free",
    customerId: idFrom(subscription.customer),
    subscriptionId: subscription.id,
    subscriptionStatus: "canceled",
    priceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelAt: null,
  });

  console.log("[stripe subscription] canceled", {
    userId,
    subscriptionId: subscription.id,
  });
}

async function resolveWithdrawalTxIdFromPayout(supabase: Supabase, payout: Stripe.Payout) {
  const metadata = payout.metadata ?? {};
  const txId = stringFrom(metadata.withdrawal_transaction_id) ?? stringFrom(metadata.wallet_transaction_id);
  if (txId) return txId;

  const { data: tx } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("type", "withdrawal")
    .eq("provider_payout_id", payout.id)
    .maybeSingle();

  return tx?.id ?? null;
}

async function handleConnectAccountUpdated(supabase: Supabase, account: Stripe.Account) {
  await syncStripeConnectAccountStatus(supabase, account);
  console.log("[stripe connect] account.updated synced", {
    accountId: account.id,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    transfersActive: account.capabilities?.transfers === "active",
  });
}

async function handleStripePayoutEvent(
  supabase: Supabase,
  payout: Stripe.Payout,
  eventType: "payout.created" | "payout.updated" | "payout.paid" | "payout.failed",
) {
  const payoutMetadata = payout.metadata ?? {};
  const userRole = stringFrom(payoutMetadata.user_role);
  const financesPath = userRole === "agency" ? "/agency/finances" : "/talent/finances";
  const txId = await resolveWithdrawalTxIdFromPayout(supabase, payout);
  if (!txId) {
    console.warn("[stripe payout] withdrawal not found for payout", {
      payoutId: payout.id,
      eventType,
      metadata: payoutMetadata,
    });
    return;
  }

  const providerStatus = payout.status ?? (
    eventType === "payout.failed"
      ? "failed"
      : eventType === "payout.paid"
        ? "paid"
        : "pending"
  );

  await supabase
    .from("wallet_transactions")
    .update({
      provider: "stripe",
      provider_payout_id: payout.id,
      provider_status: providerStatus,
      reference_id: stringFrom(payout.metadata?.transfer_id),
      failure_reason: null,
      needs_admin_review: false,
    })
    .eq("id", txId);

  if (eventType === "payout.created" || eventType === "payout.updated") {
    console.log("[stripe payout] status synced", {
      txId,
      payoutId: payout.id,
      providerStatus,
      eventType,
    });
    return;
  }

  const { data: tx } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, amount, status, provider_transfer_id")
    .eq("id", txId)
    .maybeSingle();

  if (!tx?.id) return;

  if (eventType === "payout.paid") {
    await supabase.rpc("mark_wallet_withdrawal_paid", {
      p_transaction_id: txId,
      p_provider: "stripe",
      p_admin_note: "Stripe payout confirmado por webhook.",
    });

    const amount = Math.abs(Number(tx.amount ?? 0));
    await notify(
      tx.user_id,
      "payment",
      `Seu saque de ${formatBrl(amount)} foi pago automaticamente via Stripe.`,
      financesPath,
      `wallet-withdrawal-paid-stripe:${txId}`,
    ).catch((error) => console.error("[stripe payout] paid notify failed", { txId, error }));

    console.log("[withdrawal] marked paid", {
      txId,
      provider: "stripe",
      payoutId: payout.id,
      eventType,
    });
    return;
  }

  const failureReason =
    stringFrom((payout as unknown as Record<string, unknown>).failure_message)
    ?? stringFrom((payout as unknown as Record<string, unknown>).failure_code)
    ?? "Stripe payout failed";

  const amount = Math.abs(Number(tx.amount ?? 0));
  const transferId = stringFrom(payout.metadata?.transfer_id) ?? stringFrom(tx.provider_transfer_id);

  if (transferId) {
    try {
      await getStripe().transfers.createReversal(
        transferId,
        {
          metadata: {
            wallet_transaction_id: txId,
            reason: "payout_failed_webhook",
          },
        },
        {
          idempotencyKey: `wallet_withdrawal_webhook_transfer_reversal:${txId}`,
        },
      );

      await supabase.rpc("fail_wallet_withdrawal", {
        p_transaction_id: txId,
        p_reason: `Stripe payout failed and transfer was reversed: ${failureReason}`,
        p_provider_status: "failed",
      });

      await supabase
        .from("wallet_transactions")
        .update({
          provider_transfer_id: transferId,
          provider_payout_id: payout.id,
          failure_reason: failureReason,
          needs_admin_review: false,
        })
        .eq("id", txId);

      await notify(
        tx.user_id,
        "payment",
        `Seu saque de ${formatBrl(amount)} falhou no Stripe e o saldo foi restaurado na carteira.`,
        financesPath,
        `wallet-withdrawal-failed-stripe:${txId}`,
      ).catch((error) => console.error("[stripe payout] failed notify user failed", { txId, error }));

      await notifyAdmins(
        "payment",
        `Falha em saque Stripe com saldo restaurado: ${formatBrl(amount)}`,
        "/admin/finances",
        `admin-stripe-withdrawal-failed:${txId}`,
      ).catch((error) => console.error("[stripe payout] failed notify admin failed", { txId, error }));

      console.log("[withdrawal] failed", {
        txId,
        provider: "stripe",
        payoutId: payout.id,
        transferId,
        reason: failureReason,
        eventType,
      });
      return;
    } catch (reversalError) {
      const reversalMessage = reversalError instanceof Error ? reversalError.message : String(reversalError);

      await supabase
        .from("wallet_transactions")
        .update({
          status: "failed",
          provider: "stripe",
          provider_status: "failed",
          provider_transfer_id: transferId,
          provider_payout_id: payout.id,
          processed_at: new Date().toISOString(),
          failure_reason: `${failureReason}. Reversal error: ${reversalMessage}`,
          admin_note: `Stripe payout falhou apos a transferencia. Reconciliacao manual necessaria. Reversal error: ${reversalMessage}`,
          needs_admin_review: true,
        })
        .eq("id", txId);

      await notifyAdmins(
        "payment",
        `Saque Stripe exige reconciliacao manual: ${formatBrl(amount)}`,
        "/admin/finances",
        `admin-stripe-withdrawal-review:${txId}`,
      ).catch((error) => console.error("[stripe payout] review notify admin failed", { txId, error }));

      console.log("[withdrawal stripe] failed after transfer needs review", {
        txId,
        provider: "stripe",
        payoutId: payout.id,
        transferId,
        reason: failureReason,
        reversalError: reversalMessage,
        eventType,
      });
      return;
    }
  }

  await supabase
    .from("wallet_transactions")
    .update({
      status: "failed",
      provider: "stripe",
      provider_status: "failed",
      provider_payout_id: payout.id,
      processed_at: new Date().toISOString(),
      failure_reason: failureReason,
      admin_note: "Stripe payout falhou sem transfer_id rastreavel. Reconciliacao manual necessaria.",
      needs_admin_review: true,
    })
    .eq("id", txId);

  await notifyAdmins(
    "payment",
    `Saque Stripe sem transfer_id exige revisao: ${formatBrl(amount)}`,
    "/admin/finances",
    `admin-stripe-withdrawal-missing-transfer:${txId}`,
  ).catch((error) => console.error("[stripe payout] missing transfer notify admin failed", { txId, error }));
}

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    if (!isStripeConfigured()) {
      console.error("Missing STRIPE_SECRET_KEY");
      return new Response("Server misconfigured", { status: 500 });
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
    let shouldMarkProcessed = true;

    if (await hasProcessedEvent(supabase, event.id)) {
      console.log("[stripe webhook] duplicate event skipped", { eventId: event.id, type: event.type });
      return NextResponse.json({ ok: true, duplicate: true });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const type = session.metadata?.type;

        console.log("[stripe webhook] checkout.session.completed", { type, sessionId: session.id });

        if (type === "wallet_deposit") {
          const walletCredited = await handleWalletDeposit(supabase, session);
          if (!walletCredited) {
            shouldMarkProcessed = false;
            console.error("[stripe deposit] CRITICAL credit failed, event not marked processed", {
              eventId: event.id,
              sessionId: session.id,
              transactionId: session.metadata?.wallet_transaction_id ?? null,
            });
          }
        } else if (type === "contract_funding") {
          await handleContractFunding(supabase, session);
        } else if (type === "plan_subscription") {
          await handlePlanCheckout(supabase, session);
        } else {
          console.log("[stripe webhook] checkout.session.completed unhandled type", { type, sessionId: session.id });
        }
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.paid":
        await handleInvoicePaid(supabase, event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(supabase, event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription);
        break;

      case "account.updated":
        await handleConnectAccountUpdated(supabase, event.data.object as Stripe.Account);
        break;

      case "payout.created":
      case "payout.updated":
      case "payout.paid":
      case "payout.failed":
        await handleStripePayoutEvent(supabase, event.data.object as Stripe.Payout, event.type);
        break;

      default:
        break;
    }

    if (shouldMarkProcessed) {
      await markEventProcessed(supabase, event);
    }

    return NextResponse.json({ ok: true, processed: shouldMarkProcessed });
  } catch (err) {
    console.error("[stripe webhook] global handler error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ ok: true, recovered: true });
  }
}
