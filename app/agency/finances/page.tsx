import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyFinances from "@/features/agency/AgencyFinances";
import type { AgencyTransaction, AgencyFinanceSummary } from "@/features/agency/AgencyFinances";

export const metadata: Metadata = { title: "Finances — Brisa Digital" };

export default async function AgencyFinancesPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: bookings }, { data: agency }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, talent_user_id, job_title, price, status, created_at")
      .eq("agency_id", user?.id ?? "")
      .order("created_at", { ascending: false }),
    supabase
      .from("agencies")
      .select("subscription_status, created_at")
      .eq("id", user?.id ?? "")
      .single(),
  ]);

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

  const bookingTransactions: AgencyTransaction[] = rows.map((b) => ({
    id:     b.id,
    talent: nameMap.get(b.talent_user_id) ?? "Unknown",
    job:    b.job_title ?? "",
    amount: b.price ?? 0,
    status: b.status ?? "pending",
    date:   b.created_at,
    type:   "booking" as const,
  }));

  // Generate recurring monthly subscription charges from account creation date
  const subTransactions: AgencyTransaction[] = [];
  if (agency?.subscription_status === "active" && agency?.created_at) {
    const start = new Date(agency.created_at);
    const now   = new Date();
    let current = new Date(start);
    let idx     = 0;

    // Past + current charges
    while (current <= now) {
      subTransactions.push({
        id:     `sub-${user?.id}-${idx}`,
        talent: "Platform",
        job:    "Pro Plan subscription",
        amount: 2500,
        status: "paid",
        date:   current.toISOString(),
        type:   "subscription" as const,
      });
      const next = new Date(current);
      next.setMonth(next.getMonth() + 1);
      current = next;
      idx++;
    }

    // Next upcoming charge
    subTransactions.push({
      id:     `sub-${user?.id}-next`,
      talent: "Platform",
      job:    "Pro Plan subscription",
      amount: 2500,
      status: "upcoming",
      date:   current.toISOString(),
      type:   "subscription" as const,
    });
  }

  const transactions: AgencyTransaction[] = [
    ...subTransactions,
    ...bookingTransactions,
  ];

  const completed = bookingTransactions.filter((t) => t.status === "paid" || t.status === "confirmed");
  const pending   = bookingTransactions.filter((t) => t.status === "pending" || t.status === "pending_payment");

  const completedTotal = completed.reduce((sum, t) => sum + t.amount, 0);
  const pendingTotal   = pending.reduce((sum, t) => sum + t.amount, 0);

  const summary: AgencyFinanceSummary = {
    totalSpent:        completedTotal + pendingTotal,
    pendingPayments:   pendingTotal,
    completedPayments: completedTotal,
  };

  // Last payment date = most recent paid booking date
  const lastPaid = completed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return (
    <AgencyFinances
      summary={summary}
      transactions={transactions}
      subscriptionStatus={(agency?.subscription_status ?? "active") as "active" | "inactive"}
      lastPaymentDate={lastPaid?.date ?? null}
    />
  );
}
