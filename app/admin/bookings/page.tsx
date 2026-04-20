import type { Metadata } from "next";
import AdminBookings from "@/features/admin/AdminBookings";
import { createServerClient } from "@/lib/supabase";
import { getUnifiedBookingStatus } from "@/lib/bookingStatus";

export const metadata: Metadata = { title: "Admin — Bookings — Brisa Digital" };

export default async function AdminBookingsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  // Single joined query — contract embedded via the booking_id FK (no stale join maps)
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(`
      id, job_id, job_title, talent_user_id, agency_id, price, status, created_at,
      contracts!contracts_booking_id_fkey (
        id, status, payment_amount, created_at, signed_at, confirmed_at, agency_signed_at
      )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = bookingsData ?? [];

  const talentIds = [...new Set(rows.map((b) => b.talent_user_id).filter((x): x is string => !!x))];
  const agencyIds = [...new Set(rows.map((b) => b.agency_id).filter((x): x is string => !!x))];

  const [talentData, agencyData] = await Promise.all([
    talentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
    agencyIds.length
      ? supabase.from("agencies").select("id, company_name").in("id", agencyIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const talentMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();
  for (const t of talentData) talentMap.set(t.id, t.full_name ?? "Sem nome");
  for (const a of agencyData) agencyMap.set(a.id, a.company_name ?? "Sem nome");

  const bookings = rows.map((b) => {
    const contractArr = Array.isArray((b as any).contracts) ? (b as any).contracts : [];
    const contract = contractArr[0] ?? null;

    return {
      id:                  b.id,
      jobTitle:            b.job_title      ?? "—",
      talentName:          b.talent_user_id ? (talentMap.get(b.talent_user_id) ?? "Talento sem nome") : "Sem nome",
      agencyName:          b.agency_id      ? (agencyMap.get(b.agency_id)      ?? "Agência sem nome") : "—",
      status:              b.status         ?? "pending",
      contractStatus:      contract?.status         ?? null,
      derivedStatus:       getUnifiedBookingStatus(b.status ?? "pending", contract?.status ?? null),
      price:               b.price          ?? 0,
      contractAmount:      contract?.payment_amount ?? null,
      created_at:          b.created_at     ?? "",
      contractSentAt:      contract?.created_at     ?? null,
      contractSignedAt:    contract?.signed_at      ?? null,
      contractConfirmedAt: contract?.confirmed_at ?? contract?.agency_signed_at ?? null,
    };
  });

  return <AdminBookings bookings={bookings} />;
}
