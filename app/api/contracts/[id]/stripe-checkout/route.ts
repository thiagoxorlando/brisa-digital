import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Statuses from which an agency can initiate a Stripe Checkout payment.
// 'signed' = talent accepted, agency deposit not yet paid (escrow step).
// 'confirmed' = escrow paid; also accepted so the agency can pay again if needed.
const PAYABLE_STATUSES = ["signed", "confirmed"] as const;

// POST /api/contracts/[id]/stripe-checkout
// Creates a Stripe Checkout session for the contract's gross amount.
// Does NOT touch wallet_balance or payout logic — that is handled by webhooks later.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  // Require agency role.
  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "agency") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch contract.
  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, job_id, job_description, payment_amount, status")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  // Only the owning agency may pay.
  if (contract.agency_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate payable state.
  if (!PAYABLE_STATUSES.includes(contract.status as typeof PAYABLE_STATUSES[number])) {
    return NextResponse.json(
      { error: `Contract is not payable (status: ${contract.status})` },
      { status: 400 }
    );
  }

  // Resolve job title for the line item name.
  let lineItemName = contract.job_description?.slice(0, 120) ?? "Contrato BrisaHub";
  if (contract.job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", contract.job_id)
      .maybeSingle();
    if (job?.title) lineItemName = job.title;
  }

  const amountCents = Math.round(Number(contract.payment_amount) * 100);
  if (amountCents <= 0) {
    return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
  }

  const checkoutSession = await getStripe().checkout.sessions.create({
    mode:                 "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency:     "brl",
          unit_amount:  amountCents,
          product_data: { name: lineItemName },
        },
      },
    ],
    metadata: {
      contract_id: contract.id,
      job_id:      contract.job_id      ?? "",
      talent_id:   contract.talent_id   ?? "",
      agency_id:   contract.agency_id   ?? "",
    },
    success_url: `${APP_URL}/agency/contracts?stripe_success=1`,
    cancel_url:  `${APP_URL}/agency/contracts?stripe_cancel=1`,
  });

  console.log("[stripe checkout created]", {
    session_id:  checkoutSession.id,
    contract_id: contract.id,
    amount_brl:  contract.payment_amount,
    amount_cents: amountCents,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
