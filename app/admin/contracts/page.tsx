import type { Metadata } from "next";
import AdminContracts from "@/features/admin/AdminContracts";
import type { AdminContractRow } from "@/features/admin/AdminContracts";
import { buildContractFileAccessUrl } from "@/lib/contractFiles";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Administracao - Contratos - BrisaHub" };

export default async function AdminContractsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: rows } = await supabase
    .from("contracts")
    .select("id, job_id, agency_id, talent_id, job_date, job_time, location, job_description, payment_amount, payment_method, additional_notes, status, payment_status, created_at, signed_at, agency_signed_at, deposit_paid_at, paid_at, contract_file_url, signed_contract_url")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const contractRows = rows ?? [];
  const talentIds = [...new Set(contractRows.map((contract) => contract.talent_id).filter(Boolean))] as string[];
  const agencyIds = [...new Set(contractRows.map((contract) => contract.agency_id).filter(Boolean))] as string[];
  const jobIds = [...new Set(contractRows.map((contract) => contract.job_id).filter(Boolean))] as string[];

  const [talentRes, agencyRes, jobsRes, authUsersRes, profilesRes] = await Promise.all([
    talentIds.length ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds) : Promise.resolve({ data: [] }),
    agencyIds.length ? supabase.from("agencies").select("id, user_id, company_name").in("id", agencyIds) : Promise.resolve({ data: [] }),
    jobIds.length ? supabase.from("jobs").select("id, title, workspace_id").in("id", jobIds) : Promise.resolve({ data: [] }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("profiles").select("id").is("deleted_at", null),
  ]);

  const validUserIds = new Set((authUsersRes.data?.users ?? []).map((user) => user.id));
  const validProfileIds = new Set((profilesRes.data ?? []).map((profile) => profile.id));
  const talentMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();
  const jobMap = new Map<string, string>();
  const contractJobWorkspaceIdMap = new Map<string, string | null>();

  for (const talent of talentRes.data ?? []) talentMap.set(talent.id, talent.full_name ?? "Talento órfão / usuário deletado");
  for (const agency of agencyRes.data ?? []) {
    const ownerId = (agency as { user_id?: string | null }).user_id ?? agency.id;
    const isOrphan = !ownerId || !validUserIds.has(ownerId) || !validProfileIds.has(ownerId);
    agencyMap.set(agency.id, isOrphan ? "Agência órfã / usuário deletado" : agency.company_name ?? "Agência sem nome");
  }
  for (const job of jobsRes.data ?? []) {
    jobMap.set(job.id, job.title ?? "Untitled Job");
    contractJobWorkspaceIdMap.set(job.id, (job as { workspace_id?: string | null }).workspace_id ?? null);
  }

  const contractWorkspaceIds = [...new Set([...contractJobWorkspaceIdMap.values()].filter((id): id is string => Boolean(id)))];
  const contractWorkspaceNameMap = new Map<string, string>();
  if (contractWorkspaceIds.length) {
    const { data: workspaces } = await supabase.from("premium_workspaces").select("id, name").in("id", contractWorkspaceIds).is("deleted_at", null);
    for (const workspace of workspaces ?? []) contractWorkspaceNameMap.set(workspace.id, workspace.name ?? "Workspace órfão");
  }

  const contracts: AdminContractRow[] = contractRows.map((contract) => {
    const workspaceId = contract.job_id ? (contractJobWorkspaceIdMap.get(contract.job_id) ?? null) : null;
    return {
      id: contract.id,
      jobId: contract.job_id ?? null,
      jobTitle: contract.job_id ? (jobMap.get(contract.job_id) ?? "Job órfão") : "Job órfão",
      talentId: contract.talent_id ?? null,
      talentName: contract.talent_id ? (talentMap.get(contract.talent_id) ?? "Talento órfão / usuário deletado") : "Talento órfão / usuário deletado",
      agencyName: contract.agency_id ? (agencyMap.get(contract.agency_id) ?? "Agência órfã / usuário deletado") : "—",
      workspaceId,
      workspaceName: workspaceId ? (contractWorkspaceNameMap.get(workspaceId) ?? "Workspace órfão") : null,
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

  return <AdminContracts contracts={contracts} />;
}
