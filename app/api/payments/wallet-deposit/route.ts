import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getEfiClient } from "@/lib/efiClient";

// POST /api/payments/wallet-deposit
// Body: { amount: number }
// Creates an Efí PIX charge to top up the agency's platform wallet balance.
//
// Response shape (unchanged from previous provider):
//   qr_code        — PIX copia-e-cola text     (Efí: qrcode)
//   qr_code_base64 — raw base64 QR image       (Efí: imagemQrcode, prefix stripped)
//   payment_id     — txid used to track payment
//   tx_id          — internal wallet_transactions UUID
//   creditAmount   — amount credited to wallet
//   fee            — 0 (platform absorbs Efí fees)
//   totalCharged   — same as creditAmount

interface EfiCobResponse {
  txid: string;
  loc:  { id: number; location: string; tipoCob: string };
  status: string;
}

interface EfiQrCodeResponse {
  qrcode:       string; // PIX copia-e-cola (copy-paste text)
  imagemQrcode: string; // "data:image/png;base64,<base64>" or raw base64
}

export async function POST(req: NextRequest) {
  const body      = await req.json();
  const numAmount = Number(body.amount);

  if (!numAmount || numAmount <= 0) {
    return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Validate required env vars up front
  const pixKey = process.env.EFI_PIX_KEY;
  if (
    !process.env.EFI_CLIENT_ID        ||
    !process.env.EFI_CLIENT_SECRET     ||
    !process.env.EFI_CERTIFICATE_PATH  ||
    !pixKey
  ) {
    console.error("[wallet-deposit] Efí env vars not fully configured", {
      hasClientId:    Boolean(process.env.EFI_CLIENT_ID),
      hasSecret:      Boolean(process.env.EFI_CLIENT_SECRET),
      hasCert:        Boolean(process.env.EFI_CERTIFICATE_PATH),
      hasPixKey:      Boolean(pixKey),
    });
    return NextResponse.json({ error: "Integração de pagamento não configurada." }, { status: 500 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  // Pre-insert pending transaction as stable idempotency anchor
  const { data: txRecord, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id:     user.id,
      type:        "deposit",
      amount:      numAmount,
      description: "Depósito PIX — aguardando confirmação",
      provider:    "efi",
    })
    .select("id")
    .single();

  if (txErr || !txRecord) {
    console.error("[wallet-deposit] insert tx error:", txErr);
    return NextResponse.json({ error: "Could not create deposit record" }, { status: 500 });
  }

  // Efí txid: alphanumeric, 26–35 chars — UUID without hyphens = 32 chars
  const txid = randomUUID().replace(/-/g, "");

  const cobPayload = {
    calendario:         { expiracao: 3600 },
    valor:              { original: numAmount.toFixed(2) },
    chave:              pixKey,
    solicitacaoPagador: "Deposito BrisaHub",
  };

  const cobPath = `/v2/cob/${txid}`;

  console.log("[EFI PIX CREATE]", JSON.stringify({ txid, value: numAmount.toFixed(2) }, null, 2));
  console.log("[EFI PIX CREATE URL]", cobPath);

  // Build authenticated mTLS client — PIX charge creation requires api.efipay.com.br
  let efi: Awaited<ReturnType<typeof getEfiClient>>;
  try {
    efi = await getEfiClient("https://api.efipay.com.br");
  } catch (err) {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    console.error("[wallet-deposit] Efí client init failed:", String(err));
    return NextResponse.json({ error: "Erro ao conectar com provedor de pagamento." }, { status: 500 });
  }

  // Create PIX charge — PUT /v2/cob/{txid}
  let cob: EfiCobResponse;
  try {
    const res = await efi.put<EfiCobResponse>(cobPath, cobPayload);
    cob = res.data;
  } catch (err: unknown) {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    const axErr = err as { response?: { status?: number; data?: unknown } };
    console.error("[EFI PAYMENT ERROR FULL]", {
      status: axErr?.response?.status ?? null,
      body:   JSON.stringify(axErr?.response?.data ?? String(err), null, 2),
    });
    return NextResponse.json({ error: "Erro ao criar pagamento PIX." }, { status: 502 });
  }

  // Store txid as payment_id so the webhook can find this transaction
  await supabase
    .from("wallet_transactions")
    .update({ payment_id: txid })
    .eq("id", txRecord.id);

  // Fetch QR code — GET /v2/loc/{loc.id}/qrcode
  let qrData: EfiQrCodeResponse | null = null;
  try {
    const qrRes = await efi.get<EfiQrCodeResponse>(`/v2/loc/${cob.loc.id}/qrcode`);
    qrData = qrRes.data;
  } catch (err: unknown) {
    const axErr = err as { response?: { data?: unknown } };
    console.error(
      "[wallet-deposit] Efí QR fetch failed (non-fatal):",
      JSON.stringify(axErr?.response?.data ?? String(err)),
    );
  }

  // imagemQrcode includes "data:image/png;base64," prefix — strip it
  // WalletDepositModal adds the prefix back: src={`data:image/png;base64,${qrCodeBase64}`}
  const rawBase64 = qrData?.imagemQrcode
    ?.replace(/^data:image\/[^;]+;base64,/, "") ?? null;

  console.log("[wallet-deposit] Efí PIX created — txid:", txid, "tx:", txRecord.id);

  return NextResponse.json({
    qr_code:        qrData?.qrcode ?? null,
    qr_code_base64: rawBase64,
    payment_id:     txid,
    tx_id:          txRecord.id,
    creditAmount:   numAmount,
    fee:            0,
    totalCharged:   numAmount,
  });
}
