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
  const { data: { user }, error: authErr } = await session.auth.getUser();
  if (authErr || !user) {
    console.error("[card/save] auth error:", authErr?.message);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Validate required fields
  if (!token) {
    return NextResponse.json({ error: "Token do cartão é obrigatório." }, { status: 400 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "Email do usuário não encontrado." }, { status: 400 });
  }
  if (!holder_name?.trim()) {
    return NextResponse.json({ error: "Nome do titular é obrigatório." }, { status: 400 });
  }
  if (!holder_document_type || !holder_document_number) {
    return NextResponse.json({ error: "Documento do titular é obrigatório." }, { status: 400 });
  }
  const rawDoc = String(holder_document_number).replace(/\D/g, "");
  if (!rawDoc) {
    return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("[card/save] MERCADO_PAGO_ACCESS_TOKEN not set");
    return NextResponse.json({ error: "Pagamentos não configurados." }, { status: 500 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  // Ensure MP customer exists (search-or-create, cached in profiles.mp_customer_id)
  console.log("[card/save] ensuring MP customer for user:", user.id);
  let customerId: string;
  try {
    customerId = await ensureMpCustomer(user.id, user.email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[card/save] ensureMpCustomer failed:", msg);
    return NextResponse.json({ error: "Erro ao configurar cliente de pagamento.", detail: msg }, { status: 500 });
  }
  console.log("[card/save] MP customer ready:", customerId);

  // Associate card token with MP customer
  const client     = new MercadoPagoConfig({ accessToken });
  const cardClient = new CustomerCard(client);

  console.log("[card/save] attaching card token to MP customer:", customerId);
  let mpCard;
  try {
    mpCard = await cardClient.create({
      customerId,
      body: { token },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[card/save] CustomerCard.create failed:", msg, err);
    return NextResponse.json({ error: "Erro ao salvar cartão no Mercado Pago.", detail: msg }, { status: 502 });
  }

  if (!mpCard?.id) {
    console.error("[card/save] CustomerCard.create returned no id. Response:", JSON.stringify(mpCard));
    return NextResponse.json({ error: "Resposta inválida do Mercado Pago." }, { status: 502 });
  }
  console.log("[card/save] MP card saved:", mpCard.id, "brand:", (mpCard.payment_method as { id?: string } | undefined)?.id);

  // Resolve metadata — prefer MP response, fall back to client-provided
  const brand      = (mpCard.payment_method as { id?: string } | undefined)?.id ?? payment_method_id ?? null;
  const lastFour   = mpCard.last_four_digits ?? last_four ?? null;
  const cardHolder = (mpCard.cardholder as { name?: string } | undefined)?.name ?? holder_name?.trim() ?? null;
  const expMonth   = mpCard.expiration_month ?? expiry_month ?? null;
  const expYear    = mpCard.expiration_year  ?? expiry_year  ?? null;

  // Persist to DB — no raw card data, only MP references + display metadata
  console.log("[card/save] inserting saved_card row, brand:", brand, "last_four:", lastFour);
  const { data: saved, error: insertErr } = await supabase
    .from("saved_cards")
    .insert({
      user_id:                user.id,
      mp_customer_id:         customerId,
      mp_card_id:             mpCard.id,
      brand,
      last_four:              lastFour,
      holder_name:            cardHolder,
      expiry_month:           expMonth,
      expiry_year:            expYear,
      holder_document_type:   holder_document_type ?? null,
      holder_document_number: rawDoc,
    })
    .select("id, brand, last_four, holder_name, expiry_month, expiry_year, created_at")
    .single();

  if (insertErr) {
    console.error("[card/save] DB insert failed:", insertErr.message, insertErr.code, insertErr.details);
    return NextResponse.json({ error: "Erro ao salvar cartão no banco de dados.", detail: insertErr.message }, { status: 500 });
  }
  console.log("[card/save] saved_card row created:", saved?.id);

  return NextResponse.json({ card: saved });
}
