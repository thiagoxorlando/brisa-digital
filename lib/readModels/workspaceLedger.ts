/**
 * Workspace (Premium) ledger read model.
 *
 * Builds the normalized transaction list consumed by /agency/workspace/wallet.
 * Includes the data-fetch function (buildWorkspaceLedgerRows) and the
 * presentation helpers (txLabel, txTypeTone, txAmountTone, txAmountPrefix,
 * txStatusTone, txStatusLabel) so both the page and any future components
 * share the same labels and badge colours.
 */

import {
  getContractPaymentStatus,
  contractStatusLabel,
  contractStatusTone,
  resolveContractAmounts,
} from "@/lib/contractStatus";
import { getWorkspaceMembers } from "@/lib/premiumWorkspace.server";
import { createServerClient } from "@/lib/supabase";
import { resolveEscrowTxType } from "./contractLifecycle";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TFn = (key: string) => string;

type LedgerTxBase = {
  id: string;
  type: string;
  amount: number;
  status: string;
  note: string | null;
  created_at: string;
  related_job_id: string | null;
  related_contract_id: string | null;
  agent_user_id: string;
};

type ContractLedgerRow = {
  id: string;
  label: string;
  tone: string;
  gross: number;
  commission: number;
  net: number;
  paidAt: string | null;
};

type WorkspaceLedgerContractRow = {
  id: string;
  job_id: string | null;
  payment_amount: number | null;
  commission_amount: number | null;
  net_amount: number | null;
  status: string;
  paid_at: string | null;
};

export type WorkspaceLedgerRow = LedgerTxBase & {
  agentName: string | null;
  jobTitle: string | null;
  contract: ContractLedgerRow | null;
};

// ── Presentation helpers ───────────────────────────────────────────────────────

export function txLabel(type: string, t: TFn): string {
  const map: Record<string, string> = {
    allocation:          t("workspace_wallet_tx_allocation"),
    allocation_reversal: t("workspace_wallet_tx_allocation_reversal"),
    job_commitment:      t("workspace_wallet_tx_job_commitment"),
    job_release:         t("workspace_wallet_tx_job_release"),
    job_settlement:      t("workspace_wallet_tx_job_settlement"),
    refund:              t("workspace_wallet_tx_refund"),
    adjustment:          t("workspace_wallet_tx_adjustment"),
    escrow_lock:         t("workspace_wallet_tx_escrow_lock"),
    escrow_released:     "Pagamento ao talento",
    escrow_refunded:     "Estorno · reembolso",
  };
  return map[type] ?? type;
}

export function txTypeTone(type: string): string {
  const map: Record<string, string> = {
    allocation:          "border-emerald-200 bg-emerald-50 text-emerald-700",
    allocation_reversal: "border-indigo-200 bg-indigo-50 text-indigo-700",
    job_commitment:      "border-amber-200 bg-amber-50 text-amber-700",
    job_release:         "border-sky-200 bg-sky-50 text-sky-700",
    job_settlement:      "border-rose-200 bg-rose-50 text-rose-700",
    refund:              "border-zinc-200 bg-zinc-100 text-zinc-700",
    adjustment:          "border-zinc-200 bg-zinc-100 text-zinc-700",
    escrow_lock:         "border-amber-200 bg-amber-50 text-amber-700",
    escrow_released:     "border-rose-200 bg-rose-50 text-rose-700",
    escrow_refunded:     "border-sky-200 bg-sky-50 text-sky-700",
  };
  return map[type] ?? "border-zinc-200 bg-zinc-100 text-zinc-700";
}

export function txAmountTone(type: string): string {
  if (type === "job_settlement" || type === "escrow_released") return "text-rose-600";
  if (type === "job_commitment" || type === "escrow_lock")     return "text-amber-700";
  if (type === "allocation_reversal")                          return "text-indigo-700";
  if (type === "job_release" || type === "escrow_refunded")    return "text-sky-700";
  if (type === "allocation")                                   return "text-emerald-700";
  return "text-zinc-700";
}

export function txAmountPrefix(type: string): string {
  if (["job_commitment", "job_settlement", "allocation_reversal", "escrow_lock", "escrow_released"].includes(type)) return "−";
  if (["allocation", "job_release", "refund", "escrow_refunded"].includes(type)) return "+";
  return "";
}

