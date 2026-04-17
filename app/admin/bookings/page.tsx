import type { Metadata } from "next";
import AdminBookings from "@/features/admin/AdminBookings";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Admin — Bookings — Brisa Digital" };

export default async function AdminBookingsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("id, job_id, job_title, talent_user_id, agency_id, price, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = bookingsData ?? [];

  const talentIds = [...new Set(rows.map((b) => b.talent_user_id).filter((x): x is string => !!x))];
  const agencyIds = [...new Set(rows.map((b) => b.agency_id).filter((x): x is string => !!x))];

  type TalentRow  = { id: string; full_name: string | null };
  type AgencyRow  = { id: string; company_name: string | null };
  type ContractRow = {
    job_id:           string | null;
    talent_id:        string;
    agency_id:        string | null;
    status:           string;
    payment_amount:   number | null;
    created_at:       string;
    signed_at:        string | null;
    confirmed_at:     string | null;
    agency_signed_at: string | null;
  };

  const [talentData, agencyData, contractData] = await Promise.all([
    (async (): Promise<TalentRow[]> => {
      if (!talentIds.length) return [];
      const { data } = await supabase
        .from("talent_profiles")
        .select("id, full_name")
        .in("id", talentIds);
      return data ?? [];
    })(),
    (async (): Promise<AgencyRow[]> => {
      if (!agencyIds.length) return [];
      const { data } = await supabase
        .from("agencies")
        .select("id, company_name")
        .in("id", agencyIds);
      return data ?? [];
    })(),
    // Look up contracts by talent_id — catches bookings with or without a job_id
    (async (): Promise<ContractRow[]> => {
      if (!talentIds.length) return [];
      const { data } = await supabase
        .from("contracts")
        .select("job_id, talent_id, agency_id, status, payment_amount, created_at, signed_at, confirmed_at, agency_signed_at")
        .in("talent_id", talentIds);
      return data ?? [];
    })(),
  ]);

  const talentMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();
  for (const t of talentData) talentMap.set(t.id, t.full_name ?? "Sem nome");
  for (const a of agencyData) agencyMap.set(a.id, a.company_name ?? "Sem nome");

  // Group contracts by talent_id for fast lookup
  const contractsByTalent = new Map<string, ContractRow[]>();
  for (const c of contractData) {
    const list = contractsByTalent.get(c.talent_id) ?? [];
    list.push(c);
    contractsByTalent.set(c.talent_id, list);
  }

  function findContract(
    talentId: string,
    agencyId: string | null,
    jobId: string | null
  ): ContractRow | null {
    const candidates = (contractsByTalent.get(talentId) ?? []).filter(
      (c) => c.agency_id === agencyId
    );
    if (!candidates.length) return null;
    if (jobId) {
      const exact = candidates.find((c) => c.job_id === jobId);
      if (exact) return exact;
    }
    return candidates.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] ?? null;
  }

  const bookings = rows.map((b) => {
    const contract = b.talent_user_id
      ? findContract(b.talent_user_id, b.agency_id ?? null, b.job_id ?? null)
      : null;

    return {
      id:                  b.id,
      jobTitle:            b.job_title       ?? "—",
      talentName:          b.talent_user_id  ? (talentMap.get(b.talent_user_id) ?? "Talento sem nome") : "Sem nome",
      agencyName:          b.agency_id       ? (agencyMap.get(b.agency_id)      ?? "Agência sem nome") : "—",
      status:              b.status          ?? "pending",
      price:               b.price           ?? 0,
      contractAmount:      contract?.payment_amount ?? null,
      created_at:          b.created_at      ?? "",
      contractStatus:      contract?.status         ?? null,
      contractSentAt:      contract?.created_at     ?? null,
      contractSignedAt:    contract?.signed_at      ?? null,
      contractConfirmedAt: contract?.confirmed_at ?? contract?.agency_signed_at ?? null,
    };
  });

  return <AdminBookings bookings={bookings} />;
}
