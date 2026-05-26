import type { Metadata } from "next";
import Link from "next/link";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { fetchAgencySubscriptionProfile } from "@/lib/asaasPlanSync.server";
import BillingDashboard from "@/features/agency/BillingDashboard";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";

export const metadata: Metadata = { title: "Assinatura — BrisaHub" };

function AgentBillingScreen({ workspaceName }: { workspaceName: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <h1 className="text-[18px] font-bold text-zinc-900 mb-2">Plano gerenciado pelo proprietário</h1>
      <p className="text-[14px] text-zinc-500 max-w-sm mb-2">
        Seu acesso faz parte do Espaço Premium da agência{" "}
        <strong className="text-zinc-700">{workspaceName}</strong>.
      </p>
      <p className="text-[13px] text-zinc-400 max-w-sm">
        O plano é gerenciado pelo proprietário do workspace. Não é necessário adquirir um plano separado.
      </p>
      <Link
        href="/agency/workspace"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-semibold transition-colors"
      >
        Ir para o Espaço Premium
      </Link>
    </div>
  );
}

export default async function BillingPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const userId = user?.id ?? "";

  // Invited workspace agents should not see the owner billing dashboard
  const ws = await getUserPremiumWorkspace(userId);
  if (ws?.membership.role === "agent" && ws.membership.status === "active") {
    return <AgentBillingScreen workspaceName={ws.workspace.name} />;
  }

  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: chargeRows, error: chargeError },
    { data: webhookEvents, error: webhookError },
  ] = await Promise.all([
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
      .select("payload, created_at")
      .in("event_type", ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"])
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  let profileRow: Awaited<ReturnType<typeof fetchAgencySubscriptionProfile>> = null;
  try {
    profileRow = await fetchAgencySubscriptionProfile(supabase, userId);
  } catch (error) {
    console.error("[billing] profile load failed", {
      userId,
      err: error instanceof Error ? error.message : String(error),
    });
  }

  if (chargeError) {
    console.error("[billing] wallet_transactions query failed", { userId, err: chargeError.message });
  }
  if (webhookError) {
    console.error("[billing] asaas_webhook_events query failed", { err: webhookError.message });
  }

  const asaasCustomerId = profileRow?.asaas_customer_id ?? null;


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
    const payload = evt.payload as Record<string, unknown> | null;
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
  const planExpiresAt = profileRow?.plan_expires_at ?? null;
  const planKey       = profileRow?.plan ?? "free";

  let nextChargeDate: string | null = null;
  if (planKey !== "free" && !planExpiresAt) {
    const latestPaid = charges.find((c) => c.status === "paid");
    if (latestPaid) {
      const base = new Date(latestPaid.created_at);
      base.setMonth(base.getMonth() + 1);
      nextChargeDate = base.toISOString();
    }
  }

  const trialEndsAt = profileRow?.trial_ends_at ?? null;

  return (
    <BillingDashboard
      plan={planKey}
      planStatus={profileRow?.plan_status ?? null}
      planExpiresAt={planExpiresAt}
      planCharges={charges}
      nextChargeDate={nextChargeDate}
      trialEndsAt={trialEndsAt}
    />
  );
}
