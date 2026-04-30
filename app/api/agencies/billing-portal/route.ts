import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// POST /api/agencies/billing-portal
// Opens the Stripe Customer Portal so agencies can update card/cancel/manage billing.
export async function POST() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  if (!isStripeConfigured()) {
    console.error("[billing portal] Stripe not configured");
    return NextResponse.json({ error: "Stripe nao configurado no servidor." }, { status: 503 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("[billing portal] profile query failed", { userId: user.id, error: error.message });
    return NextResponse.json({ error: "Erro ao verificar perfil." }, { status: 500 });
  }

  if (profile?.role !== "agency") {
    return NextResponse.json({ error: "Apenas agencias podem gerenciar cobranca." }, { status: 403 });
  }

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "Nenhum cliente Stripe encontrado para esta agencia." }, { status: 400 });
  }

  try {
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${APP_URL}/agency/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[billing portal] stripe portal session create failed", {
      userId: user.id,
      customerId: profile.stripe_customer_id,
      error: message,
    });
    return NextResponse.json({ error: "Nao foi possivel abrir o portal Stripe." }, { status: 500 });
  }
}
