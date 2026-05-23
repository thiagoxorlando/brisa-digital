import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { buildContractFileAccessUrl } from "@/lib/contractFiles";
import TalentContracts from "@/features/talent/TalentContracts";
import type { TalentContract, ApprovedSubmission } from "@/features/talent/TalentContracts";
import { batchGetActiveDisputes } from "@/lib/contractState.server";
import { guardOpenSpacePage } from "@/lib/talentPortalLanding";

export const metadata: Metadata = { title: "Contratos — BrisaHub" };

export default async function TalentContractsPage() {
  const talentId = await guardOpenSpacePage();

  const supabase = createServerClient({ useServiceRole: true });

  // Fetch contracts and approved submissions in parallel
  const [contractsResult, subsResult] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, agency_id, job_id, job_date, job_time, location, job_description, payment_amount, payment_method, additional_notes, status, contract_file_url, signed_contract_url, created_at")
      .eq("talent_id", talentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("id, job_id, status")
      .eq("talent_user_id", talentId)   // submissions uses talent_user_id
      .eq("status", "approved"),
  ]);

  if (contractsResult.error) console.error("[TalentContractsPage] contracts:", contractsResult.error.message);
  if (subsResult.error)      console.error("[TalentContractsPage] submissions:", subsResult.error.message);

  const rows    = contractsResult.data ?? [];
  const subRows = subsResult.data      ?? [];

  const allJobIds = [...new Set([
    ...rows.map((c) => c.job_id),
    ...subRows.map((s) => s.job_id),
  ].filter((id): id is string => !!id))];
  const { data: jobs } = allJobIds.length
    ? await supabase.from("jobs").select("id, title, agency_id, workspace_id").in("id", allJobIds)
    : { data: [] };
  const openJobMap = new Map(
    (jobs ?? [])
      .filter((job) => !(job as { workspace_id?: string | null }).workspace_id)
      .map((job) => [job.id, { title: job.title ?? "Vaga sem titulo", agencyId: job.agency_id ?? "" }]),
  );

  const filteredRows = rows.filter((contract) => !contract.job_id || openJobMap.has(contract.job_id));
  const filteredSubRows = subRows.filter((submission) => submission.job_id && openJobMap.has(submission.job_id));
  const contractJobIds = new Set(filteredRows.map((c) => c.job_id).filter(Boolean));

  const activeDisputeMap = await batchGetActiveDisputes(filteredRows.map((c) => c.id));

  // Resolve agency names
  const agencyIds = [...new Set(filteredRows.map((c) => c.agency_id).filter((id): id is string => !!id))];
  const agencyMap = new Map<string, string>();
  if (agencyIds.length) {
    const { data: agencies } = await supabase
      .from("agencies")
      .select("id, company_name")
      .in("id", agencyIds);
    for (const a of agencies ?? []) agencyMap.set(a.id, a.company_name ?? "Agência sem nome");
  }

  // Approved submissions without a contract
  const pendingSubJobIds = (filteredSubRows ?? [])
    .filter((s) => s.job_id && !contractJobIds.has(s.job_id))
    .map((s) => s.job_id as string);

  let approvedSubmissions: ApprovedSubmission[] = [];
  if (pendingSubJobIds.length) {
    const jobRows = pendingSubJobIds
      .map((jobId) => openJobMap.get(jobId) ? { id: jobId, title: openJobMap.get(jobId)!.title, agency_id: openJobMap.get(jobId)!.agencyId } : null)
      .filter((row): row is { id: string; title: string; agency_id: string } => !!row);

    const jobAgencyIds = [...new Set((jobRows ?? []).map((j) => j.agency_id).filter(Boolean))];
    const jobAgencyMap = new Map<string, string>();
    if (jobAgencyIds.length) {
      const { data: jobAgencies } = await supabase
        .from("agencies")
        .select("id, company_name")
        .in("id", jobAgencyIds);
      for (const a of jobAgencies ?? []) jobAgencyMap.set(a.id, a.company_name ?? "Agência");
    }

    approvedSubmissions = (jobRows ?? []).map((j) => {
      const sub = (filteredSubRows ?? []).find((s) => s.job_id === j.id)!;
      return {
        submissionId: sub.id,
        jobId:        j.id,
        jobTitle:     j.title ?? "Vaga sem título",
        agencyId:     j.agency_id ?? "",
        agencyName:   j.agency_id ? (jobAgencyMap.get(j.agency_id) ?? "Agência") : "Agência",
      };
    });
  }

  const contracts: TalentContract[] = filteredRows.map((c) => ({
    id:              c.id,
    jobId:           c.job_id ?? null,
    agencyName:      c.agency_id ? (agencyMap.get(c.agency_id) ?? "Agência sem nome")  : "Agência sem nome",
    jobDate:         c.job_date          ?? null,
    jobTime:         c.job_time          ?? null,
    location:        c.location          ?? null,
    jobDescription:  c.job_description   ?? null,
    paymentAmount:   c.payment_amount    ?? 0,
    paymentMethod:   c.payment_method    ?? null,
    additionalNotes: c.additional_notes  ?? null,
    status:          c.status               ?? "sent",
    createdAt:       c.created_at           ?? "",
    contractFileUrl:   c.contract_file_url ? buildContractFileAccessUrl(c.id, "original") : null,
    signedContractUrl: c.signed_contract_url ? buildContractFileAccessUrl(c.id, "signed") : null,
    activeDisputeId: activeDisputeMap.get(c.id)?.id ?? null,
  }));

  return <TalentContracts contracts={contracts} approvedSubmissions={approvedSubmissions} />;
}
