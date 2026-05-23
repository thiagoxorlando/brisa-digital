"use client";

import Link from "next/link";
import { brl } from "@/lib/brl";
import type { AdminControlCenterData, QueueItem } from "@/lib/readModels/adminControlCenter";

function ChevronRight({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

const QUEUE_SEVERITY_CHIP: Record<QueueItem["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  warn:     "border-amber-200 bg-amber-50 text-amber-700",
  neutral:  "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const QUEUE_COUNT_CLS: Record<QueueItem["severity"], string> = {
  critical: "text-red-700 font-bold",
  warn:     "text-amber-700 font-bold",
  neutral:  "text-zinc-500",
};

export default function AdminControlCenter({ data }: { data: AdminControlCenterData }) {
  const { alerts, financialOps, operationalQueue, activityMetrics, systemHealth } = data;
  const hasAlerts = alerts.length > 0;
  const allQueueClear = operationalQueue.every((q) => q.count === 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-800">Centro de Controle</h1>
        <p className="mt-1 text-sm text-zinc-500">Visão operacional da plataforma em tempo real.</p>
      </div>

      {/* ── SECTION 1: Alertas ─────────────────────────────────────────────── */}
      {hasAlerts && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
            Alertas — Ação necessária
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {alerts.map((alert) => {
              const isRed = alert.severity === "critical";
              return (
                <Link key={alert.key} href={alert.href}>
                  <div
                    className={[
                      "flex items-start gap-3 rounded-xl border p-4 transition cursor-pointer",
                      isRed
                        ? "border-red-200 bg-red-50 hover:bg-red-100"
                        : "border-amber-200 bg-amber-50 hover:bg-amber-100",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "text-2xl font-bold leading-none",
                        isRed ? "text-red-700" : "text-amber-700",
                      ].join(" ")}
                    >
                      {alert.count}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={[
                          "font-semibold text-sm",
                          isRed ? "text-red-800" : "text-amber-800",
                        ].join(" ")}
                      >
                        {alert.label}
                      </p>
                      <p
                        className={[
                          "text-xs mt-0.5",
                          isRed ? "text-red-600" : "text-amber-600",
                        ].join(" ")}
                      >
                        {alert.description}
                      </p>
                    </div>
                    <ChevronRight
                      size={18}
                      className={isRed ? "text-red-400 flex-shrink-0 mt-0.5" : "text-amber-400 flex-shrink-0 mt-0.5"}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!hasAlerts && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Tudo em ordem — nenhuma ação necessária no momento.
        </div>
      )}

      {/* ── SECTION 2: Operações Financeiras ───────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          Operações Financeiras
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/escrow">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 cursor-pointer hover:bg-emerald-100 transition">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                Custódia ativa
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-800 leading-none">
                {brl(financialOps.activeEscrow)}
              </p>
              <p className="mt-1 text-xs text-emerald-600">Contratos em custódia confirmada</p>
            </div>
          </Link>

          <Link href="/admin/disputes">
            <div
              className={[
                "rounded-xl border p-4 cursor-pointer transition",
                financialOps.disputedEscrow > 0
                  ? "border-red-200 bg-red-50 hover:bg-red-100"
                  : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
              ].join(" ")}
            >
              <p
                className={[
                  "text-[11px] font-semibold uppercase tracking-wider",
                  financialOps.disputedEscrow > 0 ? "text-red-600" : "text-zinc-500",
                ].join(" ")}
              >
                Custódia em disputa
              </p>
              <p
                className={[
                  "mt-1 text-2xl font-bold leading-none",
                  financialOps.disputedEscrow > 0 ? "text-red-800" : "text-zinc-700",
                ].join(" ")}
              >
                {brl(financialOps.disputedEscrow)}
              </p>
              <p
                className={[
                  "mt-1 text-xs",
                  financialOps.disputedEscrow > 0 ? "text-red-600" : "text-zinc-400",
                ].join(" ")}
              >
                {financialOps.disputedEscrow > 0 ? "Bloqueada por disputa aberta" : "Nenhuma disputa ativa"}
              </p>
            </div>
          </Link>

          <Link href="/admin/withdrawals">
            <div
              className={[
                "rounded-xl border p-4 cursor-pointer transition",
                financialOps.pendingWithdrawalsAmount > 0
                  ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                  : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
              ].join(" ")}
            >
              <p
                className={[
                  "text-[11px] font-semibold uppercase tracking-wider",
                  financialOps.pendingWithdrawalsAmount > 0 ? "text-amber-600" : "text-zinc-500",
                ].join(" ")}
              >
                Saques pendentes
              </p>
              <p
                className={[
                  "mt-1 text-2xl font-bold leading-none",
                  financialOps.pendingWithdrawalsAmount > 0 ? "text-amber-800" : "text-zinc-700",
                ].join(" ")}
              >
                {brl(financialOps.pendingWithdrawalsAmount)}
              </p>
              <p
                className={[
                  "mt-1 text-xs",
                  financialOps.pendingWithdrawalsAmount > 0 ? "text-amber-600" : "text-zinc-400",
                ].join(" ")}
              >
                {financialOps.pendingWithdrawalsAmount > 0 ? "Aguardando processamento" : "Nenhum saque pendente"}
              </p>
            </div>
          </Link>

          <Link href="/admin/contracts">
            <div
              className={[
                "rounded-xl border p-4 cursor-pointer transition",
                financialOps.pendingPayoutsCount > 0
                  ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                  : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100",
              ].join(" ")}
            >
              <p
                className={[
                  "text-[11px] font-semibold uppercase tracking-wider",
                  financialOps.pendingPayoutsCount > 0 ? "text-amber-600" : "text-zinc-500",
                ].join(" ")}
              >
                Pagamentos pendentes
              </p>
              <p
                className={[
                  "mt-1 text-2xl font-bold leading-none",
                  financialOps.pendingPayoutsCount > 0 ? "text-amber-800" : "text-zinc-700",
                ].join(" ")}
              >
                {financialOps.pendingPayoutsCount}
              </p>
              <p
                className={[
                  "mt-1 text-xs",
                  financialOps.pendingPayoutsCount > 0 ? "text-amber-600" : "text-zinc-400",
                ].join(" ")}
              >
                {financialOps.pendingPayoutsCount > 0 ? "Contratos aguardando depósito" : "Nenhum pagamento pendente"}
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* ── SECTION 3: Fila Operacional ────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          Fila Operacional
        </h2>
        {allQueueClear ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
            Nenhum item pendente na fila operacional.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {operationalQueue.map((item) => (
                  <tr key={item.key} className="bg-white hover:bg-zinc-50 transition">
                    <td className="px-4 py-3 font-medium text-zinc-800">{item.label}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          QUEUE_SEVERITY_CHIP[item.severity],
                        ].join(" ")}
                      >
                        <span className={QUEUE_COUNT_CLS[item.severity]}>{item.count}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={item.href}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition"
                      >
                        Ver
                        <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── SECTION 4: Atividade da Plataforma ─────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          Atividade da plataforma
        </h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Novos usuários hoje", value: activityMetrics.newUsersToday, href: "/admin/users" },
            { label: "Vagas hoje", value: activityMetrics.newJobsToday, href: "/admin/jobs" },
            { label: "Contratos hoje", value: activityMetrics.newContractsToday, href: "/admin/contracts" },
            { label: "Reservas hoje", value: activityMetrics.newBookingsToday, href: "/admin/bookings" },
            { label: "Workspaces ativos", value: activityMetrics.activeWorkspaces, href: "/admin/premium" },
            { label: "Talentos ativos", value: activityMetrics.activeTalents, href: "/admin/users" },
          ].map((card) => (
            <Link key={card.label} href={card.href}>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 cursor-pointer hover:bg-zinc-50 transition">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {card.label}
                </p>
                <p className="mt-1 text-2xl font-bold text-zinc-800 leading-none">{card.value}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── SECTION 5: Status do Sistema ───────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          Status do sistema
        </h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-emerald-800">Supabase</p>
              <p className="text-xs text-emerald-600">Conectado</p>
            </div>
          </div>

          <div
            className={[
              "rounded-xl border px-4 py-3 flex items-center gap-3",
              systemHealth.asaasConfigured
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50",
            ].join(" ")}
          >
            <span
              className={[
                "h-2.5 w-2.5 rounded-full flex-shrink-0",
                systemHealth.asaasConfigured ? "bg-emerald-500" : "bg-red-500",
              ].join(" ")}
            />
            <div>
              <p
                className={[
                  "text-xs font-semibold",
                  systemHealth.asaasConfigured ? "text-emerald-800" : "text-red-800",
                ].join(" ")}
              >
                Asaas
              </p>
              <p
                className={[
                  "text-xs",
                  systemHealth.asaasConfigured ? "text-emerald-600" : "text-red-600",
                ].join(" ")}
              >
                {systemHealth.asaasConfigured ? "Configurado" : "Chave de API ausente"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-zinc-700">Ambiente</p>
              <p className="text-xs text-zinc-500">{systemHealth.nodeEnv}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
