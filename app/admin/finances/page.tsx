import type { Metadata } from "next";
import AdminFinances, {
  type FinancesSummary,
  type FinancesBooking,
  type AgencyEntry,
} from "@/features/admin/AdminFinances";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Admin — Finances — ucastanet" };

const COMMISSION_RATE     = 0.15;
const REFERRAL_RATE       = 0.08;
const AGENCY_MONTHLY_FEE  = 2500;

export default async function AdminFinancesPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: bookingsData }, { data: agencyProfiles }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, job_title, talent_user_id, price, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, created_at")
      .eq("role", "agency")
      .order("created_at", { ascending: false }),
  ]);

  const rows = bookingsData ?? [];

  // Resolve talent names
  const talentIds = [...new Set(rows.map((b) => b.talent_user_id).filter(Boolean))] as string[];
  const talentMap = new Map<string, string>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .in("id", talentIds);
    for (const p of profiles ?? []) talentMap.set(p.id, p.full_name ?? "Unknown");
  }

  const bookings: FinancesBooking[] = rows.map((b) => ({
    id:         b.id,
    jobTitle:   b.job_title      ?? "—",
    talentName: b.talent_user_id ? (talentMap.get(b.talent_user_id) ?? "Unknown") : "Unknown",
    price:      b.price          ?? 0,
    status:     b.status         ?? "pending",
    created_at: b.created_at     ?? "",
  }));

  const confirmed    = bookings.filter((b) => b.status === "confirmed" || b.status === "paid");
  const pending      = bookings.filter((b) => b.status === "pending" || b.status === "pending_payment");
  const totalGross   = bookings.reduce((s, b) => s + b.price, 0);
  const confirmedVal = confirmed.reduce((s, b) => s + b.price, 0);
  const pendingVal   = pending.reduce((s, b) => s + b.price, 0);
  const commission   = Math.round(confirmedVal * COMMISSION_RATE);
  const referral     = Math.round(confirmedVal * REFERRAL_RATE);

  const summary: FinancesSummary = {
    totalGrossValue:     totalGross,
    confirmedGrossValue: confirmedVal,
    platformCommission:  commission,
    referralPayouts:     referral,
    netRevenue:          commission - referral,
    pendingValue:        pendingVal,
    totalBookings:       bookings.length,
    confirmedBookings:   confirmed.length,
  };

  const agencies: AgencyEntry[] = (agencyProfiles ?? []).map((a) => ({
    id:         a.id,
    name:       a.full_name ?? `Agency ${a.id.slice(0, 8)}`,
    joinedAt:   a.created_at ?? "",
    monthlyFee: AGENCY_MONTHLY_FEE,
  }));

  return <AdminFinances summary={summary} bookings={bookings} agencies={agencies} />;
}