export function txStatusTone(status: string): string {
  const n = status.toLowerCase();
  if (n === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (n === "pending")   return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-700";
}

export function txStatusLabel(status: string, t: TFn): string {
  const n = status.toLowerCase();
  if (n === "completed") return t("status_completed");
  if (n === "pending")   return t("status_pending");
  return status;
}

// ── Escrow summary ────────────────────────────────────────────────────────────

export type WorkspaceEscrowSummary = {
  activeEscrow: number;   // escrow_lock for contracts currently in "confirmed" status
  paidToTalents: number;  // sum of payout transactions for all workspace contracts
};

/**
 * Reads real money movement from wallet_transactions for workspace contracts.
 * Used by the owner wallet page summary cards so they reflect actual escrow
 * and payout amounts instead of the virtual agent-allocation ledger.
 */
export async function buildWorkspaceEscrowSummary(
  workspaceId: string,
): Promise<WorkspaceEscrowSummary> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: contracts } = await supabase
    .from("contracts")
    .select("id, status")
    .eq("workspace_id", workspaceId);

  const wsContracts = contracts ?? [];
  if (wsContracts.length === 0) return { activeEscrow: 0, paidToTalents: 0 };

  const contractIds   = wsContracts.map((c) => String(c.id));
  const confirmedIds  = wsContracts.filter((c) => c.status === "confirmed").map((c) => String(c.id));

  const [escrowResult, payoutResult] = await Promise.all([
    confirmedIds.length > 0
      ? supabase
          .from("wallet_transactions")
          .select("amount")
          .in("idempotency_key", confirmedIds.map((id) => `escrow_${id}`))
          .eq("type", "escrow_lock")
      : Promise.resolve({ data: [] as Array<{ amount: number | null }> }),
    contractIds.length > 0
      ? supabase
          .from("wallet_transactions")
          .select("amount")
          .in("reference_id", contractIds)
          .eq("type", "payout")
      : Promise.resolve({ data: [] as Array<{ amount: number | null }> }),
  ]);

  const activeEscrow = (escrowResult.data ?? []).reduce(
    (sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0,
  );
  const paidToTalents = (payoutResult.data ?? []).reduce(
    (sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0,
  );

  return { activeEscrow, paidToTalents };
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds the workspace ledger row list for /agency/workspace/wallet.
 * Fetches premium_agent_wallet_transactions, enriches with job/contract/member
 * data, and appends escrow_lock entries from wallet_transactions (owner view).
 */
export async function buildWorkspaceLedgerRows(
  workspaceId: string,
  limit: number,
  statusLang: "pt-BR" | "en",
  privateJobLabel: string,
  unknownAgentLabel: string,
  agentUserId?: string,
  ownerUserId?: string,
): Promise<WorkspaceLedgerRow[]> {
  const supabase = createServerClient({ useServiceRole: true });

  let query = supabase
    .from("premium_agent_wallet_transactions")
    .select("id, type, amount, status, note, created_at, related_job_id, related_contract_id, agent_user_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (agentUserId) query = query.eq("agent_user_id", agentUserId);

  const [{ data }, wsContractIdsResult] = await Promise.all([
    query,
    ownerUserId
      ? supabase.from("contracts").select("id").eq("workspace_id", workspaceId)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
  ]);

  const rows: LedgerTxBase[] = (data ?? []).map((row) => ({
    id:                   String(row.id),
    type:                 String(row.type),
    amount:               Number(row.amount ?? 0),
    status:               String(row.status ?? "completed"),
    note:                 row.note ?? null,
    created_at:           String(row.created_at),
    related_job_id:       row.related_job_id ?? null,
    related_contract_id:  row.related_contract_id ?? null,
    agent_user_id:        String(row.agent_user_id),
  }));

  const wsContractIds = (wsContractIdsResult.data ?? []).map((c) => c.id);
  const escrowKeys = wsContractIds.map((id) => `escrow_${id}`);

  if (rows.length === 0 && wsContractIds.length === 0) return [];

  const contractIdsFromTxs = [...new Set(rows.map((r) => r.related_contract_id).filter((v): v is string => Boolean(v)))];
  const allContractIds = [...new Set([...contractIdsFromTxs, ...wsContractIds])];
  const jobIds = [...new Set(rows.map((r) => r.related_job_id).filter((v): v is string => Boolean(v)))];

  const [jobsResult, contractsResult, payoutResult, membersResult, escrowTxsResult] = await Promise.all([
    jobIds.length > 0
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string | null }> }),
    allContractIds.length > 0
      ? supabase.from("contracts").select("id, job_id, payment_amount, commission_amount, net_amount, status, paid_at").in("id", allContractIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    allContractIds.length > 0
      ? supabase.from("wallet_transactions").select("reference_id, amount").eq("type", "payout").in("reference_id", allContractIds)
      : Promise.resolve({ data: [] as Array<{ reference_id: string | null; amount: number | null }> }),
    getWorkspaceMembers(workspaceId),
    escrowKeys.length > 0
      ? supabase.from("wallet_transactions").select("id, amount, status, created_at, idempotency_key").in("idempotency_key", escrowKeys).eq("type", "escrow_lock")
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const jobTitleMap = new Map<string, string>();
  for (const job of jobsResult.data ?? []) {
    jobTitleMap.set(String(job.id), job.title ?? privateJobLabel);
  }

  const payoutMap = new Map<string, number>();
  for (const payout of payoutResult.data ?? []) {
    if (!payout.reference_id) continue;
    payoutMap.set(String(payout.reference_id), Number(payout.amount ?? 0));
  }

  const memberNameMap = new Map<string, string>();
  for (const member of membersResult) {
    memberNameMap.set(member.userId, member.displayName || member.email || unknownAgentLabel);
  }

  const contractJobMap = new Map<string, string | null>();
  const contractMap = new Map<string, ContractLedgerRow>();
  const contractRawStatusMap = new Map<string, string>();

  for (const contract of (contractsResult.data ?? []) as (WorkspaceLedgerContractRow & { job_id: string | null })[]) {
    const paymentStatus = getContractPaymentStatus(contract);
    const { gross, commission, net } = resolveContractAmounts(contract);
    const paidToTalent =
      payoutMap.get(String(contract.id))
      ?? (contract.net_amount != null ? Number(contract.net_amount) : null)
      ?? Math.max(0, gross - commission);

    contractMap.set(String(contract.id), {
      id:         String(contract.id),
      label:      contractStatusLabel(paymentStatus, statusLang),
      tone:       contractStatusTone(paymentStatus),
      gross,
      commission,
      net:        paidToTalent ?? net,
      paidAt:     (contract.paid_at as string | null) ?? null,
    });

    contractJobMap.set(String(contract.id), contract.job_id ?? null);
    contractRawStatusMap.set(String(contract.id), contract.status);

    if (contract.job_id && !jobTitleMap.has(String(contract.job_id))) {
      jobTitleMap.set(String(contract.job_id), privateJobLabel);
    }
  }

  // Build escrow rows from wallet_transactions for all workspace contracts.
  // Resolve type based on contract final status so every financial event shows.
  const escrowRows: WorkspaceLedgerRow[] = (escrowTxsResult.data ?? []).map((tx) => {
    const key        = String((tx as Record<string, unknown>).idempotency_key ?? "");
    const contractId = key.startsWith("escrow_") ? key.slice("escrow_".length) : key;
    const rawStatus  = contractRawStatusMap.get(contractId) ?? "";
    const jobId      = contractJobMap.get(contractId) ?? null;
    const resolvedType = resolveEscrowTxType(rawStatus);

    return {
      id:                   String((tx as Record<string, unknown>).id),
      type:                 resolvedType,
      amount:               Math.abs(Number((tx as Record<string, unknown>).amount ?? 0)),
      status:               String((tx as Record<string, unknown>).status ?? "completed"),
      note:                 null,
      created_at:           String((tx as Record<string, unknown>).created_at),
      related_job_id:       jobId,
      related_contract_id:  contractId,
      agent_user_id:        ownerUserId ?? "",
      agentName:            null,
      jobTitle:             jobId ? (jobTitleMap.get(jobId) ?? null) : null,
      contract:             contractMap.get(contractId) ?? null,
    };
  });

  const mappedRows: WorkspaceLedgerRow[] = rows.map((row) => ({
    ...row,
    agentName: memberNameMap.get(row.agent_user_id) ?? null,
    jobTitle:  row.related_job_id ? (jobTitleMap.get(row.related_job_id) ?? null) : null,
    contract:  row.related_contract_id ? (contractMap.get(row.related_contract_id) ?? null) : null,
  }));

  return [...mappedRows, ...escrowRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
