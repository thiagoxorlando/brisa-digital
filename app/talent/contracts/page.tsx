import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import TalentContracts from "@/features/talent/TalentContracts";
import type { TalentContract, ApprovedSubmission } from "@/features/talent/TalentContracts";

export const metadata: Metadata = { title: "Contracts — Brisa Digital" };

export default async function TalentContractsPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });
  const talentId = user?.id ?? "";

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

  const contractJobIds = new Set(rows.map((c) => c.job_id).filter(Boolean));

  // Resolve agency names
  const agencyIds = [...new Set(rows.map((c) => c.agency_id).filter((id): id is string => !!id))];
  const agencyMap = new Map<string, string>();
  if (agencyIds.length) {
    const { data: agencies } = await supabase
      .from("agencies")
      .select("id, company_name")
      .in("id", agencyIds);
    for (const a of agencies ?? []) agencyMap.set(a.id, a.company_name ?? "Agência sem nome");
  }

  // Approved submissions without a contract
  const pendingSubJobIds = (subRows ?? [])
    .filter((s) => s.job_id && !contractJobIds.has(s.job_id))
    .map((s) => s.job_id as string);

  let approvedSubmissions: ApprovedSubmission[] = [];
  if (pendingSubJobIds.length) {
    const { data: jobRows } = await supabase
      .from("jobs")
      .select("id, title, agency_id")
      .in("id", pendingSubJobIds);

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
      const sub = (subRows ?? []).find((s) => s.job_id === j.id)!;
      return {
        submissionId: sub.id,
        jobId:        j.id,
        jobTitle:     j.title ?? "Vaga sem título",
        agencyId:     j.agency_id ?? "",
        agencyName:   j.agency_id ? (jobAgencyMap.get(j.agency_id) ?? "Agência") : "Agência",
      };
    });
  }

  const contracts: TalentContract[] = rows.map((c) => ({
    id:              c.id,
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
    contractFileUrl:   c.contract_file_url   ?? null,
    signedContractUrl: c.signed_contract_url ?? null,
  }));

  return <TalentContracts contracts={contracts} approvedSubmissions={approvedSubmissions} />;
}
