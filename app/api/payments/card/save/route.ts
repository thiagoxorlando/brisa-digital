import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, CustomerCard } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { ensureMpCustomer, MpCustomerError } from "@/lib/mpCustomer";

// MP SDK throws parsed JSON objects, not Error instances.
// Shape: { message?, error?, status?, cause?: [{ code, description }] }
function extractMpError(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as Record<string, unknown>;
  const causeDesc = Array.isArray(e.cause)
    ? (e.cause[0] as Record<string, unknown> | undefined)?.description
    : undefined;
  return String(e.message ?? causeDesc ?? e.error ?? JSON.stringify(e));
}

function mpErrorStatus(err: unknown): number {
  if (err && typeof err === "object") {
    const s = (err as Record<string, unknown>).status;
    if (typeof s === "number" && s >= 400 && s < 600) return s;
  }
  return 502;
}

// POST /api/payments/card/save
// Body: { token, payment_method_id, holder_name, expiry_month, expiry_year,
//         holder_document_type, holder_document_number }
//
// `token` is the single-use card token created by MP.js on the frontend.
// We never see or store the raw card number or CVV.
//
// Document fields are required for MP Brazil tokenization but are NOT forwarded
// to Customer.create or CustomerCard.create — only to Payment.create charges.
//
// Returns: { card: SavedCard }

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user }, error: authErr } = await session.auth.getUser();
  if (authErr || !user) {
    console.error("[card/save] auth error:", authErr?.message);
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
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

  // ── Step 1: Ensure MP customer (search-or-create, cached in profiles) ─────────
  console.log("[card/save] step=customer_setup user:", user.id, "email:", user.email);
  let customerId: string;
  try {
    customerId = await ensureMpCustomer(user.id, user.email);
  } catch (err) {
    const step   = err instanceof MpCustomerError ? err.step : "customer_setup_failed";
    const detail = err instanceof Error ? err.message : extractMpError(err);
    console.error("[card/save] customer setup failed — step:", step, "detail:", detail);
    return NextResponse.json({ error: "Erro ao configurar cliente de pagamento.", step, detail }, { status: 500 });
  }
  console.log("[card/save] step=customer_setup ok, customerId:", customerId);

  // ── Step 2: Attach card token to MP customer ──────────────────────────────────
  // CustomerCard.create body accepts only { token } — document/name are not
  // passed here; they belong to Payment.create payer.identification at charge time.
  const mpClient   = new MercadoPagoConfig({ accessToken });
  const cardClient = new CustomerCard(mpClient);

  console.log("[card/save] step=card_attach customerId:", customerId, "token length:", token?.length);
  let mpCard;
  try {
    mpCard = await cardClient.create({ customerId, body: { token } });
  } catch (err) {
    const detail  = extractMpError(err);
    const mpStatus = mpErrorStatus(err);
    console.error("[card/save] step=card_attach_failed mpStatus:", mpStatus, "detail:", detail, "raw:", JSON.stringify(err));
    return NextResponse.json({ error: "Erro ao salvar cartão no Mercado Pago.", step: "card_attach_failed", detail }, { status: mpStatus });
  }

  if (!mpCard?.id) {
    const raw = JSON.stringify(mpCard);
    console.error("[card/save] step=card_attach returned no id. Response:", raw);
    return NextResponse.json({ error: "Resposta inválida do Mercado Pago.", step: "card_attach_failed", detail: raw }, { status: 502 });
  }
  console.log("[card/save] step=card_attach ok, mpCard.id:", mpCard.id,
    "brand:", (mpCard.payment_method as { id?: string } | undefined)?.id,
    "last_four:", mpCard.last_four_digits);

  // Resolve display metadata — MP response preferred, client values as fallback
  const brand      = (mpCard.payment_method as { id?: string } | undefined)?.id ?? payment_method_id ?? null;
  const lastFour   = mpCard.last_four_digits ?? last_four ?? null;
  const cardHolder = (mpCard.cardholder as { name?: string } | undefined)?.name ?? holder_name?.trim() ?? null;
  const expMonth   = mpCard.expiration_month ?? expiry_month ?? null;
  const expYear    = mpCard.expiration_year  ?? expiry_year  ?? null;

  // ── Step 3: Persist safe metadata to saved_cards ─────────────────────────────
  console.log("[card/save] step=db_insert brand:", brand, "last_four:", lastFour);
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
    console.error("[card/save] step=saved_card_insert_failed:", insertErr.message, insertErr.code, insertErr.details);
    return NextResponse.json({ error: "Erro ao salvar cartão.", step: "saved_card_insert_failed", detail: insertErr.message }, { status: 500 });
  }
  console.log("[card/save] step=db_insert ok, saved_card id:", saved?.id);

  return NextResponse.json({ card: saved });
}
