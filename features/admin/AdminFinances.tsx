"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { REFERRAL_RATE } from "@/lib/plans";

export type FinancesBooking = {
  id: string;
  jobTitle: string;
  talentName: string;
  price: number;
  status: string;
  created_at: string;
  isReferred: boolean;
  agencyPlan: "free" | "pro" | "premium";
  commissionAmount: number;
  referralAmount: number;
  netPlatformAmount: number;
};

export type FinancesContract = {
  id: string;
  jobTitle: string;
  talentName: string;
  agencyName: string;
  agencyPlan: "free" | "pro" | "premium";
  amount: number;
  commissionAmount: number;
  netAmount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  withdrawn_at: string | null;
};

export type FinancesWithdrawal = {
  id: string;
  agencyName: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  status: string;
  createdAt: string;
  processedAt: string | null;
  pixKeyType: string | null;
  pixKeyValue: string | null;
  pixHolderName: string | null;
  adminNote: string | null;
};

export type FinancesPlanPayment = {
  id: string;
  userId: string;
  agencyName: string;
  plan: "free" | "pro" | "premium";
  amount: number;
  createdAt: string;
};

export type FinancesSubscription = {
  userId: string;
  agencyName: string;
  plan: "free" | "pro" | "premium";
  planStatus: string;
  planExpiresAt: string | null;
  totalPaid: number;
  lastPayment: string | null;
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
  pendingValue: number;
  totalBookings: number;
  confirmedBookings: number;
  agencyWalletTotal: number;
  subscriptionRevenue: number;
  minimumRequired: number;
  planBreakdown: {
    free: { commissionLabel: string; priceLabel: string };
    pro: { commissionLabel: string; priceLabel: string };
    premium: { commissionLabel: string; priceLabel: string };
  };
};

type PlatformBalanceState =
  | { status: "loading" }
  | { status: "ok"; balance: number }
  | { status: "error" };

type ProfitRange = "today" | "month" | "total";

const PLAN_BADGES: Record<string, string> = {
  free:    "bg-[#E6F0F0] text-[#647B7B] ring-1 ring-[#DDE6E6]",
  pro:     "bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30",
  premium: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30",
};

