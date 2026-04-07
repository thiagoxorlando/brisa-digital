"use client";

import Link from "next/link";
import { useState } from "react";

type Booking = {
  id: string;
  talentId: string | null;
  talentName: string;
  talentHandle: string | null;
  jobTitle: string;
  totalValue: number;
  platformCommission: number;
  referralPayout: number;
  hasReferrer: boolean;
  status: string;
  bookedAt: string;
};

type AdminStats = {
  totalJobs: number;
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_FALLBACK = { label: "Unknown", cls: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200" };

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  pending:   { label: "Pending",   cls: "bg-amber-50  text-amber-700  ring-1 ring-amber-100"    },
  cancelled: { label: "Cancelled", cls: "bg-zinc-100  text-zinc-500   ring-1 ring-zinc-200"     },
  disputed:  { label: "Disputed",  cls: "bg-rose-50   text-rose-600   ring-1 ring-rose-100"     },
};

function StatCard({
  label, value, sub, icon, stripe, href,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; stripe: string; href?: string;
}) {
  const inner = (
    <>
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-6 flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{label}</p>
          <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900 leading-none">{value}</p>
          {sub && <p className="text-[12px] text-zinc-400 mt-1.5 font-medium">{sub}</p>}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden hover:shadow-[0_4px_12px_rgba(0,0,0,0.07)] hover:border-zinc-200 transition-all duration-150">
        {inner}
      </Link>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {inner}
    </div>
  );
}

type SortKey = "totalValue" | "platformCommission" | "referralPayout" | "bookedAt";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return (
    <svg className="w-3 h-3 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
  return (
    <svg className="w-3 h-3 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {dir === "desc"
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />}
    </svg>
  );
}

type DateFilter = "all" | "today" | "this_month";

