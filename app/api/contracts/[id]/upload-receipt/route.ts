import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { sanitizeContractFileName } from "@/lib/contractFiles";

const RECEIPTS_BUCKET = "contracts";
const MAX_RECEIPT_MB  = 10;

type Params = { params: Promise<{ id: string }> };

// POST — generate a signed upload URL for the receipt file.
// Body: { filename: string; filesize: number }
// Returns: { signedUrl: string; token: string; path: string }
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { filename?: string; filesize?: number };
  const filename = typeof body.filename === "string" && body.filename.trim()
    ? body.filename.trim()
    : "comprovante.pdf";
  const filesize = Number(body.filesize ?? 0);

  console.info("[upload-receipt] POST start", { contractId: id, filename, fileSizeBytes: filesize });

  if (filesize > MAX_RECEIPT_MB * 1024 * 1024) {
    console.warn("[upload-receipt] file too large", { contractId: id, fileSizeBytes: filesize, maxBytes: MAX_RECEIPT_MB * 1024 * 1024 });
    return NextResponse.json(
      { error: `Arquivo muito grande. Máximo ${MAX_RECEIPT_MB}MB.` },
      { status: 413 },
    );
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("id, agency_id, status")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    console.error("[upload-receipt] contract not found", { contractId: id, error: fetchErr?.message });
    return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  }

  if (contract.agency_id !== user.id) {
    console.warn("[upload-receipt] forbidden", { contractId: id, userId: user.id, agencyId: contract.agency_id });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Allow upload when signed or confirmed.
  // In internal mode contracts move sent→signed→paid (no confirmed stage),
  // so "signed" is the relevant status for receipt uploads.
  if (!["signed", "confirmed"].includes(contract.status ?? "")) {
    console.warn("[upload-receipt] wrong contract status", { contractId: id, status: contract.status });
    return NextResponse.json(
      { error: "Comprovante só pode ser enviado em contratos assinados ou confirmados." },
      { status: 422 },
    );
  }

  // Derive extension — support PDF and common image formats for payment screenshots.
  // IMPORTANT: the contracts bucket must have these MIME types in allowed_mime_types.
  // See migration 20260529_contracts_bucket_allow_images.sql.
  const ext = /\.(pdf|png|jpg|jpeg|webp|gif)$/i.test(filename)
    ? filename.match(/\.\w+$/)?.[0]?.toLowerCase() ?? ".pdf"
    : ".pdf";

  const safeName = sanitizeContractFileName(
    filename.replace(/\.[^.]+$/, "") + ".pdf",
  ).replace(".pdf", ext);

  const storagePath = `receipts/${id}/${safeName}`;

  console.info("[upload-receipt] generating signed URL", { contractId: id, bucket: RECEIPTS_BUCKET, storagePath });

  const { data: signedData, error: signErr } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signErr || !signedData) {
    console.error("[upload-receipt] createSignedUploadUrl failed", {
      contractId: id,
      bucket: RECEIPTS_BUCKET,
      storagePath,
      error: signErr?.message,
    });
    return NextResponse.json({ error: "Não foi possível gerar URL de upload." }, { status: 500 });
  }

  console.info("[upload-receipt] signed URL ready", { contractId: id, storagePath });

  return NextResponse.json({
    signedUrl: signedData.signedUrl,
    token:     signedData.token,
    path:      storagePath,
  });
}

// PATCH — confirm the upload: save the storage path to contracts.payment_receipt_url
// Body: { path: string }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { path?: string };
  const path = typeof body.path === "string" ? body.path.trim() : "";

  if (!path) {
    return NextResponse.json({ error: "path obrigatório." }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("id, agency_id")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    console.error("[upload-receipt] PATCH contract not found", { contractId: id, error: fetchErr?.message });
    return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
  }

  if (contract.agency_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  console.info("[upload-receipt] saving path to DB", { contractId: id, path });

  const { error: updateErr } = await supabase
    .from("contracts")
    .update({ payment_receipt_url: path } as Record<string, unknown>)
    .eq("id", id);

  if (updateErr) {
    console.error("[upload-receipt] DB update failed", { contractId: id, path, error: updateErr.message, code: updateErr.code });
    return NextResponse.json({ error: "Falha ao salvar comprovante." }, { status: 500 });
  }

  console.info("[upload-receipt] complete", { contractId: id, path });
  return NextResponse.json({ ok: true, path });
}
