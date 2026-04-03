import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyContracts from "@/features/agency/AgencyContracts";
import type { AgencyContract } from "@/features/agency/AgencyContracts";

export const metadata: Metadata = { title: "Contracts — ucastanet" };

export default async function AgencyContractsPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: rows } = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, job_date, job_time, location, job_description, payment_amount, payment_method, additional_notes, status, created_at")
    .eq("agency_id", user?.id ?? "")
    .order("created_at", { ascending: false });

  const contracts_data = rows ?? [];

  // Resolve talent names
  const talentIds = [...new Set(contracts_data.map((c) => c.talent_id).filter((id): id is string => !!id))];
  const talentMap = new Map<string, string>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .in("id", talentIds);
    for (const p of profiles ?? []) talentMap.set(p.id, p.full_name ?? "Unknown");
  }

  const contracts: AgencyContract[] = contracts_data.map((c) => ({
    id:              c.id,
    jobId:           c.job_id          ?? null,
    talentName:      c.talent_id ? (talentMap.get(c.talent_id) ?? "Unknown Talent") : "Unknown",
    jobDate:         c.job_date        ?? null,
    jobTime:         c.job_time        ?? null,
    location:        c.location        ?? null,
    jobDescription:  c.job_description ?? null,
    paymentAmount:   c.payment_amount  ?? 0,
    paymentMethod:   c.payment_method  ?? null,
    additionalNotes: c.additional_notes ?? null,
    status:          c.status          ?? "sent",
    createdAt:       c.created_at      ?? "",
  }));

  return <AgencyContracts contracts={contracts} />;
}
