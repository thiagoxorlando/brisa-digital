import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyFinances from "@/features/agency/AgencyFinances";
import type { AgencyFinanceSummary } from "@/features/agency/AgencyFinances";
import { WITHDRAWAL_MIN_AMOUNT } from "@/lib/withdrawal-fee";
import { getOwnerTotalActiveAllocations } from "@/lib/premiumWorkspace.server";
import { buildAgencyWalletLedgerRows, type AgencyLedgerRow } from "@/lib/readModels/agencyLedger";

export const metadata: Metadata = { title: "Financeiro — BrisaHub" };

export default async function AgencyFinancesPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: bookings }, { data: walletTxs }, { data: profile }, { data: contracts }, { data: agencyRow }, { data: agentAllocTxs }, activelyAllocated] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, talent_user_id, job_id, job_title, price, status, created_at")
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
      .select("id, booking_id, job_id, status, payment_amount, confirmed_at, agency_signed_at, deposit_paid_at")
      .eq("agency_id", user?.id ?? "")
      .in("status", ["confirmed", "paid", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("agencies")
      .select("pix_key_type, pix_key_value, pix_holder_name")
      .eq("id", user?.id ?? "")
      .single(),
    // Agent allocation history entries for the Open Space transaction ledger
    supabase
      .from("premium_agent_wallet_transactions")
      .select("id, type, amount, note, created_at")
      .eq("owner_user_id", user?.id ?? "")
      .eq("status", "completed")
      .is("reversed_at", null)
      .in("type", ["allocation", "allocation_reversal"])
      .order("created_at", { ascending: false })
      .limit(50),
    // Total actively allocated — used to compute the owner's real usable balance
    getOwnerTotalActiveAllocations(user?.id ?? ""),
  ]);

  const rows = bookings ?? [];
  const jobIds = [...new Set(rows.map((booking) => booking.job_id).filter((id): id is string => !!id))];
  const contractJobIds = [...new Set((contracts ?? []).map((contract) => contract.job_id).filter((id): id is string => !!id))];
  const allJobIds = [...new Set([...jobIds, ...contractJobIds])];
  const { data: jobs } = allJobIds.length
    ? await supabase.from("jobs").select("id, workspace_id").in("id", allJobIds)
    : { data: [] };
  const openJobIds = new Set(
    (jobs ?? [])
      .filter((job) => !(job as { workspace_id?: string | null }).workspace_id)
      .map((job) => job.id),
  );
  const openBookings = rows.filter((booking) => !booking.job_id || openJobIds.has(String(booking.job_id)));
  const openContracts = (contracts ?? []).filter((contract) => !contract.job_id || openJobIds.has(String(contract.job_id)));
  // Resolve talent names
  const talentIds = [...new Set(openBookings.map((b) => b.talent_user_id).filter((id): id is string => !!id))];
  const nameMap = new Map<string, string>();
  if (talentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .in("id", talentIds);
    for (const p of profiles ?? []) nameMap.set(p.id, p.full_name ?? "Sem nome");
  }

  const bookingTxs: AgencyLedgerRow[] = openBookings.map((b) => ({
    id:     b.id,
    kind:   "booking" as const,
    talent: nameMap.get(b.talent_user_id) ?? "Sem nome",
    job:    b.job_title ?? "",
    amount: b.price ?? 0,
    status: b.status ?? "pending",
    date:   b.created_at,
  }));

  // Use ALL contracts (open space + workspace) for escrow matching so that
  // Premium workspace paid/cancelled/rejected contracts resolve correctly.
  const transactions: AgencyLedgerRow[] = buildAgencyWalletLedgerRows(
    walletTxs ?? [],
    contracts ?? [],
    agentAllocTxs ?? [],
  );

  const completed = bookingTxs.filter((t) => t.status === "paid" || t.status === "confirmed");
  const pending   = bookingTxs.filter((t) => t.status === "pending" || t.status === "pending_payment");

  const completedTotal = completed.reduce((sum, t) => sum + t.amount, 0);
  const pendingTotal   = pending.reduce((sum, t) => sum + t.amount, 0);

  const summary: AgencyFinanceSummary = {
    totalSpent:        completedTotal + pendingTotal,
    pendingPayments:   pendingTotal,
    completedPayments: completedTotal,
    walletBalance:     profile?.wallet_balance ?? 0,
    allocatedToAgents: activelyAllocated,
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
