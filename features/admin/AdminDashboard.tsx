"use client";

import Link from "next/link";
import { useState } from "react";
import { statusInfo } from "@/lib/bookingStatus";

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
  monthlySubscriptionTotal?: number;
};

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_FALLBACK = { label: "Outro", cls: "badge-info" };

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmado", cls: "badge-success" },
  completed: { label: "Concluído",  cls: "badge-success" },
  pending:   { label: "Pendente",   cls: "badge-pending" },
  pending_payment: { label: statusInfo("pending_payment").label, cls: "badge-pending" },
  paid:      { label: statusInfo("paid").label, cls: "badge-success" },
  cancelled: { label: "Cancelado",  cls: "badge-info"   },
  disputed:  { label: "Em disputa", cls: "badge-error"  },
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
        <div className="w-9 h-9 rounded-xl bg-[#E6F0F0] border border-[#DDE6E6] flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1">{label}</p>
          <p className="text-[2rem] font-semibold tracking-tighter text-[#1F2D2E] leading-none">{value}</p>
          {sub && <p className="text-[12px] text-[#647B7B] mt-1.5 font-medium">{sub}</p>}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card-hover block overflow-hidden hover:border-[#1ABC9C]/30 transition-all duration-150">
        {inner}
      </Link>
    );
  }
  return (
    <div className="card overflow-hidden">
      {inner}
    </div>
  );
}

type SortKey = "totalValue" | "platformCommission" | "referralPayout" | "bookedAt";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return (
    <svg className="w-3 h-3 text-[#647B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  // Only count commissions from confirmed/paid bookings (actual collected revenue)
  const dateFilteredRevenue  = dateFilteredBookings
    .filter((b) => b.status === "confirmed" || b.status === "paid" || b.status === "completed")
    .reduce((s, b) => s + b.platformCommission, 0);

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
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1">Admin da Plataforma</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#1F2D2E] leading-tight">Visão Geral</h1>
        </div>
        <div className="flex items-center gap-1 bg-[#E6F0F0] rounded-xl p-1">
          {(["all", "today", "this_month"] as const).map((df) => (
            <button key={df} onClick={() => setDateFilter(df)}
              className={["px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap",
                dateFilter === df ? "bg-white text-[#0E7C86] shadow-sm font-semibold" : "text-[#647B7B] hover:text-[#1F2D2E]"].join(" ")}>
              {df === "all" ? "Todo Período" : df === "today" ? "Hoje" : "Este Mês"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total de Vagas" value={String(stats.totalJobs)} sub="Em todas as categorias"
          href="/admin/jobs" stripe="from-[#1ABC9C] to-[#27C1D6]"
          icon={<svg className="w-4 h-4 text-[#0E7C86]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
        />
        <StatCard
          label="Total de Usuários" value={String(stats.totalUsers)} sub="Agências e talentos"
          href="/admin/users" stripe="from-[#0E7C86] to-[#2F8F8F]"
          icon={<svg className="w-4 h-4 text-[#0E7C86]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <StatCard
          label="Total de Reservas" value={String(dateFilteredBookings.length)}
          sub={dateFilter === "all" ? "Todo período" : dateFilter === "today" ? "Hoje" : "Este mês"}
          href="/admin/bookings" stripe="from-[#27C1D6] to-[#1ABC9C]"
          icon={<svg className="w-4 h-4 text-[#27C1D6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
        />
        <StatCard
          label="Receita da Plataforma" value={brl(dateFilteredRevenue + (dateFilter === "all" ? (stats.monthlySubscriptionTotal ?? 0) : 0))}
          sub={`Comissões${stats.monthlySubscriptionTotal ? ` + R$${(stats.monthlySubscriptionTotal / 1000).toFixed(1)}k assinaturas/mês` : ""}`}
          href="/admin/finances" stripe="from-[#F5A623] to-[#FFD166]"
          icon={<svg className="w-4 h-4 text-[#F5A623]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* ── Table card ── */}
      <div className="card overflow-hidden">

        <div className="px-6 py-5 border-b border-[#DDE6E6] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-0.5">Reservas</p>
            <p className="text-[15px] font-semibold text-[#1F2D2E]">{filtered.length} reserva{filtered.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#7FA9A8] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text" placeholder="Buscar reservas…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-base pl-9 w-48"
              />
            </div>
            <div className="flex items-center gap-1 bg-[#E6F0F0] rounded-xl p-1">
              {(["all", "pending", "pending_payment", "confirmed", "paid", "cancelled", "disputed"] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={["px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all capitalize cursor-pointer", statusFilter === s ? "bg-white text-[#0E7C86] shadow-sm font-semibold" : "text-[#647B7B] hover:text-[#1F2D2E]"].join(" ")}>
                  {s === "all" ? "Todos" : (STATUS[s]?.label ?? s)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#DDE6E6] bg-[#F8FAFC]">
                <th className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wide text-[#647B7B] whitespace-nowrap">ID Reserva</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#647B7B] whitespace-nowrap">Vaga</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#647B7B] whitespace-nowrap">Talento</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#647B7B] whitespace-nowrap">Status</th>
                <ColHeader col="totalValue"         label="Valor Total"         />
                <ColHeader col="platformCommission" label="Comissão Plataforma" />
                <ColHeader col="referralPayout"     label="Pagamento Indicação" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDE6E6]">
              {filtered.map((b) => {
                const st = STATUS[b.status] ?? STATUS_FALLBACK;
                const commPct = b.totalValue > 0 ? Math.round((b.platformCommission / b.totalValue) * 100) : 0;
                return (
                  <tr key={b.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap">
                      <p className="text-[13px] font-semibold text-[#1F2D2E] font-mono truncate max-w-[120px]">{b.id.slice(0, 8)}…</p>
                      <p className="text-[11px] text-[#647B7B] mt-0.5">{formatDate(b.bookedAt)}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-[13px] font-semibold text-[#1F2D2E] truncate max-w-[200px]">{b.jobTitle}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#E6F0F0] flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-[#0E7C86]">
                            {b.talentName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-[#1F2D2E]">{b.talentName}</p>
                          {b.talentHandle && <p className="text-[11px] text-[#647B7B]">@{b.talentHandle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <p className="text-sm font-semibold text-[#1F2D2E] tabular-nums">{brl(b.totalValue)}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <p className="text-sm font-semibold text-[#0E7C86] tabular-nums">{brl(b.platformCommission)}</p>
                      <p className="text-[11px] text-[#647B7B] tabular-nums">{commPct}% do valor</p>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-right">
                      {b.hasReferrer ? (
                        <p className="text-sm font-semibold text-[#F5A623] tabular-nums">{brl(b.referralPayout)}</p>
                      ) : (
                        <p className="text-[13px] text-[#DDE6E6]">—</p>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-16 text-center">
                  <p className="text-[14px] font-semibold text-[#647B7B]">Nenhuma reserva encontrada</p>
                  <p className="text-[13px] text-[#7FA9A8] mt-1">Tente ajustar a busca ou o filtro.</p>
                </td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#DDE6E6] bg-[#F8FAFC]">
                  <td className="px-6 py-3.5" colSpan={4}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">Totais — {filtered.length} reservas</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[13px] font-semibold text-[#1F2D2E] tabular-nums">{brl(totalValue)}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <p className="text-[13px] font-semibold text-[#0E7C86] tabular-nums">{brl(totalCommission)}</p>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <p className="text-[13px] font-semibold text-[#F5A623] tabular-nums">{brl(totalReferral)}</p>
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