function matchesDateFilter(bookedAt: string, df: DateFilter): boolean {
  if (df === "all") return true;
  const d = new Date(bookedAt);
  const now = new Date();
  if (df === "today") {
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth()    === now.getMonth()    &&
           d.getDate()     === now.getDate();
  }
  // this_month
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function AdminDashboard({ bookings, stats }: { bookings: Booking[]; stats: AdminStats }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter]     = useState<DateFilter>("all");
  const [sortKey, setSortKey]           = useState<SortKey>("bookedAt");
  const [sortDir, setSortDir]           = useState<SortDir>("desc");
  const [search, setSearch]             = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const filtered = bookings
    .filter((b) => statusFilter === "all" || b.status === statusFilter)
    .filter((b) => matchesDateFilter(b.bookedAt, dateFilter))
    .filter((b) => {
      const q = search.toLowerCase();
      return (
        b.id.toLowerCase().includes(q) ||
        b.talentName.toLowerCase().includes(q) ||
        b.jobTitle.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "bookedAt") return mul * a.bookedAt.localeCompare(b.bookedAt);
      return mul * (a[sortKey] - b[sortKey]);
    });

  const totalValue      = filtered.reduce((s, b) => s + b.totalValue, 0);
  const totalCommission = filtered.reduce((s, b) => s + b.platformCommission, 0);
  const totalReferral   = filtered.reduce((s, b) => s + (b.hasReferrer ? b.referralPayout : 0), 0);

  // Date-filtered bookings for stat cards (independent of search/status)
  const dateFilteredBookings = bookings.filter((b) => matchesDateFilter(b.bookedAt, dateFilter));
  const dateFilteredRevenue  = dateFilteredBookings.reduce((s, b) => s + b.platformCommission, 0);

  function ColHeader({ col, label, align = "right" }: { col: SortKey; label: string; align?: "left" | "right" }) {
    return (
      <th
        onClick={() => toggleSort(col)}
        className={`px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap cursor-pointer select-none hover:text-zinc-600 transition-colors ${align === "right" ? "text-right" : "text-left"}`}
      >
        <span className={`inline-flex items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
          {label}
          <SortIcon active={sortKey === col} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <div className="max-w-7xl space-y-8">

      {/* ── Page header ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Platform Admin</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Overview</h1>
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1">
          {(["all", "today", "this_month"] as const).map((df) => (
            <button key={df} onClick={() => setDateFilter(df)}
              className={["px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap",
                dateFilter === df ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"].join(" ")}>
              {df === "all" ? "All Time" : df === "today" ? "Today" : "This Month"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Jobs" value={String(stats.totalJobs)} sub="Across all categories"
          href="/admin/jobs" stripe="from-sky-400 to-blue-500"
          icon={<svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
        />
        <StatCard
          label="Total Users" value={String(stats.totalUsers)} sub="Agencies & talent"
          href="/admin/users" stripe="from-violet-400 to-purple-500"
          icon={<svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <StatCard
          label="Total Bookings" value={String(dateFilteredBookings.length)}
          sub={dateFilter === "all" ? "All time" : dateFilter === "today" ? "Today" : "This month"}
          href="/admin/bookings" stripe="from-indigo-400 to-blue-500"
          icon={<svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
        />
        <StatCard
          label="Platform Revenue" value={usd(dateFilteredRevenue)}
          sub={dateFilter === "all" ? "All time" : dateFilter === "today" ? "Today" : "This month"}
          href="/admin/finances" stripe="from-emerald-400 to-teal-500"
          icon={<svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* ── Table card ── */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">

        <div className="px-6 py-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Bookings</p>
            <p className="text-[15px] font-semibold text-zinc-900">{filtered.length} booking{filtered.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text" placeholder="Search bookings…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-[13px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none bg-white w-48 transition-colors"
              />
            </div>
            <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1">
              {(["all", "confirmed", "pending", "cancelled", "disputed"] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={["px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all capitalize cursor-pointer", statusFilter === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"].join(" ")}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap">Booking ID</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap">Job</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap">Talent</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap">Status</th>
                <ColHeader col="totalValue"         label="Total Value"         />
                <ColHeader col="platformCommission" label="Platform Commission" />
                <ColHeader col="referralPayout"     label="Referral Payout"     />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((b) => {
                const st = STATUS[b.status] ?? STATUS_FALLBACK;
                const commPct = b.totalValue > 0 ? Math.round((b.platformCommission / b.totalValue) * 100) : 0;
                return (
                  <tr key={b.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-[13px] font-semibold text-zinc-900 font-mono truncate max-w-[120px]">{b.id.slice(0, 8)}…</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{formatDate(b.bookedAt)}</p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <p className="text-[13px] font-semibold text-zinc-800 truncate max-w-[200px]">{b.jobTitle}</p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-zinc-500">
                            {b.talentName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-zinc-800">{b.talentName}</p>
                          {b.talentHandle && <p className="text-[11px] text-zinc-400">@{b.talentHandle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <p className="text-[14px] font-semibold text-zinc-900 tabular-nums">{usd(b.totalValue)}</p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <p className="text-[14px] font-semibold text-emerald-700 tabular-nums">{usd(b.platformCommission)}</p>
                      <p className="text-[11px] text-zinc-400 tabular-nums">{commPct}% of deal</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {b.hasReferrer ? (
                        <p className="text-[14px] font-semibold text-violet-700 tabular-nums">{usd(b.referralPayout)}</p>
                      ) : (
                        <p className="text-[13px] text-zinc-300">—</p>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-16 text-center">
                  <p className="text-[14px] font-semibold text-zinc-500">No bookings found</p>
                  <p className="text-[13px] text-zinc-400 mt-1">Try adjusting your search or filter.</p>
                </td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td className="px-6 py-3.5" colSpan={4}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Totals — {filtered.length} bookings</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(totalValue)}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[13px] font-semibold text-emerald-700 tabular-nums">{usd(totalCommission)}</p>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <p className="text-[13px] font-semibold text-violet-700 tabular-nums">{usd(totalReferral)}</p>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
