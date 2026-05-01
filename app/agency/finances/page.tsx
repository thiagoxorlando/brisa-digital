import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyFinances from "@/features/agency/AgencyFinances";
import type { AgencyTransaction, AgencyFinanceSummary } from "@/features/agency/AgencyFinances";
import { WITHDRAWAL_MIN_AMOUNT } from "@/lib/withdrawal-fee";

export const metadata: Metadata = { title: "Financeiro — BrisaHub" };

const ESCROW_MATCH_WINDOW_MS = 5 * 60 * 1000;

export default async function AgencyFinancesPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: bookings }, { data: walletTxs }, { data: profile }, { data: contracts }, { data: agencyRow }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, talent_user_id, job_title, price, status, created_at")
      .eq("agency_id", user?.id ?? "")
      .order("created_at", { ascending: false }),
    supabase
      .from("wallet_transactions")
      .select("id, type, amount, description, created_at, idempotency_key, status, provider, provider_status, admin_note, processed_at")
      .eq("user_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user?.id ?? "")
      .single(),
    supabase
      .from("contracts")
      .select("id, booking_id, status, payment_amount, confirmed_at, agency_signed_at, deposit_paid_at")
      .eq("agency_id", user?.id ?? "")
      .in("status", ["confirmed", "paid", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("agencies")
      .select("pix_key_type, pix_key_value, pix_holder_name")
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

  const contractRows = contracts ?? [];
  const contractByEscrowKey = new Map(contractRows.map((c) => [`escrow_${c.id}`, c]));
  const fallbackMatchedContracts = new Set<string>();

  function findEscrowContract(w: { amount: number | null; created_at: string; idempotency_key?: string | null }) {
    const keyed = w.idempotency_key ? contractByEscrowKey.get(w.idempotency_key) : null;
    if (keyed) return keyed;

    const txTime = new Date(w.created_at).getTime();
    const matches = contractRows.filter((c) => {
      if (fallbackMatchedContracts.has(c.id)) return false;
      if (Math.abs(Number(c.payment_amount ?? 0) - Number(w.amount ?? 0)) > 0.01) return false;

      const lockDate = c.confirmed_at ?? c.deposit_paid_at ?? c.agency_signed_at;
      if (!lockDate) return false;

      return Math.abs(new Date(lockDate).getTime() - txTime) <= ESCROW_MATCH_WINDOW_MS;
    });

    if (matches.length !== 1) return null;
    fallbackMatchedContracts.add(matches[0].id);
    return matches[0];
  }

  const walletRows: AgencyTransaction[] = (walletTxs ?? []).map((w) => {
    let status = w.type ?? "payment";
    let description = w.description ?? undefined;
    let bookingId: string | null = null;

    if (w.type === "deposit") {
      const normalized = (w.status ?? "").toLowerCase();
      if (normalized === "paid" || normalized === "completed" || normalized === "confirmed") {
        status = normalized;
      } else if (normalized === "pending" || w.provider_status === "pending_checkout") {
        status = "pending";
      } else {
        status = "deposit";
      }
    }

    if (status === "escrow_lock") {
      const contract = findEscrowContract(w);
      bookingId = contract?.booking_id ?? null;
      if (contract?.status === "paid") {
        status = "escrow_released";
        description = "Custódia liberada após pagamento";
      } else if (contract?.status === "cancelled") {
        status = "escrow_refunded";
        description = "Custódia estornada após cancelamento";
      }
    }

    return {
      id:              w.id,
      kind:            "wallet" as const,
      talent:          "",
      job:             "",
      amount:          w.amount ?? 0,
      status,
      date:            w.created_at,
      description,
      bookingId,
      href:            bookingId ? `/agency/bookings?booking_id=${bookingId}` : undefined,
      withdrawalStatus: w.type === "withdrawal" ? (w.status ?? null) : undefined,
      adminNote:        w.type === "withdrawal" ? ((w as Record<string, unknown>).admin_note    as string | null ?? null) : undefined,
      processedAt:      w.type === "withdrawal" ? ((w as Record<string, unknown>).processed_at as string | null ?? null) : undefined,
    };
  });

  const transactions: AgencyTransaction[] = walletRows
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const completed = bookingTxs.filter((t) => t.status === "paid" || t.status === "confirmed");
  const pending   = bookingTxs.filter((t) => t.status === "pending" || t.status === "pending_payment");

  const completedTotal = completed.reduce((sum, t) => sum + t.amount, 0);
  const pendingTotal   = pending.reduce((sum, t) => sum + t.amount, 0);
  const { data: autoWithdrawableBalanceRaw } = await supabase.rpc("get_auto_withdrawable_balance", {
    p_user_id: user?.id ?? "",
  });

  const summary: AgencyFinanceSummary = {
    totalSpent:        completedTotal + pendingTotal,
    pendingPayments:   pendingTotal,
    completedPayments: completedTotal,
    walletBalance:     profile?.wallet_balance ?? 0,
    autoWithdrawableBalance: Number(autoWithdrawableBalanceRaw ?? 0),
  };

  const agencyPix = agencyRow?.pix_key_value
    ? { pix_key_type: agencyRow.pix_key_type ?? null, pix_key_value: agencyRow.pix_key_value, pix_holder_name: agencyRow.pix_holder_name ?? null }
    : null;

  return (
    <AgencyFinances
      summary={summary}
      transactions={transactions}
      agencyPix={agencyPix}
      withdrawalMinAmount={WITHDRAWAL_MIN_AMOUNT}
      profileCpfCnpj={typeof (profile as Record<string, unknown> | null)?.cpf_cnpj === "string" ? ((profile as Record<string, unknown>).cpf_cnpj as string) : ""}
    />
  );
}
