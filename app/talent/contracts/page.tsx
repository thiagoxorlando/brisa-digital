import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import TalentContracts from "@/features/talent/TalentContracts";
import type { TalentContract } from "@/features/talent/TalentContracts";

export const metadata: Metadata = { title: "Contracts — ucastanet" };

export default async function TalentContractsPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: rows } = await supabase
    .from("contracts")
    .select("id, agency_id, job_date, job_time, location, job_description, payment_amount, payment_method, additional_notes, status, created_at")
    .eq("talent_id", user?.id ?? "")
    .order("created_at", { ascending: false });

  const contracts_data = rows ?? [];

  // Resolve agency names
  const agencyIds = [...new Set(contracts_data.map((c) => c.agency_id).filter((id): id is string => !!id))];
  const agencyMap = new Map<string, string>();
  if (agencyIds.length) {
    const { data: agencies } = await supabase
      .from("agencies")
      .select("id, company_name")
      .in("id", agencyIds);
    for (const a of agencies ?? []) agencyMap.set(a.id, a.company_name ?? "Unknown Agency");
  }

  const contracts: TalentContract[] = contracts_data.map((c) => ({
    id:              c.id,
    agencyName:      c.agency_id ? (agencyMap.get(c.agency_id) ?? "Unknown Agency") : "Unknown Agency",
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

  return <TalentContracts contracts={contracts} />;
}
