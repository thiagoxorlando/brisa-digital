"use client";

import { useEffect, useState } from "react";
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
  status: string;
  createdAt: string;
  processedAt: string | null;
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
  free: "bg-zinc-100 text-zinc-600",
  pro: "bg-blue-50 text-blue-700",
  premium: "bg-violet-50 text-violet-700",
};

const STATUS_BADGES: Record<string, string> = {
  confirmed: "bg-indigo-50 text-indigo-700",
  paid: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  pending_payment: "bg-amber-50 text-amber-700",
  cancelled: "bg-zinc-100 text-zinc-500",
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-zinc-100 text-zinc-500",
  cancelling: "bg-amber-50 text-amber-700",
};

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
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
        className="rounded-xl border border-zinc-200 px-3.5 py-2 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300"
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
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {sub ? <p className="mt-2 text-sm text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function Badge({ value, tone }: { value: string; tone: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{value}</span>;
}

function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full">{children}</table>
    </div>
  );
}

function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return <td className={`px-4 py-3.5 text-sm text-zinc-600 ${right ? "text-right" : "text-left"}`}>{children}</td>;
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
              "rounded-xl px-3.5 py-2 text-[12px] font-medium transition-colors",
              range === option.key ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
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
  const proCount = subscriptions.filter((subscription) => subscription.plan === "pro").length;
  const premiumCount = subscriptions.filter((subscription) => subscription.plan === "premium").length;

  return (
    <Section title="Planos de agencias" subtitle={`${subscriptions.length} agencias cadastradas`}>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Receita de assinaturas" value={brl(summary.subscriptionRevenue)} />
        <StatCard label="Agencias Pro" value={String(proCount)} sub={`${summary.planBreakdown.pro.priceLabel} cada`} />
        <StatCard label="Agencias Premium" value={String(premiumCount)} sub={`${summary.planBreakdown.premium.priceLabel} cada`} />
        <StatCard label="Agencias pagas" value={String(proCount + premiumCount)} />
      </div>

      <TableCard>
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <Th>Agencia</Th>
            <Th>Plano</Th>
            <Th>Status</Th>
            <Th>Vencimento</Th>
            <Th right>Total pago</Th>
            <Th right>Ultimo pagamento</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {subscriptions.map((subscription) => (
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
        <thead className="border-b border-zinc-200 bg-zinc-50">
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
        <tbody className="divide-y divide-zinc-100">
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
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:bg-zinc-300"
                    >
                      {withdrawing === contract.id ? "..." : "Sacar"}
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-400">{contract.withdrawn_at ? "Concluido" : "-"}</span>
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
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-600">Total pago aos talentos</p>
          <p className="text-lg font-semibold text-zinc-900">{brl(grandTotal)}</p>
        </div>
        <div className="space-y-3">
          {visibleReceipts.map((items) => {
            const total = items.reduce((sum, contract) => sum + contract.netAmount, 0);
            const reference = items[0];
            return (
              <div key={`${reference.talentName}-${reference.withdrawn_at}`} className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-900">{reference.talentName}</p>
                    <p className="text-sm text-zinc-500">{fmt(reference.withdrawn_at)}</p>
                  </div>
                  <p className="text-lg font-semibold text-emerald-700">{brl(total)}</p>
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

function WithdrawalsSection({ withdrawals }: { withdrawals: FinancesWithdrawal[] }) {
  const [rows, setRows] = useState<FinancesWithdrawal[]>(withdrawals);
  const [marking, setMarking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setRows(withdrawals); }, [withdrawals]);

  const pending = rows.filter((w) => w.status === "pending");
  const history = rows.filter((w) => w.status !== "pending");
  const visibleHistory = expanded ? history : history.slice(0, 5);

  async function handleMarkPaid(id: string) {
    setMarking(id);
    setError(null);
    const res = await fetch(`/api/admin/withdrawals/${id}/mark-paid`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({}),
    });
    setMarking(null);
    if (res.ok) {
      setRows((current) =>
        current.map((w) =>
          w.id === id ? { ...w, status: "paid", processedAt: new Date().toISOString() } : w,
        ),
      );
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "Erro ao marcar saque como pago.");
    }
  }

  return (
    <Section
      title="Saques de agências"
      subtitle={`${pending.length} pendente(s) — pagamento manual necessário`}
    >
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
        Confirme apenas após realizar o PIX/transferência fora da plataforma. Esta ação não envia dinheiro automaticamente.
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{error}</div>
      )}

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-5 text-[13px] text-zinc-500 shadow-sm">
          Nenhum saque pendente.
        </div>
      ) : (
        <TableCard>
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <Th>Agência</Th>
              <Th right>Valor</Th>
              <Th>Solicitado em</Th>
              <Th>Status</Th>
              <Th right>Ação</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {pending.map((w) => (
              <tr key={w.id}>
                <Td>{w.agencyName}</Td>
                <Td right><strong>{brl(w.amount)}</strong></Td>
                <Td>{fmt(w.createdAt)}</Td>
                <Td><Badge value="Aguardando pagamento" tone={STATUS_BADGES.pending} /></Td>
                <Td right>
                  <button
                    onClick={() => handleMarkPaid(w.id)}
                    disabled={marking === w.id}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:bg-zinc-300 disabled:cursor-not-allowed"
                  >
                    {marking === w.id ? "..." : "Marcar como pago"}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      {history.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 mt-2">Histórico</p>
          <TableCard>
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <Th>Agência</Th>
                <Th right>Valor</Th>
                <Th>Solicitado em</Th>
                <Th>Pago em</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visibleHistory.map((w) => (
                <tr key={w.id}>
                  <Td>{w.agencyName}</Td>
                  <Td right>{brl(w.amount)}</Td>
                  <Td>{fmt(w.createdAt)}</Td>
                  <Td>{fmt(w.processedAt)}</Td>
                  <Td>
                    <Badge
                      value={w.status === "paid" ? "Pago" : w.status === "rejected" ? "Rejeitado" : w.status}
                      tone={w.status === "paid" ? STATUS_BADGES.paid : w.status === "rejected" ? "bg-red-50 text-red-700" : STATUS_BADGES.pending}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <ShowMoreButton total={history.length} expanded={expanded} onToggle={() => setExpanded((c) => !c)} />
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
        <thead className="border-b border-zinc-200 bg-zinc-50">
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
        <tbody className="divide-y divide-zinc-100">
          {visibleBookings.map((booking) => (
            <tr key={booking.id}>
              <Td>
                <div>
                  <p className="font-medium text-zinc-900">{booking.jobTitle}</p>
                  <p className="text-xs text-zinc-400">{fmt(booking.created_at)}</p>
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
    <div className="mx-auto max-w-7xl space-y-10">
      <header className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Admin da plataforma</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Financeiro</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {summary.confirmedBookings} reservas confirmadas | {contracts.length} contratos confirmados ou pagos
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <span>
            Comissao por plano:{" "}
            <strong className="text-zinc-900">
              Free {summary.planBreakdown.free.commissionLabel} | Pro {summary.planBreakdown.pro.commissionLabel} | Premium {summary.planBreakdown.premium.commissionLabel}
            </strong>
          </span>
          <span>
            Indicacao: <strong className="text-zinc-900">{REFERRAL_RATE * 100}%</strong>
          </span>
          <span>
            Plano Pro: <strong className="text-zinc-900">{summary.planBreakdown.pro.priceLabel}</strong>
          </span>
          <span>
            Plano Premium: <strong className="text-zinc-900">{summary.planBreakdown.premium.priceLabel}</strong>
          </span>
        </div>
      </header>

      <Section
        title="Obrigacoes financeiras da plataforma"
        subtitle="O minimo necessario considera apenas o que ainda precisa sair da plataforma para agencias e talentos."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Escrow de contratos" value={brl(summary.contractsEscrowValue)} sub="Bruto em custodia" />
          <StatCard label="Carteiras das agencias" value={brl(summary.agencyWalletTotal)} sub="Saldo que pertence as agencias" />
          <StatCard label="Passivo com talentos" value={brl(summary.contractsAwaitingValue)} sub="Liquido pago ainda nao sacado" />
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Valor minimo necessario para honrar a plataforma
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{brl(summary.minimumRequired)}</p>
            </div>
            <div className="text-sm text-zinc-500">
              Escrow bruto ({brl(summary.contractsEscrowValue)}) + passivo talentos ({brl(summary.contractsAwaitingValue)}) + carteiras agencias ({brl(summary.agencyWalletTotal)})
            </div>
          </div>
        </div>

        {platformBalance.status === "loading" ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm">
            Consultando saldo no Mercado Pago...
          </div>
        ) : null}

        {platformBalance.status === "error" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            Nao foi possivel consultar o saldo da conta no Mercado Pago. Verifique manualmente se o saldo cobre pelo menos {brl(summary.minimumRequired)}.
          </div>
        ) : null}

        {platformBalance.status === "ok" ? (
          <div className={`rounded-2xl border p-5 text-sm ${safe ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            <p className="font-medium">{safe ? "Plataforma solvente" : "Plataforma abaixo do minimo necessario"}</p>
            <p className="mt-1">
              Saldo disponivel: <strong>{brl(platformBalance.balance)}</strong>
              {" | "}Minimo necessario: <strong>{brl(summary.minimumRequired)}</strong>
              {" | "}
              {safe ? "Margem" : "Deficit"}: <strong>{brl(Math.abs(platformBalance.balance - summary.minimumRequired))}</strong>
            </p>
          </div>
        ) : null}
      </Section>

      <ProfitSection bookings={bookings} contracts={contracts} planPayments={planPayments} />
      <WithdrawalsSection withdrawals={withdrawals} />
      <SubscriptionsSection subscriptions={subscriptions} summary={summary} />
      <ContractsSection contracts={contracts} summary={summary} />
      <WithdrawalHistory contracts={contracts} />
      <BookingsSection bookings={bookings} summary={summary} />
    </div>
  );
}
