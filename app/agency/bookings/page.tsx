import type { Metadata } from "next";
import BookingList from "@/features/agency/BookingList";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getUnifiedBookingStatus } from "@/lib/bookingStatus";

export const metadata: Metadata = { title: "Bookings — Brisa Digital" };

export default async function BookingsPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  // Single joined query — contracts are embedded per booking via the booking_id FK.
  // This is atomic: no separate query + join map that can go stale between fetches.
  let bookingQuery = supabase
    .from("bookings")
    .select(`
      id, talent_user_id, job_id, status, price, job_title, created_at,
      contracts!contracts_booking_id_fkey (
        id, status, signed_at, job_date, paid_at
      )
    `)
    .order("created_at", { ascending: false });

  if (user) bookingQuery = bookingQuery.eq("agency_id", user.id);

  const { data, error } = await bookingQuery;
  if (error) console.error("[BookingsPage]", error.message);

  const talentIds = [...new Set((data ?? []).map((r) => r.talent_user_id).filter((id): id is string => !!id))];

  const { data: profilesData } = talentIds.length
    ? await supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)
    : { data: [] };

  const profileMap = new Map<string, string>();
  for (const p of profilesData ?? []) profileMap.set(p.id, p.full_name ?? "");

  const bookings = (data ?? []).map((row) => {
    // contracts is an array (reverse FK); in practice there is exactly one per booking
    const contractArr = Array.isArray((row as any).contracts) ? (row as any).contracts : [];
    const contract = contractArr[0] ?? null;

    return {
      id:             String(row.id ?? ""),
      contractId:     contract?.id ?? null,
      talentId:       String(row.talent_user_id ?? ""),
      talentName:     profileMap.get(String(row.talent_user_id ?? "")) || "Talento sem nome",
      status:         String(row.status ?? "pending"),
      contractStatus: contract?.status ?? null,
      derivedStatus:  getUnifiedBookingStatus(String(row.status ?? "pending"), contract?.status ?? null),
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
