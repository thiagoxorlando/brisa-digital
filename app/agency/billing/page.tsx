import type { Metadata } from "next";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import BillingDashboard from "@/features/agency/BillingDashboard";

export const metadata: Metadata = { title: "Assinatura — BrisaHub" };

export default async function BillingPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const userId = user?.id ?? "";

  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: profile, error: profileError },
    { data: chargeRows, error: chargeError },
    { data: webhookEvents, error: webhookError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, plan_status, plan_expires_at, asaas_customer_id")
      .eq("id", userId)
      .maybeSingle(),

    // payment_id stores Asaas payment ID — column exists since 20260417 migration.
    // Avoid selecting invoice_url / asaas_payment_id which may not exist in production.
    supabase
      .from("wallet_transactions")
      .select("id, amount, description, created_at, status, payment_id, provider")
      .eq("user_id", userId)
      .eq("type", "plan_charge")
      .order("created_at", { ascending: false })
      .limit(50),

    // Fallback: raw webhook events for plan payments.
    // Query both PAYMENT_RECEIVED and PAYMENT_CONFIRMED because either event
    // may be the first (and only) one stored for a given credit-card payment.
    supabase
      .from("asaas_webhook_events")
      .select("raw_payload, created_at")
      .in("event_type", ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"])
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (profileError) {
    console.error("[billing] profile load failed", { userId, err: profileError.message });
  }
  if (chargeError) {
    console.error("[billing] wallet_transactions query failed", { userId, err: chargeError.message });
  }
  if (webhookError) {
    console.error("[billing] asaas_webhook_events query failed", { err: webhookError.message });
  }

  const profileRow = profile as Record<string, unknown> | null;
  const asaasCustomerId = (profileRow?.asaas_customer_id as string | null) ?? null;


  type PlanCharge = {
    id: string;
    amount: number;
    description: string | null;
    created_at: string;
    status: string | null;
    asaas_payment_id: string | null;
    invoice_url: string | null;
    provider: string | null;
  };

  // Primary source: wallet_transactions with type = 'plan_charge'
  const charges: PlanCharge[] = (chargeRows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id:               String(row.id ?? ""),
      amount:           Number(row.amount ?? 0),
      description:      (row.description as string | null) ?? null,
      created_at:       String(row.created_at ?? ""),
      status:           (row.status as string | null) ?? null,
      asaas_payment_id: (row.payment_id as string | null) ?? null,  // payment_id stores Asaas ID
      invoice_url:      null,
      provider:         (row.provider as string | null) ?? "asaas",
    };
  });

  // payment_ids already captured from wallet_transactions
  const seenPaymentIds = new Set<string>(
    charges.map((c) => c.asaas_payment_id).filter((id): id is string => !!id),
  );


  // Fallback: synthesise charges from raw Asaas webhook events.
  // Match by externalReference containing userId OR by customer field matching asaas_customer_id.
  for (const evt of webhookEvents ?? []) {
    const payload = evt.raw_payload as Record<string, unknown> | null;
    const paymentRaw = payload?.payment as Record<string, unknown> | null;
    if (!paymentRaw) continue;

    const pid    = String(paymentRaw.id ?? "");
    const extRef = String(paymentRaw.externalReference ?? "");
    const cust   = String(paymentRaw.customer ?? "");

    // Skip if already covered by a wallet_transaction row
    if (!pid || seenPaymentIds.has(pid)) continue;

    // Match by externalReference (plan:{planKey}:{userId}) OR by customer ID
    const matchesByRef      = extRef.startsWith("plan:") && extRef.endsWith(`:${userId}`);
    const matchesByCustomer = asaasCustomerId && cust === asaasCustomerId;

    if (!matchesByRef && !matchesByCustomer) continue;

    // Only surface plan-related payments
    if (!extRef.startsWith("plan:") && !matchesByRef) {
      // customer match but no plan extRef — skip unless description says "plano"
      const desc = String(paymentRaw.description ?? "").toLowerCase();
      if (!desc.includes("plano")) continue;
    }

    const parts    = extRef.startsWith("plan:") ? extRef.split(":") : [];
    const planKey  = parts[1] ?? "";
    const planLabel = planKey === "premium" ? "Premium" : planKey === "pro" ? "PRO" : "Assinatura";

    charges.push({
      id:               `webhook:${pid}`,
      amount:           Number(paymentRaw.value ?? 0),
      description:      `Plano ${planLabel} - BrisaHub`,
      created_at:       String(evt.created_at ?? ""),
      status:           "paid",
      asaas_payment_id: pid,
      invoice_url:      null,
      provider:         "asaas",
    });
    seenPaymentIds.add(pid);

  }


  // Most-recent first, deduped
  charges.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Next charge date:
  //   1. Use plan_expires_at if set (authoritative).
  //   2. Otherwise derive from the latest paid charge: same day + 1 month.
  //   3. Only for active paid plans — free plan has no next charge.
  const planExpiresAt = profileRow?.plan_expires_at as string | null ?? null;
  const planKey       = profileRow?.plan as string ?? "free";

  let nextChargeDate: string | null = null;
  if (planKey !== "free" && !planExpiresAt) {
    const latestPaid = charges.find((c) => c.status === "paid");
    if (latestPaid) {
      const base = new Date(latestPaid.created_at);
      base.setMonth(base.getMonth() + 1);
      nextChargeDate = base.toISOString();
    }
  }

  return (
    <BillingDashboard
      plan={planKey}
      planStatus={profileRow?.plan_status as string | null ?? null}
      planExpiresAt={planExpiresAt}
      planCharges={charges}
      nextChargeDate={nextChargeDate}
    />
  );
}
