"use client";

import { brl } from "@/lib/brl";

type Counts = {
  pendingWithdrawals: number;
  failedWithdrawals: number;
  pendingSupport: number;
  pendingPlanCharges: number;
  activeWorkspaces: number;
  activeEscrow: number;
  newUsersToday: number;
  bookingsToday: number;
  escrowTotal: number;
};

type Severity = "critical" | "warn" | "ok" | "neutral";

type Card = {
  label: string;
  value: number;
  display: string;
  sub?: string;
  severity: Severity;
  href: string;
};

function severity(count: number, thresholds: { warn: number; critical?: number }): Severity {
  if (thresholds.critical !== undefined && count >= thresholds.critical) return "critical";
  if (count >= thresholds.warn) return "warn";
  if (count === 0) return "ok";
  return "neutral";
}

const SEVERITY_CLS: Record<Severity, { card: string; label: string; value: string }> = {
  critical: {
    card:  "border-red-400/40 bg-red-500/[0.07] hover:bg-red-500/[0.13]",
    label: "text-red-400",
    value: "text-red-300",
  },
  warn: {
    card:  "border-amber-500/40 bg-amber-500/[0.08] hover:bg-amber-500/[0.14]",
    label: "text-amber-400",
    value: "text-amber-300",
  },
  ok: {
    card:  "border-emerald-500/25 bg-emerald-500/[0.05] hover:bg-emerald-500/[0.09]",
    label: "text-emerald-500/70",
    value: "text-emerald-400",
  },
  neutral: {
    card:  "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]",
    label: "text-[#7BA09A]",
    value: "text-white",
  },
};

export default function AdminControlCenter({ counts }: { counts: Counts }) {
  const cards: Card[] = [
    {
      label:    "Saques pendentes",
      value:    counts.pendingWithdrawals,
      display:  String(counts.pendingWithdrawals),
      severity: severity(counts.pendingWithdrawals, { warn: 1, critical: 5 }),
      href:     "/admin/withdrawals",
    },
    {
      label:    "Saques com problema",
      value:    counts.failedWithdrawals,
      display:  String(counts.failedWithdrawals),
      severity: severity(counts.failedWithdrawals, { warn: 1, critical: 3 }),
      href:     "/admin/withdrawals",
    },
    {
      label:    "Suporte aguardando",
      value:    counts.pendingSupport,
      display:  String(counts.pendingSupport),
      severity: severity(counts.pendingSupport, { warn: 1, critical: 10 }),
      href:     "/admin/support",
    },
    {
      label:    "Cobranças de plano pendentes",
      value:    counts.pendingPlanCharges,
      display:  String(counts.pendingPlanCharges),
      severity: severity(counts.pendingPlanCharges, { warn: 1 }),
      href:     "/admin/plans",
    },
    {
      label:    "Workspaces Premium ativos",
      value:    counts.activeWorkspaces,
      display:  String(counts.activeWorkspaces),
      severity: "neutral",
      href:     "/admin/premium",
    },
    {
      label:    "Contratos em custódia",
      value:    counts.activeEscrow,
      display:  String(counts.activeEscrow),
      sub:      counts.escrowTotal > 0 ? brl(counts.escrowTotal) : undefined,
      severity: "neutral",
      href:     "/admin/escrow",
    },
    {
      label:    "Novos usuários hoje",
      value:    counts.newUsersToday,
      display:  String(counts.newUsersToday),
      severity: "neutral",
      href:     "/admin/users",
    },
    {
      label:    "Reservas hoje",
      value:    counts.bookingsToday,
      display:  String(counts.bookingsToday),
      severity: "neutral",
      href:     "/admin/bookings",
    },
  ];

  const alertCards  = cards.filter((c) => c.severity === "critical" || c.severity === "warn");
  const allClear    = alertCards.length === 0;

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {allClear ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Tudo em ordem — nenhuma ação necessária no momento.
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {alertCards.length === 1
            ? "1 item requer atenção."
            : `${alertCards.length} itens requerem atenção.`}
        </div>
      )}

      {/* Count cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => {
          const cls = SEVERITY_CLS[card.severity];
          return (
            <a
              key={card.label}
              href={card.href}
              className={[
                "group flex flex-col gap-1 rounded-2xl border p-4 transition-all duration-150",
                cls.card,
              ].join(" ")}
            >
              <p className={["text-[11px] font-semibold uppercase tracking-[0.12em]", cls.label].join(" ")}>
                {card.label}
              </p>
              <p className={["text-3xl font-bold leading-none", cls.value].join(" ")}>
                {card.display}
              </p>
              {card.sub && (
                <p className="text-xs text-[#7BA09A]">{card.sub}</p>
              )}
              {card.severity === "ok" && (
                <p className="text-[10px] text-emerald-500/60">Nenhum pendente</p>
              )}
            </a>
          );
        })}
      </div>

      {/* Quick links — persistent shortcuts to operational areas */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#4A7872]/60">
          Atalhos operacionais
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Saques pendentes",    href: "/admin/withdrawals", desc: "Processar e aprovar" },
            { label: "Suporte aberto",      href: "/admin/support",     desc: "Responder tickets" },
            { label: "Custódia / Escrow",   href: "/admin/escrow",      desc: "Monitorar custódia" },
            { label: "Pagamentos talentos", href: "/admin/payouts",     desc: "Histórico de pagamentos" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex flex-col gap-0.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3 text-[12px] transition-all hover:bg-white/[0.07] hover:border-white/[0.12]"
            >
              <span className="font-semibold text-[#C7D9D5]">{link.label}</span>
              <span className="text-[11px] text-[#4A7872]/70">{link.desc}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
