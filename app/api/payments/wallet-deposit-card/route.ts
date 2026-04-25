import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Payment, CardToken } from "mercadopago";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { notifyAdmins } from "@/lib/notify";
import { calcFeeBreakdown, CARD_FEE_RATE } from "@/lib/mp-fees";

// POST /api/payments/wallet-deposit-card
// Body: { card_id: string (DB uuid), amount: number, security_code: string }
// Charges a saved card and credits the agency's platform wallet balance.
// Returns: { success: true, amount, fee, totalCharged }

// ── MP error helpers ──────────────────────────────────────────────────────────
// MP SDK throws parsed JSON objects, not Error instances.
// Shape: { message?, error?, status?, cause?: [{ code, description }] }

type MpCause = { code: number; description: string };
type MpErrorInfo = {
  message:      string;
  httpStatus:   number;
  statusDetail: string | undefined;
  causes:       MpCause[];
};

function extractMpErrorDetails(err: unknown): MpErrorInfo {
  if (!err || typeof err !== "object") {
    return { message: String(err), httpStatus: 502, statusDetail: undefined, causes: [] };
  }
  const e = err as Record<string, unknown>;
  const causes: MpCause[] = Array.isArray(e.cause)
    ? (e.cause as Array<Record<string, unknown>>).map((c) => ({
        code:        Number(c.code ?? 0),
        description: String(c.description ?? ""),
      }))
    : [];
  return {
    message:      String(e.message ?? e.error ?? causes[0]?.description ?? "unknown"),
    httpStatus:   typeof e.status === "number" && e.status >= 400 ? e.status : 502,
    statusDetail: e.status_detail ? String(e.status_detail) : undefined,
    causes,
  };
}

function mapPaymentError(msg: string, statusDetail?: string, causes: MpCause[] = []): string {
  const corpus = [msg, statusDetail ?? "", ...causes.map((c) => c.description)]
    .join(" ")
    .toLowerCase();
  if (corpus.includes("cc_rejected_high_risk"))
    return "Pagamento recusado por segurança. Tente outro cartão ou outra forma de pagamento.";
  if (
    corpus.includes("invalid_user_identification") ||
    corpus.includes("invalid identification")      ||
    corpus.includes("identification number")
  )
    return "CPF/CNPJ inválido. Verifique os dados do titular do cartão.";
  if (corpus.includes("not_result_by_params"))
    return "Pagamento não aprovado com os dados informados. Verifique CPF, CVV, cartão e tente outro método.";
  return "Pagamento falhou. Tente novamente.";
}

function mapRejectedDetail(statusDetail: string | undefined): string {
  const d = (statusDetail ?? "").toLowerCase();
  if (d.includes("cc_rejected_high_risk"))
    return "Pagamento recusado por segurança. Tente outro cartão ou outra forma de pagamento.";
  if (d.includes("invalid_user_identification") || d.includes("invalid identification"))
    return "CPF/CNPJ inválido. Verifique os dados do titular do cartão.";
  if (d.includes("not_result_by_params"))
    return "Pagamento não aprovado com os dados informados. Verifique CPF, CVV, cartão e tente outro método.";
  if (d.includes("cc_rejected_bad_filled_security_code"))
    return "CVV inválido ou ausente. Verifique o código do cartão e tente novamente.";
  if (d.includes("cc_rejected_insufficient_amount"))
    return "Saldo insuficiente no cartão.";
  return "Pagamento recusado pela operadora.";
}

// ── Temporary launch gate — card deposits disabled until MP integration is stable ──
// To re-enable: remove the early return below.
const CARD_DEPOSITS_ENABLED = false;

