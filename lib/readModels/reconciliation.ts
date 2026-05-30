import { createServerClient } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

export type ReconStatus  = "ok" | "attention" | "divergent";
export type AlertSeverity = "critical" | "warning" | "info";
export type AlertType    = "deposit" | "withdrawal" | "plan" | "webhook";

export type ReconciliationAlert = {
  id:             string;
  severity:       AlertSeverity;
  type:           AlertType;
  description:    string;
  /** Short headline of what's wrong — shown in the alert table row. */
  problem:        string;
  /** Potential consequence of the issue. */
  impact:         string;
  /** CTA button label, e.g. "Abrir depósito". */
  actionLabel:    string;
  userId:         string | null;
  userName:       string | null;
  amount:         number | null;
  appStatus:      string | null;
  providerStatus: string | null;
  referenceId:    string | null;
  /** ID of the specific source entity (wallet_transactions.id, webhook_events.id). */
  entityId:       string | null;
  createdAt:      string;
  adminLink:      string | null;
};

export type DepositRow = {
  id:             string;
  userId:         string;
  userName:       string;
  amount:         number;
  status:         string;
  asaasPaymentId: string | null;
  paymentId:      string | null;
  processedAt:    string | null;
  createdAt:      string;
  reconStatus:    ReconStatus;
};

export type WithdrawalRow = {
  id:              string;
  userId:          string;
  userName:        string;
  amount:          number;
  status:          string;
  asaasTransferId: string | null;
  providerTransferId: string | null;
  provider:        string | null;
  processedAt:     string | null;
  createdAt:       string;
  reconStatus:     ReconStatus;
};

export type PlanChargeRow = {
  id:          string;
  userId:      string;
  userName:    string;
  amount:      number;
  status:      string;
  paymentId:   string | null;
  description: string | null;
  processedAt: string | null;
  createdAt:   string;
  reconStatus: ReconStatus;
};

export type WebhookRow = {
  id:          string;
  eventId:     string | null;
  eventType:   string;
  processedAt: string | null;
  error:       string | null;
  hasPayload:  boolean;
  relatedId:   string | null;
  createdAt:   string;
  status:      "processed" | "pending" | "error";
};

export type ReconciliationSummary = {
  depositsOk:       number;
  depositsAlert:    number;
  withdrawalsOk:    number;
  withdrawalsAlert: number;
  planChargesOk:    number;
  webhooksPending:  number;
};

export type ReconciliationData = {
  summary:     ReconciliationSummary;
  alerts:      ReconciliationAlert[];
  deposits:    DepositRow[];
  withdrawals: WithdrawalRow[];
  planCharges: PlanChargeRow[];
  webhooks:    WebhookRow[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function minutesAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 60_000;
}

function tx<T>(row: unknown, key: string): T | null {
  return ((row as Record<string, unknown>)[key] as T) ?? null;
}

function extractRelatedId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const payment = p.payment as Record<string, unknown> | undefined;
  const transfer = p.transfer as Record<string, unknown> | undefined;
  if (payment?.id) return String(payment.id);
  if (transfer?.id) return String(transfer.id);
  if (p.id) return String(p.id);
  return null;
}

function alertId(prefix: string, id: string): string {
  return `${prefix}-${id}`;
}

// ── Main builder ─────────────────────────────────────────────────────────────

