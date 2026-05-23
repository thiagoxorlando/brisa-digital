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

export type AdminControlCenterData = {
  alerts: AlertItem[];
  financialOps: FinancialOpsData;
  operationalQueue: QueueItem[];
  activityMetrics: ActivityMetrics;
  systemHealth: SystemHealth;
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
  };
}
