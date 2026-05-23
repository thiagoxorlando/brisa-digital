import { createServerClient } from "@/lib/supabase";

export type AlertItem = {
  key: string;
  count: number;
  label: string;
  description: string;
  href: string;
  severity: "critical" | "warn";
};

export type FinancialOpsData = {
  activeEscrow: number;
  disputedEscrow: number;
  pendingWithdrawalsAmount: number;
  pendingPayoutsCount: number;
};

export type QueueItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  severity: "critical" | "warn" | "neutral";
};

export type ActivityMetrics = {
  newUsersToday: number;
  newJobsToday: number;
  newContractsToday: number;
  newBookingsToday: number;
  activeWorkspaces: number;
  activeTalents: number;
};

export type SystemHealth = {
  supabaseConnected: boolean;
  asaasConfigured: boolean;
  nodeEnv: string;
};

export type RecentActivityItem = {
  id: string;
  type: "contract" | "payment" | "dispute" | "user";
  label: string;
  description: string;
  href: string;
  createdAt: string;
  tone: "emerald" | "indigo" | "amber" | "red" | "zinc" | "sky";
};

export type AdminControlCenterData = {
  alerts: AlertItem[];
  financialOps: FinancialOpsData;
  operationalQueue: QueueItem[];
  activityMetrics: ActivityMetrics;
  systemHealth: SystemHealth;
  recentActivity: RecentActivityItem[];
};

