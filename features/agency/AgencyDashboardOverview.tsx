"use client";

import Link from "next/link";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import { useT } from "@/lib/LanguageContext";
import { talentCategoryLabel } from "@/lib/talentCategories";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  totalJobs:      number;
  activeJobs:     number;
  submissions:    number;
  pendingPayment: number;
  paidContracts:  number;
  totalSpent:     number;
  walletBalance:  number;
  activeEscrowTotal: number;
};

type TalentRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  categories: string[] | null;
  city: string | null;
  country: string | null;
};

type ActivityType = "booking" | "submission" | "job" | "profile";

type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  sub: string;
  time: string;
  link?: string;
  avatarUrl?: string | null;
  jobDate?: string | null;
};

type PendingContract = {
  id: string;
  amount: number;
  talentName: string;
  jobTitle: string;
  jobDate: string | null;
};

type ActiveJob = {
  id: string;
  title: string;
  jobDate: string | null;
  talentsNeeded: number;
};

type ConfirmedContract = {
  id: string;
  amount: number;
  talentName: string;
  jobTitle: string;
  paidAt: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}

function timeAgo(iso: string, lang: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (lang === "pt") {
    if (diff < 60)    return "agora mesmo";
    if (diff < 3600)  return `há ${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 172800) return "ontem";
    return `há ${Math.floor(diff / 86400)}d`;
  }
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)}d ago`;
}

function daysUntilJobDate(s: string | null): number | null {
  if (!s) return null;
  const diff = new Date(s + "T00:00:00").getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fmtJobDate(s: string | null, lang: string) {
  if (!s) return null;
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  return new Date(s + "T00:00:00").toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

const GRADIENTS = [
  "from-violet-400 to-indigo-600", "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
];

function avatarGradient(name: string) {
  return GRADIENTS[(name.charCodeAt(0) ?? 0) % GRADIENTS.length];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const STAT_LINKS: Record<string, string> = {
  totalJobs:      "/agency/jobs",
  activeJobs:     "/agency/jobs",
  submissions:    "/agency/submissions",
  pendingPayment: "/agency/bookings",
  contractsPaid:  "/agency/contracts",
  totalSpent:     "/agency/finances",
  activeEscrow:   "/agency/bookings",
};

const STAT_ICONS: Record<string, React.ReactNode> = {
  totalJobs: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  activeJobs: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  pendingPayment: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  submissions: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 12h6m-6 4h6M9 8h3m-5 13h10a2 2 0 002-2V7.5L14.5 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  contractsPaid: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  totalSpent: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  activeEscrow: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M12 3l7 4v5c0 4.5-2.9 8.5-7 9-4.1-.5-7-4.5-7-9V7l7-4z" />
    </svg>
  ),
};

const ACTIVITY_DOT: Record<ActivityType, string> = {
  booking:    "bg-emerald-400",
  submission: "bg-sky-400",
  job:        "bg-indigo-400",
  profile:    "bg-amber-400",
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ statKey, label, value, isCurrency }: { statKey: string; label: string; value: number; isCurrency?: boolean }) {
  const href   = STAT_LINKS[statKey];
  const icon   = STAT_ICONS[statKey];

  const inner = (
    <>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <span className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#E6F0F0] text-[#0E7C86] ring-1 ring-[#DDE6E6]">{icon}</span>
          {href && (
            <span className="text-[11px] font-semibold text-[#B8D4D4] group-hover:text-[#647B7B] transition-colors">Ver</span>
          )}
        </div>
        <p className={`text-[2.35rem] font-black tracking-[-0.06em] leading-none ${isCurrency ? "text-[#0E7C86]" : "text-[#1F2D2E]"}`}>
          {isCurrency ? brl(value) : value}
        </p>
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#647B7B] mt-3">{label}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="group block bg-white rounded-[1.5rem] border border-[#DDE6E6] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)] overflow-hidden hover:-translate-y-0.5 hover:border-[#B8D4D4] hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] transition-all duration-200">
        {inner}
      </Link>
    );
  }
  return (
    <div className="bg-white rounded-[1.5rem] border border-[#DDE6E6] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)] overflow-hidden">
      {inner}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, meta, href, hrefLabel }: {
  title: string; meta?: string; href?: string; hrefLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">{title}</h2>
        {meta && <span className="text-[11px] text-[#B8D4D4] font-medium">{meta}</span>}
      </div>
      {href && hrefLabel && (
        <Link href={href} className="text-[12px] font-medium text-[#647B7B] hover:text-[#1F2D2E] transition-colors flex items-center gap-1">
          {hrefLabel}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function Empty({ msg }: { msg: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#DDE6E6] py-10 text-center">
      <p className="text-[13px] text-[#647B7B]">{msg}</p>
    </div>
  );
}

// ─── Activity item ────────────────────────────────────────────────────────────

function ActivityItemRow({ item, index, total }: { item: ActivityItem; index: number; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const { t, lang } = useT();
  const dot     = ACTIVITY_DOT[item.type];
  const jobDate = fmtJobDate(item.jobDate ?? null, lang);
  const badge = {
    booking:    <Badge variant="success">{t("status_confirmed")}</Badge>,
    submission: <Badge variant="info">{t("submissions_title")}</Badge>,
    job:        <Badge variant="info">{t("page_jobs")}</Badge>,
    profile:    <Badge variant="warning">{t("page_profile")}</Badge>,
  }[item.type];

  const inner = (
    <li className={[
      "relative flex items-start gap-4 px-5 py-4",
      index < total - 1 ? "border-b border-[#EFF5F5]" : "",
    ].join(" ")}>
      <div className="flex-shrink-0 w-[1.875rem] flex justify-center pt-[5px]">
        {item.avatarUrl ? (
          <img src={item.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-white" />
        ) : (
          <span className={`w-2 h-2 rounded-full ring-4 ring-white ${dot} mt-1.5`} />
        )}
      </div>
      <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-[13px] font-semibold text-[#1F2D2E] leading-snug">{item.title}</p>
            {badge}
          </div>
          <p className="text-[12px] text-[#647B7B] leading-relaxed">{item.sub}</p>
          {jobDate && (
            <p className="text-[11px] text-violet-500 font-medium mt-0.5">{t("jobs_job_date")}: {jobDate}</p>
          )}
          {item.type === "submission" && expanded && item.avatarUrl && (
            <div className="mt-3 flex items-center gap-3 bg-[#F8FAFC] rounded-xl px-3 py-2.5">
              <img src={item.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-zinc-800 truncate">{item.sub.split(" applied")[0]}</p>
                {item.link && (
                  <Link href={item.link} className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium">
                    {t("action_view")} →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <p className="text-[11px] text-[#647B7B] tabular-nums whitespace-nowrap mt-0.5">
            {timeAgo(item.time, lang)}
          </p>
          {item.type === "submission" && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded((v) => !v); }}
              className="text-[10px] text-[#647B7B] hover:text-zinc-600 transition-colors"
            >
              {expanded ? "−" : "+"}
            </button>
          )}
        </div>
      </div>
    </li>
  );

  if (item.link && item.type !== "submission") {
    return (
      <Link href={item.link} className="block hover:bg-[#F8FAFC] transition-colors">
        {inner}
      </Link>
    );
  }
  return <>{inner}</>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgencyDashboardOverview({
  stats,
  recentTalent,
  recentActivity,
  pendingContracts,
  activeJobsList,
  confirmedContracts,
}: {
  stats: Stats;
  recentTalent: TalentRow[];
  recentActivity: ActivityItem[];
  pendingContracts: PendingContract[];
  activeJobsList: ActiveJob[];
  confirmedContracts: ConfirmedContract[];
}) {
  const { t, lang } = useT();

  const statEntries: { key: string; label: string; value: number; isCurrency?: boolean }[] = [
    { key: "totalJobs",      label: "Vagas abertas",                   value: stats.totalJobs },
    { key: "submissions",    label: "Candidaturas recebidas",          value: stats.submissions },
    { key: "pendingPayment", label: "Reservas em andamento",           value: stats.pendingPayment },
    { key: "contractsPaid",  label: "Contratos pagos",                 value: stats.paidContracts },
    { key: "activeEscrow",   label: "Valor em andamento",              value: stats.activeEscrowTotal, isCurrency: true },
  ];

  return (
    <div className="max-w-6xl space-y-10">

      {/* ── Page header ── */}
      <div className="rounded-[1.75rem] bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-6 py-6 text-white shadow-[0_8px_28px_rgba(26,188,156,0.28)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80 mb-2">
              {t("portal_agency")}
            </p>
            <h1 className="text-[2rem] font-black tracking-[-0.04em] leading-tight">
              {t("page_dashboard")}
            </h1>
            <p className="text-[13px] text-white/70 mt-2">
              Acompanhe vagas, pagamentos e talentos com visão rápida da operação.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/agency/finances" className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3 transition-colors hover:bg-white/25">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">Saldo na carteira</p>
              <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">{brl(stats.walletBalance)}</p>
            </Link>
            <Link href="/agency/bookings" className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3 transition-colors hover:bg-white/25">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">Valor em andamento</p>
              <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">{brl(stats.activeEscrowTotal)}</p>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statEntries.map((s) => <StatCard key={s.key} statKey={s.key} label={s.label} value={s.value} isCurrency={s.isCurrency} />)}
      </div>

      {/* ── Pending contracts (PIX payments) ── */}
      <div>
        <SectionHeader
          title={t("status_pending_payment")}
          meta={pendingContracts.length > 0 ? `${pendingContracts.length}` : undefined}
          href="/agency/contracts"
          hrefLabel={t("dashboard_view_all")}
        />
        {pendingContracts.length === 0 ? (
          <Empty msg="Nenhum contrato em custódia aguardando liberação." />
        ) : (
          <div className="bg-white rounded-2xl border border-[#DDE6E6] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] divide-y divide-[#EFF5F5] overflow-hidden">
            {pendingContracts.map((c) => {
              const daysLeft = daysUntilJobDate(c.jobDate);
              const jobDateFmt = fmtJobDate(c.jobDate, lang);
              return (
                <Link
                  key={c.id}
                  href="/agency/bookings"
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[#F8FAFC] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1F2D2E] truncate leading-snug">{c.jobTitle}</p>
                    <p className="text-[12px] text-[#647B7B] mt-0.5">{c.talentName}</p>
                    {c.jobDate && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {daysLeft !== null && daysLeft > 0 ? (
                          <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full">
                            {daysLeft}d até a vaga
                          </span>
                        ) : daysLeft !== null && daysLeft <= 0 ? (
                          <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                            Vaga passou · {jobDateFmt}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <p className="text-[14px] font-bold text-[#1F2D2E] tabular-nums flex-shrink-0">{brl(c.amount)}</p>
                  <svg className="w-4 h-4 text-[#B8D4D4] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom grid: Activity + Talent ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Activity feed — 3 cols */}
        <div className="xl:col-span-3">
          <SectionHeader title={t("dashboard_recent_bookings")} meta={`${recentActivity.length}`} />
          {recentActivity.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#DDE6E6] py-14 text-center">
              <p className="text-[14px] font-medium text-[#647B7B]">{t("dashboard_no_activity")}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#DDE6E6] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
              <ul className="relative">
                <div className="absolute left-[2.375rem] top-6 bottom-6 w-px bg-[#DDE6E6]" />
                {recentActivity.map((item, i) => (
                  <ActivityItemRow key={item.id} item={item} index={i} total={recentActivity.length} />
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Recent talent — 2 cols */}
        <div className="xl:col-span-2">
          <SectionHeader title="Equipe recente" href="/agency/talent-history" hrefLabel="Minha Equipe" />
          {recentTalent.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#DDE6E6] py-14 text-center">
              <p className="text-[14px] font-medium text-[#647B7B]">Talentos recentes aparecerão aqui após as primeiras reservas pagas.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentTalent.map((talent) => {
                const name = talent.full_name ?? "Sem nome";
                return (
                  <Link
                    key={talent.id}
                    href={`/agency/talent/${talent.id}`}
                    className="group block bg-white rounded-2xl border border-[#DDE6E6] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] hover:border-[#B8D4D4] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-150"
                  >
                    <div className="flex items-center gap-3">
                      {talent.avatar_url ? (
                        <img src={talent.avatar_url} alt={name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}>
                          {initials(name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#1F2D2E] truncate leading-none">{name}</p>
                        <p className="text-[12px] text-[#647B7B] truncate mt-0.5">
                          {[talent.city, talent.country].filter(Boolean).join(", ") || "Localização desconhecida"}
                        </p>
                      </div>
                      {talent.categories?.[0] && (
                        <span className="text-[10px] font-medium bg-[#E6F0F0] text-[#647B7B] px-2 py-0.5 rounded-full flex-shrink-0">
                          {talentCategoryLabel(talent.categories[0])}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Active Jobs + Confirmed Bookings ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Active Jobs */}
        <div>
          <SectionHeader
            title={t("dashboard_active_jobs")}
            meta={activeJobsList.length > 0 ? `${activeJobsList.length}` : undefined}
            href="/agency/jobs"
            hrefLabel={t("dashboard_view_all")}
          />
          {activeJobsList.length === 0 ? (
            <Empty msg="Nenhuma vaga ativa no momento." />
          ) : (
            <div className="bg-white rounded-2xl border border-[#DDE6E6] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] divide-y divide-[#EFF5F5] overflow-hidden">
              {activeJobsList.map((job) => {
                const date = fmtJobDate(job.jobDate, lang);
                return (
                  <Link
                    key={job.id}
                    href={`/agency/jobs/${job.id}`}
                    className="flex items-center gap-3 px-5 py-4 hover:bg-[#F8FAFC] transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#1F2D2E] truncate">{job.title}</p>
                      {date && <p className="text-[11px] text-violet-500 font-medium mt-0.5">{date}</p>}
                    </div>
                    <span className="text-[11px] font-medium text-[#647B7B] bg-[#E6F0F0] px-2 py-0.5 rounded-full flex-shrink-0">
                      {job.talentsNeeded} {job.talentsNeeded === 1 ? "vaga" : "vagas"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirmed Bookings */}
        <div>
          <SectionHeader
            title={t("contracts_paid")}
            meta={confirmedContracts.length > 0 ? `${confirmedContracts.length}` : undefined}
            href="/agency/contracts"
            hrefLabel={t("dashboard_view_all")}
          />
          {confirmedContracts.length === 0 ? (
            <Empty msg="Nenhum contrato pago ainda." />
          ) : (
            <div className="bg-white rounded-2xl border border-[#DDE6E6] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] divide-y divide-[#EFF5F5] overflow-hidden">
              {confirmedContracts.map((c) => (
                <Link key={c.id} href="/agency/bookings" className="flex items-center gap-3 px-5 py-4 hover:bg-[#F8FAFC] transition-colors">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1F2D2E] truncate">{c.jobTitle}</p>
                    <p className="text-[12px] text-[#647B7B] truncate mt-0.5">{c.talentName}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[13px] font-semibold text-emerald-700 tabular-nums">{brl(c.amount)}</p>
                    {c.paidAt && (
                      <p className="text-[11px] text-[#647B7B] mt-0.5">
                        {new Date(c.paidAt).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