export async function buildReconciliationData(): Promise<ReconciliationData> {
  const supabase = createServerClient({ useServiceRole: true });

  const [
    { data: depositRows },
    { data: withdrawalRows },
    { data: planChargeRows },
    { data: webhookRows },
  ] = await Promise.all([
    supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, status, payment_id, asaas_payment_id, provider, processed_at, created_at")
      .eq("type", "deposit")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, status, asaas_transfer_id, provider_transfer_id, provider, processed_at, created_at")
      .eq("type", "withdrawal")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("wallet_transactions")
      .select("id, user_id, amount, status, payment_id, description, provider, processed_at, created_at")
      .eq("type", "plan_charge")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("asaas_webhook_events")
      .select("id, event_id, event_type, payload, processed_at, error, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  // Resolve user names
  const allUserIds = [
    ...new Set([
      ...(depositRows ?? []).map((r) => r.user_id as string),
      ...(withdrawalRows ?? []).map((r) => r.user_id as string),
      ...(planChargeRows ?? []).map((r) => r.user_id as string),
    ].filter(Boolean)),
  ];

  const userNameMap = new Map<string, string>();
  if (allUserIds.length > 0) {
    const [{ data: profiles }, { data: talents }, { data: agencies }] = await Promise.all([
      supabase.from("profiles").select("id, role, full_name").in("id", allUserIds),
      supabase.from("talent_profiles").select("id, user_id, full_name").is("deleted_at", null),
      supabase.from("agencies").select("id, user_id, company_name").is("deleted_at", null),
    ]);

    const talentByUserId = new Map((talents ?? []).map((t) => [
      (t.user_id ?? t.id) as string,
      t.full_name as string | null,
    ]));
    const agencyByUserId = new Map((agencies ?? []).map((a) => [
      (a.user_id ?? a.id) as string,
      a.company_name as string | null,
    ]));

    for (const p of profiles ?? []) {
      const id = p.id as string;
      const role = p.role as string;
      const name =
        role === "agency"
          ? (agencyByUserId.get(id) ?? p.full_name ?? id)
          : (talentByUserId.get(id) ?? p.full_name ?? id);
      userNameMap.set(id, (name as string | null) ?? id.slice(0, 8));
    }
  }

  function userName(userId: string | null): string {
    if (!userId) return "Desconhecido";
    return userNameMap.get(userId) ?? userId.slice(0, 8);
  }

  // ── Build lookup maps for cross-reference ────────────────────────────────

  // asaas_payment_id → deposit row
  const depositByAsaasId = new Map<string, typeof depositRows extends (infer T)[] | null ? T : never>();
  for (const d of depositRows ?? []) {
    const aid = tx<string>(d, "asaas_payment_id");
    if (aid) depositByAsaasId.set(aid, d);
  }

  // asaas_transfer_id → withdrawal row
  const withdrawalByTransferId = new Map<string, typeof withdrawalRows extends (infer T)[] | null ? T : never>();
  for (const w of withdrawalRows ?? []) {
    const tid = tx<string>(w, "asaas_transfer_id");
    if (tid) withdrawalByTransferId.set(tid, w);
  }

  // payment_id duplicate detection for deposits
  const paymentIdCount = new Map<string, number>();
  for (const d of depositRows ?? []) {
    const pid = d.payment_id as string | null;
    if (pid) paymentIdCount.set(pid, (paymentIdCount.get(pid) ?? 0) + 1);
  }

  // ── Deposits ─────────────────────────────────────────────────────────────

  const deposits: DepositRow[] = (depositRows ?? []).map((d) => {
    const status = d.status as string;
    const asaasPaymentId = tx<string>(d, "asaas_payment_id");
    const paymentId = d.payment_id as string | null;
    const provider = d.provider as string | null;
    const isPaid = status === "paid";
    const isPending = status === "pending" || status === "processing";
    const pendingTooLong = isPending && minutesAgo(d.created_at as string) > 30;
    const missingRef = isPaid && !asaasPaymentId && !paymentId && provider !== "manual";
    const dupPaymentId = paymentId ? (paymentIdCount.get(paymentId) ?? 0) > 1 : false;

    let reconStatus: ReconStatus = "ok";
    if (dupPaymentId || missingRef) reconStatus = "divergent";
    else if (pendingTooLong) reconStatus = "attention";

    return {
      id:             d.id as string,
      userId:         d.user_id as string,
      userName:       userName(d.user_id as string),
      amount:         Number(d.amount ?? 0),
      status,
      asaasPaymentId,
      paymentId,
      processedAt:    d.processed_at as string | null,
      createdAt:      d.created_at as string,
      reconStatus,
    };
  });

  // ── Withdrawals ───────────────────────────────────────────────────────────

  const withdrawals: WithdrawalRow[] = (withdrawalRows ?? []).map((w) => {
    const status = w.status as string;
    const asaasTransferId = tx<string>(w, "asaas_transfer_id");
    const providerTransferId = tx<string>(w, "provider_transfer_id");
    const provider = w.provider as string | null;
    const isPaid = status === "paid";
    const isProcessing = status === "processing";
    const processingTooLong = isProcessing && minutesAgo(w.created_at as string) > 1440; // 24h
    const missingTransferId = isPaid && !asaasTransferId && !providerTransferId && provider !== "manual";

    let reconStatus: ReconStatus = "ok";
    if (missingTransferId) reconStatus = "attention";
    if (processingTooLong) reconStatus = "divergent";

    return {
      id:                w.id as string,
      userId:            w.user_id as string,
      userName:          userName(w.user_id as string),
      amount:            Number(w.amount ?? 0),
      status,
      asaasTransferId,
      providerTransferId,
      provider,
      processedAt:       w.processed_at as string | null,
      createdAt:         w.created_at as string,
      reconStatus,
    };
  });

  // ── Plan charges ──────────────────────────────────────────────────────────

  const planCharges: PlanChargeRow[] = (planChargeRows ?? []).map((p) => {
    const status = p.status as string;
    const paymentId = p.payment_id as string | null;
    const isPaid = status === "paid";
    const isPending = status === "pending" || status === "processing";
    const pendingTooLong = isPending && minutesAgo(p.created_at as string) > 1440;
    const missingRef = isPaid && !paymentId;

    let reconStatus: ReconStatus = "ok";
    if (missingRef) reconStatus = "attention";
    if (pendingTooLong) reconStatus = "attention";

    return {
      id:          p.id as string,
      userId:      p.user_id as string,
      userName:    userName(p.user_id as string),
      amount:      Math.abs(Number(p.amount ?? 0)),
      status,
      paymentId,
      description: p.description as string | null,
      processedAt: p.processed_at as string | null,
      createdAt:   p.created_at as string,
      reconStatus,
    };
  });

  // ── Webhooks ──────────────────────────────────────────────────────────────

  const webhooks: WebhookRow[] = (webhookRows ?? []).map((w) => {
    const processedAt = w.processed_at as string | null;
    const error = w.error as string | null;
    const payload = w.payload;
    const relatedId = extractRelatedId(payload);
    let status: WebhookRow["status"] = "processed";
    if (error) status = "error";
    else if (!processedAt) status = "pending";

    return {
      id:          w.id as string,
      eventId:     w.event_id as string | null,
      eventType:   w.event_type as string,
      processedAt,
      error,
      hasPayload:  !!payload,
      relatedId,
      createdAt:   w.created_at as string,
      status,
    };
  });

  // ── Alerts ────────────────────────────────────────────────────────────────

  const alerts: ReconciliationAlert[] = [];

  // Deposit alerts
  for (const d of deposits) {
    if (d.reconStatus === "ok") continue;
    if ((d.status === "pending" || d.status === "processing") && minutesAgo(d.createdAt) > 30) {
      const mins = Math.round(minutesAgo(d.createdAt));
      alerts.push({
        id: alertId("dep-pending", d.id), severity: "warning", type: "deposit",
        description: `Depósito pendente há ${mins < 60 ? `${mins} minutos` : `${Math.round(mins / 60)}h`}.`,
        problem: "PIX recebido não processado",
        impact: "Saldo da agência pode estar incorreto",
        actionLabel: "Ver usuário",
        userId: d.userId, userName: d.userName, amount: d.amount,
        appStatus: d.status, providerStatus: null,
        referenceId: d.asaasPaymentId ?? d.paymentId,
        entityId: d.id,
        createdAt: d.createdAt,
        adminLink: `/admin/users/${d.userId}`,
      });
    }
    if (d.status === "paid" && !d.asaasPaymentId && !d.paymentId) {
      alerts.push({
        id: alertId("dep-noref", d.id), severity: "warning", type: "deposit",
        description: "Depósito pago sem referência Asaas.",
        problem: "Depósito pago sem ID Asaas",
        impact: "Pagamento não rastreável — conciliação impossível",
        actionLabel: "Ver usuário",
        userId: d.userId, userName: d.userName, amount: d.amount,
        appStatus: d.status, providerStatus: null, referenceId: null,
        entityId: d.id,
        createdAt: d.createdAt,
        adminLink: `/admin/users/${d.userId}`,
      });
    }
    if (d.paymentId && (paymentIdCount.get(d.paymentId) ?? 0) > 1) {
      alerts.push({
        id: alertId("dep-dup", d.id), severity: "critical", type: "deposit",
        description: `payment_id duplicado: ${d.paymentId}`,
        problem: "payment_id duplicado detectado",
        impact: "Risco de crédito duplo no saldo do usuário",
        actionLabel: "Ver finanças",
        userId: d.userId, userName: d.userName, amount: d.amount,
        appStatus: d.status, providerStatus: null, referenceId: d.paymentId,
        entityId: d.id,
        createdAt: d.createdAt,
        adminLink: `/admin/finances`,
      });
    }
  }

  // Withdrawal alerts
  for (const w of withdrawals) {
    if (w.reconStatus === "ok") continue;
    if (w.status === "processing" && minutesAgo(w.createdAt) > 1440) {
      const hours = Math.round(minutesAgo(w.createdAt) / 60);
      alerts.push({
        id: alertId("wth-processing", w.id), severity: "critical", type: "withdrawal",
        description: `Saque em processamento há ${hours}h — verificar transferência Asaas.`,
        problem: `Saque em processamento há ${hours}h`,
        impact: "Talento aguarda pagamento — verifique transferência no Asaas",
        actionLabel: "Ver saques",
        userId: w.userId, userName: w.userName, amount: w.amount,
        appStatus: w.status, providerStatus: null,
        referenceId: w.asaasTransferId ?? w.providerTransferId,
        entityId: w.id,
        createdAt: w.createdAt,
        adminLink: `/admin/withdrawals`,
      });
    }
    if (w.status === "paid" && !w.asaasTransferId && !w.providerTransferId && w.provider !== "manual") {
      alerts.push({
        id: alertId("wth-noref", w.id), severity: "warning", type: "withdrawal",
        description: "Saque pago sem ID de transferência Asaas.",
        problem: "Saque pago sem ID de transferência",
        impact: "Não é possível verificar a transferência no Asaas",
        actionLabel: "Ver saques",
        userId: w.userId, userName: w.userName, amount: w.amount,
        appStatus: w.status, providerStatus: null, referenceId: null,
        entityId: w.id,
        createdAt: w.createdAt,
        adminLink: `/admin/withdrawals`,
      });
    }
  }

  // Plan charge alerts
  for (const p of planCharges) {
    if (p.reconStatus === "ok") continue;
    if ((p.status === "pending" || p.status === "processing") && minutesAgo(p.createdAt) > 1440) {
      const hours = Math.round(minutesAgo(p.createdAt) / 60);
      alerts.push({
        id: alertId("plan-pending", p.id), severity: "warning", type: "plan",
        description: `Cobrança de plano pendente há ${hours}h.`,
        problem: `Cobrança de plano pendente há ${hours}h`,
        impact: "Acesso premium pode estar incorreto ou expirado",
        actionLabel: "Ver plano da agência",
        userId: p.userId, userName: p.userName, amount: p.amount,
        appStatus: p.status, providerStatus: null, referenceId: p.paymentId,
        entityId: p.id,
        createdAt: p.createdAt,
        adminLink: `/admin/plans?agency=${p.userId}`,
      });
    }
    if (p.status === "paid" && !p.paymentId) {
      alerts.push({
        id: alertId("plan-noref", p.id), severity: "warning", type: "plan",
        description: "Cobrança de plano paga sem referência de pagamento.",
        problem: "Cobrança paga sem referência Asaas",
        impact: "Pagamento de plano não rastreável no provedor",
        actionLabel: "Ver plano da agência",
        userId: p.userId, userName: p.userName, amount: p.amount,
        appStatus: p.status, providerStatus: null, referenceId: null,
        entityId: p.id,
        createdAt: p.createdAt,
        adminLink: `/admin/plans?agency=${p.userId}`,
      });
    }
  }

  // Webhook alerts
  for (const w of webhooks) {
    if (w.status === "processed") continue;
    if (w.status === "error") {
      alerts.push({
        id: alertId("wh-error", w.id), severity: "critical", type: "webhook",
        description: `Webhook com erro: ${w.error ?? "erro desconhecido"}`,
        problem: `Falha ao processar webhook ${w.eventType}`,
        impact: "Ação automática não foi executada — dados podem estar desatualizados",
        actionLabel: "Ver webhooks",
        userId: null, userName: null, amount: null,
        appStatus: null, providerStatus: null,
        referenceId: w.eventId ?? w.relatedId,
        entityId: w.id,
        createdAt: w.createdAt,
        adminLink: `/admin/reconciliation`,
      });
    } else if (w.status === "pending") {
      const mins = Math.round(minutesAgo(w.createdAt));
      const severity: AlertSeverity = mins > 60 ? "critical" : "warning";
      alerts.push({
        id: alertId("wh-pending", w.id), severity, type: "webhook",
        description: `Webhook ${w.eventType} recebido sem processed_at (${mins < 60 ? `${mins}min` : `${Math.round(mins / 60)}h`}).`,
        problem: `Webhook ${w.eventType} não processado`,
        impact: "Evento ignorado — possível inconsistência nos dados",
        actionLabel: "Ver webhooks",
        userId: null, userName: null, amount: null,
        appStatus: "pending", providerStatus: null,
        referenceId: w.eventId ?? w.relatedId,
        entityId: w.id,
        createdAt: w.createdAt,
        adminLink: `/admin/reconciliation`,
      });
    }
  }

  // Cross-reference: webhook PAYMENT_RECEIVED/CONFIRMED → deposit still pending
  for (const w of webhooks) {
    if (!["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(w.eventType)) continue;
    if (!w.relatedId) continue;
    const deposit = depositByAsaasId.get(w.relatedId);
    if (!deposit) continue;
    const depStatus = deposit.status as string;
    if (depStatus === "pending" || depStatus === "processing") {
      alerts.push({
        id: alertId("xref-dep", w.id), severity: "critical", type: "deposit",
        description: `Pagamento Asaas confirmado (${w.eventType}), mas depósito ainda está ${depStatus} no app.`,
        problem: "PIX confirmado no Asaas mas saldo não creditado",
        impact: "Saldo da agência está incorreto — ação imediata necessária",
        actionLabel: "Ver usuário",
        userId: deposit.user_id as string,
        userName: userName(deposit.user_id as string),
        amount: Number(deposit.amount ?? 0),
        appStatus: depStatus, providerStatus: w.eventType,
        referenceId: w.relatedId,
        entityId: deposit.id as string,
        createdAt: w.createdAt,
        adminLink: `/admin/users/${deposit.user_id}`,
      });
    }
  }

  // Cross-reference: TRANSFER_DONE → withdrawal still processing
  for (const w of webhooks) {
    if (w.eventType !== "TRANSFER_DONE") continue;
    if (!w.relatedId) continue;
    const withdrawal = withdrawalByTransferId.get(w.relatedId);
    if (!withdrawal) continue;
    const wthStatus = withdrawal.status as string;
    if (wthStatus === "processing") {
      alerts.push({
        id: alertId("xref-wth", w.id), severity: "critical", type: "withdrawal",
        description: "Transferência Asaas concluída, mas saque ainda está em processamento no app.",
        problem: "Transferência concluída no Asaas mas saque pendente no app",
        impact: "Talento não recebeu notificação — status desatualizado",
        actionLabel: "Ver saques",
        userId: withdrawal.user_id as string,
        userName: userName(withdrawal.user_id as string),
        amount: Number(withdrawal.amount ?? 0),
        appStatus: wthStatus, providerStatus: "TRANSFER_DONE",
        referenceId: w.relatedId,
        entityId: withdrawal.id as string,
        createdAt: w.createdAt,
        adminLink: `/admin/withdrawals`,
      });
    }
  }

  // Sort alerts: critical first
  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  const summary: ReconciliationSummary = {
    depositsOk:       deposits.filter((d) => d.reconStatus === "ok").length,
    depositsAlert:    deposits.filter((d) => d.reconStatus !== "ok").length,
    withdrawalsOk:    withdrawals.filter((w) => w.reconStatus === "ok").length,
    withdrawalsAlert: withdrawals.filter((w) => w.reconStatus !== "ok").length,
    planChargesOk:    planCharges.filter((p) => p.reconStatus === "ok" && p.status === "paid").length,
    webhooksPending:  webhooks.filter((w) => w.status !== "processed").length,
  };

  return { summary, alerts, deposits, withdrawals, planCharges, webhooks };
}
