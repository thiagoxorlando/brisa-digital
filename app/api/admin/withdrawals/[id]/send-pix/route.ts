import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { getEfiPixClient } from "@/lib/efiClient";

// POST /api/admin/withdrawals/[id]/send-pix
// Sends PIX via Efí and saves "processing" or "paid" depending on Efí response.
// "processando" from Efí → status "processing" (money in flight, not yet confirmed).
// Confirmed terminal statuses → status "paid".

interface EfiPixSendResponse {
  idEnvio?:               string; // Efí's unique reference for the outbound transfer
  identificadorPagamento?: string;
  tipo?:                   string;
  valor?:                  string;
  status?:                 string;
  [key: string]: unknown;
}

// Efí statuses that mean the transfer is definitively completed.
const EFI_COMPLETED_STATUSES = ["liquidado", "concluido", "realizado", "completed", "paid"];

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

  // ── 1. Fetch withdrawal — must be pending ─────────────────────────────────────
  const { data: tx, error: txError } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, net_amount, status")
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

  let efi: Awaited<ReturnType<typeof getEfiPixClient>>;
  try {
    efi = await getEfiPixClient();
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

  // ── 4. Resolve transfer reference ─────────────────────────────────────────────
  // Priority: idEnvio (Efí's transfer ID) → identificadorPagamento → fallback to
  // withdrawal DB id. Never use a generic placeholder — provider_transfer_id has
  // a unique constraint and must identify exactly this transfer.
  const transferId = efiResponse.idEnvio
    ?? efiResponse.identificadorPagamento
    ?? id; // withdrawal's own UUID — always unique

  const efiStatus = (efiResponse.status ?? "processando").toLowerCase();

  console.log("[send-pix] unique txId selected", {
    idEnvio:                efiResponse.idEnvio,
    identificadorPagamento: efiResponse.identificadorPagamento,
    usedFallbackToTxId:     !efiResponse.idEnvio && !efiResponse.identificadorPagamento,
    transferId,
    efiStatus,
  });

  // ── 5. Determine DB status ────────────────────────────────────────────────────
  const isCompleted = EFI_COMPLETED_STATUSES.includes(efiStatus);
  const dbStatus    = isCompleted ? "paid" : "processing";

  if (isCompleted) {
    console.log("[send-pix] Efí returned completed, saving as paid", { efiStatus, transferId });
  } else {
    console.log("[send-pix] Efí returned processing, saving as processing", { efiStatus, transferId });
  }

  // ── 6a. Critical update — confirmed-existing columns ─────────────────────────
  // Only set processed_at if the transfer is definitively complete.
  // .eq("status", "pending") ensures a double-click cannot trigger two transfers.
  const adminNote = isCompleted
    ? `PIX confirmado via Efí — ref: ${transferId}`
    : `PIX enviado via Efí, aguardando confirmação — ref: ${transferId}`;

  const updatePayload: Record<string, unknown> = {
    status:     dbStatus,
    admin_note: adminNote,
    ...(isCompleted && { processed_at: new Date().toISOString() }),
  };

  console.log("[EFI TRANSFER DB UPDATE ATTEMPT]", {
    txId:          id,
    transferId,
    efiStatus,
    dbStatus,
    updatePayload,
  });

  const { error: updateError } = await supabase
    .from("wallet_transactions")
    .update(updatePayload)
    .eq("id", id)
    .eq("status", "pending");

  if (updateError) {
    console.error("[EFI TRANSFER DB UPDATE ERROR FULL]", {
      txId:             id,
      transferId,
      efiStatus,
      dbStatus,
      updatePayload,
      supabase_code:    updateError.code,
      supabase_message: updateError.message,
      supabase_details: updateError.details,
      supabase_hint:    updateError.hint,
      full_error:       JSON.stringify(updateError),
    });
    return NextResponse.json(
      {
        error:       "Transferência PIX criada no Efí mas falhou ao salvar no banco. Verificar manualmente.",
        transfer_id: transferId,
        tx_id:       id,
      },
      { status: 500 },
    );
  }

  // ── 6b. Best-effort provider columns (migration 20260427) ─────────────────────
  const { error: providerErr } = await supabase
    .from("wallet_transactions")
    .update({
      provider:             "efi",
      provider_transfer_id: transferId,
      provider_status:      efiResponse.status ?? "processando",
    })
    .eq("id", id);

  if (providerErr) {
    console.warn("[send-pix] provider columns update failed (non-fatal — apply migration 20260427):", {
      txId:    id,
      code:    providerErr.code,
      message: providerErr.message,
    });
  }

  console.log("[send-pix] DB update success", {
    txId:      id,
    dbStatus,
    transferId,
    admin:     auth.userId,
  });

  return NextResponse.json({
    ok:              true,
    id,
    status:          dbStatus,
    efi_transfer_id: transferId,
    efi_status:      efiResponse.status ?? "processando",
  });
}
