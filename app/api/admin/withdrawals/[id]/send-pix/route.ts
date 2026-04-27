import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { getEfiClient } from "@/lib/efiClient";

// POST /api/admin/withdrawals/[id]/send-pix
// Creates a PIX transfer via Efí for a pending withdrawal.
// Does NOT mark the withdrawal as paid — admin manually approves after confirming.

interface EfiPixSendResponse {
  identificadorPagamento?: string;
  tipo?:                   string;
  valor?:                  string;
  status?:                 string;
  [key: string]: unknown;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  console.log("[send-pix env]", {
    hasEfiClientId: Boolean(process.env.EFI_CLIENT_ID),
    hasEfiSecret:   Boolean(process.env.EFI_CLIENT_SECRET),
    hasCert:        Boolean(process.env.EFI_CERTIFICATE_PATH),
    efiBaseUrl:     process.env.EFI_BASE_URL,
    nodeEnv:        process.env.NODE_ENV,
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

  // ── 2. Fetch agency PIX key ───────────────────────────────────────────────────
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

  // ── 3. Call Efí API — POST /v2/gn/pix/enviar ─────────────────────────────────
  const pixPayload = {
    valor:   Number(tx.net_amount).toFixed(2),
    pagador: { chave: pix_key_value.trim() },
  };

  console.log("[PIX PAYLOAD]", JSON.stringify(pixPayload, null, 2));

  let efi: Awaited<ReturnType<typeof getEfiClient>>;
  try {
    efi = await getEfiClient();
  } catch (err) {
    console.error("[send-pix] Efí client init failed:", String(err));
    return NextResponse.json({ error: "Falha ao conectar com Efí." }, { status: 502 });
  }

  let efiResponse: EfiPixSendResponse;
  try {
    const res = await efi.post<EfiPixSendResponse>("/v2/gn/pix/enviar", pixPayload);
    efiResponse = res.data;
    console.log("[EFI SUCCESS]", JSON.stringify(efiResponse, null, 2));
  } catch (err: unknown) {
    const axErr = err as { response?: { status?: number; data?: unknown } };
    console.error("[EFI ERROR FULL]", {
      status: axErr?.response?.status ?? null,
      body:   JSON.stringify(axErr?.response?.data ?? String(err), null, 2),
    });
    return NextResponse.json({ error: "Erro ao criar transferência PIX no Efí." }, { status: 502 });
  }

  // Use identificadorPagamento as the stable transfer reference
  const transferId = efiResponse.identificadorPagamento ?? efiResponse.status ?? "efi-transfer";
  const transferStatus = efiResponse.status ?? "processando";

  // ── 4. Update wallet_transactions — only after Efí succeeds ──────────────────
  const { error: updateError } = await supabase
    .from("wallet_transactions")
    .update({
      status:               "processing",
      provider:             "efi",
      provider_transfer_id: transferId,
      provider_status:      transferStatus,
    })
    .eq("id", id);

  if (updateError) {
    console.error("[send-pix] CRITICAL: Efí transfer created but DB update failed:", {
      txId:        id,
      transferId,
      transferStatus,
      db_error:    updateError.message,
    });
    return NextResponse.json(
      {
        error:       "Transferência PIX criada no Efí mas falhou ao salvar no banco. Verificar manualmente.",
        transfer_id: transferId,
      },
      { status: 500 },
    );
  }

  console.log("[EFI TRANSFER]", {
    txId:          id,
    transferId,
    transferStatus,
    admin:         auth.userId,
  });

  return NextResponse.json({
    ok:             true,
    id,
    status:         "processing",
    efi_transfer_id: transferId,
    efi_status:      transferStatus,
  });
}
