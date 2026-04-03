import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyFinances from "@/features/agency/AgencyFinances";
import type { AgencyTransaction, AgencyFinanceSummary } from "@/features/agency/AgencyFinances";

export const metadata: Metadata = { title: "Finances — ucastanet" };

export default async function AgencyFinancesPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  let query = supabase
    .from("bookings")
    .select("id, talent_user_id, job_title, price, status, created_at")
    .order("created_at", { ascending: false });

  if (user) query = query.eq("agency_id", user.id);

  const { data: bookings } = await query;

  const rows = bookings ?? [];

  // Resolve talent names
  const talentIds = [...new Set(rows.map((b) => b.talent_user_id).filter((id): id is string => !!id))];
  const nameMap = new Map<string, string>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .in("id", talentIds);
    for (const p of profiles ?? []) nameMap.set(p.id, p.full_name ?? "Unknown");
  }

  const transactions: AgencyTransaction[] = rows.map((b) => ({
    id:     b.id,
    talent: nameMap.get(b.talent_user_id) ?? "Unknown",
    job:    b.job_title ?? "",
    amount: b.price ?? 0,
    status: b.status ?? "pending",
    date:   b.created_at,
  }));

  const completed = transactions.filter((t) => t.status === "confirmed");
  const pending   = transactions.filter((t) => t.status === "pending");

  const completedTotal = completed.reduce((sum, t) => sum + t.amount, 0);
  const pendingTotal   = pending.reduce((sum, t) => sum + t.amount, 0);

  const summary: AgencyFinanceSummary = {
    totalSpent:        completedTotal + pendingTotal,
    pendingPayments:   pendingTotal,
    completedPayments: completedTotal,
  };

  return <AgencyFinances summary={summary} transactions={transactions} />;
}