const STATUS_BADGES: Record<string, string> = {
  confirmed:       "bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30",
  paid:            "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
  pending:         "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
  pending_payment: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
  processing:      "bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30",
  failed:          "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
  cancelled:       "bg-[#E6F0F0] text-[#647B7B] ring-1 ring-[#DDE6E6]",
  active:          "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
  inactive:        "bg-[#E6F0F0] text-[#647B7B] ring-1 ring-[#DDE6E6]",
  cancelling:      "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
};

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmt(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function planLabel(plan: "free" | "pro" | "premium") {
  if (plan === "pro") return "Pro";
  if (plan === "premium") return "Premium";
  return "Free";
}

function isInRange(value: string | null, range: ProfitRange) {
  if (!value) return false;
  if (range === "total") return true;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

  if (range === "today") {
    return date >= todayStart && date < tomorrowStart;
  }

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function ShowMoreButton({
  total,
  expanded,
  onToggle,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (total <= 5) return null;

  return (
    <div className="flex justify-end">
      <button
        onClick={onToggle}
        className="rounded-xl border border-zinc-700 px-3.5 py-2 text-[12px] font-medium text-zinc-400 transition-colors hover:border-zinc-500 hover:text-[#647B7B]"
      >
        {expanded ? "Ver menos" : `Ver mais (${total - 5})`}
      </button>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="px-8 py-7 space-y-5">
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-white">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function GroupBlock({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  accent: "green" | "amber" | "blue";
  children: ReactNode;
}) {
  const v = {
    green: {
      border: "border-emerald-900/60",
      header: "bg-emerald-950/70 border-b border-emerald-900/50",
      dot: "bg-emerald-400 shadow-sm shadow-emerald-400/60",
      title: "text-emerald-300",
      sub: "text-emerald-700",
      shadow: "shadow-emerald-950/30",
      stripe: "from-emerald-500/40 via-teal-500/20 to-transparent",
    },
    amber: {
      border: "border-amber-900/60",
      header: "bg-amber-950/70 border-b border-amber-900/50",
      dot: "bg-amber-400 shadow-sm shadow-amber-400/60",
      title: "text-amber-300",
      sub: "text-amber-700",
      shadow: "shadow-amber-950/30",
      stripe: "from-amber-500/40 via-yellow-500/20 to-transparent",
    },
    blue: {
      border: "border-blue-900/60",
      header: "bg-blue-950/70 border-b border-blue-900/50",
      dot: "bg-blue-400 shadow-sm shadow-blue-400/60",
      title: "text-blue-300",
      sub: "text-blue-700",
      shadow: "shadow-blue-950/30",
      stripe: "from-blue-500/40 via-cyan-500/20 to-transparent",
    },
  }[accent];

  return (
    <div className={`rounded-3xl border ${v.border} overflow-hidden shadow-2xl ${v.shadow}`}>
      <div className={`${v.header} px-8 py-6 relative overflow-hidden`}>
        <div className={`absolute inset-y-0 left-0 w-64 bg-gradient-to-r ${v.stripe} pointer-events-none`} />
        <div className="relative flex items-center gap-3">
          <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${v.dot}`} />
          <h2 className={`text-2xl font-bold tracking-tight ${v.title}`}>{title}</h2>
        </div>
        <p className={`relative mt-1 ml-[26px] text-sm ${v.sub}`}>{subtitle}</p>
      </div>
      <div className="divide-y divide-zinc-800/60 bg-[#0B0F14]">
        {children}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="relative rounded-2xl border border-[#DDE6E6] bg-white p-5 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-[#1F2D2E]">{value}</p>
      {sub ? <p className="mt-2 text-sm text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function Badge({ value, tone }: { value: string; tone: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{value}</span>;
}

function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#DDE6E6] bg-white">
      <table className="w-full">{children}</table>
    </div>
  );
}

function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return <td className={`px-4 py-3.5 text-sm text-[#647B7B] ${right ? "text-right" : "text-left"}`}>{children}</td>;
}

function ProfitSection({
  bookings,
  contracts,
  planPayments,
}: {
  bookings: FinancesBooking[];
  contracts: FinancesContract[];
  planPayments: FinancesPlanPayment[];
}) {
  const [range, setRange] = useState<ProfitRange>("month");

  const filteredBookings = bookings.filter((booking) => isInRange(booking.created_at, range));
  const filteredContracts = contracts.filter((contract) => isInRange(contract.paid_at ?? contract.created_at, range));
  const filteredPlanPayments = planPayments.filter((payment) => isInRange(payment.createdAt, range));

  const bookingCommission = filteredBookings.reduce((sum, booking) => sum + booking.commissionAmount, 0);
  const contractCommission = filteredContracts.reduce((sum, contract) => sum + contract.commissionAmount, 0);
  const totalCommission = bookingCommission + contractCommission;
  const planRevenue = filteredPlanPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalProfit = totalCommission + planRevenue;

  return (
    <Section
      title="Lucro da plataforma"
      subtitle="Resumo filtravel de comissao e receita de planos para acompanhamento rapido."
    >
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: "today" as ProfitRange, label: "Hoje" },
          { key: "month" as ProfitRange, label: "Este mes" },
          { key: "total" as ProfitRange, label: "Total" },
        ]).map((option) => (
          <button
            key={option.key}
            onClick={() => setRange(option.key)}
            className={[
              "rounded-xl px-3.5 py-2 text-[12px] font-medium transition-all",
              range === option.key
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
                : "border border-[#DDE6E6] bg-white text-[#647B7B] hover:border-[#B8D4D4] hover:bg-[#F8FAFC] hover:text-[#1F2D2E]",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Comissao da plataforma"
          value={brl(totalCommission)}
          sub={`Reservas: ${brl(bookingCommission)} | Contratos: ${brl(contractCommission)}`}
        />
        <StatCard
          label="Receita de planos"
          value={brl(planRevenue)}
          sub={`${filteredPlanPayments.length} pagamento(s) de plano no periodo`}
        />
        <StatCard
          label="Total de lucro"
          value={brl(totalProfit)}
          sub={`${filteredBookings.length} reservas + ${filteredContracts.length} contratos considerados`}
        />
      </div>
    </Section>
  );
}

function SubscriptionsSection({
  subscriptions,
  summary,
}: {
  subscriptions: FinancesSubscription[];
  summary: FinancesSummary;
}) {
  const [expanded, setExpanded] = useState(false);
  const proCount = subscriptions.filter((subscription) => subscription.plan === "pro").length;
  const premiumCount = subscriptions.filter((subscription) => subscription.plan === "premium").length;
  const visibleSubscriptions = expanded ? subscriptions : subscriptions.slice(0, 5);

  return (
    <Section title="Planos de agencias" subtitle={`${subscriptions.length} agencias cadastradas`}>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Receita de assinaturas" value={brl(summary.subscriptionRevenue)} />
        <StatCard label="Agencias Pro" value={String(proCount)} sub={`${summary.planBreakdown.pro.priceLabel} cada`} />
        <StatCard label="Agencias Premium" value={String(premiumCount)} sub={`${summary.planBreakdown.premium.priceLabel} cada`} />
        <StatCard label="Agencias pagas" value={String(proCount + premiumCount)} />
      </div>

      <TableCard>
        <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
          <tr>
            <Th>Agencia</Th>
            <Th>Plano</Th>
            <Th>Status</Th>
            <Th>Vencimento</Th>
            <Th right>Total pago</Th>
            <Th right>Ultimo pagamento</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFF5F5] [&>tr]:transition-colors [&>tr:hover]:bg-[#F8FAFC]">
          {visibleSubscriptions.map((subscription) => (
            <tr key={subscription.userId}>
              <Td>{subscription.agencyName}</Td>
              <Td><Badge value={planLabel(subscription.plan)} tone={PLAN_BADGES[subscription.plan] ?? PLAN_BADGES.free} /></Td>
              <Td><Badge value={subscription.planStatus} tone={STATUS_BADGES[subscription.planStatus] ?? STATUS_BADGES.inactive} /></Td>
              <Td>{fmt(subscription.planExpiresAt)}</Td>
              <Td right>{subscription.totalPaid ? brl(subscription.totalPaid) : "-"}</Td>
              <Td right>{fmt(subscription.lastPayment)}</Td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <ShowMoreButton total={subscriptions.length} expanded={expanded} onToggle={() => setExpanded((c) => !c)} />
    </Section>
  );
}

function ContractsSection({
  contracts,
  summary,
}: {
  contracts: FinancesContract[];
  summary: FinancesSummary;
}) {
  const [rows, setRows] = useState<FinancesContract[]>(contracts);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setRows(contracts);
  }, [contracts]);

  async function handleWithdraw(id: string) {
    setWithdrawing(id);
    const response = await fetch(`/api/contracts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    setWithdrawing(null);

    if (response.ok) {
      const payload = (await response.json()) as { withdrawn_at?: string | null };
      setRows((current) =>
        current.map((contract) =>
          contract.id === id ? { ...contract, withdrawn_at: payload.withdrawn_at ?? new Date().toISOString() } : contract,
        ),
      );
    }
  }

  const visibleRows = expanded ? rows : rows.slice(0, 5);

  return (
    <Section
      title="Contratos confirmados e pagos"
      subtitle={`${rows.length} contratos | ${brl(summary.contractsCommission)} de comissao retida pela plataforma`}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Em escrow" value={brl(summary.contractsEscrowValue)} sub="Bruto retido em contratos confirmados" />
        <StatCard label="Aguardando saque" value={brl(summary.contractsAwaitingValue)} sub="Liquido devido em contratos pagos ainda nao sacados" />
        <StatCard label="Ja sacado" value={brl(summary.contractsWithdrawnValue)} sub="Liquido que ja saiu para os talentos" />
        <StatCard label="Comissao ganha" value={brl(summary.contractsCommission)} sub="Retencao da plataforma por plano da agencia" />
      </div>

      <TableCard>
        <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
          <tr>
            <Th>Vaga</Th>
            <Th>Talento</Th>
            <Th>Agencia</Th>
            <Th>Plano</Th>
            <Th>Status</Th>
            <Th right>Bruto</Th>
            <Th right>Comissao</Th>
            <Th right>Liquido talento</Th>
            <Th right>Data</Th>
            <Th right>Acoes</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFF5F5] [&>tr]:transition-colors [&>tr:hover]:bg-[#F8FAFC]">
          {visibleRows.map((contract) => {
            const statusLabel = contract.withdrawn_at ? "sacado" : contract.status === "paid" ? "aguardando saque" : "escrow";
            const statusTone = contract.withdrawn_at
              ? STATUS_BADGES.cancelled
              : contract.status === "paid"
                ? STATUS_BADGES.pending
                : STATUS_BADGES.confirmed;

            return (
              <tr key={contract.id}>
                <Td>{contract.jobTitle}</Td>
                <Td>{contract.talentName}</Td>
                <Td>{contract.agencyName}</Td>
                <Td><Badge value={planLabel(contract.agencyPlan)} tone={PLAN_BADGES[contract.agencyPlan] ?? PLAN_BADGES.free} /></Td>
                <Td><Badge value={statusLabel} tone={statusTone} /></Td>
                <Td right>{brl(contract.amount)}</Td>
                <Td right>{brl(contract.commissionAmount)}</Td>
                <Td right>{brl(contract.netAmount)}</Td>
                <Td right>{fmt(contract.withdrawn_at ?? contract.paid_at ?? contract.created_at)}</Td>
                <Td right>
                  {contract.status === "paid" && !contract.withdrawn_at ? (
                    <button
                      onClick={() => handleWithdraw(contract.id)}
                      disabled={withdrawing === contract.id}
                      className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:from-emerald-500 hover:to-teal-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {withdrawing === contract.id ? "..." : "Sacar"}
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-600">{contract.withdrawn_at ? "Concluido" : "-"}</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>

      <ShowMoreButton total={rows.length} expanded={expanded} onToggle={() => setExpanded((current) => !current)} />
    </Section>
  );
}

function WithdrawalHistory({ contracts }: { contracts: FinancesContract[] }) {
  const [expanded, setExpanded] = useState(false);
  const withdrawn = contracts
    .filter((contract) => !!contract.withdrawn_at)
    .sort((left, right) => new Date(right.withdrawn_at ?? "").getTime() - new Date(left.withdrawn_at ?? "").getTime());

  if (withdrawn.length === 0) return null;

  const groups = new Map<string, FinancesContract[]>();
  for (const contract of withdrawn) {
    const day = (contract.withdrawn_at ?? "").slice(0, 10);
    const key = `${contract.talentName}::${day}`;
    const current = groups.get(key) ?? [];
    current.push(contract);
    groups.set(key, current);
  }

  const receipts = [...groups.values()];
  const visibleReceipts = expanded ? receipts : receipts.slice(0, 5);
  const grandTotal = withdrawn.reduce((sum, contract) => sum + contract.netAmount, 0);

  return (
    <Section title="Historico de saques" subtitle={`${receipts.length} saque(s) concluidos`}>
      <div className="rounded-2xl border border-[#DDE6E6] bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-400">Total pago aos talentos</p>
          <p className="text-lg font-semibold text-[#1F2D2E]">{brl(grandTotal)}</p>
        </div>
        <div className="space-y-3">
          {visibleReceipts.map((items) => {
            const total = items.reduce((sum, contract) => sum + contract.netAmount, 0);
            const reference = items[0];
            return (
              <div key={`${reference.talentName}-${reference.withdrawn_at}`} className="rounded-xl border border-[#DDE6E6] bg-[#F8FAFC] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#1F2D2E]">{reference.talentName}</p>
                    <p className="text-sm text-zinc-500">{fmt(reference.withdrawn_at)}</p>
                  </div>
                  <p className="text-lg font-semibold text-emerald-400">{brl(total)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ShowMoreButton total={receipts.length} expanded={expanded} onToggle={() => setExpanded((current) => !current)} />
    </Section>
  );
}

const PIX_TYPE_LABELS_ADMIN: Record<string, string> = {
  cpf: "CPF", cnpj: "CNPJ", email: "E-mail", phone: "Telefone", random: "Chave aleatória",
};

function WithdrawalFeesSection({ withdrawals }: { withdrawals: FinancesWithdrawal[] }) {
  const [expandedFees, setExpandedFees] = useState(false);
  const paid    = withdrawals.filter((w) => w.status === "paid");
  const pending = withdrawals.filter((w) => w.status === "pending");

  const todayStart      = new Date(); todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart   = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const monthStart      = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const totalEarned    = paid.reduce((s, w) => s + w.feeAmount, 0);
  const totalPending   = pending.reduce((s, w) => s + w.feeAmount, 0);
  const feesToday      = paid
    .filter((w) => { const d = new Date(w.processedAt ?? ""); return d >= todayStart && d < tomorrowStart; })
    .reduce((s, w) => s + w.feeAmount, 0);
  const feesThisMonth  = paid
    .filter((w) => new Date(w.processedAt ?? "") >= monthStart)
    .reduce((s, w) => s + w.feeAmount, 0);

  const sorted = [...withdrawals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visibleFees = expandedFees ? sorted : sorted.slice(0, 5);

  return (
    <Section title="Taxas de saque" subtitle="Receita da plataforma por taxa de processamento (3%)">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total arrecadado"  value={brl(totalEarned)}   sub="Saques marcados como pago" />
        <StatCard label="Taxas pendentes"   value={brl(totalPending)}  sub="Aguardando processamento" />
        <StatCard label="Hoje"              value={brl(feesToday)}     sub="Processado hoje" />
        <StatCard label="Este mês"          value={brl(feesThisMonth)} sub="Processado no mês atual" />
      </div>

      {sorted.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Histórico de saques</p>
          <TableCard>
            <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
              <tr>
                <Th>Agência</Th>
                <Th right>Valor sacado</Th>
                <Th right>Taxa</Th>
                <Th right>Líquido enviado</Th>
                <Th>Solicitado em</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF5F5] [&>tr]:transition-colors [&>tr:hover]:bg-[#F8FAFC]">
              {visibleFees.map((w) => (
                <tr key={w.id}>
                  <Td>{w.agencyName}</Td>
                  <Td right>{brl(w.amount)}</Td>
                  <Td right>
                    <span className={
                      w.status === "paid"     ? "font-semibold text-emerald-400" :
                      w.status === "rejected" ? "text-zinc-600 line-through"     : "text-amber-400"
                    }>
                      {brl(w.feeAmount)}
                    </span>
                  </Td>
                  <Td right>{w.status === "rejected" ? <span className="text-zinc-600">—</span> : brl(w.netAmount)}</Td>
                  <Td>{fmt(w.createdAt)}</Td>
                  <Td>
                    {w.status === "paid"       && <Badge value="Pago"         tone="bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30" />}
                    {w.status === "rejected"   && <Badge value="Cancelado"    tone="bg-red-500/15 text-red-400 ring-1 ring-red-500/20" />}
                    {w.status === "pending"    && <Badge value="Pendente"     tone="bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30" />}
                    {w.status === "processing" && <Badge value="Em andamento" tone="bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30" />}
                    {w.status === "failed"     && <Badge value="Falhou"       tone="bg-red-500/15 text-red-400 ring-1 ring-red-500/30" />}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <ShowMoreButton total={sorted.length} expanded={expandedFees} onToggle={() => setExpandedFees((c) => !c)} />
        </>
      )}
    </Section>
  );
}

function WithdrawalsSection({ withdrawals }: { withdrawals: FinancesWithdrawal[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<FinancesWithdrawal[]>(withdrawals);
  const [approving, setApproving] = useState<string | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [approveLoading, setApproveLoading] = useState(false);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [sendingPix, setSendingPix] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPending, setExpandedPending] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { setRows(withdrawals); }, [withdrawals]);

  const pendingOnly   = rows.filter((w) => w.status === "pending");
  const processingOnly = rows.filter((w) => w.status === "processing");
  const pending = rows.filter((w) => w.status === "pending" || w.status === "processing");
  const visiblePending = expandedPending ? pending : pending.slice(0, 5);
  const history = rows
    .filter((w) => w.status !== "pending" && w.status !== "processing")
    .sort((a, b) => {
      const ta = new Date(a.processedAt ?? a.createdAt).getTime();
      const tb = new Date(b.processedAt ?? b.createdAt).getTime();
      return tb - ta;
    });
  const visibleHistory = expandedHistory ? history : history.slice(0, 5);

  async function handleSendPix(id: string) {
    setSendingPix(id);
    setError(null);
    const res = await fetch(`/api/admin/withdrawals/${id}/send-pix`, { method: "POST" });
    const data = await res.json().catch(() => ({})) as { error?: string; status?: string };
    setSendingPix(null);
    if (!res.ok) {
      setError(data.error ?? "Erro ao enviar PIX.");
      return;
    }
    const savedStatus = data.status ?? "processing";
    setRows((current) =>
      current.map((w) => w.id === id
        ? {
            ...w,
            status:      savedStatus,
            adminNote:   savedStatus === "paid"
              ? "PIX confirmado via Efí"
              : "PIX enviado via Efí, aguardando confirmação",
            processedAt: savedStatus === "paid" ? new Date().toISOString() : w.processedAt,
          }
        : w),
    );
    router.refresh();
  }

  async function handleApprove() {
    if (!approving) return;
    const id = approving;
    const note = approveNote.trim();
    setApproveLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/withdrawals/${id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string; details?: unknown; code?: string };
    setApproveLoading(false);
    if (!res.ok) {
      console.error("[handleApprove] failed:", { status: res.status, body: data });
      setError(
        typeof data.details === "string" ? data.details
        : data.error ?? "Erro ao aprovar saque.",
      );
      return;
    }
    setRows((current) =>
      current.map((w) => w.id === id ? { ...w, status: "paid", adminNote: note || null, processedAt: new Date().toISOString() } : w),
    );
    setApproving(null);
    setApproveNote("");
  }

  async function handleCancel() {
    if (!canceling || !cancelReason.trim()) return;
    const id = canceling;
    const reason = cancelReason.trim();
    setCancelLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/withdrawals/${id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    setCancelLoading(false);
    if (res.ok) {
      setRows((current) =>
        current.map((w) => w.id === id ? { ...w, status: "rejected", adminNote: reason, processedAt: new Date().toISOString() } : w),
      );
      setCanceling(null);
      setCancelReason("");
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "Erro ao cancelar saque.");
    }
  }

  function copyPix(value: string, id: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  }

  return (
    <Section
      title="Saques de agências"
      subtitle={`${pendingOnly.length} pendente(s)${processingOnly.length > 0 ? ` · ${processingOnly.length} em processamento via Efí` : ""}`}
    >
      {canceling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#DDE6E6] rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4">
            <h3 className="text-[15px] font-bold text-[#1F2D2E]">Cancelar saque</h3>
            <p className="text-[13px] text-zinc-400">O valor integral será devolvido ao saldo da agência. Esta ação não pode ser desfeita.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento…"
              rows={3}
              className="w-full border border-[#DDE6E6] rounded-xl px-3 py-2.5 text-[13px] text-[#1F2D2E] bg-white placeholder:text-[#647B7B] focus:outline-none focus:border-[#1ABC9C] resize-none"
            />
            {error && <p className="text-[12px] text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={cancelLoading || !cancelReason.trim()}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-[13px] font-bold py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {cancelLoading ? "Cancelando…" : "Confirmar cancelamento"}
              </button>
              <button
                onClick={() => { setCanceling(null); setCancelReason(""); setError(null); }}
                className="px-4 border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-[#647B7B] text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {approving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#DDE6E6] rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4">
            <h3 className="text-[15px] font-bold text-[#1F2D2E]">Marcar saque como pago</h3>
            <p className="text-[13px] text-zinc-400">Confirme que o PIX foi enviado manualmente. Esta ação não pode ser desfeita.</p>
            <textarea
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="Observação opcional (ex: PIX enviado, comprovante nº…)"
              rows={3}
              className="w-full border border-[#DDE6E6] rounded-xl px-3 py-2.5 text-[13px] text-[#1F2D2E] bg-white placeholder:text-[#647B7B] focus:outline-none focus:border-[#1ABC9C] resize-none"
            />
            {error && <p className="text-[12px] text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={approveLoading}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white text-[13px] font-bold py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed"
              >
                {approveLoading ? "Processando…" : "Confirmar pagamento"}
              </button>
              <button
                onClick={() => { setApproving(null); setApproveNote(""); setError(null); }}
                className="px-4 border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-[#647B7B] text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-amber-900/50 bg-amber-950/40 px-4 py-3 text-[13px] text-amber-400">
        Use <strong>Enviar PIX</strong> para criar a transferência automaticamente via Efí, ou envie manualmente e use <strong>Marcar como pago</strong>.
      </div>

      {error && !canceling && !approving && (
        <div className="rounded-2xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-[13px] text-red-400">{error}</div>
      )}

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-[#DDE6E6] bg-white px-4 py-5 text-[13px] text-[#647B7B]">
          Nenhum saque pendente.
        </div>
      ) : (
        <TableCard>
          <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
            <tr>
              <Th>Agência</Th>
              <Th right>Total debitado</Th>
              <Th right>Taxa</Th>
              <Th right>Líquido a enviar</Th>
              <Th>Chave PIX</Th>
              <Th>Titular</Th>
              <Th>Solicitado em</Th>
              <Th right>Ações</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFF5F5] [&>tr]:transition-colors [&>tr:hover]:bg-[#F8FAFC]">
            {visiblePending.map((w) => (
              <tr key={w.id}>
                <Td>{w.agencyName}</Td>
                <Td right><strong className="text-[#1F2D2E]">{brl(w.amount)}</strong></Td>
                <Td right><span className="text-red-400">{brl(w.feeAmount)}</span></Td>
                <Td right><strong className="text-emerald-400">{brl(w.netAmount)}</strong></Td>
                <Td>
                  {w.pixKeyValue ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase bg-[#E6F0F0] text-[#647B7B] px-1.5 py-0.5 rounded">
                        {PIX_TYPE_LABELS_ADMIN[w.pixKeyType ?? ""] ?? w.pixKeyType}
                      </span>
                      <span className="font-mono text-xs text-[#647B7B]">{w.pixKeyValue}</span>
                      <button onClick={() => copyPix(w.pixKeyValue!, w.id)}
                        className="text-zinc-600 hover:text-[#647B7B] transition-colors cursor-pointer"
                        title="Copiar chave PIX">
                        {copied === w.id
                          ? <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        }
                      </button>
                    </div>
                  ) : <span className="text-zinc-600 text-xs">Não configurado</span>}
                </Td>
                <Td>{w.pixHolderName ?? "-"}</Td>
                <Td>{fmt(w.createdAt)}</Td>
                <Td right>
                  <div className="flex items-center justify-end gap-2">
                    {w.status === "pending" && (
                      <button
                        onClick={() => handleSendPix(w.id)}
                        disabled={sendingPix === w.id || approving === w.id || canceling === w.id}
                        className="rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:from-cyan-500 hover:to-teal-500 hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {sendingPix === w.id ? "Enviando…" : "Enviar PIX"}
                      </button>
                    )}
                    {w.status === "processing" && (
                      <span className="rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-400 ring-1 ring-cyan-500/20">
                        PIX em andamento
                      </span>
                    )}
                    {(w.status === "pending" || w.status === "processing") && (
                      <button onClick={() => { setApproving(w.id); setApproveNote(""); setError(null); }} disabled={canceling === w.id || sendingPix === w.id}
                        className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:from-emerald-500 hover:to-teal-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
                        Marcar como pago
                      </button>
                    )}
                    <button onClick={() => { setCanceling(w.id); setCancelReason(""); setError(null); }} disabled={approving === w.id || sendingPix === w.id}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-all hover:border-red-800 hover:bg-red-950/40 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed">
                      Cancelar
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      <ShowMoreButton total={pending.length} expanded={expandedPending} onToggle={() => setExpandedPending((c) => !c)} />

      {history.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mt-2">Histórico</p>
          <TableCard>
            <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
              <tr>
                <Th>Agência</Th>
                <Th right>Total</Th>
                <Th right>Taxa</Th>
                <Th right>Líquido</Th>
                <Th>Solicitado em</Th>
                <Th>Processado em</Th>
                <Th>Status</Th>
                <Th>Motivo</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF5F5] [&>tr]:transition-colors [&>tr:hover]:bg-[#F8FAFC]">
              {visibleHistory.map((w) => (
                <tr key={w.id}>
                  <Td>{w.agencyName}</Td>
                  <Td right>{brl(w.amount)}</Td>
                  <Td right>{w.feeAmount ? brl(w.feeAmount) : "-"}</Td>
                  <Td right>{w.netAmount ? brl(w.netAmount) : "-"}</Td>
                  <Td>{fmt(w.createdAt)}</Td>
                  <Td>{fmt(w.processedAt)}</Td>
                  <Td>
                    {w.status === "paid"       && <Badge value="Pago"           tone="bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30" />}
                    {w.status === "processing" && <Badge value="Em andamento"   tone="bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30" />}
                    {w.status === "failed"     && <Badge value="Falhou"         tone="bg-red-500/15 text-red-400 ring-1 ring-red-500/30" />}
                    {w.status === "rejected"   && <Badge value="Cancelado"      tone="bg-red-500/15 text-red-400 ring-1 ring-red-500/20" />}
                    {!["paid","processing","failed","rejected"].includes(w.status) && (
                      <Badge value={w.status} tone="bg-[#E6F0F0] text-[#647B7B] ring-1 ring-[#DDE6E6]" />
                    )}
                  </Td>
                  <Td><span className="text-zinc-500 text-xs">{w.adminNote ?? "-"}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <ShowMoreButton total={history.length} expanded={expandedHistory} onToggle={() => setExpandedHistory((c) => !c)} />
        </>
      )}
    </Section>
  );
}

function BookingsSection({
  bookings,
  summary,
}: {
  bookings: FinancesBooking[];
  summary: FinancesSummary;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleBookings = expanded ? bookings : bookings.slice(0, 5);

  return (
    <Section title="Reservas" subtitle={`${bookings.length} reservas | comissao dinamica por plano da agencia`}>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Bruto confirmado" value={brl(summary.confirmedGrossValue)} />
        <StatCard label="Comissao da plataforma" value={brl(summary.platformCommission)} sub="Free 20% | Pro 10% | Premium 10%" />
        <StatCard label="Indicacao" value={brl(summary.referralPayouts)} sub={`${REFERRAL_RATE * 100}% quando houver indicacao ativa`} />
        <StatCard label="Pendente" value={brl(summary.pendingValue)} />
      </div>

      <TableCard>
        <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
          <tr>
            <Th>Vaga</Th>
            <Th>Talento</Th>
            <Th>Plano</Th>
            <Th>Status</Th>
            <Th right>Valor</Th>
            <Th right>Comissao</Th>
            <Th right>Indicacao</Th>
            <Th right>Liquido plataforma</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFF5F5] [&>tr]:transition-colors [&>tr:hover]:bg-[#F8FAFC]">
          {visibleBookings.map((booking) => (
            <tr key={booking.id}>
              <Td>
                <div>
                  <p className="font-medium text-[#1F2D2E]">{booking.jobTitle}</p>
                  <p className="text-xs text-zinc-500">{fmt(booking.created_at)}</p>
                </div>
              </Td>
              <Td>{booking.talentName}</Td>
              <Td><Badge value={planLabel(booking.agencyPlan)} tone={PLAN_BADGES[booking.agencyPlan] ?? PLAN_BADGES.free} /></Td>
              <Td><Badge value={booking.status} tone={STATUS_BADGES[booking.status] ?? STATUS_BADGES.cancelled} /></Td>
              <Td right>{brl(booking.price)}</Td>
              <Td right>{booking.commissionAmount ? brl(booking.commissionAmount) : "-"}</Td>
              <Td right>{booking.referralAmount ? brl(booking.referralAmount) : "-"}</Td>
              <Td right>{booking.netPlatformAmount ? brl(booking.netPlatformAmount) : "-"}</Td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <ShowMoreButton total={bookings.length} expanded={expanded} onToggle={() => setExpanded((current) => !current)} />
    </Section>
  );
}

export default function AdminFinances({
  summary,
  bookings,
  contracts = [],
  planPayments = [],
  subscriptions = [],
  withdrawals = [],
}: {
  summary: FinancesSummary;
  bookings: FinancesBooking[];
  contracts?: FinancesContract[];
  planPayments?: FinancesPlanPayment[];
  subscriptions?: FinancesSubscription[];
  withdrawals?: FinancesWithdrawal[];
}) {
  const [platformBalance, setPlatformBalance] = useState<PlatformBalanceState>({ status: "loading" });

  useEffect(() => {
    fetch("/api/admin/platform-balance")
      .then((response) => response.json())
      .then((payload) => {
        if (typeof payload.available_balance === "number") {
          setPlatformBalance({ status: "ok", balance: payload.available_balance });
          return;
        }
        setPlatformBalance({ status: "error" });
      })
      .catch(() => setPlatformBalance({ status: "error" }));
  }, []);

  const safe = platformBalance.status === "ok" && platformBalance.balance >= summary.minimumRequired;

  return (
    <div className="bg-[#041C1E] -mx-6 -my-10 lg:-mx-10 px-6 py-10 lg:px-10 min-h-full">
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Admin da plataforma</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Financeiro</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {summary.confirmedBookings} reservas confirmadas | {contracts.length} contratos confirmados ou pagos
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-2xl border border-[#DDE6E6] bg-white px-4 py-3 text-sm text-[#647B7B]">
          <span>
            Comissao por plano:{" "}
            <strong className="text-[#647B7B]">
              Free {summary.planBreakdown.free.commissionLabel} | Pro {summary.planBreakdown.pro.commissionLabel} | Premium {summary.planBreakdown.premium.commissionLabel}
            </strong>
          </span>
          <span>
            Indicacao: <strong className="text-[#647B7B]">{REFERRAL_RATE * 100}%</strong>
          </span>
          <span>
            Plano Pro: <strong className="text-[#647B7B]">{summary.planBreakdown.pro.priceLabel}</strong>
          </span>
          <span>
            Plano Premium: <strong className="text-[#647B7B]">{summary.planBreakdown.premium.priceLabel}</strong>
          </span>
        </div>
      </header>

      <GroupBlock
        accent="green"
        title="Resumo financeiro"
        subtitle="Saúde financeira da plataforma — obrigações, lucro, assinaturas e reservas."
      >
        <Section
          title="Obrigacoes financeiras da plataforma"
          subtitle="O minimo necessario considera apenas o que ainda precisa sair da plataforma para agencias e talentos."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Escrow de contratos" value={brl(summary.contractsEscrowValue)} sub="Bruto em custodia" />
            <StatCard label="Carteiras das agencias" value={brl(summary.agencyWalletTotal)} sub="Saldo que pertence as agencias" />
            <StatCard label="Passivo com talentos" value={brl(summary.contractsAwaitingValue)} sub="Liquido pago ainda nao sacado" />
          </div>

          <div className="rounded-2xl border border-[#DDE6E6] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Valor minimo necessario para honrar a plataforma
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-[#1F2D2E]">{brl(summary.minimumRequired)}</p>
              </div>
              <div className="text-sm text-zinc-500">
                Escrow bruto ({brl(summary.contractsEscrowValue)}) + passivo talentos ({brl(summary.contractsAwaitingValue)}) + carteiras agencias ({brl(summary.agencyWalletTotal)})
              </div>
            </div>
          </div>

          {platformBalance.status === "loading" ? (
            <div className="rounded-2xl border border-[#DDE6E6] bg-white p-5 text-sm text-zinc-500">
              Consultando saldo no Mercado Pago...
            </div>
          ) : null}

          {platformBalance.status === "error" ? (
            <div className="rounded-2xl border border-amber-900/50 bg-amber-950/40 p-5 text-sm text-amber-400">
              Nao foi possivel consultar o saldo da conta no Mercado Pago. Verifique manualmente se o saldo cobre pelo menos {brl(summary.minimumRequired)}.
            </div>
          ) : null}

          {platformBalance.status === "ok" ? (
            <div className={`rounded-2xl border p-5 text-sm ${safe ? "border-emerald-900/50 bg-emerald-950/40 text-emerald-400" : "border-red-900/50 bg-red-950/40 text-red-400"}`}>
              <p className="font-medium">{safe ? "Plataforma solvente" : "Plataforma abaixo do minimo necessario"}</p>
              <p className="mt-1 text-zinc-400">
                Saldo disponivel: <strong className="text-white">{brl(platformBalance.balance)}</strong>
                {" | "}Minimo necessario: <strong className="text-white">{brl(summary.minimumRequired)}</strong>
                {" | "}
                {safe ? "Margem" : "Deficit"}: <strong className={safe ? "text-emerald-300" : "text-red-300"}>{brl(Math.abs(platformBalance.balance - summary.minimumRequired))}</strong>
              </p>
            </div>
          ) : null}
        </Section>

        <ProfitSection bookings={bookings} contracts={contracts} planPayments={planPayments} />
        <SubscriptionsSection subscriptions={subscriptions} summary={summary} />
        <BookingsSection bookings={bookings} summary={summary} />
      </GroupBlock>

      <GroupBlock
        accent="amber"
        title="Operações de saque"
        subtitle="Saques pendentes de agências. Processe o PIX manualmente e confirme aqui antes de marcar como pago."
      >
        <WithdrawalsSection withdrawals={withdrawals} />
      </GroupBlock>

      <GroupBlock
        accent="blue"
        title="Histórico e auditoria"
        subtitle="Taxas arrecadadas por saque, contratos ativos e saques de talentos processados."
      >
        <WithdrawalFeesSection withdrawals={withdrawals} />
        <ContractsSection contracts={contracts} summary={summary} />
        <WithdrawalHistory contracts={contracts} />
      </GroupBlock>
    </div>
    </div>
  );
}


