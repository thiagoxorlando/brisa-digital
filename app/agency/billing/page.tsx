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
    { data: chargeRows },
    { data: webhookEvents },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, plan_status, plan_expires_at")
      .eq("id", userId)
      .maybeSingle(),

    // Dedicated plan-charge rows written by checkout + webhook
    supabase
      .from("wallet_transactions")
      .select("id, amount, description, created_at, status, asaas_payment_id, invoice_url, provider")
      .eq("user_id", userId)
      .eq("type", "plan_charge")
      .order("created_at", { ascending: false })
      .limit(50),

    // Fallback: raw webhook events for PAYMENT_CONFIRMED with plan externalReference.
    // Used to surface the charge that activated the plan before the wallet_transaction fix.
    supabase
      .from("asaas_webhook_events")
      .select("raw_payload, created_at")
      .eq("event_type", "PAYMENT_CONFIRMED")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (profileError) {
    console.error("[agency billing] failed to load core profile", {
      userId,
      error: profileError.message,
    });
  }

  // Build plan charge list: wallet_transactions are the primary source.
  // Supplement with any confirmed webhook events for this user that aren't
  // already represented (matched by asaas_payment_id).
  const seenPaymentIds = new Set<string>(
    (chargeRows ?? [])
      .map((r) => (r as Record<string, unknown>).asaas_payment_id as string | null)
      .filter((id): id is string => !!id),
  );

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

  const charges: PlanCharge[] = (chargeRows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id:               String(row.id ?? ""),
      amount:           Number(row.amount ?? 0),
      description:      (row.description as string | null) ?? null,
      created_at:       String(row.created_at ?? ""),
      status:           (row.status as string | null) ?? null,
      asaas_payment_id: (row.asaas_payment_id as string | null) ?? null,
      invoice_url:      (row.invoice_url as string | null) ?? null,
      provider:         (row.provider as string | null) ?? "asaas",
    };
  });

  // Supplement from webhook events for charges that pre-date the wallet_transaction fix
  for (const evt of webhookEvents ?? []) {
    const payload = evt.raw_payload as Record<string, unknown> | null;
    const paymentRaw = payload?.payment as Record<string, unknown> | null;
    if (!paymentRaw) continue;

    const extRef = String(paymentRaw.externalReference ?? "");
    if (!extRef.startsWith(`plan:`) || !extRef.endsWith(`:${userId}`)) continue;

    const pid = String(paymentRaw.id ?? "");
    if (!pid || seenPaymentIds.has(pid)) continue;

    const parts = extRef.split(":");
    const planKey = parts[1] ?? "";
    const planLabel = planKey === "premium" ? "Premium" : "PRO";

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

  // Keep most-recent first
  charges.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <BillingDashboard
      plan={profile?.plan ?? "free"}
      planStatus={profile?.plan_status ?? null}
      planExpiresAt={(profile as Record<string, unknown> | null)?.plan_expires_at as string | null ?? null}
      planCharges={charges}
    />
  );
}
