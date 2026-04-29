import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripeCustomer";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// POST /api/contracts/[id]/stripe-checkout
// Funds a signed job contract through Stripe Checkout.
// This does not transfer funds to the talent. It only funds escrow; agency
// release later credits the talent's internal wallet.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "agency") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: contract, error: contractErr } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, job_id, job_description, payment_amount, status, stripe_payment_intent_id")
    .eq("id", id)
    .single();

  if (contractErr || !contract) {
    return NextResponse.json({ error: "Contrato nao encontrado." }, { status: 404 });
  }

  if (contract.agency_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (contract.status === "confirmed" && contract.stripe_payment_intent_id) {
    return NextResponse.json({ error: "Contrato ja financiado." }, { status: 409 });
  }

  if (contract.status !== "signed") {
    return NextResponse.json(
      { error: `Contrato nao esta pronto para pagamento (status: ${contract.status}).` },
      { status: 400 },
    );
  }

  const amount = Number(contract.payment_amount ?? 0);
  const amountInCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amountInCents <= 0) {
    return NextResponse.json({ error: "Valor do contrato invalido." }, { status: 400 });
  }

  let lineItemName = contract.job_description?.slice(0, 120) ?? "Job BrisaHub";
  if (contract.job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", contract.job_id)
      .maybeSingle();
    if (job?.title) lineItemName = job.title;
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email ?? user.email ?? null;
  const customerId = await getOrCreateStripeCustomer(supabase, user.id, email);

  const checkoutSession = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: amountInCents,
          product_data: { name: lineItemName },
        },
      },
    ],
    metadata: {
      type: "contract_funding",
      contract_id: contract.id,
      agency_id: contract.agency_id,
      talent_id: contract.talent_id ?? "",
      job_id: contract.job_id ?? "",
      amount: amount.toFixed(2),
    },
    payment_intent_data: {
      metadata: {
        type: "contract_funding",
        contract_id: contract.id,
        agency_id: contract.agency_id,
        talent_id: contract.talent_id ?? "",
        job_id: contract.job_id ?? "",
      },
    },
    success_url: `${APP_URL}/agency/bookings?stripe_contract=success`,
    cancel_url: `${APP_URL}/agency/bookings?stripe_contract=cancel`,
  });

  await supabase
    .from("contracts")
    .update({
      payment_provider: "stripe",
      stripe_checkout_session_id: checkoutSession.id,
    })
    .eq("id", contract.id);

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Stripe nao retornou URL de pagamento." }, { status: 500 });
  }

  console.log("[stripe contract funding] checkout created", {
    sessionId: checkoutSession.id,
    contractId: contract.id,
    amount,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
