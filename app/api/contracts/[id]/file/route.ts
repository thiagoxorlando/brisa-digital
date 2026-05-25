import { NextRequest, NextResponse } from "next/server";
import { resolveContractCreationAccess } from "@/lib/contractCreationAccess.server";
import { getContractBucket, getStoredContractPath, resolveContractFileUrl } from "@/lib/contractFiles";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rawType = req.nextUrl.searchParams.get("type");
  const fileType: import("@/lib/contractFiles").ContractFileKind =
    rawType === "signed" ? "signed" : rawType === "receipt" ? "receipt" : "original";

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: contract, error: contractError }, { data: caller }] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, agency_id, talent_id, talent_user_id, job_id, contract_file_url, signed_contract_url, payment_receipt_url")
      .eq("id", id)
      .single(),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single(),
  ]);

  if (contractError || !contract) {
    return NextResponse.json({ error: "Contrato nao encontrado." }, { status: 404 });
  }

  const contractTalentUserId = contract.talent_user_id ?? contract.talent_id ?? null;
  const agencyAccess = caller?.role === "agency"
    ? await resolveContractCreationAccess({
        userId: user.id,
        jobId: contract.job_id ?? null,
        requestedAgencyId: contract.agency_id ?? null,
      })
    : null;

  const canRead =
    caller?.role === "admin" ||
    (caller?.role === "agency" && !!agencyAccess?.allowed) ||
    (caller?.role === "talent" && contractTalentUserId === user.id);

  if (!canRead) {
    return NextResponse.json({ error: "Voce nao tem permissao para acessar este contrato." }, { status: 403 });
  }

  const fileRef =
    fileType === "signed"  ? contract.signed_contract_url  :
    fileType === "receipt" ? (contract as Record<string, unknown>).payment_receipt_url as string | null :
    contract.contract_file_url;
  if (!fileRef) {
    return NextResponse.json({ error: "Arquivo do contrato nao encontrado." }, { status: 404 });
  }

  const storagePath = getStoredContractPath(fileRef);
  const bucket = getContractBucket(fileType, fileRef);

  console.error("[contracts/file] resolving", {
    contractId: id,
    field: fileType === "signed" ? "signed_contract_url" : "contract_file_url",
    fileRef,
    storagePath,
    bucket,
  });

  const fileUrl = await resolveContractFileUrl(supabase, fileType, fileRef);
  if (!fileUrl) {
    console.error("[contracts/file] failed to resolve URL", {
      contractId: id,
      fileType,
      fileRef,
      storagePath,
      bucket,
    });
    return NextResponse.json({ error: "Arquivo do contrato nao encontrado." }, { status: 404 });
  }

  return NextResponse.redirect(fileUrl);
}
