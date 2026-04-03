import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import AdminContracts from "@/features/admin/AdminContracts";
import type { AdminContractRow } from "@/features/admin/AdminContracts";

export const metadata: Metadata = { title: "Admin — Contracts — ucastanet" };

export default async function AdminContractsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: rows } = await supabase
    .from("contracts")
    .select("id, agency_id, talent_id, job_date, location, job_description, payment_amount, status, created_at")
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
  for (const t of talentRes.data ?? []) talentMap.set(t.id, t.full_name ?? "Unknown");
  for (const a of agencyRes.data ?? []) agencyMap.set(a.id, a.company_name ?? "Unknown");

  const contracts: AdminContractRow[] = contracts_data.map((c) => ({
    id:             c.id,
    talentName:     c.talent_id ? (talentMap.get(c.talent_id) ?? "Unknown") : "Unknown",
    agencyName:     c.agency_id ? (agencyMap.get(c.agency_id) ?? "Unknown") : "—",
    jobDate:        c.job_date        ?? null,
    location:       c.location        ?? null,
    jobDescription: c.job_description ?? null,
    paymentAmount:  c.payment_amount  ?? 0,
    status:         c.status          ?? "sent",
    createdAt:      c.created_at      ?? "",
  }));

  return <AdminContracts contracts={contracts} />;
}
