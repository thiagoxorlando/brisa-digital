import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, CustomerCard } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { ensureMpCustomer } from "@/lib/mpCustomer";

// POST /api/payments/card/save
// Body: { token, payment_method_id, holder_name, expiry_month, expiry_year,
//         holder_document_type, holder_document_number }
//
// `token` is the single-use card token created by MP.js on the frontend.
// We never see or store the raw card number or CVV.
//
// Returns: { card: SavedCard }

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    token,
    payment_method_id,
    last_four,
    holder_name,
    expiry_month,
    expiry_year,
    holder_document_type,
    holder_document_number,
  } = body;

  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN!;
  const supabase    = createServerClient({ useServiceRole: true });

  // Ensure MP customer exists
  const email      = user.email ?? "user@brisadigital.com";
  const customerId = await ensureMpCustomer(user.id, email);

  // Associate card token with MP customer → creates a saved card
  const client     = new MercadoPagoConfig({ accessToken });
  const cardClient = new CustomerCard(client);

  let mpCard;
  try {
    mpCard = await cardClient.create({
      customerId,
      body: { token },
    });
  } catch (err) {
    console.error("[card/save] MP CustomerCard.create failed:", err);
    return NextResponse.json({ error: "Failed to save card with Mercado Pago" }, { status: 502 });
  }

  // Resolve metadata — prefer values from MP response, fall back to client-provided
  const brand      = (mpCard.payment_method as { id?: string } | undefined)?.id ?? payment_method_id ?? null;
  const lastFour   = mpCard.last_four_digits ?? last_four ?? null;
  const cardHolder = (mpCard.cardholder as { name?: string } | undefined)?.name ?? holder_name ?? null;
  const expMonth   = mpCard.expiration_month ?? expiry_month ?? null;
  const expYear    = mpCard.expiration_year  ?? expiry_year  ?? null;

  // Persist to DB (no raw card data — only MP references + display metadata + document)
  const { data: saved, error: insertErr } = await supabase
    .from("saved_cards")
    .insert({
      user_id:                user.id,
      mp_customer_id:         customerId,
      mp_card_id:             mpCard.id!,
      brand,
      last_four:              lastFour,
      holder_name:            cardHolder,
      expiry_month:           expMonth,
      expiry_year:            expYear,
      holder_document_type:   holder_document_type   ?? null,
      holder_document_number: holder_document_number ?? null,
    })
    .select("id, brand, last_four, holder_name, expiry_month, expiry_year, created_at")
    .single();

  if (insertErr) {
    console.error("[card/save] DB insert failed:", insertErr.message);
    return NextResponse.json({ error: "Failed to persist card" }, { status: 500 });
  }

  return NextResponse.json({ card: saved });
}
