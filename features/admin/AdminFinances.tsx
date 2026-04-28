"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { REFERRAL_RATE } from "@/lib/plans";

// ── Types ─────────────────────────────────────────────────────────────────────

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

export type FinancesWallet = {
  userId: string;
  name: string;
  role: "agency" | "talent";
  balance: number;
  plan?: "free" | "pro" | "premium";
  hasPix?: boolean;
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

// ── Constants ─────────────────────────────────────────────────────────────────

type Tab = "saques" | "carteiras" | "visao-geral" | "contratos" | "reservas" | "planos";
type ProfitRange = "today" | "month" | "total";

const PLAN_BADGES: Record<string, string> = {
  free:    "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30",
  pro:     "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30",
  premium: "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30",
};

const PLAN_BADGES_LIGHT: Record<string, string> = {
  free:    "bg-[#E6F0F0] text-[#647B7B] ring-1 ring-[#DDE6E6]",
  pro:     "bg-blue-50 text-blue-600 ring-1 ring-blue-200",
  premium: "bg-violet-50 text-violet-600 ring-1 ring-violet-200",
};

const STATUS_BADGES: Record<string, string> = {
  confirmed:       "bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30",
  paid:            "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
  pending:         "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
  pending_payment: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
  processing:      "bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30",
  failed:          "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
  cancelled:       "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30",
  active:          "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
  inactive:        "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30",
  cancelling:      "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
};

const PIX_TYPE_LABELS_ADMIN: Record<string, string> = {
  cpf: "CPF", cnpj: "CNPJ", email: "Email", phone: "Tel", random: "EVP",
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

function planLabel(plan: string) {
  return plan === "pro" ? "Pro" : plan === "premium" ? "Premium" : "Free";
}

function isInRange(value: string | null, range: ProfitRange) {
  if (!value) return false;
  if (range === "total") return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (range === "today") return date >= todayStart && date < tomorrowStart;
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

// ── UI Atoms ──────────────────────────────────────────────────────────────────

function Badge({ value, tone }: { value: string; tone: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{value}</span>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="relative rounded-2xl border border-[#DDE6E6] bg-white p-5 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[#1F2D2E]">{value}</p>
      {sub ? <p className="mt-1.5 text-xs text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function KpiCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string;
  accent: "green" | "amber" | "blue" | "red" | "neutral";
}) {
  const styles = {
    green:   "border-emerald-800/50 bg-emerald-950/40 text-emerald-300",
    amber:   "border-amber-800/50 bg-amber-950/40 text-amber-300",
    blue:    "border-blue-800/50 bg-blue-950/40 text-blue-300",
    red:     "border-red-800/50 bg-red-950/40 text-red-300",
    neutral: "border-zinc-700/50 bg-zinc-800/40 text-zinc-300",
  }[accent];
  return (
    <div className={`rounded-2xl border ${styles} px-5 py-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#DDE6E6] bg-white">
      <table className="w-full min-w-full">{children}</table>
    </div>
  );
}

function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return <td className={`px-4 py-3.5 text-sm text-[#647B7B] ${right ? "text-right" : "text-left"}`}>{children}</td>;
}

function ShowMoreButton({
  total, threshold = 5, expanded, onToggle,
}: {
  total: number; threshold?: number; expanded: boolean; onToggle: () => void;
}) {
  if (total <= threshold) return null;
  return (
    <div className="flex justify-center pt-1">
      <button
        onClick={onToggle}
        className="rounded-xl border border-zinc-700 px-4 py-2 text-[12px] font-medium text-zinc-400 transition-all hover:border-zinc-500 hover:text-zinc-300"
      >
        {expanded ? "Ver menos" : `Ver mais (${total - threshold} restantes)`}
      </button>
    </div>
  );
}

function Section({ title, subtitle, children, action }: {
  title: string; subtitle?: string; children: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="space-y-5 py-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-white">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-zinc-800/60" />;
}

// ── Section: Profit ───────────────────────────────────────────────────────────

function ProfitSection({
  bookings, contracts, planPayments,
}: {
  bookings: FinancesBooking[];
  contracts: FinancesContract[];
  planPayments: FinancesPlanPayment[];
}) {
  const [range, setRange] = useState<ProfitRange>("month");

  const fb = bookings.filter((b) => isInRange(b.created_at, range));
  const fc = contracts.filter((c) => isInRange(c.paid_at ?? c.created_at, range));
  const fp = planPayments.filter((p) => isInRange(p.createdAt, range));

  const bookingCommission = fb.reduce((s, b) => s + b.commissionAmount, 0);
  const contractCommission = fc.reduce((s, c) => s + c.commissionAmount, 0);
  const totalCommission = bookingCommission + contractCommission;
  const planRevenue = fp.reduce((s, p) => s + p.amount, 0);
  const totalProfit = totalCommission + planRevenue;

  const RANGES: { key: ProfitRange; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "month", label: "Este mês" },
    { key: "total", label: "Total" },
  ];

  return (
    <Section
      title="Lucro da plataforma"
      subtitle="Comissão e receita de planos filtráveis por período."
      action={
        <div className="flex gap-1">
          {RANGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={[
                "rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-all",
                range === key
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
                  : "border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Comissão de reservas/contratos"
          value={brl(totalCommission)}
          sub={`Reservas: ${brl(bookingCommission)} · Contratos: ${brl(contractCommission)}`}
        />
        <StatCard
          label="Receita de planos"
          value={brl(planRevenue)}
          sub={`${fp.length} pagamento(s) no período`}
        />
        <StatCard
          label="Total do período"
          value={brl(totalProfit)}
          sub={`${fb.length} reservas + ${fc.length} contratos`}
        />
      </div>
    </Section>
  );
}

// ── Section: Subscriptions ────────────────────────────────────────────────────

function SubscriptionsSection({
  subscriptions, summary,
}: {
  subscriptions: FinancesSubscription[];
  summary: FinancesSummary;
}) {
  const [expanded, setExpanded] = useState(false);
  const proCount = subscriptions.filter((s) => s.plan === "pro").length;
  const premiumCount = subscriptions.filter((s) => s.plan === "premium").length;
  const visible = expanded ? subscriptions : subscriptions.slice(0, 5);

  return (
    <Section
      title="Planos de agências"
      subtitle={`${subscriptions.length} agências cadastradas · ${proCount + premiumCount} pagantes`}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Receita total de assinaturas" value={brl(summary.subscriptionRevenue)} />
        <StatCard label="Agências Pro" value={String(proCount)} sub={`${summary.planBreakdown.pro.priceLabel}`} />
        <StatCard label="Agências Premium" value={String(premiumCount)} sub={`${summary.planBreakdown.premium.priceLabel}`} />
        <StatCard label="Agências pagantes" value={String(proCount + premiumCount)} />
      </div>
      <TableCard>
        <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
          <tr>
            <Th>Agência</Th>
            <Th>Plano</Th>
            <Th>Status</Th>
            <Th>Vencimento</Th>
            <Th right>Total pago</Th>
            <Th right>Último pag.</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFF5F5] [&>tr:hover]:bg-[#F8FAFC]">
          {visible.map((s) => (
            <tr key={s.userId}>
              <Td><span className="font-medium text-[#1F2D2E]">{s.agencyName}</span></Td>
              <Td><Badge value={planLabel(s.plan)} tone={PLAN_BADGES_LIGHT[s.plan] ?? PLAN_BADGES_LIGHT.free} /></Td>
              <Td><Badge value={s.planStatus} tone={STATUS_BADGES[s.planStatus] ?? STATUS_BADGES.inactive} /></Td>
              <Td>{fmt(s.planExpiresAt)}</Td>
              <Td right>{s.totalPaid ? brl(s.totalPaid) : "—"}</Td>
              <Td right>{fmt(s.lastPayment)}</Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      <ShowMoreButton total={subscriptions.length} expanded={expanded} onToggle={() => setExpanded((c) => !c)} />
    </Section>
  );
}

// ── Section: Withdrawal fees ──────────────────────────────────────────────────

function WithdrawalFeesSection({ withdrawals }: { withdrawals: FinancesWithdrawal[] }) {
  const [expanded, setExpanded] = useState(false);
  const paid    = withdrawals.filter((w) => w.status === "paid");
  const pending = withdrawals.filter((w) => w.status === "pending");

  const todayStart    = new Date(); todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const monthStart    = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const totalEarned  = paid.reduce((s, w) => s + w.feeAmount, 0);
  const totalPending = pending.reduce((s, w) => s + w.feeAmount, 0);
  const feesToday    = paid.filter((w) => { const d = new Date(w.processedAt ?? ""); return d >= todayStart && d < tomorrowStart; }).reduce((s, w) => s + w.feeAmount, 0);
  const feesMonth    = paid.filter((w) => new Date(w.processedAt ?? "") >= monthStart).reduce((s, w) => s + w.feeAmount, 0);

  const sorted  = [...withdrawals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visible = expanded ? sorted : sorted.slice(0, 5);

  return (
    <Section title="Taxas de saque" subtitle="Receita da plataforma por processamento de saques (3%)">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total arrecadado"  value={brl(totalEarned)}  sub="Saques concluídos" />
        <StatCard label="Pendente"          value={brl(totalPending)} sub="Aguardando processamento" />
        <StatCard label="Hoje"              value={brl(feesToday)}    sub="Processado hoje" />
        <StatCard label="Este mês"          value={brl(feesMonth)}    sub="Mês atual" />
      </div>
      {sorted.length > 0 && (
        <>
          <TableCard>
            <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
              <tr>
                <Th>Agência</Th>
                <Th right>Sacado</Th>
                <Th right>Taxa (3%)</Th>
                <Th right>Líquido enviado</Th>
                <Th>Solicitado em</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF5F5] [&>tr:hover]:bg-[#F8FAFC]">
              {visible.map((w) => (
                <tr key={w.id}>
                  <Td><span className="font-medium text-[#1F2D2E]">{w.agencyName}</span></Td>
                  <Td right>{brl(w.amount)}</Td>
                  <Td right>
                    <span className={
                      w.status === "paid" ? "font-semibold text-emerald-600" :
                      w.status === "rejected" ? "text-zinc-400 line-through" : "text-amber-600"
                    }>
                      {brl(w.feeAmount)}
                    </span>
                  </Td>
                  <Td right>{w.status === "rejected" ? <span className="text-zinc-400">—</span> : brl(w.netAmount)}</Td>
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
          <ShowMoreButton total={sorted.length} expanded={expanded} onToggle={() => setExpanded((c) => !c)} />
        </>
      )}
    </Section>
  );
}

// ── Section: Contracts ────────────────────────────────────────────────────────

function ContractsSection({
  contracts, summary,
}: {
  contracts: FinancesContract[];
  summary: FinancesSummary;
}) {
  const [rows, setRows] = useState<FinancesContract[]>(contracts);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setRows(contracts); }, [contracts]);

  async function handleWithdraw(id: string) {
    setWithdrawing(id);
    const res = await fetch(`/api/contracts/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    setWithdrawing(null);
    if (res.ok) {
      const payload = (await res.json()) as { withdrawn_at?: string | null };
      setRows((cur) => cur.map((c) => c.id === id ? { ...c, withdrawn_at: payload.withdrawn_at ?? new Date().toISOString() } : c));
    }
  }

  const visible = expanded ? rows : rows.slice(0, 5);

  return (
    <Section
      title="Contratos confirmados e pagos"
      subtitle={`${rows.length} contratos · ${brl(summary.contractsCommission)} retido pela plataforma`}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Em escrow" value={brl(summary.contractsEscrowValue)} sub="Bruto retido em confirmados" />
        <StatCard label="Aguardando saque" value={brl(summary.contractsAwaitingValue)} sub="Líquido a sacar por talentos" />
        <StatCard label="Já sacado" value={brl(summary.contractsWithdrawnValue)} sub="Líquido enviado aos talentos" />
        <StatCard label="Comissão da plataforma" value={brl(summary.contractsCommission)} sub="Retenção por plano" />
      </div>
      <TableCard>
        <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
          <tr>
            <Th>Vaga</Th>
            <Th>Talento</Th>
            <Th>Agência</Th>
            <Th>Plano</Th>
            <Th>Status</Th>
            <Th right>Bruto</Th>
            <Th right>Comissão</Th>
            <Th right>Líquido</Th>
            <Th right>Ações</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFF5F5] [&>tr:hover]:bg-[#F8FAFC]">
          {visible.map((c) => {
            const statusLabel = c.withdrawn_at ? "sacado" : c.status === "paid" ? "aguard. saque" : "escrow";
            const statusTone  = c.withdrawn_at ? STATUS_BADGES.cancelled : c.status === "paid" ? STATUS_BADGES.pending : STATUS_BADGES.confirmed;
            return (
              <tr key={c.id}>
                <Td>
                  <div>
                    <p className="font-medium text-[#1F2D2E]">{c.jobTitle}</p>
                    <p className="text-xs text-zinc-500">{fmt(c.created_at)}</p>
                  </div>
                </Td>
                <Td>{c.talentName}</Td>
                <Td>{c.agencyName}</Td>
                <Td><Badge value={planLabel(c.agencyPlan)} tone={PLAN_BADGES_LIGHT[c.agencyPlan] ?? PLAN_BADGES_LIGHT.free} /></Td>
                <Td><Badge value={statusLabel} tone={statusTone} /></Td>
                <Td right>{brl(c.amount)}</Td>
                <Td right>{brl(c.commissionAmount)}</Td>
                <Td right><strong className="text-[#1F2D2E]">{brl(c.netAmount)}</strong></Td>
                <Td right>
                  {c.status === "paid" && !c.withdrawn_at ? (
                    <button
                      onClick={() => handleWithdraw(c.id)}
                      disabled={withdrawing === c.id}
                      className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {withdrawing === c.id ? "…" : "Sacar"}
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-500">{c.withdrawn_at ? "Concluído" : "—"}</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
      <ShowMoreButton total={rows.length} expanded={expanded} onToggle={() => setExpanded((c) => !c)} />
    </Section>
  );
}

function WithdrawalHistory({ contracts }: { contracts: FinancesContract[] }) {
  const [expanded, setExpanded] = useState(false);
  const withdrawn = contracts
    .filter((c) => !!c.withdrawn_at)
    .sort((a, b) => new Date(b.withdrawn_at ?? "").getTime() - new Date(a.withdrawn_at ?? "").getTime());

  if (withdrawn.length === 0) return null;

  const groups = new Map<string, FinancesContract[]>();
  for (const c of withdrawn) {
    const day = (c.withdrawn_at ?? "").slice(0, 10);
    const key = `${c.talentName}::${day}`;
    const cur = groups.get(key) ?? [];
    cur.push(c);
    groups.set(key, cur);
  }

  const receipts = [...groups.values()];
  const visible  = expanded ? receipts : receipts.slice(0, 5);
  const grand    = withdrawn.reduce((s, c) => s + c.netAmount, 0);

  return (
    <Section title="Histórico de saques para talentos" subtitle={`${receipts.length} saques concluídos`}>
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Total pago a talentos" value={brl(grand)} sub={`${receipts.length} transações`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((items) => {
          const total = items.reduce((s, c) => s + c.netAmount, 0);
          const ref   = items[0];
          return (
            <div key={`${ref.talentName}-${ref.withdrawn_at}`} className="rounded-2xl border border-[#DDE6E6] bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#1F2D2E] text-sm">{ref.talentName}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{fmt(ref.withdrawn_at)}</p>
                  <p className="text-xs text-zinc-500">{items.length} contrato(s)</p>
                </div>
                <p className="text-lg font-bold text-emerald-600 shrink-0">{brl(total)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <ShowMoreButton total={receipts.length} expanded={expanded} onToggle={() => setExpanded((c) => !c)} />
    </Section>
  );
}

// ── Section: Bookings ─────────────────────────────────────────────────────────

function BookingsSection({ bookings, summary }: { bookings: FinancesBooking[]; summary: FinancesSummary }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? bookings : bookings.slice(0, 5);

  return (
    <Section
      title="Reservas"
      subtitle={`${bookings.length} reservas · comissão dinâmica por plano`}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Bruto confirmado"    value={brl(summary.confirmedGrossValue)} />
        <StatCard label="Comissão plataforma" value={brl(summary.platformCommission)} sub="Free 20% · Pro/Premium 10%" />
        <StatCard label="Indicações"          value={brl(summary.referralPayouts)} sub={`${REFERRAL_RATE * 100}% por indicação ativa`} />
        <StatCard label="Pendente"            value={brl(summary.pendingValue)} />
      </div>
      <TableCard>
        <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
          <tr>
            <Th>Vaga</Th>
            <Th>Talento</Th>
            <Th>Plano</Th>
            <Th>Status</Th>
            <Th right>Valor</Th>
            <Th right>Comissão</Th>
            <Th right>Indicação</Th>
            <Th right>Líq. plataforma</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EFF5F5] [&>tr:hover]:bg-[#F8FAFC]">
          {visible.map((b) => (
            <tr key={b.id}>
              <Td>
                <div>
                  <p className="font-medium text-[#1F2D2E]">{b.jobTitle}</p>
                  <p className="text-xs text-zinc-500">{fmt(b.created_at)}</p>
                </div>
              </Td>
              <Td>{b.talentName}</Td>
              <Td><Badge value={planLabel(b.agencyPlan)} tone={PLAN_BADGES_LIGHT[b.agencyPlan] ?? PLAN_BADGES_LIGHT.free} /></Td>
              <Td><Badge value={b.status} tone={STATUS_BADGES[b.status] ?? STATUS_BADGES.cancelled} /></Td>
              <Td right>{brl(b.price)}</Td>
              <Td right>{b.commissionAmount ? brl(b.commissionAmount) : "—"}</Td>
              <Td right>{b.referralAmount ? brl(b.referralAmount) : "—"}</Td>
              <Td right>{b.netPlatformAmount ? brl(b.netPlatformAmount) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      <ShowMoreButton total={bookings.length} expanded={expanded} onToggle={() => setExpanded((c) => !c)} />
    </Section>
  );
}

// ── Section: Wallets ──────────────────────────────────────────────────────────

function WalletsSection({
  agencyWallets,
  talentWallets,
  summary,
}: {
  agencyWallets: FinancesWallet[];
  talentWallets: FinancesWallet[];
  summary: FinancesSummary;
}) {
  const [agencyExpanded, setAgencyExpanded] = useState(false);
  const [talentExpanded, setTalentExpanded] = useState(false);

  const totalAgency  = agencyWallets.reduce((s, w) => s + w.balance, 0);
  const totalTalent  = talentWallets.reduce((s, w) => s + w.balance, 0);
  const totalAll     = totalAgency + totalTalent;
  const agencyPct    = totalAll > 0 ? Math.round(totalAgency / totalAll * 100) : 0;
  const talentPct    = totalAll > 0 ? Math.round(totalTalent / totalAll * 100) : 0;

  const visAgency = agencyExpanded ? agencyWallets : agencyWallets.slice(0, 10);
  const visTalent = talentExpanded ? talentWallets : talentWallets.slice(0, 10);

  return (
    <>
      {/* Overview */}
      <Section title="Carteiras na plataforma" subtitle="Saldos pertencentes a agências e talentos — obrigações da plataforma.">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Total em carteiras" value={brl(totalAll)} sub={`${agencyWallets.length + talentWallets.length} usuários com saldo`} />
          <StatCard label="Carteiras de agências" value={brl(totalAgency)} sub={`${agencyWallets.length} agências · ${agencyPct}% do total`} />
          <StatCard label="Carteiras de talentos" value={brl(totalTalent)} sub={`${talentWallets.length} talentos · ${talentPct}% do total`} />
          <StatCard label="Do mínimo obrigatório" value={brl(summary.agencyWalletTotal)} sub="Parcela das agências no mín. obrigatório" />
        </div>

        {/* Balance bar */}
        {totalAll > 0 && (
          <div className="rounded-2xl border border-[#DDE6E6] bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-3">Distribuição de saldos</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-[#F0F9F8]">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                style={{ width: `${agencyPct}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
                style={{ width: `${talentPct}%` }}
              />
            </div>
            <div className="mt-2.5 flex gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Agências {agencyPct}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                Talentos {talentPct}%
              </span>
            </div>
          </div>
        )}
      </Section>

      <Divider />

      {/* Agency wallets */}
      <Section title="Carteiras de agências" subtitle={`${agencyWallets.length} agência(s) com saldo positivo · ordenado por saldo`}>
        {agencyWallets.length === 0 ? (
          <div className="rounded-2xl border border-[#DDE6E6] bg-white px-4 py-5 text-sm text-[#647B7B]">
            Nenhuma agência com saldo.
          </div>
        ) : (
          <>
            <TableCard>
              <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
                <tr>
                  <Th>Agência</Th>
                  <Th>Plano</Th>
                  <Th>PIX</Th>
                  <Th right>Saldo</Th>
                  <Th right>% do total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFF5F5] [&>tr:hover]:bg-[#F8FAFC]">
                {visAgency.map((w) => (
                  <tr key={w.userId}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[11px] font-bold text-emerald-700">
                          {w.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium text-[#1F2D2E]">{w.name}</span>
                      </div>
                    </Td>
                    <Td>
                      <Badge value={planLabel(w.plan ?? "free")} tone={PLAN_BADGES_LIGHT[w.plan ?? "free"]} />
                    </Td>
                    <Td>
                      {w.hasPix
                        ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Configurado</span>
                        : <span className="inline-flex items-center gap-1 text-zinc-400 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />Sem PIX</span>
                      }
                    </Td>
                    <Td right>
                      <strong className={`text-base ${w.balance >= 10 ? "text-emerald-600" : "text-[#1F2D2E]"}`}>
                        {brl(w.balance)}
                      </strong>
                    </Td>
                    <Td right>
                      <span className="text-xs text-zinc-500">
                        {totalAgency > 0 ? `${((w.balance / totalAgency) * 100).toFixed(1)}%` : "—"}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
            <ShowMoreButton total={agencyWallets.length} threshold={10} expanded={agencyExpanded} onToggle={() => setAgencyExpanded((c) => !c)} />
          </>
        )}
      </Section>

      <Divider />

      {/* Talent wallets */}
      <Section title="Carteiras de talentos" subtitle={`${talentWallets.length} talento(s) com saldo positivo · ordenado por saldo`}>
        {talentWallets.length === 0 ? (
          <div className="rounded-2xl border border-[#DDE6E6] bg-white px-4 py-5 text-sm text-[#647B7B]">
            Nenhum talento com saldo.
          </div>
        ) : (
          <>
            <TableCard>
              <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
                <tr>
                  <Th>Talento</Th>
                  <Th right>Saldo</Th>
                  <Th right>% do total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFF5F5] [&>tr:hover]:bg-[#F8FAFC]">
                {visTalent.map((w) => (
                  <tr key={w.userId}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[11px] font-bold text-blue-700">
                          {w.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium text-[#1F2D2E]">{w.name}</span>
                      </div>
                    </Td>
                    <Td right>
                      <strong className={`text-base ${w.balance >= 10 ? "text-blue-600" : "text-[#1F2D2E]"}`}>
                        {brl(w.balance)}
                      </strong>
                    </Td>
                    <Td right>
                      <span className="text-xs text-zinc-500">
                        {totalTalent > 0 ? `${((w.balance / totalTalent) * 100).toFixed(1)}%` : "—"}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
            <ShowMoreButton total={talentWallets.length} threshold={10} expanded={talentExpanded} onToggle={() => setTalentExpanded((c) => !c)} />
          </>
        )}
      </Section>
    </>
  );
}

// ── Section: Withdrawals (action-heavy) ───────────────────────────────────────

function WithdrawalsSection({ withdrawals }: { withdrawals: FinancesWithdrawal[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<FinancesWithdrawal[]>(withdrawals);
  const [approving, setApproving]       = useState<string | null>(null);
  const [approveNote, setApproveNote]   = useState("");
  const [approveLoading, setApproveLoading] = useState(false);
  const [canceling, setCanceling]       = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [sendingPix, setSendingPix]     = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [expandedPending, setExpandedPending] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [copied, setCopied]             = useState<string | null>(null);

  useEffect(() => { setRows(withdrawals); }, [withdrawals]);

  const pendingOnly   = rows.filter((w) => w.status === "pending");
  const processingOnly = rows.filter((w) => w.status === "processing");
  const pending       = rows.filter((w) => w.status === "pending" || w.status === "processing");
  const visiblePending = expandedPending ? pending : pending.slice(0, 5);
  const history       = rows
    .filter((w) => w.status !== "pending" && w.status !== "processing")
    .sort((a, b) => new Date(b.processedAt ?? b.createdAt).getTime() - new Date(a.processedAt ?? a.createdAt).getTime());
  const visibleHistory = expandedHistory ? history : history.slice(0, 5);

  async function handleSendPix(id: string) {
    setSendingPix(id);
    setError(null);
    const res  = await fetch(`/api/admin/withdrawals/${id}/send-pix`, { method: "POST" });
    const data = await res.json().catch(() => ({})) as { error?: string; status?: string };
    setSendingPix(null);
    if (!res.ok) { setError(data.error ?? "Erro ao enviar PIX."); return; }
    const savedStatus = data.status ?? "processing";
    setRows((cur) => cur.map((w) => w.id === id
      ? {
          ...w,
          status:      savedStatus,
          adminNote:   savedStatus === "paid" ? "PIX confirmado via Efí" : "PIX enviado via Efí, aguardando confirmação",
          processedAt: savedStatus === "paid" ? new Date().toISOString() : w.processedAt,
        }
      : w,
    ));
    router.refresh();
  }

  async function handleApprove() {
    if (!approving) return;
    const id   = approving;
    const note = approveNote.trim();
    setApproveLoading(true);
    setError(null);
    const res  = await fetch(`/api/admin/withdrawals/${id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string; details?: unknown };
    setApproveLoading(false);
    if (!res.ok) {
      setError(typeof data.details === "string" ? data.details : data.error ?? "Erro ao aprovar saque.");
      return;
    }
    setRows((cur) => cur.map((w) => w.id === id ? { ...w, status: "paid", adminNote: note || null, processedAt: new Date().toISOString() } : w));
    setApproving(null);
    setApproveNote("");
  }

  async function handleCancel() {
    if (!canceling || !cancelReason.trim()) return;
    const id     = canceling;
    const reason = cancelReason.trim();
    setCancelLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/withdrawals/${id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    setCancelLoading(false);
    if (res.ok) {
      setRows((cur) => cur.map((w) => w.id === id ? { ...w, status: "rejected", adminNote: reason, processedAt: new Date().toISOString() } : w));
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

  const MODAL_BASE = "fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4";
  const MODAL_CARD = "bg-[#0B0F14] border border-zinc-800 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4";

  return (
    <>
      {/* Cancel modal */}
      {canceling && (
        <div className={MODAL_BASE}>
          <div className={MODAL_CARD}>
            <h3 className="text-[15px] font-bold text-white">Cancelar saque</h3>
            <p className="text-[13px] text-zinc-400">O valor integral será devolvido ao saldo da agência. Ação irreversível.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento…"
              rows={3}
              className="w-full border border-zinc-700 rounded-xl px-3 py-2.5 text-[13px] text-white bg-zinc-900 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            {error && <p className="text-[12px] text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleCancel} disabled={cancelLoading || !cancelReason.trim()}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-[13px] font-bold py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed">
                {cancelLoading ? "Cancelando…" : "Confirmar cancelamento"}
              </button>
              <button onClick={() => { setCanceling(null); setCancelReason(""); setError(null); }}
                className="px-4 border border-zinc-700 hover:border-zinc-600 text-zinc-400 text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer">
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve modal */}
      {approving && (
        <div className={MODAL_BASE}>
          <div className={MODAL_CARD}>
            <h3 className="text-[15px] font-bold text-white">Marcar saque como pago</h3>
            <p className="text-[13px] text-zinc-400">Confirme que o PIX foi enviado manualmente. Ação irreversível.</p>
            <textarea
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="Observação opcional (ex: PIX enviado, comprovante nº…)"
              rows={3}
              className="w-full border border-zinc-700 rounded-xl px-3 py-2.5 text-[13px] text-white bg-zinc-900 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            {error && <p className="text-[12px] text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleApprove} disabled={approveLoading}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white text-[13px] font-bold py-2.5 rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed">
                {approveLoading ? "Processando…" : "Confirmar pagamento"}
              </button>
              <button onClick={() => { setApproving(null); setApproveNote(""); setError(null); }}
                className="px-4 border border-zinc-700 hover:border-zinc-600 text-zinc-400 text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer">
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      <Section
        title="Saques de agências"
        subtitle={`${pendingOnly.length} pendente(s)${processingOnly.length > 0 ? ` · ${processingOnly.length} em processamento via Efí` : ""}`}
      >
        <div className="rounded-2xl border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-[13px] text-amber-400">
          Use <strong>Enviar PIX</strong> para criar a transferência automaticamente via Efí, ou envie manualmente e use <strong>Marcar como pago</strong>.
        </div>

        {error && !canceling && !approving && (
          <div className="rounded-2xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-[13px] text-red-400">{error}</div>
        )}

        {pending.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-5 text-[13px] text-zinc-500 text-center">
            Nenhum saque pendente.
          </div>
        ) : (
          <TableCard>
            <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
              <tr>
                <Th>Agência</Th>
                <Th right>Debitado</Th>
                <Th right>Taxa</Th>
                <Th right>Líquido</Th>
                <Th>Chave PIX</Th>
                <Th>Titular</Th>
                <Th>Solicitado</Th>
                <Th right>Ações</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF5F5] [&>tr:hover]:bg-[#F8FAFC]">
              {visiblePending.map((w) => (
                <tr key={w.id}>
                  <Td><span className="font-medium text-[#1F2D2E]">{w.agencyName}</span></Td>
                  <Td right><strong className="text-[#1F2D2E]">{brl(w.amount)}</strong></Td>
                  <Td right><span className="text-red-500 text-xs">{brl(w.feeAmount)}</span></Td>
                  <Td right><strong className="text-emerald-600">{brl(w.netAmount)}</strong></Td>
                  <Td>
                    {w.pixKeyValue ? (
                      <div className="flex items-center gap-1.5 max-w-[200px]">
                        <span className="text-[10px] font-bold uppercase bg-[#E6F0F0] text-[#647B7B] px-1.5 py-0.5 rounded shrink-0">
                          {PIX_TYPE_LABELS_ADMIN[w.pixKeyType ?? ""] ?? w.pixKeyType}
                        </span>
                        <span className="font-mono text-xs text-[#647B7B] truncate">{w.pixKeyValue}</span>
                        <button onClick={() => copyPix(w.pixKeyValue!, w.id)}
                          className="text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer shrink-0"
                          title="Copiar">
                          {copied === w.id
                            ? <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          }
                        </button>
                      </div>
                    ) : <span className="text-zinc-400 text-xs">Não configurado</span>}
                  </Td>
                  <Td>{w.pixHolderName ?? "—"}</Td>
                  <Td>{fmt(w.createdAt)}</Td>
                  <Td right>
                    <div className="flex items-center justify-end gap-1.5">
                      {w.status === "pending" && (
                        <button
                          onClick={() => handleSendPix(w.id)}
                          disabled={sendingPix === w.id || !!approving || !!canceling}
                          className="rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:from-cyan-500 hover:to-teal-500 hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {sendingPix === w.id ? "Enviando…" : "Enviar PIX"}
                        </button>
                      )}
                      {w.status === "processing" && (
                        <span className="rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-400 ring-1 ring-cyan-500/20">
                          Em andamento
                        </span>
                      )}
                      {(w.status === "pending" || w.status === "processing") && (
                        <button
                          onClick={() => { setApproving(w.id); setApproveNote(""); setError(null); }}
                          disabled={!!canceling || sendingPix === w.id}
                          className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:from-emerald-500 hover:to-teal-500 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Marcar pago
                        </button>
                      )}
                      <button
                        onClick={() => { setCanceling(w.id); setCancelReason(""); setError(null); }}
                        disabled={!!approving || sendingPix === w.id}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-500 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
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
      </Section>

      {history.length > 0 && (
        <>
          <Divider />
          <Section title="Histórico de saques" subtitle={`${history.length} saques processados`}>
            <TableCard>
              <thead className="border-b border-[#DDE6E6] bg-[#F0F9F8]">
                <tr>
                  <Th>Agência</Th>
                  <Th right>Total</Th>
                  <Th right>Taxa</Th>
                  <Th right>Líquido</Th>
                  <Th>Solicitado</Th>
                  <Th>Processado</Th>
                  <Th>Status</Th>
                  <Th>Nota</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFF5F5] [&>tr:hover]:bg-[#F8FAFC]">
                {visibleHistory.map((w) => (
                  <tr key={w.id}>
                    <Td><span className="font-medium text-[#1F2D2E]">{w.agencyName}</span></Td>
                    <Td right>{brl(w.amount)}</Td>
                    <Td right>{w.feeAmount ? brl(w.feeAmount) : "—"}</Td>
                    <Td right>{w.netAmount ? brl(w.netAmount) : "—"}</Td>
                    <Td>{fmt(w.createdAt)}</Td>
                    <Td>{fmt(w.processedAt)}</Td>
                    <Td>
                      {w.status === "paid"       && <Badge value="Pago"         tone="bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30" />}
                      {w.status === "processing" && <Badge value="Em andamento" tone="bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30" />}
                      {w.status === "failed"     && <Badge value="Falhou"       tone="bg-red-500/15 text-red-400 ring-1 ring-red-500/30" />}
                      {w.status === "rejected"   && <Badge value="Cancelado"    tone="bg-red-500/15 text-red-400 ring-1 ring-red-500/20" />}
                      {!["paid", "processing", "failed", "rejected"].includes(w.status) && (
                        <Badge value={w.status} tone="bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30" />
                      )}
                    </Td>
                    <Td><span className="text-zinc-500 text-xs">{w.adminNote ?? "—"}</span></Td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
            <ShowMoreButton total={history.length} expanded={expandedHistory} onToggle={() => setExpandedHistory((c) => !c)} />
          </Section>
        </>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type PlatformBalanceState =
  | { status: "loading" }
  | { status: "ok"; balance: number }
  | { status: "unavailable" }
  | { status: "error" };

export default function AdminFinances({
  summary,
  bookings,
  contracts = [],
  planPayments = [],
  subscriptions = [],
  withdrawals = [],
  agencyWallets = [],
  talentWallets = [],
}: {
  summary: FinancesSummary;
  bookings: FinancesBooking[];
  contracts?: FinancesContract[];
  planPayments?: FinancesPlanPayment[];
  subscriptions?: FinancesSubscription[];
  withdrawals?: FinancesWithdrawal[];
  agencyWallets?: FinancesWallet[];
  talentWallets?: FinancesWallet[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("saques");
  const [platformBalance, setPlatformBalance] = useState<PlatformBalanceState>({ status: "loading" });

  useEffect(() => {
    fetch("/api/admin/platform-balance")
      .then((r) => r.json())
      .then((p) => {
        if (p.unavailable) { setPlatformBalance({ status: "unavailable" }); return; }
        if (typeof p.available_balance === "number") { setPlatformBalance({ status: "ok", balance: p.available_balance }); return; }
        setPlatformBalance({ status: "error" });
      })
      .catch(() => setPlatformBalance({ status: "error" }));
  }, []);

  const safe = platformBalance.status === "ok" && platformBalance.balance >= summary.minimumRequired;
  const pendingCount = withdrawals.filter((w) => w.status === "pending" || w.status === "processing").length;
  const totalWallets = agencyWallets.length + talentWallets.length;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "saques",    label: "Saques",      badge: pendingCount > 0 ? pendingCount : undefined },
    { id: "carteiras", label: "Carteiras",   badge: totalWallets > 0 ? totalWallets : undefined },
    { id: "visao-geral", label: "Visão Geral" },
    { id: "contratos", label: "Contratos" },
    { id: "reservas",  label: "Reservas" },
    { id: "planos",    label: "Planos" },
  ];

  return (
    <div className="bg-[#041C1E] -mx-6 -my-10 lg:-mx-10 min-h-full">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="px-6 pt-8 pb-6 lg:px-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Admin da plataforma</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Financeiro</h1>
              <p className="mt-1 text-sm text-zinc-500">
                {summary.confirmedBookings} reservas confirmadas · {contracts.length} contratos · {subscriptions.length} agências
              </p>
            </div>
            <div className="hidden md:flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
              <span>Free <strong className="text-zinc-500">{summary.planBreakdown.free.commissionLabel}</strong></span>
              <span>Pro <strong className="text-zinc-500">{summary.planBreakdown.pro.commissionLabel}</strong></span>
              <span>Premium <strong className="text-zinc-500">{summary.planBreakdown.premium.commissionLabel}</strong></span>
              <span>Indicação <strong className="text-zinc-500">{REFERRAL_RATE * 100}%</strong></span>
            </div>
          </div>

          {/* KPI bar — always visible */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Obrigações totais"
              value={brl(summary.minimumRequired)}
              sub="Escrow + talentos + carteiras"
              accent="amber"
            />
            <KpiCard
              label="Saques pendentes"
              value={String(pendingCount)}
              sub={pendingCount > 0 ? "requerem ação" : "tudo em dia"}
              accent={pendingCount > 0 ? "red" : "neutral"}
            />
            <KpiCard
              label="Receita de planos"
              value={brl(summary.subscriptionRevenue)}
              sub={`${subscriptions.filter((s) => s.plan !== "free").length} agências pagantes`}
              accent="blue"
            />
            <KpiCard
              label="Comissão de reservas"
              value={brl(summary.platformCommission)}
              sub={`${summary.confirmedBookings} reservas confirmadas`}
              accent="green"
            />
          </div>
        </div>
      </div>

      {/* ── Tab bar — sticky ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-zinc-800/60 bg-[#041C1E]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="flex gap-0.5 overflow-x-auto py-1.5 scrollbar-none">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all",
                  activeTab === tab.id
                    ? "bg-white/10 text-white ring-1 ring-white/10"
                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
                ].join(" ")}
              >
                {tab.label}
                {tab.badge != null && (
                  <span className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums leading-tight ${
                    tab.id === "saques" ? "bg-amber-500 text-black" : "bg-zinc-700 text-zinc-300"
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-6 lg:px-10">

        {/* Saques */}
        <div className={activeTab === "saques" ? "" : "hidden"}>
          <WithdrawalsSection withdrawals={withdrawals} />
        </div>

        {/* Carteiras */}
        <div className={activeTab === "carteiras" ? "" : "hidden"}>
          <WalletsSection
            agencyWallets={agencyWallets}
            talentWallets={talentWallets}
            summary={summary}
          />
        </div>

        {/* Visão Geral */}
        <div className={activeTab === "visao-geral" ? "" : "hidden"}>
          <Section title="Obrigações financeiras" subtitle="Mínimo necessário para honrar todos os compromissos da plataforma.">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label="Escrow de contratos"    value={brl(summary.contractsEscrowValue)}   sub="Bruto em custódia" />
              <StatCard label="Carteiras das agências" value={brl(summary.agencyWalletTotal)}       sub="Saldo pertencente às agências" />
              <StatCard label="Passivo com talentos"   value={brl(summary.contractsAwaitingValue)} sub="Líquido pago, não sacado" />
            </div>

            <div className="rounded-2xl border border-[#DDE6E6] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Mínimo necessário</p>
                  <p className="mt-2 text-4xl font-bold tracking-tight text-[#1F2D2E]">{brl(summary.minimumRequired)}</p>
                  <p className="mt-1.5 text-sm text-zinc-500">
                    {brl(summary.contractsEscrowValue)} escrow + {brl(summary.contractsAwaitingValue)} talentos + {brl(summary.agencyWalletTotal)} carteiras
                  </p>
                </div>
                {platformBalance.status === "ok" && (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${safe ? "border-emerald-900/50 bg-emerald-950/40 text-emerald-400" : "border-red-900/50 bg-red-950/40 text-red-400"}`}>
                    <p className="font-semibold">{safe ? "✓ Plataforma solvente" : "⚠ Abaixo do mínimo"}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Saldo MP: {brl(platformBalance.balance)} · {safe ? "Margem" : "Déficit"}: {brl(Math.abs(platformBalance.balance - summary.minimumRequired))}
                    </p>
                  </div>
                )}
                {platformBalance.status === "unavailable" && (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-500">
                    Saldo MP: <strong className="text-zinc-400">Indisponível</strong>
                    <span className="ml-1 text-xs">(legado)</span>
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Divider />
          <ProfitSection bookings={bookings} contracts={contracts} planPayments={planPayments} />
        </div>

        {/* Contratos */}
        <div className={activeTab === "contratos" ? "" : "hidden"}>
          <ContractsSection contracts={contracts} summary={summary} />
          <Divider />
          <WithdrawalHistory contracts={contracts} />
        </div>

        {/* Reservas */}
        <div className={activeTab === "reservas" ? "" : "hidden"}>
          <BookingsSection bookings={bookings} summary={summary} />
        </div>

        {/* Planos */}
        <div className={activeTab === "planos" ? "" : "hidden"}>
          <SubscriptionsSection subscriptions={subscriptions} summary={summary} />
          <Divider />
          <WithdrawalFeesSection withdrawals={withdrawals} />
        </div>

      </div>

      {/* Bottom padding */}
      <div className="h-12" />
    </div>
  );
}
