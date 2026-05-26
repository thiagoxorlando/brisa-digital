import { createServerClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createServerClient>;

const FULL_PROFILE_SELECT = [
  "plan",
  "plan_status",
  "plan_expires_at",
  "asaas_customer_id",
  "asaas_subscription_id",
  "trial_started_at",
  "trial_ends_at",
  "subscription_provider",
].join(", ");

const LEGACY_PROFILE_SELECT = [
  "plan",
  "plan_status",
  "plan_expires_at",
  "asaas_customer_id",
  "asaas_subscription_id",
].join(", ");

const LEGACY_SAFE_UPDATE_KEYS = new Set([
  "plan",
  "plan_status",
  "plan_expires_at",
  "asaas_customer_id",
  "asaas_subscription_id",
]);

const PLAN_PAYMENT_SUCCESS_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

export type AgencySubscriptionProfile = {
  plan: string | null;
  plan_status: string | null;
  plan_expires_at: string | null;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_provider: string | null;
};

export type AsaasPlanPayment = {
  id: string;
  status?: string;
  value: number;
  customer?: string;
  dueDate?: string;
  externalReference?: string;
  subscription?: string;
  subscriptionId?: string;
};

function findPlanChargeStatusForAsaasEvent(event: string) {
  switch (event) {
    case "PAYMENT_OVERDUE":
      return "overdue";
    case "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED":
      return "failed";
    default:
      return "pending";
  }
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = String(error?.message ?? "");
  if (!message.includes("does not exist")) return false;
  // SELECT format: "column profiles.trial_started_at does not exist"
  // UPDATE format: "column \"trial_started_at\" of relation \"profiles\" does not exist"
  return message.includes("profiles");
}

function toProfileRow(row: Record<string, unknown> | null | undefined): AgencySubscriptionProfile | null {
  if (!row) return null;
  return {
    plan: (row.plan as string | null) ?? null,
    plan_status: (row.plan_status as string | null) ?? null,
    plan_expires_at: (row.plan_expires_at as string | null) ?? null,
    asaas_customer_id: (row.asaas_customer_id as string | null) ?? null,
    asaas_subscription_id: (row.asaas_subscription_id as string | null) ?? null,
    trial_started_at: ("trial_started_at" in row ? (row.trial_started_at as string | null) : null) ?? null,
    trial_ends_at: ("trial_ends_at" in row ? (row.trial_ends_at as string | null) : null) ?? null,
    subscription_provider: ("subscription_provider" in row ? (row.subscription_provider as string | null) : null) ?? null,
  };
}

function buildLegacySafePatch(patch: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => LEGACY_SAFE_UPDATE_KEYS.has(key)),
  );
}

function computePlanExpiresAt(dueDate: string | undefined) {
  if (!dueDate) return null;
  const nextChargeDate = new Date(dueDate);
  if (Number.isNaN(nextChargeDate.getTime())) return null;
  nextChargeDate.setMonth(nextChargeDate.getMonth() + 1);
  return nextChargeDate.toISOString();
}

export function isAsaasPlanPaymentConfirmed(status: string | undefined | null) {
  return PLAN_PAYMENT_SUCCESS_STATUSES.has(String(status ?? "").toUpperCase());
}

export function parsePlanExternalReference(externalReference: string | undefined | null) {
  const extRef = String(externalReference ?? "");
  if (!extRef.startsWith("plan:")) return null;

  const [, rawPlanKey, userId] = extRef.split(":");
  const planKey = rawPlanKey === "premium" ? "premium" : rawPlanKey === "pro" ? "pro" : null;

  if (!planKey || !userId) return null;

  return { extRef, planKey, userId };
}

export async function fetchAgencySubscriptionProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<AgencySubscriptionProfile | null> {
  const full = await supabase
    .from("profiles")
    .select(FULL_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (!full.error) {
    return toProfileRow(full.data as Record<string, unknown> | null);
  }

  if (!isMissingColumnError(full.error)) {
    throw full.error;
  }

  const fallback = await supabase
    .from("profiles")
    .select(LEGACY_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (fallback.error) throw fallback.error;

  return toProfileRow(fallback.data as Record<string, unknown> | null);
}

export async function updateAgencySubscriptionProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
) {
  const fullUpdate = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("id")
    .single();

  if (!fullUpdate.error) {
    return { usedLegacyFallback: false as const };
  }

  if (!isMissingColumnError(fullUpdate.error)) {
    throw fullUpdate.error;
  }

  const legacyPatch = buildLegacySafePatch(patch);
  const fallbackUpdate = await supabase
    .from("profiles")
    .update(legacyPatch)
    .eq("id", userId)
    .select("id")
    .single();

  if (fallbackUpdate.error) throw fallbackUpdate.error;

  return { usedLegacyFallback: true as const };
}

export async function syncAgencyLegacySubscriptionStatus(
  supabase: SupabaseClient,
  agencyId: string,
  status: string,
) {
  const result = await supabase
    .from("agencies")
    .update({ subscription_status: status } as Record<string, unknown>)
    .eq("id", agencyId)
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }
}

