"use client";

import Link from "next/link";
import { useT } from "@/lib/LanguageContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type Stats = {
  applied:        number;
  accepted:       number;
  upcoming:       number;
  pendingWithdraw: number;
  totalEarned:    number;
};

type UpcomingBooking = {
  id:         string;
  title:      string;
  agencyName: string;
  jobDate:    string | null;
  jobTime:    string | null;
  location:   string | null;
  amount:     number;
  status:     string;
};

type PendingPayment = {
  id:     string;
  title:  string;
  amount: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

function fmtJobDate(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function daysUntil(s: string | null) {
  if (!s) return null;
  const diff = Math.ceil(
    (new Date(s + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return `em ${diff} dias`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, stripe, icon, href,
}: {
  label: string; value: string; sub?: string;
  stripe: string; icon: React.ReactNode; href?: string;
}) {
  const inner = (
    <>
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-5 flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{label}</p>
          <p className="text-[1.75rem] font-semibold tracking-tighter text-zinc-900 leading-none">{value}</p>
          {sub && <p className="text-[12px] text-zinc-400 mt-1.5">{sub}</p>}
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

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, href, hrefLabel }: { title: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{title}</h2>
      {href && hrefLabel && (
        <Link href={href} className="text-[12px] font-medium text-zinc-400 hover:text-zinc-900 transition-colors flex items-center gap-1">
          {hrefLabel}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function Empty({ msg, cta, href }: { msg: string; cta?: string; href?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 py-10 text-center">
      <p className="text-[13px] text-zinc-400">{msg}</p>
      {cta && href && (
        <Link href={href} className="inline-block mt-3 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
          {cta} →
        </Link>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type TodayAvailability = {
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
} | null;

export default function TalentDashboard({
  stats,
  upcomingBookings,
  pendingPayments,
  todayAvailability,
}: {
  stats:             Stats;
  upcomingBookings:  UpcomingBooking[];
  pendingPayments:   PendingPayment[];
  todayAvailability: TodayAvailability;
}) {
  const { t, lang } = useT();

  const statCards = [
    {
      label: lang === "pt" ? "Trabalhos" : "Applied Jobs",
      value: String(stats.applied),
      sub:   t("page_jobs"),
      href:  "/talent/jobs",
      stripe: "from-sky-400 to-blue-500",
      icon: (
        <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      label: t("action_accept"),
      value: String(stats.accepted),
      sub:   t("contracts_title"),
      href:  "/talent/contracts",
      stripe: "from-violet-400 to-purple-500",
      icon: (
        <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: t("bookings_title"),
      value: String(stats.upcoming),
      sub:   t("status_confirmed"),
      href:  "/talent/bookings",
      stripe: "from-amber-400 to-orange-500",
      icon: (
        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label:  t("finances_available"),
      value:  brl(stats.pendingWithdraw),
      sub:    stats.totalEarned > 0 ? `${brl(stats.totalEarned)} ${t("finances_earnings")}` : t("finances_ready"),
      href:   "/talent/finances",
      stripe: "from-emerald-400 to-teal-500",
      icon: (
        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="max-w-5xl space-y-8">

      {/* ── Header ── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("portal_talent")}</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">{t("page_dashboard")}</h1>
      </div>

      {/* ── Availability banner ── */}
      {todayAvailability?.is_available === true ? (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <p className="text-[13px] font-medium text-emerald-800">
              Você está disponível hoje
              {todayAvailability.start_time && (
                <span className="font-normal text-emerald-600">
                  {" · "}{todayAvailability.start_time.slice(0, 5)}
                  {todayAvailability.end_time && `–${todayAvailability.end_time.slice(0, 5)}`}
                </span>
              )}
            </p>
          </div>
          <Link href="/talent/availability" className="text-[12px] font-medium text-emerald-600 hover:text-emerald-800 underline underline-offset-2 whitespace-nowrap transition-colors">
            Editar
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-zinc-300 flex-shrink-0" />
            <p className="text-[13px] text-zinc-500">
              {todayAvailability?.is_available === false
                ? "Você está indisponível hoje"
                : "Marque sua disponibilidade para receber mais convites"}
            </p>
          </div>
          <Link href="/talent/availability" className="text-[12px] font-medium text-violet-600 hover:text-violet-800 underline underline-offset-2 whitespace-nowrap transition-colors">
            Atualizar
          </Link>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* ── Bottom grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Upcoming bookings — 3 cols */}
        <div className="xl:col-span-3 space-y-0">
          <SectionHeader title={t("bookings_title")} href="/talent/bookings" hrefLabel={t("dashboard_view_all")} />

          {upcomingBookings.length === 0 ? (
            <Empty
              msg={t("bookings_no_bookings")}
              cta={lang === "pt" ? "Ver Vagas" : "View Jobs"}
              href="/talent/jobs"
            />
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
              {upcomingBookings.map((b) => {
                const countdown = daysUntil(b.jobDate);
                const isToday   = countdown === "Hoje";
                const isSoon    = typeof countdown === "string" && countdown.startsWith("em") && parseInt(countdown) <= 3;

                return (
                  <div key={b.id} className="flex items-center gap-4 px-5 py-4">
                    {/* Date block */}
                    <div className={[
                      "w-12 flex-shrink-0 text-center rounded-xl py-1.5 border",
                      isToday ? "bg-amber-50 border-amber-100" : "bg-zinc-50 border-zinc-100",
                    ].join(" ")}>
                      {b.jobDate ? (
                        <>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 leading-none">
                            {new Date(b.jobDate + "T00:00:00").toLocaleDateString("pt-BR", { month: "short" })}
                          </p>
                          <p className={`text-[18px] font-bold leading-tight ${isToday ? "text-amber-600" : "text-zinc-900"}`}>
                            {new Date(b.jobDate + "T00:00:00").getDate()}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] text-zinc-400 py-1">{t("general_tbd")}</p>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-zinc-900 truncate leading-snug">{b.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-[11px] text-zinc-400 truncate">{b.agencyName}</p>
                        {b.location && <span className="text-[#647B7B]">·</span>}
                        {b.location && <p className="text-[11px] text-zinc-400 truncate">{b.location}</p>}
                      </div>
                      {b.jobTime && (
                        <p className="text-[11px] text-zinc-400 mt-0.5">{b.jobTime}</p>
                      )}
                    </div>

                    {/* Right: amount + countdown */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{brl(b.amount)}</p>
                      {countdown && (
                        <span className={[
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block",
                          isToday || isSoon
                            ? "bg-amber-50 text-amber-600"
                            : "bg-zinc-100 text-zinc-500",
                        ].join(" ")}>
                          {countdown}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment status — 2 cols */}
        <div className="xl:col-span-2 space-y-0">
          <SectionHeader title={t("page_finances")} href="/talent/finances" hrefLabel={t("nav_finances")} />

          {/* Withdraw banner */}
          {stats.pendingWithdraw > 0 && (
            <Link
              href="/talent/finances"
              className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5 mb-3 hover:bg-emerald-100/60 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-emerald-800">
                  {brl(stats.pendingWithdraw)} {t("finances_available")}
                </p>
                <p className="text-[11px] text-emerald-600 mt-0.5">{t("finances_withdraw_btn")}</p>
              </div>
            </Link>
          )}

          {pendingPayments.length === 0 && stats.pendingWithdraw === 0 ? (
            <Empty msg={t("finances_no_funds")} />
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">

              {pendingPayments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-zinc-800 truncate">{p.title}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{t("status_pending_payment")}</p>
                  </div>
                  <p className="text-[12px] font-semibold text-zinc-700 tabular-nums flex-shrink-0">
                    {brl(p.amount)}
                  </p>
                </div>
              ))}

              {/* Summary row */}
              {(stats.totalEarned > 0 || pendingPayments.length > 0) && (
                <div className="px-5 py-3 bg-zinc-50/60 flex items-center justify-between">
                  <p className="text-[11px] text-zinc-400">{t("finances_earnings")}</p>
                  <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{brl(stats.totalEarned)}</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

