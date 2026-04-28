import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { getEfiSdk } from "@/lib/efiSdk";

// POST /api/admin/withdrawals/[id]/send-pix
// Sends PIX via Efí SDK (PUT /v3/gn/pix/:idEnvio on pix.api.efipay.com.br).
// Uses the withdrawal's own UUID as idEnvio for built-in idempotency.
// Saves "processing" when Efí returns "processando"; "paid" only on terminal success.

interface EfiPixSendResponse {
  idEnvio?: string;
  e2eId?:   string;
  valor?:   string;
  horario?: { solicitacao?: string };
  status?:  string;
}

// Efí statuses that mean the transfer is definitively complete.
const EFI_COMPLETED_STATUSES = ["liquidado", "concluido", "realizado", "completed", "paid"];

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

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

  const platformPixKey = process.env.EFI_PIX_KEY;
  if (!platformPixKey) {
    console.error("[send-pix] EFI_PIX_KEY not set");
    return NextResponse.json({ error: "Chave PIX da plataforma não configurada (EFI_PIX_KEY)." }, { status: 500 });
  }

  // ── 3. Call Efí SDK — PUT /v3/gn/pix/:idEnvio on pix.api.efipay.com.br ────────
  // idEnvio = withdrawal UUID — ensures idempotency (same UUID = same transfer).
  // pagador.chave  = platform's PIX key (the sender account)
  // favorecido.chave = agency's PIX key (the recipient)
  const idEnvio = id;
  const valor   = Number(tx.net_amount).toFixed(2);

  console.log("[send-pix] calling Efí PIX endpoint", {
    sdkMethod:    "pixSend",
    apiHost:      "pix.api.efipay.com.br (internal to SDK)",
    route:        `PUT /v3/gn/pix/${idEnvio}`,
    idEnvio,
    valor,
    favorecidoChave: pix_key_value.trim(),
    pagadorChave:    platformPixKey,
  });

  let efipay: ReturnType<typeof getEfiSdk>;
  try {
    efipay = getEfiSdk();
  } catch (err) {
    console.error("[send-pix] SDK init failed:", String(err));
    return NextResponse.json({ error: "Falha ao inicializar SDK Efí." }, { status: 502 });
  }

  let efiResponse: EfiPixSendResponse;
  try {
    efiResponse = await efipay.pixSend(
      { idEnvio },
      {
        valor,
        pagador:    { chave: platformPixKey },
        favorecido: { chave: pix_key_value.trim() },
      },
    ) as EfiPixSendResponse;
  } catch (err: unknown) {
    const axErr = err as { type?: string; nome?: string; mensagem?: string; response?: { status?: number; data?: unknown } };
    console.error("[EFI SEND PIX ERROR]", {
      type:     axErr?.type,
      nome:     axErr?.nome,
      mensagem: axErr?.mensagem,
      status:   axErr?.response?.status ?? null,
      body:     JSON.stringify(axErr?.response?.data ?? axErr ?? String(err), null, 2),
    });
    return NextResponse.json({ error: "Erro ao enviar PIX via Efí." }, { status: 502 });
  }

  // Guard: SDK should always return JSON — if it somehow returns HTML the host is wrong.
  const responseStr = typeof efiResponse === "string" ? efiResponse : JSON.stringify(efiResponse);
  if (responseStr.includes("<!doctype html") || responseStr.includes("<!DOCTYPE html")) {
    console.error("[send-pix] Efí returned HTML — wrong endpoint or misconfigured SDK", {
      preview: responseStr.slice(0, 200),
    });
    return NextResponse.json(
      { error: "Efí returned HTML instead of JSON — wrong endpoint. Check SDK config." },
      { status: 502 },
    );
  }

  console.log("[EFI PIX SEND RESPONSE]", JSON.stringify(efiResponse, null, 2));

  // ── 4. Resolve transfer reference ─────────────────────────────────────────────
  // SDK echoes back idEnvio; fall back to the withdrawal id (same value we sent).
  const transferId     = efiResponse.idEnvio ?? idEnvio;
  const efiStatus      = (efiResponse.status ?? "processando").toLowerCase();

  console.log("[send-pix] unique txId selected", {
    responseIdEnvio: efiResponse.idEnvio,
    usedFallback:    !efiResponse.idEnvio,
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
  const adminNote = isCompleted
    ? `PIX confirmado via Efí — ref: ${transferId}`
    : `PIX enviado via Efí, aguardando confirmação — ref: ${transferId}`;

  const updatePayload: Record<string, unknown> = {
    status:     dbStatus,
    admin_note: adminNote,
    ...(isCompleted && { processed_at: new Date().toISOString() }),
  };

  console.log("[EFI TRANSFER DB UPDATE ATTEMPT]", { txId: id, transferId, efiStatus, dbStatus, updatePayload });

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
        error:       "PIX enviado no Efí mas falhou ao salvar no banco. Verificar manualmente.",
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

  console.log("[send-pix] DB update success", { txId: id, dbStatus, transferId, admin: auth.userId });

  return NextResponse.json({
    ok:              true,
    id,
    status:          dbStatus,
    efi_transfer_id: transferId,
    efi_status:      efiResponse.status ?? "processando",
  });
}