export async function startAgencyPlanTrial(params: {
  supabase: SupabaseClient;
  userId: string;
  planKey: "pro" | "premium";
  customerId: string;
  subscriptionId: string;
  paymentId?: string;
  paymentValue: number;
  trialStartedAt: string;
  trialEndsAt: string;
}) {
  const {
    supabase,
    userId,
    planKey,
    customerId,
    subscriptionId,
    paymentId,
    paymentValue,
    trialStartedAt,
    trialEndsAt,
  } = params;

  const planLabel = planKey === "premium" ? "Premium" : "PRO";

  await updateAgencySubscriptionProfile(supabase, userId, {
    plan: planKey,
    plan_status: "trialing",
    plan_expires_at: trialEndsAt,
    asaas_customer_id: customerId,
    asaas_subscription_id: subscriptionId,
    subscription_provider: "asaas",
    trial_started_at: trialStartedAt,
    trial_ends_at: trialEndsAt,
  });
  await syncAgencyLegacySubscriptionStatus(supabase, userId, "trialing");

  if (!paymentId) {
    return;
  }

  const { data: existingCharge, error: chargeLookupError } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("payment_id", paymentId)
    .eq("type", "plan_charge")
    .maybeSingle();

  if (chargeLookupError) throw chargeLookupError;

  if (existingCharge) {
    const { error: chargeUpdateError } = await supabase
      .from("wallet_transactions")
      .update({
        status: "pending",
        amount: paymentValue,
        provider: "asaas",
      } as Record<string, unknown>)
      .eq("id", existingCharge.id);

    if (chargeUpdateError) throw chargeUpdateError;
    return;
  }

  const { error: chargeInsertError } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id: userId,
      type: "plan_charge",
      amount: paymentValue,
      status: "pending",
      payment_id: paymentId,
      description: `Assinatura ${planLabel} - BrisaHub`,
      provider: "asaas",
    } as Record<string, unknown>);

  if (chargeInsertError && chargeInsertError.code !== "23505") {
    throw chargeInsertError;
  }
}

export async function syncAgencyPlanPaymentIssue(params: {
  supabase: SupabaseClient;
  payment: AsaasPlanPayment;
  event: "PAYMENT_OVERDUE" | "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED";
}) {
  const { supabase, payment, event } = params;
  const parsed = parsePlanExternalReference(payment.externalReference);

  if (!parsed) {
    return { ok: false as const, reason: "missing_plan_reference" as const };
  }

  await updateAgencySubscriptionProfile(supabase, parsed.userId, {
    plan: parsed.planKey,
    plan_status: "past_due",
    asaas_customer_id: payment.customer ?? null,
    asaas_subscription_id: payment.subscriptionId ?? payment.subscription ?? null,
    subscription_provider: "asaas",
  });
  await syncAgencyLegacySubscriptionStatus(supabase, parsed.userId, "past_due");

  const { data: existingCharge, error: chargeLookupError } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("payment_id", payment.id)
    .eq("type", "plan_charge")
    .maybeSingle();

  if (chargeLookupError) throw chargeLookupError;

  const nextStatus = findPlanChargeStatusForAsaasEvent(event);

  if (existingCharge) {
    const { error: chargeUpdateError } = await supabase
      .from("wallet_transactions")
      .update({
        status: nextStatus,
        provider: "asaas",
      } as Record<string, unknown>)
      .eq("id", existingCharge.id);

    if (chargeUpdateError) throw chargeUpdateError;
  }

  return {
    ok: true as const,
    ...parsed,
    paymentId: payment.id,
    planStatus: "past_due" as const,
    chargeStatus: nextStatus,
  };
}

export async function syncAgencyPlanFromAsaasPayment(params: {
  supabase: SupabaseClient;
  payment: AsaasPlanPayment;
  now?: string;
}) {
  const { supabase, payment } = params;
  const now = params.now ?? new Date().toISOString();
  const parsed = parsePlanExternalReference(payment.externalReference);

  if (!parsed) {
    return { ok: false as const, reason: "missing_plan_reference" as const };
  }

  if (!isAsaasPlanPaymentConfirmed(payment.status)) {
    return {
      ok: false as const,
      reason: "payment_not_confirmed" as const,
      paymentStatus: String(payment.status ?? ""),
      ...parsed,
    };
  }

  const planLabel = parsed.planKey === "premium" ? "Premium" : "PRO";
  const profilePatch: Record<string, unknown> = {
    plan: parsed.planKey,
    plan_status: "active",
    plan_expires_at: computePlanExpiresAt(payment.dueDate),
    asaas_customer_id: payment.customer ?? null,
    asaas_subscription_id: payment.subscriptionId ?? payment.subscription ?? null,
    subscription_provider: "asaas",
    trial_started_at: null,
    trial_ends_at: null,
  };

  await updateAgencySubscriptionProfile(supabase, parsed.userId, profilePatch);
  await syncAgencyLegacySubscriptionStatus(supabase, parsed.userId, "active");

  const { data: existingCharge, error: chargeLookupError } = await supabase
    .from("wallet_transactions")
    .select("id, status")
    .eq("payment_id", payment.id)
    .eq("type", "plan_charge")
    .maybeSingle();

  if (chargeLookupError) throw chargeLookupError;

  if (existingCharge) {
    if (existingCharge.status !== "paid") {
      const { error: chargeUpdateError } = await supabase
        .from("wallet_transactions")
        .update({
          status: "paid",
          processed_at: now,
          provider: "asaas",
        } as Record<string, unknown>)
        .eq("id", existingCharge.id);

      if (chargeUpdateError) throw chargeUpdateError;
    }
  } else {
    const { error: chargeInsertError } = await supabase
      .from("wallet_transactions")
      .insert({
        user_id: parsed.userId,
        type: "plan_charge",
        amount: payment.value,
        status: "paid",
        payment_id: payment.id,
        description: `Assinatura ${planLabel} - BrisaHub`,
        provider: "asaas",
        processed_at: now,
      } as Record<string, unknown>);

    if (chargeInsertError && chargeInsertError.code !== "23505") {
      throw chargeInsertError;
    }
  }

  return {
    ok: true as const,
    ...parsed,
    paymentId: payment.id,
    paymentStatus: String(payment.status ?? ""),
    planExpiresAt: profilePatch.plan_expires_at as string | null,
  };
}
