"use client";

import { useState } from "react";

const COMMISSION_RATE    = 0.15;
const REFERRAL_RATE      = 0.02;
const AGENCY_MONTHLY_FEE = 2500;

export type FinancesBooking = {
  id: string;
  jobTitle: string;
  talentName: string;
  price: number;
  status: string;
  created_at: string;
  isReferred: boolean;
};

export type FinancesContract = {
  id: string;
  jobTitle: string;
  talentName: string;
  agencyName: string;
  amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  withdrawn_at: string | null;
};

export type AgencyEntry = {
  id: string;
  name: string;
  joinedAt: string;
  monthlyFee: number;
  subscriptionStatus: string;
};

export type FinancesSummary = {
  totalGrossValue: number;
  confirmedGrossValue: number;
  platformCommission: number;
  referralPayouts: number;
  contractsGross: number;
  contractsCommission: number;
  contractsEscrowValue: number;
  contractsAwaitingValue: number;
  contractsWithdrawnValue: number;
  contractsPaidValue: number;
  subscriptionRevenue: number;
  monthlySubscriptionTotal: number;
  netRevenue: number;
  pendingValue: number;
  totalBookings: number;
  confirmedBookings: number;
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function fmt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const BOOKING_STATUS_STYLES: Record<string, string> = {
  confirmed:       "bg-emerald-50 text-emerald-700",
  paid:            "bg-emerald-50 text-emerald-700",
  pending:         "bg-amber-50   text-amber-700",
  pending_payment: "bg-amber-50   text-amber-700",
  cancelled:       "bg-zinc-100   text-zinc-500",
};

// ── Reusable collapsible section ──────────────────────────────────────────────
function Section({
  label, title, meta, right, children, defaultOpen = true,
}: {
  label: string;
  title: string;
  meta?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 group cursor-pointer"
      >
        <div className="text-left">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">{label}</p>
          <h2 className="text-[18px] font-semibold tracking-tight text-zinc-900 group-hover:text-zinc-600 transition-colors">
            {title}
          </h2>
          {meta && <p className="text-[12px] text-zinc-400 mt-0.5">{meta}</p>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {right}
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="space-y-4">{children}</div>}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, note, stripe }: {
  label: string; value: string; sub?: string; note?: string; stripe: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">{label}</p>
        <p className="text-[1.75rem] font-semibold tracking-tighter text-zinc-900 leading-none">{value}</p>
        {sub  && <p className="text-[12px] text-zinc-400 mt-1.5">{sub}</p>}
        {note && <p className="text-[11px] text-zinc-300 mt-0.5 italic">{note}</p>}
      </div>
    </div>
  );
}

// ── Table shell ───────────────────────────────────────────────────────────────
function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">{children}</table>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`${right ? "text-right px-4" : "text-left px-4 first:px-6"} py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400`}>
      {children}
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function WithdrawalHistory({ contracts }: { contracts: FinancesContract[] }) {
  const withdrawn = contracts
    .filter((c) => !!c.withdrawn_at)
    .sort((a, b) => new Date(b.withdrawn_at!).getTime() - new Date(a.withdrawn_at!).getTime());

  if (withdrawn.length === 0) return null;

  // Group by talent+day so each talent's single withdraw click = one receipt
  const groups = new Map<string, FinancesContract[]>();
  for (const c of withdrawn) {
    const key = `${c.talentName}::${c.withdrawn_at!.slice(0, 10)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const receipts = [...groups.values()].sort(
    (a, b) => new Date(b[0].withdrawn_at!).getTime() - new Date(a[0].withdrawn_at!).getTime()
  );

  const grandTotal = withdrawn.reduce((s, c) => s + Math.round(c.amount * (1 - COMMISSION_RATE)), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Withdrawal History</p>
        <p className="text-[12px] text-zinc-400">{receipts.length} withdrawal{receipts.length !== 1 ? "s" : ""} · {usd(grandTotal)} total</p>
      </div>
      <div className="space-y-3">
        {receipts.map((items, i) => {
          const talentTotal = items.reduce((s, c) => s + Math.round(c.amount * (1 - COMMISSION_RATE)), 0);
          const day  = items[0].withdrawn_at!.slice(0, 10);
          const date = new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
          const talent = items[0].talentName;
          return (
            <div key={`${talent}-${day}`} className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-900">{talent}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{date}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[20px] font-semibold tracking-tight text-emerald-700 tabular-nums leading-none">{usd(talentTotal)}</p>
                  <span className="inline-flex mt-1.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 px-2 py-0.5 rounded-full">
                    Completed
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContractsTable({ contracts, summary }: { contracts: FinancesContract[]; summary: FinancesSummary }) {
  const [rows, setRows] = useState<FinancesContract[]>(contracts);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  async function handleWithdraw(id: string) {
    setWithdrawing(id);
    const res = await fetch(`/api/contracts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    setWithdrawing(null);
    if (res.ok) {
      const { withdrawn_at } = await res.json();
      setRows((prev) => prev.map((c) => c.id === id ? { ...c, withdrawn_at } : c));
    }
  }

  function statusLabel(c: FinancesContract) {
    if (c.status === "confirmed") return { label: "In Escrow",           cls: "bg-indigo-50 text-indigo-700" };
    if (c.withdrawn_at)           return { label: "Withdrawn",           cls: "bg-zinc-100 text-zinc-500"   };
    return                               { label: "Awaiting Withdrawal", cls: "bg-amber-50 text-amber-700"  };
  }

  return (
    <TableShell>
      <thead>
        <tr className="border-b border-zinc-100">
          <Th>Job</Th>
          <Th>Talent</Th>
          <Th>Agency</Th>
          <Th>Status</Th>
          <Th right>Value</Th>
          <Th right>Commission (15%)</Th>
          <Th right>Date</Th>
          <th className="px-4 py-3.5 w-32" />
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-50">
        {rows.map((c) => {
          const comm = Math.round(c.amount * COMMISSION_RATE);
          const { label, cls } = statusLabel(c);
          const canWithdraw = c.status === "paid" && !c.withdrawn_at;
          return (
            <tr key={c.id} className="hover:bg-zinc-50/60 transition-colors">
              <td className="px-6 py-3.5">
                <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[150px]">{c.jobTitle}</p>
              </td>
              <td className="px-4 py-3.5">
                <span className="text-[13px] text-zinc-600">{c.talentName}</span>
              </td>
              <td className="px-4 py-3.5">
                <span className="text-[13px] text-zinc-500">{c.agencyName}</span>
              </td>
              <td className="px-4 py-3.5">
                <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${cls}`}>
                  {label}
                </span>
              </td>
              <td className="px-4 py-3.5 text-right">
                <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(c.amount)}</span>
              </td>
              <td className="px-4 py-3.5 text-right">
                <span className="text-[13px] font-semibold text-emerald-700 tabular-nums">{usd(comm)}</span>
              </td>
              <td className="px-4 py-3.5 text-right">
                <span className="text-[12px] text-zinc-400">
                  {c.withdrawn_at ? fmt(c.withdrawn_at) : fmt(c.paid_at ?? c.created_at)}
                </span>
              </td>
              <td className="px-4 py-3.5 text-right">
                {canWithdraw && (
                  <button
                    onClick={() => handleWithdraw(c.id)}
                    disabled={withdrawing === c.id}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-700 disabled:bg-zinc-300 text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {withdrawing === c.id ? "…" : "Withdraw"}
                  </button>
                )}
                {c.withdrawn_at && (
                  <span className="text-[11px] text-zinc-400">Done {fmt(c.withdrawn_at)}</span>
                )}
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="px-6 py-14 text-center">
              <p className="text-[14px] font-medium text-zinc-500">No confirmed contracts yet</p>
            </td>
          </tr>
        )}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
            <td colSpan={4} className="px-6 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{rows.length} contracts</p>
            </td>
            <td className="px-4 py-3.5 text-right">
              <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(summary.contractsGross)}</p>
            </td>
            <td className="px-4 py-3.5 text-right">
              <p className="text-[13px] font-semibold text-emerald-700 tabular-nums">{usd(summary.contractsCommission)}</p>
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      )}
    </TableShell>
  );
}

export default function AdminFinances({
  summary,
  bookings,
  contracts = [],
  agencies  = [],
}: {
  summary:    FinancesSummary;
  bookings:   FinancesBooking[];
  contracts?: FinancesContract[];
  agencies?:  AgencyEntry[];
}) {
  const activeAgencies = agencies.filter((a) => a.subscriptionStatus === "active");

  // Per-agency accumulated months for display
  const now = new Date();
  function agencyMonths(joinedAt: string) {
    const joined = new Date(joinedAt);
    return Math.max(1, (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth()) + 1);
  }

  return (
    <div className="max-w-7xl space-y-10">

      {/* ── Header ── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Platform Admin</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Finances</h1>
        <p className="text-[13px] text-zinc-400 mt-1">
          {summary.confirmedBookings} confirmed bookings · {contracts.length} confirmed/paid contracts · {activeAgencies.length} active subscriptions
        </p>
      </div>

      {/* ── Rate banner ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3">
        <span>Commission: <strong className="text-zinc-700">{COMMISSION_RATE * 100}%</strong></span>
        <span className="text-zinc-200">·</span>
        <span>Referral payout: <strong className="text-zinc-700">{REFERRAL_RATE * 100}%</strong> (only when active referrals exist)</span>
        <span className="text-zinc-200">·</span>
        <span>Subscription: <strong className="text-zinc-700">$2,500/mo per agency</strong></span>
      </div>

      {/* ══ 1. REVENUE SUMMARY ══════════════════════════════════════════════════ */}
      <Section label="Revenue Summary" title="Platform Totals">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Contracts in Escrow"
            value={usd(summary.contractsGross)}
            sub={`${contracts.length} confirmed contracts`}
            stripe="from-indigo-400 to-violet-500"
          />
          <StatCard
            label="Contract Commission (15%)"
            value={usd(summary.contractsCommission)}
            sub="Platform fee on confirmed contracts"
            stripe="from-emerald-400 to-teal-500"
          />
          <StatCard
            label="Subscription Revenue"
            value={usd(summary.subscriptionRevenue)}
            sub="All-time accumulated"
            note={`${usd(summary.monthlySubscriptionTotal)}/mo currently`}
            stripe="from-violet-400 to-purple-500"
          />
          <StatCard
            label="Net Platform Revenue"
            value={usd(summary.netRevenue)}
            sub="Commission + subscriptions − referrals"
            stripe="from-emerald-500 to-green-600"
          />
        </div>
      </Section>

      {/* ══ 2. CONTRACTS ════════════════════════════════════════════════════════ */}
      <Section
        label="Contracts"
        title="Confirmed & Paid Contracts"
        meta={`${contracts.length} contracts · ${usd(summary.contractsGross)} total · ${usd(summary.contractsCommission)} commission`}
      >
        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="In Escrow"
            value={usd(summary.contractsEscrowValue)}
            sub="Agency deposited, job not yet paid"
            stripe="from-indigo-400 to-violet-500"
          />
          <StatCard
            label="Awaiting Withdrawal"
            value={usd(summary.contractsAwaitingValue)}
            sub="Paid out, talent hasn't withdrawn"
            stripe="from-amber-400 to-orange-500"
          />
          <StatCard
            label="Withdrawn"
            value={usd(summary.contractsWithdrawnValue)}
            sub="Talent has withdrawn funds"
            stripe="from-sky-400 to-blue-500"
          />
          <StatCard
            label="Commission Earned (15%)"
            value={usd(summary.contractsCommission)}
            sub="Platform fee on all contracts"
            stripe="from-emerald-400 to-teal-500"
          />
        </div>

        {/* Full list */}
        <ContractsTable contracts={contracts} summary={summary} />

        {/* Withdrawal history */}
        <WithdrawalHistory contracts={contracts} />
      </Section>

      {/* ══ 3. BOOKINGS ═════════════════════════════════════════════════════════ */}
      <Section
        label="Bookings"
        title="All Bookings"
        meta={`${bookings.length} total · ${summary.confirmedBookings} confirmed · ${usd(summary.confirmedGrossValue)} confirmed value`}
      >
        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Confirmed Gross"
            value={usd(summary.confirmedGrossValue)}
            sub="Confirmed booking value"
            stripe="from-indigo-400 to-violet-500"
          />
          <StatCard
            label="Commission (15%)"
            value={usd(summary.platformCommission)}
            sub="Platform fee on confirmed"
            stripe="from-emerald-400 to-teal-500"
          />
          <StatCard
            label="Referral Payouts (2%)"
            value={usd(summary.referralPayouts)}
            sub="Paid to referrers"
            stripe="from-violet-400 to-purple-500"
          />
          <StatCard
            label="Pending Value"
            value={usd(summary.pendingValue)}
            sub="Awaiting confirmation"
            stripe="from-amber-400 to-orange-500"
          />
        </div>

        {/* Full list */}
        <TableShell>
          <thead>
            <tr className="border-b border-zinc-100">
              <Th>Job</Th>
              <Th>Talent</Th>
              <Th>Status</Th>
              <Th right>Value</Th>
              <Th right>Commission (15%)</Th>
              <Th right>Referral (2%)</Th>
              <Th right>Net</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {bookings.map((b) => {
              const isConf     = b.status === "confirmed" || b.status === "paid";
              const commission = isConf ? Math.round(b.price * COMMISSION_RATE) : 0;
              const referral   = isConf && b.isReferred ? Math.round(b.price * REFERRAL_RATE) : 0;
              const net        = commission - referral;
              const stCls      = BOOKING_STATUS_STYLES[b.status] ?? "bg-zinc-100 text-zinc-500";
              return (
                <tr key={b.id} className="hover:bg-zinc-50/60 transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[180px]">{b.jobTitle || "—"}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{fmt(b.created_at)}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-[13px] text-zinc-600">{b.talentName}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${stCls}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">
                      {b.price > 0 ? usd(b.price) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`text-[13px] font-semibold tabular-nums ${isConf ? "text-emerald-700" : "text-zinc-300"}`}>
                      {isConf ? usd(commission) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`text-[13px] font-semibold tabular-nums ${isConf && b.isReferred ? "text-violet-700" : "text-zinc-300"}`}>
                      {isConf && b.isReferred ? usd(referral) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`text-[13px] font-semibold tabular-nums ${isConf ? "text-zinc-900" : "text-zinc-300"}`}>
                      {isConf ? usd(net) : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-14 text-center">
                  <p className="text-[14px] font-medium text-zinc-500">No bookings yet</p>
                </td>
              </tr>
            )}
          </tbody>
          {bookings.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                <td colSpan={3} className="px-6 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{bookings.length} bookings</p>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(summary.totalGrossValue)}</p>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <p className="text-[13px] font-semibold text-emerald-700 tabular-nums">{usd(summary.platformCommission)}</p>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <p className="text-[13px] font-semibold text-violet-700 tabular-nums">{usd(summary.referralPayouts)}</p>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">
                    {usd(summary.platformCommission - summary.referralPayouts)}
                  </p>
                </td>
              </tr>
            </tfoot>
          )}
        </TableShell>
      </Section>

      {/* ══ 4. SUBSCRIPTIONS ════════════════════════════════════════════════════ */}
      <Section
        label="Recurring Revenue"
        title="Monthly Agency Subscriptions"
        meta={`${activeAgencies.length} active · ${usd(summary.monthlySubscriptionTotal)}/mo · ${usd(summary.subscriptionRevenue)} accumulated`}
        right={
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Monthly</p>
            <p className="text-[18px] font-semibold text-zinc-900 tabular-nums leading-none">
              {usd(summary.monthlySubscriptionTotal)}
            </p>
          </div>
        }
      >
        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard
            label="Active Subscriptions"
            value={String(activeAgencies.length)}
            sub={`${usd(summary.monthlySubscriptionTotal)}/mo total`}
            stripe="from-indigo-400 to-violet-500"
          />
          <StatCard
            label="Monthly Recurring"
            value={usd(summary.monthlySubscriptionTotal)}
            sub="Current monthly income"
            stripe="from-emerald-400 to-teal-500"
          />
          <StatCard
            label="All-Time Accumulated"
            value={usd(summary.subscriptionRevenue)}
            sub="Total subscription revenue"
            stripe="from-violet-400 to-purple-500"
          />
        </div>

        {/* Agency list */}
        {agencies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-10 text-center">
            <p className="text-[13px] text-zinc-400 font-medium">No agencies registered yet</p>
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr className="border-b border-zinc-100">
                <Th>Agency</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Member Since</Th>
                <Th right>Months</Th>
                <Th right>Accumulated</Th>
                <Th right>Monthly</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {agencies.map((a) => {
                const months      = agencyMonths(a.joinedAt);
                const accumulated = months * AGENCY_MONTHLY_FEE;
                return (
                  <tr key={a.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white">
                          {a.name.slice(0, 2).toUpperCase()}
                        </div>
                        <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[160px]">{a.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Pro</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={[
                        "inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize",
                        a.subscriptionStatus === "active"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                          : "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
                      ].join(" ")}>
                        {a.subscriptionStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[13px] text-zinc-500">{fmt(a.joinedAt)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[13px] text-zinc-700 tabular-nums font-medium">{months}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(accumulated)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[13px] font-semibold text-zinc-500 tabular-nums">{usd(a.monthlyFee)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                <td colSpan={5} className="px-6 py-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{agencies.length} agencies</p>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(summary.subscriptionRevenue)}</p>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <p className="text-[13px] font-semibold text-emerald-700 tabular-nums">{usd(summary.monthlySubscriptionTotal)}/mo</p>
                </td>
              </tr>
            </tfoot>
          </TableShell>
        )}
      </Section>

    </div>
  );
}
