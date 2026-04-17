import type { Metadata } from "next";
import BookingList from "@/features/agency/BookingList";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Bookings — Brisa Digital" };

export default async function BookingsPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  let bookingQuery = supabase
    .from("bookings")
    .select("id, talent_user_id, job_id, status, price, job_title, created_at")
    .order("created_at", { ascending: false });

  if (user) bookingQuery = bookingQuery.eq("agency_id", user.id);

  const { data, error } = await bookingQuery;
  if (error) console.error("[BookingsPage]", error.message);

  const talentIds = [...new Set((data ?? []).map((r) => r.talent_user_id).filter((id): id is string => !!id))];

  // Fetch contracts by agency_id so we catch every booking regardless of
  // whether it has a job_id. Previously queried by job_id only, which left
  // contractId = null for any booking without a job → buttons did nothing.
  const [profilesRes, contractsRes] = await Promise.all([
    talentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)
      : Promise.resolve({ data: [] }),
    user
      ? supabase
          .from("contracts")
          .select("id, job_id, talent_id, status, signed_at, job_date, paid_at")
          .eq("agency_id", user.id)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map<string, string>();
  for (const p of profilesRes.data ?? []) profileMap.set(p.id, p.full_name ?? "");

  type ContractRow = { id: string; status: string; signed_at: string | null; job_date: string | null; paid_at: string | null };

  // Primary key: job_id::talent_id  (exact match)
  // Fallback key: talent_id         (for bookings with no job_id)
  const contractByJobTalent = new Map<string, ContractRow>();
  const contractByTalent    = new Map<string, ContractRow>();

  for (const c of contractsRes.data ?? []) {
    const row: ContractRow = {
      id:        c.id,
      status:    c.status,
      signed_at: c.signed_at ?? null,
      job_date:  c.job_date  ?? null,
      paid_at:   c.paid_at   ?? null,
    };
    if (c.job_id && c.talent_id) {
      contractByJobTalent.set(`${c.job_id}::${c.talent_id}`, row);
    }
    if (c.talent_id && !contractByTalent.has(c.talent_id)) {
      contractByTalent.set(c.talent_id, row);
    }
  }

  const bookings = (data ?? []).map((row) => {
    const contract =
      (row.job_id && row.talent_user_id
        ? contractByJobTalent.get(`${row.job_id}::${row.talent_user_id}`)
        : null)
      ?? (row.talent_user_id ? contractByTalent.get(row.talent_user_id) : null)
      ?? null;

    return {
      id:             String(row.id ?? ""),
      contractId:     contract?.id ?? null,
      talentId:       String(row.talent_user_id ?? ""),
      talentName:     profileMap.get(String(row.talent_user_id ?? "")) || "Talento sem nome",
      status:         contract?.status ?? String(row.status ?? "sent"),
      totalValue:     Number(row.price ?? 0),
      jobTitle:       String(row.job_title ?? ""),
      createdAt:      String(row.created_at ?? ""),
      contractSigned: contract?.signed_at ?? null,
      jobDate:        contract?.job_date ?? null,
      paidAt:         contract?.paid_at ?? null,
    };
  });

  return <BookingList bookings={bookings} />;
}
