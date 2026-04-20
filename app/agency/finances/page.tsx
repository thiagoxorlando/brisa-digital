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

  const [{ data: bookings }, { data: walletTxs }, { data: savedCards }, { data: profile }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, talent_user_id, job_title, price, status, created_at")
      .eq("agency_id", user?.id ?? "")
      .order("created_at", { ascending: false }),
    supabase
      .from("wallet_transactions")
      .select("id, type, amount, description, created_at")
      .eq("user_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("saved_cards")
      .select("id, brand, last_four, holder_name, expiry_month, expiry_year, created_at")
      .eq("user_id", user?.id ?? "")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("wallet_balance")
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
    for (const p of profiles ?? []) nameMap.set(p.id, p.full_name ?? "Sem nome");
  }

  const bookingTxs: AgencyTransaction[] = rows.map((b) => ({
    id:     b.id,
    kind:   "booking" as const,
    talent: nameMap.get(b.talent_user_id) ?? "Sem nome",
    job:    b.job_title ?? "",
    amount: b.price ?? 0,
    status: b.status ?? "pending",
    date:   b.created_at,
  }));

  const walletRows: AgencyTransaction[] = (walletTxs ?? []).map((w) => ({
    id:          w.id,
    kind:        "wallet" as const,
    talent:      "",
    job:         "",
    amount:      w.amount ?? 0,
    status:      w.type ?? "payment",
    date:        w.created_at,
    description: w.description ?? undefined,
  }));

  const transactions: AgencyTransaction[] = [
    ...bookingTxs,
    ...walletRows,
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const completed = bookingTxs.filter((t) => t.status === "paid" || t.status === "confirmed");
  const pending   = bookingTxs.filter((t) => t.status === "pending" || t.status === "pending_payment");

  const completedTotal = completed.reduce((sum, t) => sum + t.amount, 0);
  const pendingTotal   = pending.reduce((sum, t) => sum + t.amount, 0);

  const summary: AgencyFinanceSummary = {
    totalSpent:        completedTotal + pendingTotal,
    pendingPayments:   pendingTotal,
    completedPayments: completedTotal,
    walletBalance:     profile?.wallet_balance ?? 0,
  };

  return (
    <AgencyFinances
      summary={summary}
      transactions={transactions}
      savedCards={savedCards ?? []}
      mpPublicKey={process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY ?? ""}
    />
  );
}
