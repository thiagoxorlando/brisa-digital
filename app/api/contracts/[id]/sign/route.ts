import { NextRequest, NextResponse } from "next/server";
import { notify } from "@/lib/notify";
import { syncBooking } from "@/lib/syncBooking";
import { agencyWorkspaceBookingsHref, resolveWorkspaceLifecycleByJobId } from "@/lib/workspaceLifecycle";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { isSignedContractUrlRequired } from "@/lib/contractSigningPolicy";
import { renderNotificationTemplate } from "@/lib/notificationTemplates";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { signed_contract_url } = body as { signed_contract_url?: string };
  const signedContractUrl = signed_contract_url?.trim() ?? "";

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("agency_id, talent_id, talent_user_id, job_id, booking_id, status, contract_file_url")
    .eq("id", id)
    .single();

  if (fetchErr || !contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const contractTalentUserId = contract.talent_user_id ?? contract.talent_id ?? null;
  const workspaceLifecycle = await resolveWorkspaceLifecycleByJobId(supabase, contract.job_id ?? null);
  const agencyBookingsHref = agencyWorkspaceBookingsHref(workspaceLifecycle?.workspaceSlug);

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "talent" || contractTalentUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (contract.status !== "sent") {
    return NextResponse.json({ error: "Contract is no longer pending" }, { status: 409 });
  }

  // Policy 5: digital-only contracts do not require an uploaded signed PDF;
  // PDF-mode contracts (contract_file_url set) require signed_contract_url.
  // Centralised in lib/contractSigningPolicy.ts.
  if (isSignedContractUrlRequired(contract) && !signedContractUrl) {
    return NextResponse.json(
      { error: "Envie o contrato assinado em PDF antes de concluir a assinatura." },
      { status: 400 },
    );
  }

  const updates: Record<string, string> = {
    status: "signed",
    signed_at: new Date().toISOString(),
  };
  if (signedContractUrl) {
    updates.signed_contract_url = signedContractUrl;
  }

  const { error } = await supabase
    .from("contracts")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await syncBooking(supabase, {
    ...contract,
    talent_id: contractTalentUserId,
  }, "pending_payment");

  const signedTpl = renderNotificationTemplate("contract_signed");
  await notify(contract.agency_id, signedTpl.channel, signedTpl.body, agencyBookingsHref);

  return NextResponse.json({ ok: true, status: "signed" });
}
