import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyContracts from "@/features/agency/AgencyContracts";
import type { AgencyContract } from "@/features/agency/AgencyContracts";

export const metadata: Metadata = { title: "Contracts — Brisa Digital" };

export default async function AgencyContractsPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: rows } = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, job_date, job_time, location, job_description, payment_amount, payment_method, additional_notes, status, payment_status, contract_file_url, signed_contract_url, created_at, signed_at, agency_signed_at, deposit_paid_at, paid_at")
    .eq("agency_id", user?.id ?? "")
    .order("created_at", { ascending: false });

  const contracts_data = rows ?? [];

  // Resolve talent names + job titles in parallel
  const talentIds = [...new Set(contracts_data.map((c) => c.talent_id).filter((id): id is string => !!id))];
  const jobIds    = [...new Set(contracts_data.map((c) => c.job_id).filter((id): id is string => !!id))];

  const talentMap = new Map<string, string>();
  const jobMap    = new Map<string, string>();

  await Promise.all([
    talentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)
          .then(({ data }) => { for (const p of data ?? []) talentMap.set(p.id, p.full_name ?? "Sem nome"); })
      : Promise.resolve(),
    jobIds.length
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
          .then(({ data }) => { for (const j of data ?? []) jobMap.set(j.id, j.title ?? "Untitled Job"); })
      : Promise.resolve(),
  ]);

  const contracts: AgencyContract[] = contracts_data.map((c) => ({
    id:              c.id,
    jobId:           c.job_id          ?? null,
    jobTitle:        c.job_id ? (jobMap.get(c.job_id) ?? "Untitled Job") : "Untitled Job",
    talentId:        c.talent_id       ?? null,
    talentName:      c.talent_id ? (talentMap.get(c.talent_id) ?? "Talento sem nome")  : "Sem nome",
    jobDate:         c.job_date        ?? null,
    jobTime:         c.job_time        ?? null,
    location:        c.location        ?? null,
    jobDescription:  c.job_description ?? null,
    paymentAmount:   c.payment_amount  ?? 0,
    paymentMethod:   c.payment_method  ?? null,
    additionalNotes: c.additional_notes ?? null,
    status:          c.status          ?? "sent",
    paymentStatus:   c.payment_status  ?? "pending",
    createdAt:       c.created_at      ?? "",
    signedAt:        c.signed_at         ?? null,
    agencySignedAt:  c.agency_signed_at  ?? null,
    depositPaidAt:   c.deposit_paid_at   ?? null,
    paidAt:          c.paid_at           ?? null,
    contractFileUrl:       c.contract_file_url    ?? null,
    signedContractUrl:     (c as any).signed_contract_url ?? null,
  }));

  return <AgencyContracts contracts={contracts} />;
}
