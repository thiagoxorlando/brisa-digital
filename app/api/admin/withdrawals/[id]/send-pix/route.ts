import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";

// DB pix_key_type values → Asaas pixAddressKeyType enum
const PIX_TYPE_MAP: Record<string, string> = {
  cpf:    "CPF",
  cnpj:   "CNPJ",
  email:  "EMAIL",
  phone:  "TELEFONE",
  random: "EVP",
};

// POST /api/admin/withdrawals/[id]/send-pix
// Creates a PIX transfer via Asaas for a pending withdrawal.
// Does NOT mark the withdrawal as paid — that happens via webhook on DONE status.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  console.log("[send-pix env]", {
    hasAsaasKey: Boolean(process.env.ASAAS_API_KEY),
    asaasUrl: process.env.ASAAS_API_URL,
    nodeEnv: process.env.NODE_ENV,
  });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });

  const supabase = createServerClient({ useServiceRole: true });

  // ── 1. Fetch withdrawal — must be pending with no in-flight transfer ──────────
  const { data: tx, error: txError } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, net_amount, status, provider_transfer_id")
    .eq("id", id)
    .eq("type", "withdrawal")
    .single();

  if (txError || !tx) {
    console.error("[send-pix] tx fetch error:", txError?.message, { id });
    return NextResponse.json({ error: "Saque não encontrado." }, { status: 404 });
  }

  if (tx.status !== "pending") {
    return NextResponse.json(
      { error: `Saque está com status "${tx.status}". Apenas saques pendentes podem ser enviados.` },
      { status: 409 },
    );
  }

  // Idempotency guard: block if a transfer was already created for this tx
  if (tx.provider_transfer_id !== null) {
    return NextResponse.json(
      { error: "Transferência PIX já foi criada para este saque.", provider_transfer_id: tx.provider_transfer_id },
      { status: 409 },
    );
  }

  if (!tx.net_amount || Number(tx.net_amount) <= 0) {
    console.error("[send-pix] invalid net_amount:", tx.net_amount, { id });
    return NextResponse.json({ error: "net_amount inválido para este saque." }, { status: 422 });
  }

  // ── 2. Fetch agency PIX data ──────────────────────────────────────────────────
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("pix_key_type, pix_key_value")
    .eq("id", tx.user_id)
    .single();

  if (agencyError || !agency) {
    console.error("[send-pix] agency fetch error:", agencyError?.message, { userId: tx.user_id });
    return NextResponse.json({ error: "Dados da agência não encontrados." }, { status: 404 });
  }

  const { pix_key_type, pix_key_value } = agency;

  if (!pix_key_type || !pix_key_value?.trim()) {
    return NextResponse.json({ error: "Agência não tem chave PIX configurada." }, { status: 422 });
  }

  const pixAddressKeyType = PIX_TYPE_MAP[pix_key_type];
  if (!pixAddressKeyType) {
    console.error("[send-pix] unknown pix_key_type:", pix_key_type, { id });
    return NextResponse.json({ error: `Tipo de chave PIX desconhecido: "${pix_key_type}".` }, { status: 422 });
  }

  // ── 3. Call Asaas API ─────────────────────────────────────────────────────────
  const asaasApiUrl = process.env.ASAAS_API_URL;
  const asaasApiKey = process.env.ASAAS_API_KEY;

  if (!asaasApiUrl || !asaasApiKey) {
    console.error("[send-pix] Asaas env vars not configured", { hasUrl: !!asaasApiUrl, hasKey: !!asaasApiKey });
    return NextResponse.json({ error: "Integração Asaas não configurada." }, { status: 500 });
  }

  let asaasResponse: { id: string; status: string };

  try {
    console.log("[PIX PAYLOAD]", JSON.stringify({
      value: Number(tx.net_amount),
      pixAddressKey: pix_key_value.trim(),
      pixAddressKeyType,
    }, null, 2));

    const res = await fetch(`${asaasApiUrl}/transfers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "BrisaHub/1.0",
        "access_token": asaasApiKey,
      },
      body: JSON.stringify({
        value:              Number(tx.net_amount),
        pixAddressKey:      pix_key_value.trim(),
        pixAddressKeyType,
        description:        "Saque BrisaHub",
      }),
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      console.error("[ASAAS ERROR FULL]", {
        status: res.status,
        body: JSON.stringify(data, null, 2),
      });
      return NextResponse.json(
        { error: "Erro ao criar transferência PIX no Asaas." },
        { status: 502 },
      );
    }

    console.log("[ASAAS SUCCESS]", data);
    asaasResponse = data;
  } catch (err) {
    console.error("[send-pix] Asaas fetch failed:", err, { txId: id });
    return NextResponse.json({ error: "Falha de conexão com Asaas." }, { status: 502 });
  }

  if (!asaasResponse.id) {
    console.error("[send-pix] Asaas response missing id:", asaasResponse, { txId: id });
    return NextResponse.json({ error: "Resposta inválida do Asaas." }, { status: 502 });
  }

  // ── 4. Update wallet_transactions — only after Asaas succeeds ────────────────
  const { error: updateError } = await supabase
    .from("wallet_transactions")
    .update({
      status:               "processing",
      provider:             "asaas",
      provider_transfer_id: asaasResponse.id,
      provider_status:      asaasResponse.status,
    })
    .eq("id", id);

  if (updateError) {
    // Transfer was created at Asaas but we failed to persist the ID.
    // Log with full context so this can be reconciled manually.
    console.error("[send-pix] CRITICAL: Asaas transfer created but DB update failed:", {
      txId:                id,
      asaas_transfer_id:   asaasResponse.id,
      asaas_status:        asaasResponse.status,
      db_error:            updateError.message,
    });
    return NextResponse.json(
      {
        error:             "Transferência PIX criada no Asaas mas falhou ao salvar no banco. Verificar manualmente.",
        asaas_transfer_id: asaasResponse.id,
      },
      { status: 500 },
    );
  }

  console.log("[send-pix] transfer created:", {
    txId:              id,
    asaas_transfer_id: asaasResponse.id,
    asaas_status:      asaasResponse.status,
    admin:             auth.userId,
  });

  return NextResponse.json({
    ok:                true,
    id,
    status:            "processing",
    asaas_transfer_id: asaasResponse.id,
    asaas_status:      asaasResponse.status,
  });
}
