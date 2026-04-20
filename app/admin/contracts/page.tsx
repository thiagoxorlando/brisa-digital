import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import AdminContracts from "@/features/admin/AdminContracts";
import type { AdminContractRow } from "@/features/admin/AdminContracts";

export const metadata: Metadata = { title: "Admin — Contracts — Brisa Digital" };

export default async function AdminContractsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: rows } = await supabase
    .from("contracts")
    .select("id, job_id, agency_id, talent_id, job_date, job_time, location, job_description, payment_amount, payment_method, additional_notes, status, payment_status, created_at, signed_at, agency_signed_at, deposit_paid_at, paid_at, contract_file_url, signed_contract_url")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const contracts_data = rows ?? [];

  const talentIds = [...new Set(contracts_data.map((c) => c.talent_id).filter(Boolean))] as string[];
  const agencyIds = [...new Set(contracts_data.map((c) => c.agency_id).filter(Boolean))] as string[];

  const [talentRes, agencyRes] = await Promise.all([
    talentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)
      : Promise.resolve({ data: [] }),
    agencyIds.length
      ? supabase.from("agencies").select("id, company_name").in("id", agencyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const talentMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();
  for (const t of talentRes.data ?? []) talentMap.set(t.id, t.full_name ?? "Sem nome");
  for (const a of agencyRes.data ?? []) agencyMap.set(a.id, a.company_name ?? "Sem nome");

  // Resolve job titles
  const jobIds = [...new Set(contracts_data.map((c) => c.job_id).filter(Boolean))] as string[];
  const jobMap = new Map<string, string>();
  if (jobIds.length) {
    const { data: jobs } = await supabase.from("jobs").select("id, title").in("id", jobIds);
    for (const j of jobs ?? []) jobMap.set(j.id, j.title ?? "Untitled Job");
  }

  const contracts: AdminContractRow[] = contracts_data.map((c) => ({
    id:              c.id,
    jobId:           c.job_id          ?? null,
    jobTitle:        c.job_id ? (jobMap.get(c.job_id) ?? "Untitled Job") : "Untitled Job",
    talentId:        c.talent_id       ?? null,
    talentName:      c.talent_id ? (talentMap.get(c.talent_id) ?? "Sem nome")  : "Sem nome",
    agencyName:      c.agency_id ? (agencyMap.get(c.agency_id) ?? "Sem nome") : "—",
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
    signedAt:        c.signed_at       ?? null,
    agencySignedAt:  c.agency_signed_at ?? null,
    depositPaidAt:     c.deposit_paid_at    ?? null,
    paidAt:            c.paid_at            ?? null,
    contractFileUrl:   c.contract_file_url  ?? null,
    signedContractUrl: c.signed_contract_url ?? null,
  }));

  return <AdminContracts contracts={contracts} />;
}
