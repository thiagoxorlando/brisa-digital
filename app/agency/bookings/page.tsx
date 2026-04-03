import type { Metadata } from "next";
import BookingList from "@/features/agency/BookingList";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Bookings — ucastanet" };

export default async function BookingsPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  let query = supabase
    .from("bookings")
    .select("id, talent_user_id, status, price, job_title, created_at")
    .order("created_at", { ascending: false });

  // Agencies only see their own bookings
  if (user) query = query.eq("agency_id", user.id);

  const { data, error } = await query;

  if (error) {
    console.error("[BookingsPage]", error.message);
  }

  // Resolve talent names from talent_profiles
  const talentIds = [
    ...new Set(
      (data ?? [])
        .map((r) => r.talent_user_id)
        .filter((id): id is string => !!id)
    ),
  ];

  const profileMap = new Map<string, string>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .in("id", talentIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p.full_name ?? "");
    }
  }

  const bookings = (data ?? []).map((row: Record<string, unknown>) => ({
    id:         String(row.id ?? ""),
    talentId:   String(row.talent_user_id ?? ""),
    talentName: profileMap.get(String(row.talent_user_id ?? "")) || "Unknown Talent",
    status:     String(row.status ?? "pending"),
    totalValue: Number(row.price ?? 0),
    jobTitle:   String(row.job_title ?? ""),
    createdAt:  String(row.created_at ?? ""),
  }));

  return <BookingList bookings={bookings} />;
}
