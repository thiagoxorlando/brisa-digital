import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { brl } from "@/lib/brl";
import {
  getAgentLedgerBalance,
  getOwnerAllocationSummary,
  getWorkspaceAgentLedgerBalances,
  getWorkspaceMembers,
} from "@/lib/premiumWorkspace.server";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";
import { getServerLang, getServerT } from "@/lib/i18n/server";
import WorkspaceWalletAllocator from "@/features/agency/WorkspaceWalletAllocator";
import {
  buildWorkspaceLedgerRows,
  buildWorkspaceEscrowSummary,
  txLabel,
  txTypeTone,
  txAmountTone,
  txAmountPrefix,
  txStatusTone,
  txStatusLabel,
  type WorkspaceLedgerRow,
  type TFn,
} from "@/lib/readModels/workspaceLedger";

export const metadata: Metadata = { title: "Carteira Premium - BrisaHub" };

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald" | "amber" | "rose" | "sky" | "indigo";
}) {
  const colors = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-600",
    sky: "text-sky-700",
    indigo: "text-indigo-700",
  };

  return (
    <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{label}</p>
      <p className={`mt-2 text-[1.8rem] font-bold ${accent ? colors[accent] : "text-zinc-950"}`}>{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}


function formatDateTime(value: string | null, locale: string): string {
  if (!value) return "-";
  return new Date(value).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

function TimelineCard({
  title,
  description,
  rows,
  t,
  locale,
}: {
  title: string;
  description: string;
  rows: WorkspaceLedgerRow[];
  t: TFn;
  locale: string;
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-[28px] border border-zinc-200 bg-white px-6 py-10 text-center shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
        <h2 className="text-[16px] font-semibold text-zinc-900">{title}</h2>
        <p className="mt-2 text-[13px] text-zinc-500">{description}</p>
        <p className="mt-5 text-[14px] text-zinc-500">{t("workspace_wallet_no_transactions")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-zinc-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
      <div className="border-b border-zinc-100 px-6 py-5">
        <h2 className="text-[16px] font-semibold text-zinc-900">{title}</h2>
        <p className="mt-1 text-[13px] text-zinc-500">{description}</p>
      </div>
      <ul className="divide-y divide-zinc-100">
        {rows.map((tx) => (
          <li key={tx.id} className="px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-semibold text-zinc-900">{txLabel(tx.type, t)}</p>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${txStatusTone(tx.status)}`}>
                    {txStatusLabel(tx.status, t)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] text-zinc-500">
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1">
                    {t("workspace_wallet_date_label")}: {formatDateTime(tx.created_at, locale)}
                  </span>
                  {tx.agentName ? (
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1">
                      {t("workspace_wallet_agent_label")}: {tx.agentName}
                    </span>
                  ) : null}
                  {tx.jobTitle ? (
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1">
                      {t("workspace_wallet_job_label")}: {tx.jobTitle}
                    </span>
                  ) : null}
                  {tx.note ? (
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1">
                      {t("workspace_wallet_note_label")}: {tx.note}
                    </span>
                  ) : null}
                </div>

                {tx.contract ? (
                  <div className="rounded-[22px] border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[12px] font-semibold text-zinc-800">
                        {t("workspace_wallet_contract_label")} #{shortId(tx.contract.id)}
                      </p>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${tx.contract.tone}`}>
                        {tx.contract.label}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 text-[12px] text-zinc-600 sm:grid-cols-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{t("workspace_wallet_gross")}</p>
                        <p className="mt-1 font-semibold text-zinc-900">{brl(tx.contract.gross)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{t("workspace_wallet_commission")}</p>
                        <p className="mt-1 font-semibold text-zinc-900">{brl(tx.contract.commission)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{t("workspace_wallet_paid_to_talent")}</p>
                        <p className="mt-1 font-semibold text-zinc-900">{brl(tx.contract.net)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{t("workspace_wallet_paid_at")}</p>
                        <p className="mt-1 font-semibold text-zinc-900">{formatDateTime(tx.contract.paidAt, locale)}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="lg:pl-6">
                <p className={`text-[1.1rem] font-bold tabular-nums ${txAmountTone(tx.type)}`}>
                  {txAmountPrefix(tx.type)}{brl(tx.amount)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function WorkspaceWalletPage() {
  const [t, lang] = await Promise.all([getServerT(), getServerLang()]);
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const statusLang = lang === "en" ? "en" : "pt-BR";
  const context = await requirePremiumWorkspacePageContext();

  if (!context.isOwner) {
    const [ledger, rows] = await Promise.all([
      getAgentLedgerBalance(context.workspace.id, context.userId),
      buildWorkspaceLedgerRows(context.workspace.id, 120, statusLang, t("workspace_private_job"), t("workspace_role_agent"), context.userId),
    ]);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[1.5rem] font-bold tracking-tight text-zinc-950 sm:text-[1.8rem]">{t("workspace_wallet_page_title")}</h1>
          <p className="mt-1 text-[14px] text-zinc-500">{t("workspace_wallet_agent_page_description")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("workspace_wallet_allocated")} value={brl(ledger.allocatedAmount)} hint={t("workspace_wallet_total_sent_by_owner")} />
          <StatCard label={t("workspace_wallet_committed")} value={brl(ledger.committedAmount)} hint={t("workspace_wallet_reserved_in_open_jobs")} accent="amber" />
          <StatCard label={t("workspace_wallet_paid_talents")} value={brl(ledger.spentAmount)} hint={t("workspace_wallet_settled_paid_contracts")} accent="rose" />
          <StatCard
            label={t("workspace_wallet_available")}
            value={brl(ledger.availableAmount)}
            hint={t("workspace_wallet_available_new_jobs")}
            accent={ledger.availableAmount > 0 ? "emerald" : "indigo"}
          />
        </div>

        <TimelineCard
          title={t("workspace_wallet_timeline_title_agent")}
          description={t("workspace_wallet_timeline_description_agent")}
          rows={rows}
          t={t}
          locale={locale}
        />
      </div>
    );
  }

  const supabase = createServerClient({ useServiceRole: true });

  const [summary, members, ledgerMap, rows, walletTxsResult, escrowSummary] = await Promise.all([
    getOwnerAllocationSummary(context.workspace.id, context.workspace.ownerUserId),
    getWorkspaceMembers(context.workspace.id),
    getWorkspaceAgentLedgerBalances(context.workspace.id),
    buildWorkspaceLedgerRows(context.workspace.id, 250, statusLang, t("workspace_private_job"), t("workspace_role_agent"), undefined, context.workspace.ownerUserId),
    supabase
      .from("wallet_transactions")
      .select("id, type, amount, description, status, provider_status, created_at, processed_at, admin_note")
      .eq("user_id", context.workspace.ownerUserId)
      .in("type", ["deposit", "withdrawal"])
      .order("created_at", { ascending: false })
      .limit(50),
    buildWorkspaceEscrowSummary(context.workspace.id),
  ]);

  const agents = members.filter((member) => member.role === "agent");
  const ledgerBalances = Array.from(ledgerMap.values());
  const totalAgentAvailable = ledgerBalances.reduce((sum, ledger) => sum + ledger.availableAmount, 0);
  const availableToAllocateOrReclaim = summary.ownerUnallocatedAvailable + totalAgentAvailable;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.5rem] font-bold tracking-tight text-zinc-950 sm:text-[1.8rem]">{t("workspace_wallet_page_title")}</h1>
        <p className="mt-1 text-[14px] text-zinc-500">{t("workspace_wallet_owner_page_description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label={t("workspace_wallet_owner_balance_label")}
          value={brl(summary.ownerUnallocatedAvailable)}
          hint={t("workspace_wallet_owner_balance_hint")}
        />
        <StatCard
          label={t("workspace_wallet_allocated_to_agents")}
          value={brl(summary.totalAllocatedToAgents)}
          hint={t("workspace_wallet_allocated_to_agents_hint")}
          accent="indigo"
        />
        <StatCard
          label={t("workspace_wallet_committed_escrow")}
          value={brl(escrowSummary.activeEscrow)}
          hint={t("workspace_wallet_committed_escrow_hint")}
          accent="amber"
        />
        <StatCard
          label={t("workspace_wallet_paid_talents")}
          value={brl(escrowSummary.paidToTalents)}
          hint={t("workspace_wallet_settled_paid_contracts")}
          accent="rose"
        />
        <StatCard
          label={t("workspace_wallet_available_allocate_reclaim")}
          value={brl(availableToAllocateOrReclaim)}
          hint={t("workspace_wallet_available_allocate_reclaim_hint")}
          accent="emerald"
        />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-[16px] font-semibold text-zinc-900">{t("workspace_wallet_allocator_title")}</h2>
          <p className="mt-1 text-[13px] text-zinc-500">{t("workspace_wallet_allocator_description")}</p>
        </div>
        <WorkspaceWalletAllocator
          agents={agents}
          initialLedgerBalances={ledgerBalances}
          initialOwnerSummary={summary}
        />
      </section>

      <TimelineCard
        title={t("workspace_wallet_timeline_title_owner")}
        description={t("workspace_wallet_timeline_description_owner")}
        rows={rows}
        t={t}
        locale={locale}
      />

      {/* Main wallet history: deposits and withdrawals */}
      {(walletTxsResult.data ?? []).length > 0 && (
        <section className="rounded-[28px] border border-zinc-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
          <div className="border-b border-zinc-100 px-6 py-5">
            <h2 className="text-[16px] font-semibold text-zinc-900">Histórico da carteira principal</h2>
            <p className="mt-1 text-[13px] text-zinc-500">Depósitos e saques processados na conta principal do workspace.</p>
          </div>
          <ul className="divide-y divide-zinc-100">
            {(walletTxsResult.data ?? []).map((tx) => {
              const isDeposit = tx.type === "deposit";
              const isWithdrawal = tx.type === "withdrawal";
              const statusNorm = (tx.status ?? "").toLowerCase();
              const isPending = statusNorm === "pending" || tx.provider_status === "pending_checkout";
              const isFailed  = statusNorm === "failed" || statusNorm === "cancelled";
              const amount = Math.abs(Number(tx.amount ?? 0));

              const typePill = isDeposit
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-zinc-200 bg-zinc-100 text-zinc-600";
              const typeLabel = isDeposit ? "Depósito" : "Saque";
              const amtColor  = isDeposit ? "text-emerald-700" : "text-rose-600";
              const amtPrefix = isDeposit ? "+" : "−";

              const statusPill = isPending
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : isFailed
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700";
              const statusLabel = isPending ? "Pendente" : isFailed ? "Falhou" : "Confirmado";

              return (
                <li key={tx.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${typePill}`}>
                      {typeLabel}
                    </span>
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusPill}`}>
                      {statusLabel}
                    </span>
                    {tx.description && (
                      <span className="text-[12px] text-zinc-500">{tx.description}</span>
                    )}
                    <span className="text-[11px] text-zinc-400">
                      {formatDateTime(tx.created_at, locale)}
                    </span>
                    {isWithdrawal && tx.processed_at && (
                      <span className="text-[11px] text-zinc-400">
                        Processado em {formatDateTime(tx.processed_at as string | null, locale)}
                      </span>
                    )}
                    {tx.admin_note && (
                      <span className="text-[11px] text-zinc-500 italic">{tx.admin_note as string}</span>
                    )}
                  </div>
                  <p className={`text-[1rem] font-bold tabular-nums ${amtColor}`}>
                    {amtPrefix}{brl(amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
