import type { Metadata } from "next";
import AgencyContracts, { type AgencyContract } from "@/features/agency/AgencyContracts";
import WorkspacePremiumContracts, { type PremiumContract } from "@/features/agency/WorkspacePremiumContracts";
import { buildContractFileAccessUrl } from "@/lib/contractFiles";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Contratos Premium - BrisaHub" };

export default async function WorkspaceContractsPage() {
  const context = await requirePremiumWorkspacePageContext();
  const supabase = createServerClient({ useServiceRole: true });

  const { data: workspaceJobs } = await supabase
    .from("jobs")
    .select("id, title, created_by_user_id")
    .eq("workspace_id", context.workspace.id);

  const allWorkspaceJobs = workspaceJobs ?? [];
  const visibleJobs = context.isOwner
    ? (workspaceJobs ?? [])
    : (workspaceJobs ?? []).filter((job) => job.created_by_user_id === context.userId);

  const visibleJobIds = new Set(visibleJobs.map((job) => job.id));
  const workspaceJobIds = allWorkspaceJobs.map((job) => job.id);
  const jobTitleMap = new Map(allWorkspaceJobs.map((job) => [job.id, job.title ?? "Vaga do workspace"]));

  const contractSelect =
    "id, workspace_id, job_id, talent_id, talent_user_id, job_date, job_time, location, job_description, payment_amount, commission_amount, net_amount, payment_method, additional_notes, status, payment_status, contract_file_url, signed_contract_url, created_at, signed_at, agency_signed_at, deposit_paid_at, paid_at";

  const [workspaceContractsResult, jobJoinContractsResult] = await Promise.all([
    supabase
      .from("contracts")
      .select(contractSelect)
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false }),
    workspaceJobIds.length > 0
      ? supabase
        .from("contracts")
        .select(contractSelect)
        .in("job_id", workspaceJobIds)
        .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const rawWorkspaceContracts = workspaceContractsResult.data ?? [];
  const rawJobJoinContracts = jobJoinContractsResult.data ?? [];
  const contractMap = new Map<string, (typeof rawWorkspaceContracts)[number]>();

  for (const contract of rawWorkspaceContracts) {
    contractMap.set(contract.id, contract);
  }
  for (const contract of rawJobJoinContracts) {
    if (!contractMap.has(contract.id)) {
      contractMap.set(contract.id, contract);
    }
  }

  const contractsData = [...contractMap.values()]
    .filter((contract) => {
      if (context.isOwner) return true;
      if (!contract.job_id) return false;
      return visibleJobIds.has(contract.job_id);
    })
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

const talentIds = [...new Set(
    contractsData
      .map((contract) => contract.talent_user_id ?? contract.talent_id)
      .filter((id): id is string => !!id),
  )];

  const talentNameMap: Map<string, string> = new Map();
  const talentAvatarMap: Map<string, string | null> = new Map();
  if (talentIds.length > 0) {
    const { data: talents } = await supabase
      .from("talent_profiles")
      .select("id, full_name, avatar_url")
      .in("id", talentIds);
    for (const talent of talents ?? []) {
      talentNameMap.set(talent.id, talent.full_name ?? "Talento");
      talentAvatarMap.set(talent.id, (talent as { avatar_url?: string | null }).avatar_url ?? null);
    }
  }

  if (context.isOwner) {
    const contracts: AgencyContract[] = contractsData.map((contract) => {
      const talentId = contract.talent_user_id ?? contract.talent_id ?? null;
      return {
        id: contract.id,
        jobId: contract.job_id ?? null,
        jobTitle: contract.job_id ? (jobTitleMap.get(contract.job_id) ?? "Vaga do workspace") : "Vaga do workspace",
        talentId,
        talentName: talentId ? (talentNameMap.get(talentId) ?? "Talento") : "Talento",
        jobDate: contract.job_date ?? null,
        jobTime: contract.job_time ?? null,
        location: contract.location ?? null,
        jobDescription: contract.job_description ?? null,
        paymentAmount: contract.payment_amount ?? 0,
        paymentMethod: contract.payment_method ?? null,
        additionalNotes: contract.additional_notes ?? null,
        status: contract.status ?? "sent",
        paymentStatus: contract.payment_status ?? "pending",
        createdAt: contract.created_at ?? "",
        signedAt: contract.signed_at ?? null,
        agencySignedAt: contract.agency_signed_at ?? null,
        depositPaidAt: contract.deposit_paid_at ?? null,
        paidAt: contract.paid_at ?? null,
        contractFileUrl: contract.contract_file_url ? buildContractFileAccessUrl(contract.id, "original") : null,
        signedContractUrl: contract.signed_contract_url ? buildContractFileAccessUrl(contract.id, "signed") : null,
      };
    });

    return <AgencyContracts contracts={contracts} bookingsHref="/agency/workspace/bookings" showPaymentActions={false} />;
  }

  const premiumContracts: PremiumContract[] = contractsData.map((contract) => {
    const talentId = contract.talent_user_id ?? contract.talent_id ?? null;
    return {
      id: contract.id,
      jobId: contract.job_id ?? null,
      jobTitle: contract.job_id ? (jobTitleMap.get(contract.job_id) ?? "Vaga do workspace") : "Vaga do workspace",
      talentName: talentId ? (talentNameMap.get(talentId) ?? "Talento") : "Talento",
      talentAvatarUrl: talentId ? (talentAvatarMap.get(talentId) ?? null) : null,
      status: contract.status ?? "sent",
      paymentAmount: contract.payment_amount ?? 0,
      commissionAmount: contract.commission_amount ?? 0,
      netAmount: contract.net_amount ?? 0,
      jobDate: contract.job_date ?? null,
      location: contract.location ?? null,
      createdAt: contract.created_at ?? "",
      signedAt: contract.signed_at ?? null,
      paidAt: contract.paid_at ?? null,
      contractFileUrl: contract.contract_file_url ? buildContractFileAccessUrl(contract.id, "original") : null,
      signedContractUrl: contract.signed_contract_url ? buildContractFileAccessUrl(contract.id, "signed") : null,
    };
  });

  return <WorkspacePremiumContracts contracts={premiumContracts} lang={context.lang} />;
}
