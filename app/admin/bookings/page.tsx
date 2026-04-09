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

  // Resolve talent and agency names
  const talentIds = [...new Set(rows.map((b) => b.talent_user_id).filter(Boolean))] as string[];
  const agencyIds = [...new Set(rows.map((b) => b.agency_id).filter(Boolean))] as string[];
  const jobIds    = [...new Set(rows.map((b) => b.job_id).filter(Boolean))] as string[];

  const [talentRes, agencyRes, contractsRes] = await Promise.all([
    talentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)
      : Promise.resolve({ data: [] }),
    agencyIds.length
      ? supabase.from("agencies").select("id, company_name").in("id", agencyIds)
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase
          .from("contracts")
          .select("job_id, talent_id, status, created_at")
          .in("job_id", jobIds)
      : Promise.resolve({ data: [] }),
  ]);

  const talentMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();
  for (const t of talentRes.data ?? []) talentMap.set(t.id, t.full_name ?? "Unknown");
  for (const a of agencyRes.data ?? []) agencyMap.set(a.id, a.company_name ?? "Unknown");

  // Build a map: `${job_id}:${talent_id}` → contract row
  type ContractRow = { status: string; created_at: string };
  const contractMap = new Map<string, ContractRow>();
  for (const c of contractsRes.data ?? []) {
    if (c.job_id && c.talent_id) {
      contractMap.set(`${c.job_id}:${c.talent_id}`, { status: c.status, created_at: c.created_at });
    }
  }

  const bookings = rows.map((b) => {
    const contract = b.job_id && b.talent_user_id
      ? contractMap.get(`${b.job_id}:${b.talent_user_id}`) ?? null
      : null;

    return {
      id:                 b.id,
      jobTitle:           b.job_title        ?? "—",
      talentName:         b.talent_user_id   ? (talentMap.get(b.talent_user_id) ?? "Unknown Talent") : "Unknown",
      agencyName:         b.agency_id        ? (agencyMap.get(b.agency_id)      ?? "Unknown Agency") : "—",
      status:             b.status           ?? "pending",
      price:              b.price            ?? 0,
      created_at:         b.created_at       ?? "",
      // contract fields — use booking created_at as accepted_at proxy
      contractStatus:     contract?.status   ?? null,
      contractSentAt:     contract?.created_at ?? null,
      contractAcceptedAt: contract?.status === "accepted" ? b.created_at : null,
    };
  });

  return <AdminBookings bookings={bookings} />;
}