export async function POST(req: NextRequest) {
  if (!CARD_DEPOSITS_ENABLED) {
    return NextResponse.json(
      { error: "Depósito por cartão temporariamente indisponível. Use PIX." },
      { status: 503 },
    );
  }

  const session = await createSessionClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body         = await req.json();
  const cardId       = body.card_id as string | undefined;
  const numAmount    = Number(body.amount);
  const rawCvv       = String(body.security_code ?? "").replace(/\D/g, "");

  if (!cardId) return NextResponse.json({ error: "card_id é obrigatório." }, { status: 400 });
  if (!numAmount || numAmount <= 0) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  if (rawCvv.length < 3 || rawCvv.length > 4) {
    return NextResponse.json({ error: "CVV inválido ou ausente. Verifique o código do cartão e tente novamente." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "agency") {
    return NextResponse.json({ error: "Apenas agencias podem depositar na carteira da plataforma." }, { status: 403 });
  }

  // Verify the card belongs to this user; fetch all fields needed for Payment.create
  const { data: card, error: cardErr } = await supabase
    .from("saved_cards")
    .select("id, mp_card_id, mp_customer_id, brand, last_four, issuer_id, holder_document_type, holder_document_number")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .single();

  if (cardErr || !card) {
    return NextResponse.json({ error: "Cartão não encontrado." }, { status: 404 });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "Pagamentos não configurados." }, { status: 500 });
  }

  // Resolve agency name for MP charge description
  const { data: agency } = await supabase
    .from("agencies")
    .select("company_name")
    .eq("id", user.id)
    .single();
  const agencyName = agency?.company_name ?? null;

  // Fee breakdown — when CARD_FEE_RATE = 0, totalCharged = numAmount
  const { creditAmount, fee, totalCharged } = calcFeeBreakdown(numAmount, CARD_FEE_RATE);

  // Pre-insert a pending transaction as the stable idempotency anchor
  const { data: txRecord, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id:     user.id,
      type:        "deposit",
      amount:      creditAmount,
      description: "Depósito via cartão — aguardando confirmação",
    })
    .select("id")
    .single();

  if (txErr || !txRecord) {
    console.error("[wallet-deposit-card] pre-insert tx error:", txErr);
    return NextResponse.json({ error: "Erro ao criar registro de depósito." }, { status: 500 });
  }

  const mpClient = new MercadoPagoConfig({ accessToken });

  // ── Step 1: Tokenize saved card + CVV ────────────────────────────────────────
  // security_code must be included so the token carries CVV validation.
  // rawCvv is never logged or stored.
  let token: string;
  try {
    const cardToken = await new CardToken(mpClient).create({
      body: { card_id: card.mp_card_id, security_code: rawCvv },
    });
    token = cardToken.id!;
    console.log("[wallet-deposit-card] step=tokenize ok, token id length:", token?.length);
  } catch (err) {
    const { message, httpStatus, causes } = extractMpErrorDetails(err);
    if (causes.some((c) => c.code === 3031) || message.toLowerCase().includes("security_code")) {
      await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
      return NextResponse.json({ error: "CVV inválido ou ausente. Verifique o código do cartão e tente novamente.", step: "tokenize_failed" }, { status: 400 });
    }
    console.error("[wallet-deposit-card] step=tokenize_failed message:", message, "causes:", causes.map((c) => `${c.code}:${c.description}`).join(", "));
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    return NextResponse.json({ error: "Erro ao processar cartão.", step: "tokenize_failed", detail: message }, { status: httpStatus });
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email ?? "deposito@brisahub.com.br";

  // Validate document before calling MP — number must be digits only
  const docDigits = (card.holder_document_number ?? "").replace(/\D/g, "");

  // Build Payment.create body — log safe fields only (no token, no CVV, no secrets)
  const issuerId = card.issuer_id ? Number(card.issuer_id) : undefined;
  console.log(
    "[wallet-deposit-card] step=payment_create",
    "amount:", totalCharged,
    "payment_method_id:", card.brand,
    "issuer_id:", issuerId,
    "has_identification:", !!(card.holder_document_type && docDigits),
    "doc_type:", card.holder_document_type,
    "email:", email,
    "tx_id:", txRecord.id,
  );

  // ── Step 2: Charge via Payment.create ────────────────────────────────────────
  let result;
  try {
    result = await new Payment(mpClient).create({
      body: {
        transaction_amount: totalCharged,
        description:        agencyName
          ? `BrisaHub — Depósito de Saldo (${agencyName})`
          : "BrisaHub — Depósito de Saldo",
        installments:       1,
        token,
        payment_method_id:  card.brand ?? undefined,
        ...(issuerId !== undefined ? { issuer_id: issuerId } : {}),
        payer: {
          id:         card.mp_customer_id,
          email,
          type:       "customer",
          first_name: agencyName ?? undefined,
          ...(card.holder_document_type && docDigits ? {
            identification: {
              type:   card.holder_document_type,
              number: docDigits,
            },
          } : {}),
        },
        metadata: {
          type:                    "wallet_deposit_card",
          user_id:                 user.id,
          agency_id:               user.id,
          wallet_transaction_id:   txRecord.id,
          intended_credit_amount:  creditAmount,
        },
      },
      requestOptions: { idempotencyKey: `wallet-deposit:${txRecord.id}` },
    });
  } catch (err) {
    const { message, httpStatus, statusDetail, causes } = extractMpErrorDetails(err);
    if (causes.some((c) => c.code === 3031) || message.toLowerCase().includes("security_code")) {
      await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
      return NextResponse.json({ error: "CVV inválido ou ausente. Verifique o código do cartão e tente novamente.", step: "payment_create_failed" }, { status: 400 });
    }
    const userMsg = mapPaymentError(message, statusDetail, causes);
    console.error(
      "[wallet-deposit-card] step=payment_create_failed",
      "message:", message,
      "httpStatus:", httpStatus,
      "statusDetail:", statusDetail,
      "causes:", causes.map((c) => `${c.code}:${c.description}`).join(", "),
    );
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    return NextResponse.json({
      error:            userMsg,
      step:             "payment_create_failed",
      detail:           message,
      mp_status_detail: statusDetail,
    }, { status: httpStatus });
  }

  if (result.status === "rejected") {
    const userMsg = mapRejectedDetail(result.status_detail);
    console.error(
      "[wallet-deposit-card] payment rejected",
      "status_detail:", result.status_detail,
      "payment_id:", result.id,
    );
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    return NextResponse.json({
      error:            userMsg,
      step:             "payment_rejected",
      mp_status_detail: result.status_detail,
    }, { status: 402 });
  }

  if (result.status !== "approved") {
    console.error("[wallet-deposit-card] payment not approved, status:", result.status, "id:", result.id);
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    return NextResponse.json({
      error:         "Pagamento ainda não aprovado. A carteira não foi creditada.",
      step:          "payment_pending",
      paymentStatus: result.status,
      paymentId:     result.id,
    }, { status: 409 });
  }

  // ── Credit wallet atomically via RPC ─────────────────────────────────────────
  await supabase.rpc("increment_wallet_balance", {
    p_user_id: user.id,
    p_amount:  creditAmount,
  });

  await supabase
    .from("wallet_transactions")
    .update({
      payment_id:  String(result.id),
      description: `Depósito via cartão ${card.brand?.toUpperCase() ?? ""} •••• ${card.last_four ?? ""}`.trim(),
    })
    .eq("id", txRecord.id);

  const brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(creditAmount);
  await notifyAdmins(
    "payment",
    `Depósito de carteira confirmado: ${brl}`,
    "/admin/finances",
    `admin-wallet-deposit-card:${result.id ?? txRecord.id}`,
  );

  console.log("[wallet-deposit-card] success, payment_id:", result.id, "credited:", creditAmount);
  return NextResponse.json({ success: true, amount: creditAmount, fee, totalCharged });
}
