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
  const jobIds    = [...new Set((data ?? []).map((r) => r.job_id).filter((id): id is string => !!id))];

  const [profilesRes, contractsRes] = await Promise.all([
    talentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase.from("contracts").select("job_id, talent_id, status, signed_at, job_date, paid_at").in("job_id", jobIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map<string, string>();
  for (const p of profilesRes.data ?? []) profileMap.set(p.id, p.full_name ?? "");

  // Map job_id → contract for this talent
  const contractMap = new Map<string, { status: string; signed_at: string | null; job_date: string | null; paid_at: string | null }>();
  for (const c of contractsRes.data ?? []) {
    if (c.job_id) contractMap.set(`${c.job_id}::${c.talent_id}`, { status: c.status, signed_at: c.signed_at ?? null, job_date: c.job_date ?? null, paid_at: c.paid_at ?? null });
  }

  const bookings = (data ?? []).map((row) => {
    const contract = (row.job_id && row.talent_user_id)
      ? contractMap.get(`${row.job_id}::${row.talent_user_id}`)
      : null;
    return {
      id:              String(row.id ?? ""),
      talentId:        String(row.talent_user_id ?? ""),
      talentName:      profileMap.get(String(row.talent_user_id ?? "")) || "Unknown Talent",
      status:          String(row.status ?? "pending"),
      totalValue:      Number(row.price ?? 0),
      jobTitle:        String(row.job_title ?? ""),
      createdAt:       String(row.created_at ?? ""),
      contractStatus:  contract?.status ?? null,
      contractSigned:  contract?.signed_at ?? null,
      jobDate:         contract?.job_date ?? null,
      paidAt:          contract?.paid_at ?? null,
    };
  });

  return <BookingList bookings={bookings} />;
}
