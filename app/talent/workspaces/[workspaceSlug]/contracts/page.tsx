import { notFound } from "next/navigation";
import type { Metadata } from "next";
import WorkspaceTalentContracts, { type WorkspaceTalentContract } from "@/features/talent/WorkspaceTalentContracts";
import { buildContractFileAccessUrl } from "@/lib/contractFiles";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { hasActivePremiumWorkspaceTalentMembership } from "@/lib/workspacePortalJobs";
import { batchGetActiveDisputes } from "@/lib/contractState.server";

export const metadata: Metadata = { title: "Contratos — BrisaHub" };

type Props = { params: Promise<{ workspaceSlug: string }> };
type ContractRow = {
  id: string;
  workspace_id: string | null;
  agency_id: string | null;
  job_id: string | null;
  talent_id: string | null;
  talent_user_id: string | null;
  job_date: string | null;
  job_time: string | null;
  location: string | null;
  job_description: string | null;
  payment_amount: number | null;
  commission_amount: number | null;
  net_amount: number | null;
  payment_method: string | null;
  additional_notes: string | null;
  status: string | null;
  created_at: string | null;
  signed_at: string | null;
  paid_at: string | null;
  contract_file_url: string | null;
  signed_contract_url: string | null;
};

export default async function WorkspaceContractsPage({ params }: Props) {
  const { workspaceSlug } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) notFound();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("id, agency_id, owner_user_id, name, brand_primary_color, brand_accent_color")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!workspace) notFound();

  const isWorkspaceMember = await hasActivePremiumWorkspaceTalentMembership(supabase, workspace.id, user.id);
  if (!isWorkspaceMember) notFound();

  const { data: allJobs } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null);

  const workspaceJobIds = (allJobs ?? []).map((job) => job.id);
  const jobMap = new Map((allJobs ?? []).map((job) => [String(job.id), job.title ?? "Vaga"]));

  const contractSelect =
    "id, workspace_id, agency_id, job_id, talent_id, talent_user_id, job_date, job_time, location, job_description, payment_amount, commission_amount, net_amount, payment_method, additional_notes, status, created_at, signed_at, paid_at, contract_file_url, signed_contract_url";

  const [workspaceContractsResult, jobJoinContractsResult, agencyResult] = await Promise.all([
    supabase
      .from("contracts")
      .select(contractSelect)
      .eq("workspace_id", workspace.id)
      .or(`talent_user_id.eq.${user.id},talent_id.eq.${user.id}`),
    workspaceJobIds.length > 0
      ? supabase
        .from("contracts")
        .select(contractSelect)
        .in("job_id", workspaceJobIds)
        .or(`talent_user_id.eq.${user.id},talent_id.eq.${user.id}`)
      : Promise.resolve({ data: [], error: null }),
    workspace.agency_id
      ? supabase.from("agencies").select("company_name").eq("id", workspace.agency_id).maybeSingle()
      : workspace.owner_user_id
        ? supabase.from("agencies").select("company_name").eq("user_id", workspace.owner_user_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
  ]);

  const contractMap = new Map<string, ContractRow>();
  for (const contract of (workspaceContractsResult.data ?? []) as ContractRow[]) {
    if (contract) contractMap.set(contract.id, contract);
  }
  for (const contract of (jobJoinContractsResult.data ?? []) as ContractRow[]) {
    if (contract && !contractMap.has(contract.id)) {
      contractMap.set(contract.id, contract);
    }
  }

  const agencyName = agencyResult.data?.company_name ?? workspace.name;

  const allContractIds = [...contractMap.keys()];
  const allContractJobIds = [...new Set(
    [...contractMap.values()].map((c) => c.job_id).filter((id): id is string => !!id)
  )];

  const [agentCommitsResult, activeDisputeMap] = await Promise.all([
    allContractJobIds.length
      ? supabase
        .from("premium_agent_wallet_transactions")
        .select("related_job_id")
        .in("related_job_id", allContractJobIds)
        .eq("type", "job_commitment")
        .eq("status", "completed")
      : Promise.resolve({ data: [] }),
    batchGetActiveDisputes(allContractIds),
  ]);

  const agentBackedJobIds = new Set<string>();
  for (const r of agentCommitsResult.data ?? []) {
    if (r.related_job_id) agentBackedJobIds.add(String(r.related_job_id));
  }

  const contracts: WorkspaceTalentContract[] = [...contractMap.values()]
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    })
    .map((contract) => ({
      id: contract.id,
      jobId: contract.job_id ?? null,
      jobTitle: contract.job_id ? (jobMap.get(String(contract.job_id)) ?? "Vaga") : "Vaga",
      agencyName,
      jobDate: contract.job_date ?? null,
      jobTime: contract.job_time ?? null,
      location: contract.location ?? null,
      jobDescription: contract.job_description ?? null,
      paymentAmount: contract.payment_amount ?? 0,
      commissionAmount: contract.commission_amount ?? null,
      netAmount: contract.net_amount ?? null,
      paymentMethod: contract.payment_method ?? null,
      additionalNotes: contract.additional_notes ?? null,
      status: contract.status ?? "sent",
      createdAt: contract.created_at ?? "",
      signedAt: contract.signed_at ?? null,
      paidAt: contract.paid_at ?? null,
      contractFileUrl: contract.contract_file_url ? buildContractFileAccessUrl(contract.id, "original") : null,
      signedContractUrl: contract.signed_contract_url ? buildContractFileAccessUrl(contract.id, "signed") : null,
      isAgentJobBacked: contract.job_id ? agentBackedJobIds.has(String(contract.job_id)) : false,
      activeDisputeId: activeDisputeMap.get(contract.id)?.id ?? null,
    }));

  const primary = workspace.brand_primary_color ?? "#1ABC9C";
  const accent = workspace.brand_accent_color ?? "#27C1D6";

  return (
    <WorkspaceTalentContracts
      contracts={contracts}
      workspaceName={workspace.name}
      workspaceSlug={workspaceSlug}
      primary={primary}
      accent={accent}
    />
  );
}
