"use client";

import { brl } from "@/lib/brl";

export type AnalyticsBucket = {
  totalUsers: number;
  newUsers: number;
  totalAgencies: number;
  totalTalents: number;
  totalBookings: number;
  confirmedBookings: number;
  paidContracts: number;
  totalContracts: number;
  escrowValue: number;
  payoutsValue: number;
  withdrawalsValue: number;
  commissionRevenue: number;
  activePremiumWorkspaces: number;
};

export type AnalyticsData = {
  allTime: AnalyticsBucket;
  last30Days: AnalyticsBucket;
};

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "warn";
}) {
  const toneCls =
    tone === "positive"
      ? "from-emerald-400 to-teal-500"
      : tone === "warn"
      ? "from-amber-400 to-orange-500"
      : "from-zinc-300 to-zinc-400";
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className={`h-[3px] bg-gradient-to-r ${toneCls}`} />
      <div className="p-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
        <p className="text-[1.5rem] font-semibold leading-none tracking-tighter text-zinc-900">{value}</p>
        {sub && <p className="mt-1 text-[11px] text-zinc-500">{sub}</p>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function AdminAnalytics({ data }: { data: AnalyticsData }) {
  const { allTime, last30Days } = data;

  return (
    <div className="max-w-7xl space-y-8 px-4 sm:px-6">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          Admin da plataforma
        </p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-zinc-900">
          Analytics
        </h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          Métricas operacionais da plataforma — todo período e últimos 30 dias.
        </p>
      </div>

      <Section title="Crescimento da plataforma">
        <StatCard
          label="Usuários totais"
          value={String(allTime.totalUsers)}
          sub={`${allTime.totalAgencies} agências · ${allTime.totalTalents} talentos`}
        />
        <StatCard
          label="Novos (30 dias)"
          value={String(last30Days.newUsers)}
          sub={`${pct(last30Days.newUsers, allTime.totalUsers)} do total`}
          tone="positive"
        />
        <StatCard
          label="Workspaces Premium ativos"
          value={String(allTime.activePremiumWorkspaces)}
        />
        <StatCard
          label="Reservas (30 dias)"
          value={String(last30Days.totalBookings)}
          sub={`Total geral: ${allTime.totalBookings}`}
        />
      </Section>

      <Section title="Funil de reservas">
        <StatCard
          label="Reservas totais"
          value={String(allTime.totalBookings)}
        />
        <StatCard
          label="Confirmadas"
          value={String(allTime.confirmedBookings)}
          sub={`Conversão: ${pct(allTime.confirmedBookings, allTime.totalBookings)}`}
          tone="positive"
        />
        <StatCard
          label="Contratos criados"
          value={String(allTime.totalContracts)}
        />
        <StatCard
          label="Contratos pagos"
          value={String(allTime.paidContracts)}
          sub={`Pago/criado: ${pct(allTime.paidContracts, allTime.totalContracts)}`}
          tone="positive"
        />
      </Section>

      <Section title="Visão financeira">
        <StatCard
          label="Em custódia"
          value={brl(allTime.escrowValue)}
          tone="warn"
        />
        <StatCard
          label="Pago a talentos"
          value={brl(allTime.payoutsValue)}
        />
        <StatCard
          label="Saques processados"
          value={brl(allTime.withdrawalsValue)}
        />
        <StatCard
          label="Receita (30d)"
          value={brl(last30Days.commissionRevenue)}
          sub={`Total geral: ${brl(allTime.commissionRevenue)}`}
          tone="positive"
        />
      </Section>

      <Section title="Métricas Premium">
        <StatCard
          label="Workspaces ativos"
          value={String(allTime.activePremiumWorkspaces)}
        />
        <StatCard
          label="Contratos pagos"
          value={String(allTime.paidContracts)}
        />
        <StatCard
          label="Receita comissão (geral)"
          value={brl(allTime.commissionRevenue)}
        />
        <StatCard
          label="Novos usuários (30d)"
          value={String(last30Days.newUsers)}
          tone="positive"
        />
      </Section>
    </div>
  );
}
