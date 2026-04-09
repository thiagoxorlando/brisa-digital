import type { Metadata } from "next";
import AdminUsers from "@/features/admin/AdminUsers";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Admin — Users — Brisa Digital" };

const COMMISSION_RATE = 0.15;

export default async function AdminUsersPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: { users: authUsers } },
    { data: profiles },
    { data: talentProfiles },
    { data: agencies },
    { data: bookingsData },
  ] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("profiles").select("id, role"),
    supabase.from("talent_profiles").select("id, full_name").is("deleted_at", null),
    supabase.from("agencies").select("id, company_name").is("deleted_at", null),
    supabase.from("bookings").select("talent_user_id, agency_id, price, status"),
  ]);

  const roleMap   = new Map<string, string>();
  const talentMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();

  for (const p of profiles      ?? []) roleMap.set(p.id, p.role ?? "");
  for (const t of talentProfiles ?? []) talentMap.set(t.id, t.full_name ?? "");
  for (const a of agencies       ?? []) agencyMap.set(a.id, a.company_name ?? "");

  // Aggregate financials per user
  const earnedMap     = new Map<string, number>(); // talent → confirmed earnings (85%)
  const spentMap      = new Map<string, number>(); // agency → total booking spend
  const commissionMap = new Map<string, number>(); // talent → platform commission generated

  for (const b of bookingsData ?? []) {
    const price = b.price ?? 0;
    if (b.status === "confirmed") {
      if (b.talent_user_id) {
        earnedMap.set(b.talent_user_id, (earnedMap.get(b.talent_user_id) ?? 0) + Math.round(price * 0.85));
        commissionMap.set(b.talent_user_id, (commissionMap.get(b.talent_user_id) ?? 0) + Math.round(price * COMMISSION_RATE));
      }
      if (b.agency_id) {
        spentMap.set(b.agency_id, (spentMap.get(b.agency_id) ?? 0) + price);
      }
    }
  }

  const users = (authUsers ?? []).map((u) => {
    const role = roleMap.get(u.id) ?? "talent";
    const name =
      role === "agency"
        ? (agencyMap.get(u.id) || talentMap.get(u.id) || "")
        : (talentMap.get(u.id) || "");
    return {
      id:                  u.id,
      email:               u.email ?? "",
      name,
      role,
      created_at:          u.created_at ?? "",
      totalEarned:         earnedMap.get(u.id) ?? 0,
      totalSpent:          spentMap.get(u.id) ?? 0,
      commissionGenerated: commissionMap.get(u.id) ?? 0,
    };
  });

  return <AdminUsers users={users} />;
}
