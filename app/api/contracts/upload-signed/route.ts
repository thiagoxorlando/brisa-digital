import { NextRequest, NextResponse } from "next/server";
import { CONTRACTS_BUCKET, sanitizeContractFileName } from "@/lib/contractFiles";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getPlatformSetting } from "@/lib/platformSettings.server";

// POST /api/contracts/upload-signed
//
// Accepts JSON { contract_id, filename, filesize } - no file body.
// Validates that the caller is the talent who owns the contract, then returns
// a signed upload URL so the browser can PUT the PDF directly to Supabase
// Storage without going through Vercel (avoids 413 payload errors).
export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const signedUploadRateLimit = checkRateLimit({
    key: buildRateLimitKey("signed-contract-upload", getRequestIp(req), user.id),
    limit: 20,
    windowMs: 60 * 60 * 1000,
    message: "Muitos pedidos de upload de contrato assinado. Aguarde um pouco e tente novamente.",
  });
  if (signedUploadRateLimit) return signedUploadRateLimit;

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const contractId = typeof body.contract_id === "string" ? body.contract_id.trim() : "";
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const filesize = typeof body.filesize === "number" ? body.filesize : 0;

  if (!contractId || !filename) {
    return NextResponse.json({ error: "contract_id e filename sao obrigatorios." }, { status: 400 });
  }

  const uploadMaxMb = await getPlatformSetting<number>("upload_max_mb", 20);
  const maxFileSize = uploadMaxMb * 1024 * 1024;

  if (!/\.pdf$/i.test(filename)) {
    return NextResponse.json({ error: `Envie um arquivo PDF valido de ate ${uploadMaxMb}MB.` }, { status: 400 });
  }

  if (filesize <= 0 || filesize > maxFileSize) {
    return NextResponse.json({ error: `Arquivo muito grande. Envie um PDF de ate ${uploadMaxMb}MB.` }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, talent_id, talent_user_id")
    .eq("id", contractId)
    .single();

  if (contractError || !contract) {
    return NextResponse.json({ error: "Contrato nao encontrado." }, { status: 404 });
  }

  const contractTalentUserId = contract.talent_user_id ?? contract.talent_id ?? null;
  if (contractTalentUserId !== user.id) {
    return NextResponse.json({ error: "Voce nao tem permissao para enviar o contrato assinado." }, { status: 403 });
  }

  const safeName = sanitizeContractFileName(filename);
  const storagePath = `contracts/signed/${user.id}/${contractId}/${Date.now()}-${safeName}`;

  const { data, error: signError } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signError || !data?.signedUrl) {
    console.error("[contracts/upload-signed] createSignedUploadUrl", signError);
    return NextResponse.json(
      { error: "Falha ao gerar URL de upload. Tente novamente." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
  });
}
