"use client";

import { useState } from "react";

const COMMISSION_RATE = 0.15;
const REFERRAL_RATE   = 0.08;

export type FinancesBooking = {
  id: string;
  jobTitle: string;
  talentName: string;
  price: number;
  status: string;
  created_at: string;
};

export type AgencyEntry = {
  id: string;
  name: string;
  joinedAt: string;
  monthlyFee: number;
};

export type FinancesSummary = {
  totalGrossValue: number;
  confirmedGrossValue: number;
  platformCommission: number;
  referralPayouts: number;
  netRevenue: number;
  pendingValue: number;
  totalBookings: number;
  confirmedBookings: number;
};

type DrillKey =
  | "confirmed"
  | "commission"
  | "referral"
  | "net"
  | "pending"
  | "pipeline"
  | null;

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700",
  pending:   "bg-amber-50   text-amber-700",
  cancelled: "bg-zinc-100   text-zinc-500",
};

function StatCard({
  label, value, sub, stripe, active, onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  stripe: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left bg-white rounded-2xl border shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-150 cursor-pointer",
        active
          ? "border-zinc-900 ring-2 ring-zinc-900/10"
          : "border-zinc-100 hover:border-zinc-300",
      ].join(" ")}
    >
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-6 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">{label}</p>
          <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900 leading-none">{value}</p>
          {sub && <p className="text-[12px] text-zinc-400 mt-1.5">{sub}</p>}
        </div>
        <svg
          className={`w-4 h-4 mt-1 flex-shrink-0 transition-transform text-zinc-400 ${active ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>
  );
}

function DrillTable({
  title,
  bookings,
  highlight,
}: {
  title: string;
  bookings: FinancesBooking[];
  highlight: "commission" | "referral" | "net" | "none";
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
        <p className="text-[14px] font-semibold text-zinc-900">{title}</p>
        <span className="text-[12px] text-zinc-400">{bookings.length} bookings</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Job</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Talent</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Date</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Deal Value</th>
              {highlight !== "none" && (
                <th className="text-right px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  {highlight === "commission" ? "Commission" : highlight === "referral" ? "Referral" : "Net Revenue"}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {bookings.map((b) => {
              const commission = Math.round(b.price * COMMISSION_RATE);
              const referral   = Math.round(b.price * REFERRAL_RATE);
              const net        = commission - referral;
              const hlValue    = highlight === "commission" ? commission : highlight === "referral" ? referral : net;
              const stCls = STATUS_STYLES[b.status] ?? "bg-zinc-100 text-zinc-500";
              return (
                <tr key={b.id} className="hover:bg-zinc-50/60 transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[160px]">{b.jobTitle || "—"}</p>
                  </td>
                  <td className="px-4 py-3.5 hidden sm:table-cell">
                    <span className="text-[13px] text-zinc-600">{b.talentName}</span>
                  </td>
                  <td className="px-4 py-3.5 hidden sm:table-cell">
                    <span className="text-[12px] text-zinc-400">{formatDate(b.created_at)}</span>
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
                  {highlight !== "none" && (
                    <td className="px-6 py-3.5 text-right">
                      <span className={`text-[13px] font-semibold tabular-nums ${
                        highlight === "commission" ? "text-emerald-700" :
                        highlight === "referral"   ? "text-violet-700"  :
                        "text-zinc-900"
                      }`}>
                        {usd(hlValue)}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <p className="text-[14px] font-medium text-zinc-500">No bookings in this category</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminFinances({
  summary,
  bookings,
  agencies = [],
}: {
  summary: FinancesSummary;
  bookings: FinancesBooking[];
  agencies?: AgencyEntry[];
}) {
  const [drill, setDrill] = useState<DrillKey>(null);

  const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "paid");
  const pending   = bookings.filter((b) => b.status === "pending" || b.status === "pending_payment");
  const monthlySubscriptionTotal = agencies.reduce((s, a) => s + a.monthlyFee, 0);

  function toggle(key: DrillKey) {
    setDrill((prev) => (prev === key ? null : key));
  }

  const drillContent: Record<Exclude<DrillKey, null>, { title: string; list: FinancesBooking[]; highlight: "commission" | "referral" | "net" | "none" }> = {
    confirmed: { title: "Confirmed Bookings",        list: confirmed, highlight: "none"       },
    commission: { title: "Platform Commission",       list: confirmed, highlight: "commission" },
    referral:   { title: "Referral Payouts",          list: confirmed, highlight: "referral"   },
    net:        { title: "Net Platform Revenue",      list: confirmed, highlight: "net"        },
    pending:    { title: "Pending Bookings",          list: pending,   highlight: "none"       },
    pipeline:   { title: "Total Gross Pipeline",      list: bookings,  highlight: "none"       },
  };

  return (
    <div className="max-w-7xl space-y-8">

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
          Platform Admin
        </p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">
          Finances
        </h1>
        <p className="text-[13px] text-zinc-400 mt-1">
          {summary.confirmedBookings} confirmed of {summary.totalBookings} total bookings
        </p>
      </div>

      {/* Rate info */}
      <div className="flex items-center gap-3 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Platform commission: <strong className="text-zinc-600">{COMMISSION_RATE * 100}%</strong>
        &nbsp;· Referral payout: <strong className="text-zinc-600">{REFERRAL_RATE * 100}%</strong>
        &nbsp;· Net revenue: <strong className="text-zinc-600">{((COMMISSION_RATE - REFERRAL_RATE) * 100).toFixed(0)}%</strong>
      </div>

      {/* Clickable stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard
          label="Gross Confirmed Value"
          value={usd(summary.confirmedGrossValue)}
          sub="From confirmed bookings"
          stripe="from-indigo-400 to-violet-500"
          active={drill === "confirmed"}
          onClick={() => toggle("confirmed")}
        />
        <StatCard
          label="Platform Commission"
          value={usd(summary.platformCommission)}
          sub={`${COMMISSION_RATE * 100}% of confirmed`}
          stripe="from-emerald-400 to-teal-500"
          active={drill === "commission"}
          onClick={() => toggle("commission")}
        />
        <StatCard
          label="Referral Payouts"
          value={usd(summary.referralPayouts)}
          sub={`${REFERRAL_RATE * 100}% of confirmed`}
          stripe="from-violet-400 to-purple-500"
          active={drill === "referral"}
          onClick={() => toggle("referral")}
        />
        <StatCard
          label="Net Platform Revenue"
          value={usd(summary.netRevenue)}
          sub="Commission minus referral payouts"
          stripe="from-emerald-500 to-green-600"
          active={drill === "net"}
          onClick={() => toggle("net")}
        />
        <StatCard
          label="Pending Value"
          value={usd(summary.pendingValue)}
          sub="Awaiting confirmation"
          stripe="from-amber-400 to-orange-500"
          active={drill === "pending"}
          onClick={() => toggle("pending")}
        />
        <StatCard
          label="Total Gross Pipeline"
          value={usd(summary.totalGrossValue)}
          sub="All bookings combined"
          stripe="from-sky-400 to-blue-500"
          active={drill === "pipeline"}
          onClick={() => toggle("pipeline")}
        />
      </div>

      {/* Inline drill-down */}
      {drill && (
        <DrillTable
          title={drillContent[drill].title}
          bookings={drillContent[drill].list}
          highlight={drillContent[drill].highlight}
        />
      )}

      {/* Full breakdown table */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-100">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">
            Breakdown
          </p>
          <p className="text-[15px] font-semibold text-zinc-900">All Bookings</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Job</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Talent</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Deal Value</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Commission</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Referral</th>
                <th className="text-right px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {bookings.map((b) => {
                const commission = Math.round(b.price * COMMISSION_RATE);
                const referral   = Math.round(b.price * REFERRAL_RATE);
                const net        = commission - referral;
                const isConfirmed = b.status === "confirmed";
                const stCls = STATUS_STYLES[b.status] ?? "bg-zinc-100 text-zinc-500";
                return (
                  <tr key={b.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[180px]">
                        {b.jobTitle || "—"}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{formatDate(b.created_at)}</p>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <span className="text-[13px] text-zinc-600">{b.talentName}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${stCls}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">
                        {b.price > 0 ? usd(b.price) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right hidden md:table-cell">
                      <span className={`text-[13px] font-semibold tabular-nums ${isConfirmed ? "text-emerald-700" : "text-zinc-300"}`}>
                        {isConfirmed ? usd(commission) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right hidden md:table-cell">
                      <span className={`text-[13px] font-semibold tabular-nums ${isConfirmed ? "text-violet-700" : "text-zinc-300"}`}>
                        {isConfirmed ? usd(referral) : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right hidden lg:table-cell">
                      <span className={`text-[13px] font-semibold tabular-nums ${isConfirmed ? "text-zinc-900" : "text-zinc-300"}`}>
                        {isConfirmed ? usd(net) : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">No bookings yet</p>
                  </td>
                </tr>
              )}
            </tbody>
            {bookings.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={2} className="px-6 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                      Totals
                    </p>
                  </td>
                  <td className="px-4 py-3.5 hidden sm:table-cell" />
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(summary.totalGrossValue)}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden md:table-cell">
                    <p className="text-[13px] font-semibold text-emerald-700 tabular-nums">{usd(summary.platformCommission)}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden md:table-cell">
                    <p className="text-[13px] font-semibold text-violet-700 tabular-nums">{usd(summary.referralPayouts)}</p>
                  </td>
                  <td className="px-6 py-3.5 text-right hidden lg:table-cell">
                    <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(summary.netRevenue)}</p>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Monthly Agency Subscriptions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Recurring</p>
            <h2 className="text-[18px] font-semibold tracking-tight text-zinc-900">Monthly Agency Payments</h2>
          </div>
          {agencies.length > 0 && (
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Monthly Total</p>
              <p className="text-[22px] font-semibold tracking-tight text-zinc-900 tabular-nums">
                {usd(monthlySubscriptionTotal)}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Each agency pays <strong className="text-zinc-600 mx-1">{usd(agencies[0]?.monthlyFee ?? 2500)}/month</strong> subscription fee.
          {agencies.length > 0 && (
            <span className="ml-1">{agencies.length} active {agencies.length === 1 ? "agency" : "agencies"} = {usd(monthlySubscriptionTotal)}/mo</span>
          )}
        </div>

        {agencies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-10 text-center">
            <p className="text-[13px] text-zinc-400 font-medium">No agencies registered yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
            {agencies.map((agency) => (
              <div key={agency.id} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/60 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white">
                  {agency.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-zinc-900 truncate">{agency.name}</p>
                  <p className="text-[12px] text-zinc-400 mt-0.5">Member since {formatDate(agency.joinedAt)}</p>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 flex-shrink-0">
                  Active
                </span>
                <p className="text-[14px] font-semibold text-zinc-900 tabular-nums flex-shrink-0 min-w-[80px] text-right">
                  {usd(agency.monthlyFee)}/mo
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
