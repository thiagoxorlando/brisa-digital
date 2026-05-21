import { NextRequest, NextResponse } from "next/server";
import { resolveContractCreationAccess } from "@/lib/contractCreationAccess.server";
import { CONTRACTS_BUCKET, sanitizeContractFileName } from "@/lib/contractFiles";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { getPlatformSetting } from "@/lib/platformSettings.server";

// POST /api/contracts/upload
//
// Accepts JSON { job_id, filename, filesize } - no file body.
// Validates the caller and returns a signed upload URL so the browser can
// PUT the PDF directly to Supabase Storage, bypassing Vercel payload limits.
export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uploadRateLimit = checkRateLimit({
    key: buildRateLimitKey("contract-upload", getRequestIp(req), user.id),
    limit: 20,
    windowMs: 60 * 60 * 1000,
    message: "Muitos pedidos de upload de contrato. Aguarde um pouco e tente novamente.",
  });
  if (uploadRateLimit) return uploadRateLimit;

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const jobId = typeof body.job_id === "string" ? body.job_id.trim() : "";
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const filesize = typeof body.filesize === "number" ? body.filesize : 0;

  if (!jobId || !filename) {
    return NextResponse.json({ error: "job_id e filename sao obrigatorios." }, { status: 400 });
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
  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "agency") {
    return NextResponse.json({ error: "Apenas agencias podem enviar contratos." }, { status: 403 });
  }

  const access = await resolveContractCreationAccess({
    userId: user.id,
    jobId,
    requestedAgencyId: user.id,
  });

  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const safeName = sanitizeContractFileName(filename);
  const storagePath = access.kind === "workspace"
    ? `contracts/workspaces/${access.workspaceId}/jobs/${jobId}/agency/${user.id}/${Date.now()}-${safeName}`
    : `contracts/open/${access.agencyId}/jobs/${jobId}/agency/${user.id}/${Date.now()}-${safeName}`;

  const { data, error: signError } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signError || !data?.signedUrl) {
    console.error("[contracts/upload] createSignedUploadUrl", signError);
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
