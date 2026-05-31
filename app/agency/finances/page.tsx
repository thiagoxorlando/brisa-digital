import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyFinances from "@/features/agency/AgencyFinances";
import type { AgencyFinanceSummary } from "@/features/agency/AgencyFinances";
import { WITHDRAWAL_MIN_AMOUNT } from "@/lib/withdrawal-fee";
import { getPlatformSettings } from "@/lib/platformSettings.server";
import { getOwnerTotalActiveAllocations } from "@/lib/premiumWorkspace.server";
import { buildAgencyWalletLedgerRows, type AgencyLedgerRow } from "@/lib/readModels/agencyLedger";
import { resolveAgencyConfig } from "@/lib/agencyConfig";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";
import { parsePlan } from "@/lib/plans";

export const metadata: Metadata = { title: "Finances — BrisaHub" };

export default async function AgencyFinancesPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: walletTxs }, { data: profile }, { data: contracts }, { data: agencyRow }, { data: agentAllocTxsRaw }, activelyAllocated] = await Promise.all([
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
      .select("id, booking_id, job_id, status, payment_amount, confirmed_at, agency_signed_at, deposit_paid_at, paid_at, talent_id, job_description")
      .eq("agency_id", user?.id ?? "")
      .is("deleted_at", null)
      .in("status", ["confirmed", "paid", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("agencies")
      .select("pix_key_type, pix_key_value, pix_holder_name, payment_mode, commission_percent_override, escrow_enabled, receipt_uploads_enabled")
      .eq("id", user?.id ?? "")
      .single(),
    supabase
      .from("premium_agent_wallet_transactions")
      .select("id, type, amount, note, created_at, related_job_id, related_contract_id")
      .eq("owner_user_id", user?.id ?? "")
      .eq("status", "completed")
      .is("reversed_at", null)
      .in("type", ["allocation", "allocation_reversal", "job_commitment", "job_release", "job_settlement"])
      .order("created_at", { ascending: false })
      .limit(100),
    getOwnerTotalActiveAllocations(user?.id ?? ""),
  ]);

  // Resolve job titles for Premium agent reservation rows.
  // Collect unique job IDs from job_commitment / job_release / job_settlement entries.
  const premiumJobIds = [
    ...new Set(
      (agentAllocTxsRaw ?? [])
        .map((tx) => (tx as Record<string, unknown>).related_job_id as string | null | undefined)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const jobTitleMap = new Map<string, string>();
  if (premiumJobIds.length > 0) {
    const { data: jobRows } = await supabase
      .from("jobs")
      .select("id, title")
      .in("id", premiumJobIds);
    for (const j of jobRows ?? []) {
      jobTitleMap.set(String(j.id), j.title ?? "Vaga privada");
    }
  }

  // Enrich agentAllocTxs with resolved job_title for display.
  const agentAllocTxs = (agentAllocTxsRaw ?? []).map((tx) => {
    const raw = tx as Record<string, unknown>;
    const relJobId = raw.related_job_id as string | null | undefined;
    return {
      id: String(tx.id),
      type: String(tx.type),
      amount: tx.amount as number | null,
      note: tx.note as string | null,
      created_at: String(tx.created_at),
      related_job_id: relJobId ?? null,
      related_contract_id: (raw.related_contract_id as string | null | undefined) ?? null,
      job_title: relJobId ? (jobTitleMap.get(relJobId) ?? null) : null,
    };
  });

  let transactions: AgencyLedgerRow[] = buildAgencyWalletLedgerRows(
    walletTxs ?? [],
    contracts ?? [],
    agentAllocTxs,
  );

  // For internal payment mode: build ledger rows from paid contracts since no
  // wallet_transactions exist in this mode. Resolves talent names for display.
  const [planSettingEarly, globalDefaultsEarly] = await Promise.all([
    getLivePlanSetting(parsePlan((profile as Record<string, unknown> | null)?.plan as string | null)),
    getGlobalPaymentDefaults(),
  ]);
  const agencyConfigEarly = resolveAgencyConfig(agencyRow as Record<string, unknown> | null, planSettingEarly.commission_percent, globalDefaultsEarly);

  if (!agencyConfigEarly.showEscrow && (walletTxs ?? []).length === 0) {
    const paidContracts = (contracts ?? []).filter((c) => (c as Record<string, unknown>).status === "paid");
    if (paidContracts.length > 0) {
      const talentIds = [...new Set(
        paidContracts
          .map((c) => (c as Record<string, unknown>).talent_id as string | null | undefined)
          .filter((id): id is string => Boolean(id)),
      )];
      const talentNameMap = new Map<string, string>();
      if (talentIds.length > 0) {
        const { data: talentProfiles } = await supabase
          .from("talent_profiles")
          .select("id, full_name")
          .in("id", talentIds)
          .limit(200);
        for (const tp of talentProfiles ?? []) {
          talentNameMap.set(tp.id, tp.full_name ?? "Talent");
        }
      }

      const jobIds = [...new Set(
        paidContracts
          .map((c) => (c as Record<string, unknown>).job_id as string | null | undefined)
          .filter((id): id is string => Boolean(id)),
      )];
      const jobTitleMapInternal = new Map<string, string>();
      if (jobIds.length > 0) {
        const { data: jobRows } = await supabase
          .from("jobs")
          .select("id, title")
          .in("id", jobIds)
          .limit(200);
        for (const jr of jobRows ?? []) {
          jobTitleMapInternal.set(jr.id, jr.title ?? "Job");
        }
      }

      const internalRows: AgencyLedgerRow[] = paidContracts.map((c) => {
        const raw = c as Record<string, unknown>;
        const talentId = raw.talent_id as string | null | undefined;
        const jobId = raw.job_id as string | null | undefined;
        return {
          id: String(raw.id),
          kind: "booking" as const,
          talent: talentId ? (talentNameMap.get(talentId) ?? "Talent") : "Talent",
          job: jobId ? (jobTitleMapInternal.get(jobId) ?? (raw.job_description as string | null) ?? "Job") : ((raw.job_description as string | null) ?? "Job"),
          amount: Number(raw.payment_amount ?? 0),
          status: "paid",
          date: (raw.paid_at as string | null) ?? String(raw.confirmed_at ?? new Date().toISOString()),
          bookingId: (raw.booking_id as string | null | undefined) ?? null,
          href: `/agency/contracts`,
        };
      });

      transactions = [...internalRows, ...transactions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    }
  }

  // Derive payment stats from the wallet ledger — same source as wallet balance.
  // escrow_released = money that left escrow and was credited to talent wallet.
  // escrow_lock     = funds currently held in escrow (confirmed contracts not yet paid).
  const completedPayments = transactions
    .filter((t) => t.kind === "wallet" && t.status === "escrow_released")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const pendingPayments = transactions
    .filter((t) => t.kind === "wallet" && t.status === "escrow_lock")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const summary: AgencyFinanceSummary = {
    pendingPayments,
    completedPayments,
    walletBalance:     profile?.wallet_balance ?? 0,
    allocatedToAgents: activelyAllocated,
  };

  const agencyConfig = agencyConfigEarly;

  const feeSettings = await getPlatformSettings([
    "withdrawal_fee_percent",
    "withdrawal_min_fee",
    "withdrawal_min_amount_agency",
  ]);
  const withdrawalFeePercent = Number(feeSettings.withdrawal_fee_percent ?? 0) || 0;
  const withdrawalMinFee = Number(feeSettings.withdrawal_min_fee ?? 0) || 0;
  const agencyMinRaw = Number(feeSettings.withdrawal_min_amount_agency ?? 100);
  const agencyMinWithdrawal = Number.isFinite(agencyMinRaw) && agencyMinRaw > 0 ? agencyMinRaw : 100;
  const effectiveMinWithdrawal = Math.max(WITHDRAWAL_MIN_AMOUNT, agencyMinWithdrawal);

  const agencyPix = agencyRow?.pix_key_value
    ? { pix_key_type: agencyRow.pix_key_type ?? null, pix_key_value: agencyRow.pix_key_value, pix_holder_name: agencyRow.pix_holder_name ?? null }
    : null;

  return (
    <AgencyFinances
      summary={summary}
      transactions={transactions}
      agencyConfig={agencyConfig}
      agencyPix={agencyPix}
      withdrawalMinAmount={effectiveMinWithdrawal}
      withdrawalFeePercent={withdrawalFeePercent}
      withdrawalMinFee={withdrawalMinFee}
      profileCpfCnpj={typeof (profile as Record<string, unknown> | null)?.cpf_cnpj === "string" ? ((profile as Record<string, unknown>).cpf_cnpj as string) : ""}
    />
  );
}