export async function buildAdminControlCenterData(): Promise<AdminControlCenterData> {
  const supabase = createServerClient({ useServiceRole: true });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [
    disputesRes,
    pendingWithdrawalsCountRes,
    pendingPayoutsCountRes,
    supportWaitingRes,
    sentContractsRes,
    pendingWithdrawalsAmtRes,
    disputedContractsRes,
    confirmedContractsRes,
    newUsersRes,
    newJobsRes,
    newContractsRes,
    newBookingsRes,
    activeWorkspacesRes,
    activeTalentsRes,
    recentContractsRes,
    recentWalletRes,
    recentDisputesRes,
    recentProfilesRes,
  ] = await Promise.all([
    supabase
      .from("contract_disputes")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "under_review"]),

    supabase
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("type", "withdrawal")
      .in("status", ["pending", "processing"]),

    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "signed"),

    supabase
      .from("support_conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting_admin")
      .is("archived_at", null),

    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "sent"),

    supabase
      .from("wallet_transactions")
      .select("amount")
      .eq("type", "withdrawal")
      .in("status", ["pending", "processing"]),

    supabase
      .from("contract_disputes")
      .select("contract_id")
      .in("status", ["open", "under_review"]),

    supabase
      .from("contracts")
      .select("id")
      .is("deleted_at", null)
      .eq("status", "confirmed"),

    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", todayIso),

    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", todayIso),

    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", todayIso),

    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", todayIso),

    supabase
      .from("premium_workspaces")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null),

    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("role", "talent"),

    supabase
      .from("contracts")
      .select("id, status, job_description, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),

    supabase
      .from("wallet_transactions")
      .select("id, type, amount, description, created_at")
      .in("type", ["payout", "deposit", "withdrawal"])
      .order("created_at", { ascending: false })
      .limit(6),

    supabase
      .from("contract_disputes")
      .select("id, status, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(6),

    supabase
      .from("profiles")
      .select("id, role, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const openDisputesCount = disputesRes.count ?? 0;
  const pendingWithdrawalsCount = pendingWithdrawalsCountRes.count ?? 0;
  const pendingPayoutsCount = pendingPayoutsCountRes.count ?? 0;
  const supportWaitingCount = supportWaitingRes.count ?? 0;
  const sentContractsCount = sentContractsRes.count ?? 0;

  const pendingWithdrawalsAmount = (pendingWithdrawalsAmtRes.data ?? []).reduce(
    (sum, row) => sum + Math.abs(Number((row as { amount?: number | null }).amount ?? 0)),
    0,
  );

  const disputedContractIds = new Set(
    (disputedContractsRes.data ?? []).map((r) => String((r as { contract_id: string }).contract_id)),
  );
  const confirmedContractIds = (confirmedContractsRes.data ?? []).map((r) => String((r as { id: string }).id));
  const disputedConfirmedIds = confirmedContractIds.filter((id) => disputedContractIds.has(id));

  let disputedEscrow = 0;
  let activeEscrow = 0;

  if (confirmedContractIds.length > 0) {
    const escrowKeys = confirmedContractIds.map((id) => `escrow_${id}`);
    const { data: escrowTxs } = await supabase
      .from("wallet_transactions")
      .select("amount, idempotency_key")
      .eq("type", "escrow_lock")
      .in("idempotency_key", escrowKeys);

    for (const tx of escrowTxs ?? []) {
      const key = String((tx as { idempotency_key?: string | null }).idempotency_key ?? "");
      const contractId = key.startsWith("escrow_") ? key.slice(7) : key;
      const amt = Math.abs(Number((tx as { amount?: number | null }).amount ?? 0));
      activeEscrow += amt;
      if (disputedConfirmedIds.includes(contractId)) {
        disputedEscrow += amt;
      }
    }
  }

  const rawAlerts: Array<{
    key: string;
    count: number;
    label: string;
    description: string;
    href: string;
    severity: "critical" | "warn";
  }> = [
    {
      key: "openDisputes",
      count: openDisputesCount,
      label: "Disputas abertas",
      description: "Contratos com custódia bloqueada aguardando resolução.",
      href: "/admin/disputes",
      severity: "critical",
    },
    {
      key: "pendingWithdrawals",
      count: pendingWithdrawalsCount,
      label: "Saques pendentes",
      description: "Solicitações de saque aguardando processamento.",
      href: "/admin/withdrawals",
      severity: "warn",
    },
    {
      key: "pendingPayouts",
      count: pendingPayoutsCount,
      label: "Contratos aguardando depósito",
      description: "Talentos assinaram — agência ainda não depositou.",
      href: "/admin/contracts",
      severity: "warn",
    },
    {
      key: "supportWaiting",
      count: supportWaitingCount,
      label: "Suporte aguardando",
      description: "Conversas que aguardam resposta da administração.",
      href: "/admin/support",
      severity: "warn",
    },
  ];

  const alerts = rawAlerts.filter((a) => a.count > 0);

  const operationalQueue: QueueItem[] = [
    {
      key: "openDisputes",
      label: "Disputas abertas",
      count: openDisputesCount,
      href: "/admin/disputes",
      severity: openDisputesCount > 0 ? "critical" : "neutral",
    },
    {
      key: "pendingWithdrawals",
      label: "Saques pendentes",
      count: pendingWithdrawalsCount,
      href: "/admin/withdrawals",
      severity: pendingWithdrawalsCount > 0 ? "warn" : "neutral",
    },
    {
      key: "pendingPayouts",
      label: "Contratos aguardando depósito",
      count: pendingPayoutsCount,
      href: "/admin/contracts",
      severity: pendingPayoutsCount > 0 ? "warn" : "neutral",
    },
    {
      key: "supportWaiting",
      label: "Suporte aguardando",
      count: supportWaitingCount,
      href: "/admin/support",
      severity: supportWaitingCount > 0 ? "warn" : "neutral",
    },
    {
      key: "sentContracts",
      label: "Contratos aguardando assinatura",
      count: sentContractsCount,
      href: "/admin/contracts",
      severity: sentContractsCount > 0 ? "warn" : "neutral",
    },
  ];

  const activityMetrics: ActivityMetrics = {
    newUsersToday: newUsersRes.count ?? 0,
    newJobsToday: newJobsRes.count ?? 0,
    newContractsToday: newContractsRes.count ?? 0,
    newBookingsToday: newBookingsRes.count ?? 0,
    activeWorkspaces: activeWorkspacesRes.count ?? 0,
    activeTalents: activeTalentsRes.count ?? 0,
  };

  const systemHealth: SystemHealth = {
    supabaseConnected: true,
    asaasConfigured: !!process.env.ASAAS_API_KEY,
    nodeEnv: process.env.NODE_ENV ?? "production",
  };

  // --- Recent activity feed ---
  const CONTRACT_STATUS_LABEL: Record<string, string> = {
    sent:      "Contrato enviado",
    signed:    "Contrato assinado",
    confirmed: "Contrato em custódia",
    paid:      "Contrato pago",
    cancelled: "Contrato cancelado",
    rejected:  "Contrato rejeitado",
  };
  const CONTRACT_STATUS_TONE: Record<string, RecentActivityItem["tone"]> = {
    sent:      "zinc",
    signed:    "amber",
    confirmed: "indigo",
    paid:      "emerald",
    cancelled: "zinc",
    rejected:  "red",
  };
  const WALLET_TYPE_LABEL: Record<string, string> = {
    payout:     "Pagamento ao talento",
    deposit:    "Depósito recebido",
    withdrawal: "Saque solicitado",
  };
  const WALLET_TYPE_TONE: Record<string, RecentActivityItem["tone"]> = {
    payout:     "emerald",
    deposit:    "sky",
    withdrawal: "amber",
  };
  const DISPUTE_STATUS_LABEL: Record<string, string> = {
    open:         "Disputa aberta",
    under_review: "Disputa em revisão",
  };

  type RawActivity = { id: string; createdAt: string; item: RecentActivityItem };
  const raw: RawActivity[] = [];

  for (const c of recentContractsRes.data ?? []) {
    const ct = c as { id: string; status: string | null; job_description: string | null; created_at: string };
    const status = ct.status ?? "sent";
    raw.push({
      id: ct.id,
      createdAt: ct.created_at,
      item: {
        id: ct.id,
        type: "contract",
        label: CONTRACT_STATUS_LABEL[status] ?? "Contrato atualizado",
        description: ct.job_description ? ct.job_description.slice(0, 60) : "Contrato sem descrição",
        href: "/admin/contracts",
        createdAt: ct.created_at,
        tone: CONTRACT_STATUS_TONE[status] ?? "zinc",
      },
    });
  }

  for (const w of recentWalletRes.data ?? []) {
    const wt = w as { id: string; type: string | null; amount: number | null; description: string | null; created_at: string };
    const wtype = wt.type ?? "payout";
    raw.push({
      id: wt.id,
      createdAt: wt.created_at,
      item: {
        id: wt.id,
        type: "payment",
        label: WALLET_TYPE_LABEL[wtype] ?? "Transação financeira",
        description: wt.description ? wt.description.slice(0, 60) : `R$ ${Math.abs(Number(wt.amount ?? 0)).toFixed(2)}`,
        href: wtype === "withdrawal" ? "/admin/withdrawals" : "/admin/contracts",
        createdAt: wt.created_at,
        tone: WALLET_TYPE_TONE[wtype] ?? "zinc",
      },
    });
  }

  for (const d of recentDisputesRes.data ?? []) {
    const rd = d as { id: string; status: string | null; reason: string | null; created_at: string };
    const dstatus = rd.status ?? "open";
    const isActive = dstatus === "open" || dstatus === "under_review";
    raw.push({
      id: rd.id,
      createdAt: rd.created_at,
      item: {
        id: rd.id,
        type: "dispute",
        label: DISPUTE_STATUS_LABEL[dstatus] ?? "Disputa encerrada",
        description: rd.reason ? rd.reason.slice(0, 60) : "Sem descrição",
        href: "/admin/disputes",
        createdAt: rd.created_at,
        tone: isActive ? "red" : "zinc",
      },
    });
  }

  for (const p of recentProfilesRes.data ?? []) {
    const rp = p as { id: string; role: string | null; created_at: string };
    raw.push({
      id: rp.id,
      createdAt: rp.created_at,
      item: {
        id: rp.id,
        type: "user",
        label: rp.role === "talent" ? "Novo talento cadastrado" : rp.role === "agency" ? "Nova agência cadastrada" : "Novo usuário",
        description: rp.role === "admin" ? "Administrador" : (rp.role ?? "Usuário"),
        href: "/admin/users",
        createdAt: rp.created_at,
        tone: "sky",
      },
    });
  }

  const recentActivity = raw
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10)
    .map((r) => r.item);

  return {
    alerts,
    financialOps: {
      activeEscrow,
      disputedEscrow,
      pendingWithdrawalsAmount,
      pendingPayoutsCount,
    },
    operationalQueue,
    activityMetrics,
    systemHealth,
    recentActivity,
  };
}
