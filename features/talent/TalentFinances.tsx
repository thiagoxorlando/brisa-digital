"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { generateReceiptPdf } from "@/lib/generateReceiptPdf";
import { brl } from "@/lib/brl";
import { REFERRAL_RATE } from "@/lib/plans";
import { withdrawalStatusLabel, withdrawalStatusTone } from "@/lib/withdrawalStatus";
import PixSetup, { type PixKeyType, type PixProfileRow, maskPixKey, PIX_LABELS } from "@/features/talent/PixSetup";


type PeriodFilter = "today" | "month" | "all";

const LIST_PREVIEW_LIMIT = 5;

function periodMatches(date: string | null | undefined, period: PeriodFilter) {
  if (period === "all") return true;
  if (!date) return false;
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return false;
  const now = new Date();
  if (period === "today") {
    return value.toDateString() === now.toDateString();
  }
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
}

function FilterTabs({ value, onChange }: { value: PeriodFilter; onChange: (value: PeriodFilter) => void }) {
  const options: Array<{ value: PeriodFilter; label: string }> = [
    { value: "today", label: "Hoje" },
    { value: "month", label: "Este mês" },
    { value: "all", label: "Total" },
  ];

  return (
    <div className="inline-flex rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={[
            "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer",
            value === option.value
              ? "bg-[#1F2D2E] text-white"
              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800",
          ].join(" ")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function visibleItems<T>(items: T[], expanded: boolean) {
  return expanded ? items : items.slice(0, LIST_PREVIEW_LIMIT);
}

function ShowMoreButton({
  total,
  expanded,
  onClick,
}: {
  total: number;
  expanded: boolean;
  onClick: () => void;
}) {
  if (total <= LIST_PREVIEW_LIMIT) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border-t border-zinc-50 px-5 py-3 text-[12px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 cursor-pointer"
    >
      {expanded ? "Ver menos" : `Ver mais ${total - LIST_PREVIEW_LIMIT}`}
    </button>
  );
}

type PaidContract = {
  id: string;
  jobTitle: string;
  amount: number;
  commissionAmount: number;
  referralCommission: number;
  earnings: number;
  paid_at: string | null;
};

type Payment = {
  id: string;
  job: string;
  amount: number;      // deal value
  earnings: number;    // 85% of amount
  status: string;
  date: string;
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
};

type Referral = {
  id: string;
  talentName: string;
  job: string;
  amount: number;      // deal value
  commission: number;  // REFERRAL_RATE of amount
  date: string;
};

function StatCard({ label, value, sub, stripe }: { label: string; value: string; sub?: string; stripe: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
      <div className={`h-[3px] shrink-0 bg-gradient-to-r ${stripe}`} />
      <div className="flex flex-col justify-between gap-3 p-5 grow">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 leading-snug">{label}</p>
        <p className="whitespace-nowrap text-[1.6rem] font-extrabold tracking-tight text-zinc-900 leading-none tabular-nums">
          {value}
        </p>
        {sub && <p className="text-[12px] text-zinc-400 leading-snug mt-auto pt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── PIX account setup ─────────────────────────────────────────────────────────

type TalentWithdrawal = {
  id: string;
  amount: number;
  net_amount: number | null;
  fee_amount: number | null;
  status: string | null;
  created_at: string;
  processed_at: string | null;
  admin_note: string | null;
  provider: string | null;
  provider_status: string | null;
  provider_transfer_id: string | null;
  asaas_transfer_id: string | null;
};


type WithdrawState = "idle" | "loading" | "success" | "error";

// ── Receipt generator ─────────────────────────────────────────────────────────

async function downloadReceipt(w: TalentWithdrawal, pix: PixProfileRow | null, talentName: string) {
  await generateReceiptPdf({
    receiptType: "saque",
    id: w.id,
    amount: w.amount,
    netAmount: w.net_amount,
    feeAmount: w.fee_amount,
    status: w.status,
    createdAt: w.created_at,
    processedAt: w.processed_at,
    provider: w.provider,
    providerStatus: w.provider_status,
    transferId: w.asaas_transfer_id ?? w.provider_transfer_id ?? null,
    holderName: pix?.pix_holder_name ?? talentName,
    pixKeyType: pix?.pix_key_type ?? null,
    pixKeyValue: pix?.pix_key_value ?? null,
    adminNote: w.admin_note,
  });
}

export default function TalentFinances({ paymentMode = "escrow" }: { paymentMode?: "escrow" | "internal" }) {
  const isInternal = paymentMode === "internal";
  const referralRateLabel = `${REFERRAL_RATE * 100}%`;
  const [payments, setPayments]         = useState<Payment[]>([]);
  const [referrals, setReferrals]       = useState<Referral[]>([]);
  const [paidContracts, setPaidContracts] = useState<PaidContract[]>([]);
  const [withdrawals, setWithdrawals]   = useState<TalentWithdrawal[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [withdrawState, setWithdrawState] = useState<WithdrawState>("idle");
  const [withdrawMsg, setWithdrawMsg]   = useState("");
  const [pixReady, setPixReady] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [period, setPeriod]             = useState<PeriodFilter>("all");
  const [showAllWithdrawals, setShowAllWithdrawals] = useState(false);
  const [showAllReferrals, setShowAllReferrals] = useState(false);
  const [showAllPaid, setShowAllPaid] = useState(false);
  const [expandedWithdrawal, setExpandedWithdrawal] = useState<string | null>(null);
  const [pixProfile, setPixProfile] = useState<PixProfileRow | null>(null);
  const [talentName, setTalentName] = useState("");

  async function load(initial = false) {
    if (initial) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { if (initial) setLoading(false); return; }

    const { data: profileBalance } = await supabase
      .from("profiles")
      .select("wallet_balance")
      .eq("id", user.id)
      .single();

    setWalletBalance(Number(profileBalance?.wallet_balance ?? 0));

    const [{ data: withdrawalRows }, { data: pixRow }] = await Promise.all([
      supabase
        .from("wallet_transactions")
        .select("id, amount, net_amount, fee_amount, status, created_at, processed_at, admin_note, provider, provider_status, provider_transfer_id, asaas_transfer_id")
        .eq("user_id", user.id)
        .eq("type", "withdrawal")
        .order("created_at", { ascending: false }),
      supabase
        .from("talent_profiles")
        .select("full_name, pix_key_type, pix_key_value, pix_holder_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (pixRow) {
      const p = pixRow as PixProfileRow & { full_name?: string };
      setPixProfile(p);
      if (p.full_name) setTalentName(p.full_name);
    }

    setWithdrawals((withdrawalRows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: row.id,
        amount: Number(row.amount ?? 0),
        net_amount: typeof r.net_amount === "number" ? r.net_amount : null,
        fee_amount: typeof r.fee_amount === "number" ? r.fee_amount : null,
        status: row.status ?? null,
        created_at: row.created_at,
        processed_at: r.processed_at as string | null ?? null,
        admin_note: r.admin_note as string | null ?? null,
        provider: r.provider as string | null ?? null,
        provider_status: r.provider_status as string | null ?? null,
        provider_transfer_id: r.provider_transfer_id as string | null ?? null,
        asaas_transfer_id: r.asaas_transfer_id as string | null ?? null,
      };
    }));

    // My bookings
    const { data: bookingsData } = await supabase
      .from("bookings")
      .select("id, job_title, price, status, created_at, job_id")
      .eq("talent_user_id", user.id)
      .order("created_at", { ascending: false });

    // Fetch job requirements (gender, age)
    const jobIds = [...new Set((bookingsData ?? []).map((b) => b.job_id).filter(Boolean))];
    const jobReqMap = new Map<string, { gender: string | null; age_min: number | null; age_max: number | null }>();
    const openJobIds = new Set<string>();
    if (jobIds.length) {
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, gender, age_min, age_max, workspace_id")
        .in("id", jobIds);
      for (const j of jobsData ?? []) {
        if (!(j as { workspace_id?: string | null }).workspace_id) {
          openJobIds.add(j.id);
          jobReqMap.set(j.id, { gender: j.gender ?? null, age_min: j.age_min ?? null, age_max: j.age_max ?? null });
        }
      }
    }
    const visibleBookings = (bookingsData ?? []).filter((booking) => !booking.job_id || openJobIds.has(booking.job_id));

    // Fetch net_amount from contracts for each booking (reflects actual plan commission)
    const bookingIds = visibleBookings.map((b) => b.id).filter(Boolean);
    const netAmountMap = new Map<string, number>();
    if (bookingIds.length) {
      const { data: bookingContracts } = await supabase
        .from("contracts")
        .select("booking_id, net_amount")
        .in("booking_id", bookingIds);
      for (const c of bookingContracts ?? []) {
        if (c.booking_id && c.net_amount != null) {
          netAmountMap.set(c.booking_id, Number(c.net_amount));
        }
      }
    }

    setPayments(
      visibleBookings.map((b) => {
        const req = b.job_id ? jobReqMap.get(b.job_id) : null;
        const price = b.price ?? 0;
        const earnings = netAmountMap.has(b.id)
          ? netAmountMap.get(b.id)!
          : 0;
        return {
          id:       b.id,
          job:      b.job_title ?? "Untitled job",
          amount:   price,
          earnings,
          status:   b.status ?? "pending",
          date:     b.created_at,
          gender:   req?.gender ?? null,
          ageMin:   req?.age_min ?? null,
          ageMax:   req?.age_max ?? null,
        };
      })
    );

    // Paid contracts — the source of truth for earnings
    const { data: contractsDataRaw } = await supabase
      .from("contracts")
      .select("id, job_id, payment_amount, net_amount, commission_amount, paid_at")
      .or(`talent_id.eq.${user.id},talent_user_id.eq.${user.id}`)
      .eq("status", "paid")
      .order("paid_at", { ascending: false });

    const contractJobIdsForFilter = [...new Set((contractsDataRaw ?? []).map((c) => c.job_id).filter(Boolean))];
    const openContractJobIds = new Set<string>();
    if (contractJobIdsForFilter.length) {
      const { data: contractJobs } = await supabase
        .from("jobs")
        .select("id, workspace_id")
        .in("id", contractJobIdsForFilter);
      for (const job of contractJobs ?? []) {
        if (!(job as { workspace_id?: string | null }).workspace_id) openContractJobIds.add(job.id);
      }
    }
    const contractsData = (contractsDataRaw ?? []).filter((contract) => !contract.job_id || openContractJobIds.has(contract.job_id));

    const contractIds    = (contractsData ?? []).map((c) => c.id);
    const contractJobIds = [...new Set((contractsData ?? []).map((c) => c.job_id).filter(Boolean))];
    const contractJobMap = new Map<string, string>();
    // Actual payout amounts from wallet_transactions (reference_id = contract uuid)
    const payoutTxMap   = new Map<string, number>();

    await Promise.all([
      contractJobIds.length
        ? supabase.from("jobs").select("id, title").in("id", contractJobIds)
            .then(({ data }) => { for (const j of data ?? []) contractJobMap.set(j.id, j.title ?? "Untitled Job"); })
        : Promise.resolve(),
      contractIds.length
        ? supabase
            .from("wallet_transactions")
            .select("reference_id, amount")
            .eq("user_id", user.id)
            .eq("type", "payout")
            .in("reference_id", contractIds)
            .then(({ data }) => {
              for (const tx of data ?? []) {
                if (tx.reference_id) payoutTxMap.set(tx.reference_id, Number(tx.amount));
              }
            })
        : Promise.resolve(),
    ]);

    setPaidContracts(
      (contractsData ?? []).map((c) => {
        const gross = Number(c.payment_amount ?? 0);
        const commissionAmount = c.commission_amount != null ? Number(c.commission_amount) : 0;
        const netFromContract = c.net_amount != null
          ? Number(c.net_amount)
          : Math.max(0, gross - commissionAmount);
        const payoutTx = payoutTxMap.get(c.id);
        const earnings = payoutTx ?? netFromContract;
        const referralCommission = payoutTx != null && netFromContract > payoutTx
          ? Math.max(0, parseFloat((netFromContract - payoutTx).toFixed(2)))
          : 0;
        return {
          id:                c.id,
          jobTitle:          c.job_id ? (contractJobMap.get(c.job_id) ?? "Untitled Job") : "Untitled Job",
          amount:            gross,
          commissionAmount,
          referralCommission,
          earnings,
          paid_at:           c.paid_at ?? null,
        };
      })
    );

    // Referral earnings: actual paid commissions from wallet_transactions.
    // Replaces the old submission+booking estimate — shows real credited amounts.
    const { data: refCommTxs } = await supabase
      .from("wallet_transactions")
      .select("id, amount, reference_id, created_at")
      .eq("user_id", user.id)
      .eq("type", "referral_commission")
      .order("created_at", { ascending: false });

    // One commission per referred contract: deduplicate by reference_id.
    // Guards against duplicate rows from old code paths that lacked idempotency.
    const seenRefKeys = new Set<string>();
    const uniqueRefCommTxs = (refCommTxs ?? []).filter((tx) => {
      const key = tx.reference_id ?? tx.id;
      if (seenRefKeys.has(key)) return false;
      seenRefKeys.add(key);
      return true;
    });

    if (uniqueRefCommTxs.length > 0) {
      const refContractIds = [...new Set(uniqueRefCommTxs.map((tx) => tx.reference_id).filter(Boolean))];
      const refTalentNameMap = new Map<string, string>();
      const refJobTitleMap   = new Map<string, string>();
      const refGrossMap      = new Map<string, number>();
      const premiumRefContractIds = new Set<string>();

      if (refContractIds.length) {
        const { data: refContracts } = await supabase
          .from("contracts")
          .select("id, talent_id, job_id, payment_amount")
          .in("id", refContractIds);

        const refTalentIds = [...new Set((refContracts ?? []).map((c) => c.talent_id).filter(Boolean))];
        const refJobIds    = [...new Set((refContracts ?? []).map((c) => c.job_id).filter(Boolean))];

        const [talentRes, jobRes] = await Promise.all([
          refTalentIds.length
            ? supabase.from("talent_profiles").select("id, full_name").in("id", refTalentIds)
            : null,
          refJobIds.length
            ? supabase.from("jobs").select("id, title, workspace_id").in("id", refJobIds)
            : null,
        ]);

        const talentNameMap = new Map<string, string>();
        for (const t of talentRes?.data ?? []) talentNameMap.set(t.id, t.full_name ?? "Sem nome");
        const jobTitleMap = new Map<string, string>();
        for (const j of jobRes?.data ?? []) {
          if ((j as { workspace_id?: string | null }).workspace_id) continue;
          jobTitleMap.set(j.id, j.title ?? "Untitled");
        }

        for (const c of refContracts ?? []) {
          if (c.job_id && !jobTitleMap.has(c.job_id)) {
            premiumRefContractIds.add(c.id);
            continue;
          }
          refTalentNameMap.set(c.id, c.talent_id ? (talentNameMap.get(c.talent_id) ?? "Sem nome") : "Sem nome");
          refJobTitleMap.set(c.id, c.job_id ? (jobTitleMap.get(c.job_id) ?? "—") : "—");
          refGrossMap.set(c.id, Number(c.payment_amount ?? 0));
        }
      }

      setReferrals(
        uniqueRefCommTxs
          .filter((tx) => !tx.reference_id || !premiumRefContractIds.has(tx.reference_id))
          .map((tx) => ({
          id:         tx.id,
          talentName: tx.reference_id ? (refTalentNameMap.get(tx.reference_id) ?? "Sem nome") : "Sem nome",
          job:        tx.reference_id ? (refJobTitleMap.get(tx.reference_id) ?? "—") : "—",
          amount:     tx.reference_id ? (refGrossMap.get(tx.reference_id) ?? 0) : 0,
          commission: Number(tx.amount),
          date:       tx.created_at,
        }))
      );
    } else {
      setReferrals([]);
    }

    if (initial) setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const { refreshing } = useRealtimeRefresh(
    [{ table: "bookings" }, { table: "contracts" }, { table: "profiles" }, { table: "wallet_transactions" }],
    () => load(false),
  );

  const pendingPayment      = payments.filter((p) => p.status === "pending_payment");
  const pendingEarnings     = pendingPayment.reduce((s, p) => s + p.earnings, 0);
  const referralEarnings    = referrals.reduce((s, r) => s + r.commission, 0);
  const paidContractEarnings = paidContracts.reduce((s, c) => s + c.earnings, 0);

  // Available withdrawal money is the talent wallet balance. It includes both
  // contract payouts and referral commissions after they are credited.
  const availableToWithdraw = Math.max(0, walletBalance);
  const withdrawAmountNum = Math.round(Number(withdrawAmount) * 100) / 100;
  const filteredReferrals = referrals.filter((r) => periodMatches(r.date, period));
  const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending" || w.status === "processing" || w.status === "blocked");
  const filteredWithdrawalHistory = withdrawals.filter((w) =>
    (w.status === "paid" || w.status === "cancelled" || w.status === "rejected" || w.status === "failed")
    && periodMatches(w.processed_at ?? w.created_at, period),
  );
  const alreadyWithdrawn = withdrawals
    .filter((w) => w.status === "paid")
    .reduce((sum, w) => sum + w.amount, 0);
  const canRequestWithdrawal = withdrawAmountNum > 0
    && withdrawAmountNum <= availableToWithdraw
    && pixReady
    && withdrawState !== "loading";

  async function handleWithdraw() {
    if (withdrawAmountNum <= 0 || withdrawAmountNum > availableToWithdraw) return;
    if (!pixReady) {
      setWithdrawState("error");
      setWithdrawMsg("Cadastre sua chave PIX para sacar");
      return;
    }

    setWithdrawState("loading");
    try {
      const withdrawRes = await fetch("/api/asaas/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: withdrawAmountNum }),
      });
      const withdrawData = await withdrawRes.json().catch(() => ({})) as {
        error?: string;
        provider_transfer_id?: string;
        provider?: string;
        rail?: string;
        status?: string;
        message?: string;
      };

      if (!withdrawRes.ok) {
        setWithdrawState("error");
        setWithdrawMsg(withdrawData.error ?? "Erro ao solicitar saque.");
        return;
      }

      setWithdrawState("success");
      setWithdrawAmount("");
      setWithdrawMsg(
        withdrawData.message
          ?? `Saque via PIX enviado: ${brl(withdrawAmountNum)}. Acompanhe o status abaixo.`,
      );
      await load(false);
    } catch {
      setWithdrawState("error");
      setWithdrawMsg("Erro de rede. Tente novamente.");
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Visão Geral</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Financeiro</h1>
        <div className="flex items-center gap-3 mt-1">
          {!loading && (
            <p className="text-[13px] text-zinc-400">
              {payments.length} reservas · {referrals.length} indicaç{referrals.length !== 1 ? "ões" : "ão"}
            </p>
          )}
          {refreshing && (
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Atualizando…
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-zinc-400">Filtrar listas por período</p>
        <FilterTabs value={period} onChange={setPeriod} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            <StatCard
              label="Total Ganho"
              value={brl(paidContractEarnings + (isInternal ? 0 : referralEarnings))}
              sub={isInternal ? "Contratos com pagamento confirmado" : "Contratos pagos + indicações"}
              stripe="from-indigo-500 to-violet-500"
            />
            <StatCard
              label="Aguardando Pagamento"
              value={brl(pendingEarnings)}
              sub="Agência ainda não liberou"
              stripe="from-amber-400 to-orange-500"
            />
            {!isInternal && (
              <StatCard
                label="Disponível para saque"
                value={brl(availableToWithdraw)}
                sub={alreadyWithdrawn > 0 ? `${brl(alreadyWithdrawn)} já sacado` : "Pronto para saque"}
                stripe="from-emerald-400 to-teal-500"
              />
            )}
            {!isInternal && (
              <StatCard
                label="Indicações"
                value={brl(referralEarnings)}
                sub={`${referrals.length} reserva${referrals.length !== 1 ? "s" : ""} (${referralRateLabel})`}
                stripe="from-violet-400 to-purple-500"
              />
            )}
          </div>

          {/* Internal mode notice */}
          {isInternal && (
            <div className="flex items-start gap-3 bg-teal-50 border border-teal-100 rounded-2xl px-5 py-4">
              <svg className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px] text-teal-800 leading-relaxed">
                Pagamentos são feitos diretamente pela agência. O BrisaHub registra comprovantes e confirmações, mas não guarda saldo nem realiza saques neste modo.
              </p>
            </div>
          )}

          {/* Withdraw — escrow mode only */}
          {!isInternal && <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="px-6 py-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Saque via PIX</p>
                <p className="break-words text-[1.55rem] sm:text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">{brl(availableToWithdraw)}</p>
                {alreadyWithdrawn > 0 && (
                  <p className="text-[12px] text-zinc-400 mt-1">{brl(alreadyWithdrawn)} já sacado</p>
                )}
              </div>
            </div>

            <div className="px-6 pb-5">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 min-w-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-zinc-400 pointer-events-none">R$</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full pl-8 pr-3 py-2.5 text-[13px] font-semibold bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
                  />
                </div>
                <button
                  onClick={handleWithdraw}
                  disabled={!canRequestWithdrawal}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-100 disabled:text-zinc-400 text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {withdrawState === "loading" ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Processando…
                    </>
                  ) : withdrawState === "success" ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Solicitado
                    </>
                  ) : "Solicitar saque"}
                </button>
              </div>
              {withdrawAmountNum > availableToWithdraw && (
                <p className="text-[11px] text-rose-600 mt-2">Valor superior ao saldo disponível.</p>
              )}
              {!pixReady && (
                <p className="text-[11px] text-amber-700 mt-2">Cadastre sua chave PIX para sacar.</p>
              )}
            </div>

            {/* Success message */}
            {withdrawState === "success" && (
              <div className="mx-6 mb-5 flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[13px] text-emerald-800 font-medium leading-relaxed">{withdrawMsg}</p>
              </div>
            )}

            {/* Error message */}
            {withdrawState === "error" && (
              <div className="mx-6 mb-5 flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[13px] text-rose-700 font-medium leading-relaxed">{withdrawMsg}</p>
              </div>
            )}

            {pendingWithdrawals.length > 0 && (
              <div className="mx-6 mb-5 rounded-xl border border-zinc-100 bg-zinc-50">
                <div className="px-4 py-3 border-b border-zinc-100">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Saques pendentes</p>
                </div>
                <div className="divide-y divide-zinc-100">
                  {pendingWithdrawals.map((withdrawal) => (
                    <div key={withdrawal.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-zinc-900">{brl(withdrawal.amount)}</p>
                        <p className="text-[11px] text-zinc-400">
                          {withdrawalStatusLabel(withdrawal.status ?? "pending")} · {new Date(withdrawal.created_at).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Saque via PIX
                          {withdrawal.provider_status ? ` · ${withdrawal.provider_status}` : ""}
                        </p>
                        {withdrawal.admin_note && (
                          <p className="text-[11px] text-zinc-500 mt-0.5">{withdrawal.admin_note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>}

          {/* Pending payment notice */}
          {pendingEarnings > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[12px] text-amber-800 leading-relaxed">
                <strong>{brl(pendingEarnings)}</strong> aguardando pagamento da agência{isInternal ? " — confirmação pendente." : " — será adicionado ao seu saldo disponível quando pago."}
              </p>
            </div>
          )}

          {/* Finance info */}
          {!isInternal && (
            <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                Os valores exibidos refletem reservas, contratos pagos, indicações e saques registrados na carteira.
              </span>
            </div>
          )}

          {/* PIX account setup — escrow mode only */}
          {!isInternal && <PixSetup onSaved={(_, value, holderName) => setPixReady(Boolean(value.trim() && holderName.trim()))} />}

          {/* Withdrawal history — escrow mode only */}
          {!isInternal && filteredWithdrawalHistory.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Histórico de Saques</p>
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-zinc-50">
                {visibleItems(filteredWithdrawalHistory, showAllWithdrawals).map((withdrawal) => {
                  const isExpanded = expandedWithdrawal === withdrawal.id;
                  const refDate = new Date(withdrawal.processed_at ?? withdrawal.created_at);
                  const transferRef = withdrawal.asaas_transfer_id ?? withdrawal.provider_transfer_id;
                  const netDisplay = withdrawal.net_amount !== null ? brl(withdrawal.net_amount) : brl(withdrawal.amount);
                  const pixTypeLabel = pixProfile?.pix_key_type
                    ? ({ cpf: "CPF", cnpj: "CNPJ", email: "E-mail", phone: "Telefone", random: "Chave Aleatória" }[pixProfile.pix_key_type] ?? pixProfile.pix_key_type)
                    : null;

                  const isPaid = withdrawal.status === "paid";

                  return (
                    <div key={withdrawal.id}>
                      {/* Summary row — click to toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedWithdrawal(isExpanded ? null : withdrawal.id)}
                        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-zinc-50/60 transition-colors"
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isPaid ? "bg-emerald-100" : "bg-zinc-100"}`}>
                          <svg className={`w-4 h-4 ${isPaid ? "text-emerald-600" : "text-zinc-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-zinc-900">{withdrawalStatusLabel(withdrawal.status ?? "paid")}</p>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            {refDate.toLocaleDateString("pt-BR", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                            {" · "}
                            {refDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className={`text-[20px] font-semibold tracking-tight tabular-nums leading-none ${isPaid ? "text-emerald-700" : "text-zinc-400"}`}>{netDisplay}</p>
                            {withdrawal.net_amount !== null && withdrawal.fee_amount !== null && withdrawal.fee_amount > 0 && (
                              <p className="text-[10px] text-zinc-400 mt-0.5">bruto {brl(withdrawal.amount)}</p>
                            )}
                          </div>
                          <svg className={`w-4 h-4 text-zinc-300 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-zinc-50 bg-zinc-50/60 px-5 py-4 space-y-3">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                            <div>
                              <p className="text-zinc-400 mb-0.5">Status</p>
                              <p className="font-semibold text-zinc-800">{withdrawalStatusLabel(withdrawal.status)}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 mb-0.5">Valor líquido</p>
                              <p className="font-semibold text-emerald-700">{netDisplay}</p>
                            </div>
                            {withdrawal.fee_amount !== null && withdrawal.fee_amount > 0 && (
                              <div>
                                <p className="text-zinc-400 mb-0.5">Taxa</p>
                                <p className="font-semibold text-zinc-800">{brl(withdrawal.fee_amount)}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-zinc-400 mb-0.5">Data</p>
                              <p className="font-semibold text-zinc-800">{refDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 mb-0.5">Horário</p>
                              <p className="font-semibold text-zinc-800">{refDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                            </div>
                            {pixTypeLabel && (
                              <div>
                                <p className="text-zinc-400 mb-0.5">Tipo de chave PIX</p>
                                <p className="font-semibold text-zinc-800">{pixTypeLabel}</p>
                              </div>
                            )}
                            {pixProfile?.pix_key_value && (
                              <div>
                                <p className="text-zinc-400 mb-0.5">Chave PIX</p>
                                <p className="font-semibold text-zinc-800 font-mono text-[11px]">{maskPixKey(pixProfile.pix_key_type, pixProfile.pix_key_value)}</p>
                              </div>
                            )}
                            {pixProfile?.pix_holder_name && (
                              <div>
                                <p className="text-zinc-400 mb-0.5">Titular</p>
                                <p className="font-semibold text-zinc-800">{pixProfile.pix_holder_name}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-zinc-400 mb-0.5">Provedor</p>
                              <p className="font-semibold text-zinc-800">{withdrawal.provider === "asaas" ? "Asaas PIX" : withdrawal.provider ?? "PIX"}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 mb-0.5">Origem</p>
                              <p className="font-semibold text-zinc-800">BrisaHub</p>
                            </div>
                            {transferRef && (
                              <div className="col-span-2">
                                <p className="text-zinc-400 mb-0.5">ID da transferência</p>
                                <p className="font-semibold text-zinc-800 font-mono text-[11px] break-all">{transferRef}</p>
                              </div>
                            )}
                            <div className="col-span-2">
                              <p className="text-zinc-400 mb-0.5">ID interno</p>
                              <p className="font-medium text-zinc-500 font-mono text-[10px] break-all">{withdrawal.id}</p>
                            </div>
                            {withdrawal.provider_status && (
                              <div className="col-span-2">
                                <p className="text-zinc-400 mb-0.5">Status do provedor</p>
                                <p className="font-semibold text-zinc-800">{withdrawal.provider_status}</p>
                              </div>
                            )}
                            {withdrawal.admin_note && (
                              <div className="col-span-2">
                                <p className="text-zinc-400 mb-0.5">Observação</p>
                                <p className="font-semibold text-zinc-800">{withdrawal.admin_note}</p>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => { void downloadReceipt(withdrawal, pixProfile, talentName); }}
                            className="flex items-center gap-2 rounded-xl border border-[#DDE6E6] bg-white px-4 py-2 text-[12px] font-semibold text-[#0E7C86] transition-colors hover:bg-[#F0F9F8] hover:border-[#0E7C86]"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Baixar comprovante
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <ShowMoreButton
                  total={filteredWithdrawalHistory.length}
                  expanded={showAllWithdrawals}
                  onClick={() => setShowAllWithdrawals((value) => !value)}
                />
              </div>
            </div>
          )}

          {/* Paid contract breakdown */}
          {paidContracts.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Detalhamento dos Pagamentos</p>
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-zinc-50">
                {visibleItems(paidContracts, showAllPaid).map((contract) => (
                  <div key={contract.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-zinc-900 truncate">{contract.jobTitle}</p>
                        {contract.paid_at && (
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            Pago em {new Date(contract.paid_at).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                      <p className="text-[15px] font-semibold text-emerald-700 tabular-nums flex-shrink-0">{brl(contract.earnings)}</p>
                    </div>
                    <div className="mt-2 space-y-0.5 text-[11px] text-zinc-500">
                      <div className="flex justify-between">
                        <span>Valor bruto</span>
                        <span className="tabular-nums text-zinc-700">{brl(contract.amount)}</span>
                      </div>
                      {contract.commissionAmount > 0 && (
                        <div className="flex justify-between">
                          <span>Comissão da plataforma</span>
                          <span className="tabular-nums text-rose-600">−{brl(contract.commissionAmount)}</span>
                        </div>
                      )}
                      {contract.referralCommission > 0 && (
                        <div className="flex justify-between">
                          <span>Comissão de indicação</span>
                          <span className="tabular-nums text-violet-600">−{brl(contract.referralCommission)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-zinc-100 pt-1 mt-1">
                        <span className="font-semibold text-zinc-700">Líquido recebido</span>
                        <span className="tabular-nums font-semibold text-emerald-700">{brl(contract.earnings)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <ShowMoreButton
                  total={paidContracts.length}
                  expanded={showAllPaid}
                  onClick={() => setShowAllPaid((v) => !v)}
                />
              </div>
            </div>
          )}

          {/* Referral earnings — escrow mode only */}
          {!isInternal && <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Ganhos de Indicação</p>
              <span className="text-[10px] font-semibold bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full">{referralRateLabel} por reserva</span>
            </div>

            {filteredReferrals.length === 0 ? (
              <div className="bg-white rounded-2xl border border-zinc-100 py-12 text-center">
                <p className="text-[14px] font-medium text-zinc-500">Nenhum ganho de indicação ainda</p>
                <p className="text-[13px] text-zinc-400 mt-1">Indique talentos para vagas e ganhe quando forem reservados.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
                {visibleItems(filteredReferrals, showAllReferrals).map((r) => (
                  <div key={r.id} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-zinc-900 truncate">{r.talentName}</p>
                      <p className="text-[12px] text-zinc-400 mt-0.5 truncate">{r.job}</p>
                    </div>
                    <span className="text-[11px] font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-100 px-2.5 py-1 rounded-full flex-shrink-0">
                      Indicação
                    </span>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[15px] font-semibold text-violet-700 tabular-nums">{brl(r.commission)}</p>
                      <p className="text-[11px] text-zinc-400 tabular-nums">de {brl(r.amount)}</p>
                    </div>
                  </div>
                ))}
                <ShowMoreButton
                  total={filteredReferrals.length}
                  expanded={showAllReferrals}
                  onClick={() => setShowAllReferrals((value) => !value)}
                />
              </div>
            )}
          </div>}
        </>
      )}
    </div>
  );
}
