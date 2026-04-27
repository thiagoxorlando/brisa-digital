import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getEfiClient } from "@/lib/efiClient";

// POST /api/wallet/deposit
// Body: { amount: number, email?: string }
// Duplicate entry-point for wallet PIX deposit — same logic as /api/payments/wallet-deposit.
// Returns: { qr_code, qr_code_base64, payment_id, tx_id, creditAmount, fee, totalCharged }

interface EfiCobResponse {
  txid: string;
  loc:  { id: number; location: string; tipoCob: string };
  status: string;
}

interface EfiQrCodeResponse {
  qrcode:       string;
  imagemQrcode: string;
}

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const amount = Number(body.amount);

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const pixKey = process.env.EFI_PIX_KEY;
  if (
    !process.env.EFI_CLIENT_ID       ||
    !process.env.EFI_CLIENT_SECRET    ||
    !process.env.EFI_CERTIFICATE_PATH ||
    !pixKey
  ) {
    console.error("[wallet/deposit] Efí env vars not fully configured");
    return NextResponse.json({ error: "Integração de pagamento não configurada." }, { status: 500 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: txRecord, error: txErr } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id:     user.id,
      type:        "deposit",
      amount,
      description: "Depósito via PIX (pendente)",
      provider:    "efi",
    })
    .select("id")
    .single();

  if (txErr || !txRecord) {
    console.error("[wallet/deposit] Failed to log pending deposit:", txErr?.message);
    return NextResponse.json({ error: "Could not create deposit record" }, { status: 500 });
  }

  const txid = randomUUID().replace(/-/g, "");

  const cobPayload = {
    calendario:         { expiracao: 3600 },
    valor:              { original: amount.toFixed(2) },
    chave:              pixKey,
    solicitacaoPagador: "Deposito BrisaHub",
  };

  console.log("[EFI PIX CREATE]", JSON.stringify({ txid, value: amount.toFixed(2) }, null, 2));

  let efi: Awaited<ReturnType<typeof getEfiClient>>;
  try {
    efi = await getEfiClient();
  } catch (err) {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    console.error("[wallet/deposit] Efí client init failed:", String(err));
    return NextResponse.json({ error: "Erro ao conectar com provedor de pagamento." }, { status: 500 });
  }

  let cob: EfiCobResponse;
  try {
    const res = await efi.put<EfiCobResponse>(`/v2/cob/${txid}`, cobPayload);
    cob = res.data;
  } catch (err: unknown) {
    await supabase.from("wallet_transactions").delete().eq("id", txRecord.id);
    const axErr = err as { response?: { status?: number; data?: unknown } };
    console.error("[EFI PAYMENT ERROR FULL]", {
      status: axErr?.response?.status ?? null,
      body:   JSON.stringify(axErr?.response?.data ?? String(err), null, 2),
    });
    return NextResponse.json({ error: "Failed to create PIX payment" }, { status: 502 });
  }

  await supabase
    .from("wallet_transactions")
    .update({ payment_id: txid })
    .eq("id", txRecord.id);

  let qrData: EfiQrCodeResponse | null = null;
  try {
    const qrRes = await efi.get<EfiQrCodeResponse>(`/v2/loc/${cob.loc.id}/qrcode`);
    qrData = qrRes.data;
  } catch (err: unknown) {
    const axErr = err as { response?: { data?: unknown } };
    console.error(
      "[wallet/deposit] Efí QR fetch failed (non-fatal):",
      JSON.stringify(axErr?.response?.data ?? String(err)),
    );
  }

  const rawBase64 = qrData?.imagemQrcode
    ?.replace(/^data:image\/[^;]+;base64,/, "") ?? null;

  console.log("[wallet/deposit] Efí PIX created — txid:", txid, "tx:", txRecord.id);

  return NextResponse.json({
    qr_code:        qrData?.qrcode ?? null,
    qr_code_base64: rawBase64,
    payment_id:     txid,
    tx_id:          txRecord.id,
    creditAmount:   amount,
    fee:            0,
    totalCharged:   amount,
  });
}
