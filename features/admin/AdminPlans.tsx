"use client";

import { useState } from "react";
import { brl } from "@/lib/brl";
import type { Plan } from "@/lib/plans";
import { premiumSeatHighlights } from "@/lib/planSettings.shared";
import { useT } from "@/lib/LanguageContext";

export type AdminPlansCharge = {
  id: string;
  createdAt: string;
  planName: string;
  amount: number;
  status: string;
  provider: string;
  paymentId: string | null;
  processedAt: string | null;
  invoiceUrl: string | null;
  description: string | null;
};

export type AdminPlansAgency = {
  id: string;
  email: string | null;
  agencyName: string;
  contactName: string | null;
  currentPlan: Plan;
  currentPlanLabel: string;
  planStatus: string;
  accountActive: boolean;
  nextChargeDate: string | null;
  lastPaidAt: string | null;
  asaasCustomerId: string | null;
  asaasSubscriptionId: string | null;
  totalPaid: number;
  paidChargeCount: number;
  paidCharges: AdminPlansCharge[];
  pendingCharges: AdminPlansCharge[];
  failedCharges: AdminPlansCharge[];
  activeJobCount: number;
  isOrphan: boolean;
  orphanReason: string | null;
  paymentMode: "internal" | "escrow" | null;
  commissionOverride: number | null;
  escrowEnabled: boolean | null;
};

export type PlanSetting = {
  plan_key: Plan;
  name: string;
  price: number;
  commission_percent: number;
  is_available: boolean;
  job_limit: number | null;
  max_hires_per_job: number | null;
  included_agent_seats: number | null;
  extra_agent_seat_price: number | null;
};

export type PlanSettingHistoryEntry = {
  id: string;
  plan_key: string;
  changed_by: string;
  changed_by_email: string | null;
  changed_at: string;
  old_price: number;
  new_price: number;
  old_commission_percent: number;
  new_commission_percent: number;
  old_is_available: boolean;
  new_is_available: boolean;
  old_job_limit: number | null;
  new_job_limit: number | null;
  old_included_agent_seats: number | null;
  new_included_agent_seats: number | null;
  old_extra_agent_seat_price: number | null;
  new_extra_agent_seat_price: number | null;
};

type AdminPlansProps = {
  agencies: AdminPlansAgency[];
  summary: {
    freeCount: number;
    proCount: number;
    premiumCount: number;
    totalRevenuePaid: number;
    pendingChargeCount: number;
    pendingChargeAmount: number;
    failedChargeCount: number;
  };
  planSettings: PlanSetting[];
  planHistory: PlanSettingHistoryEntry[];
  activeByPlan: { free: number; pro: number; premium: number };
};

const PLAN_OPTIONS: Array<{ value: "all" | Plan; label: string }> = [
  { value: "all", label: "Todos os planos" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "premium", label: "Premium" },
];

const STATUS_OPTIONS = [
  "all", "active", "inactive", "pending", "cancelled", "canceled", "past_due", "overdue", "trialing",
] as const;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function planStatusLabel(status: string) {
  switch (status) {
    case "active":    return "Ativo";
    case "inactive":  return "Inativo";
    case "pending":   return "Pendente";
    case "cancelled":
    case "canceled":  return "Cancelado";
    case "past_due":
    case "overdue":   return "Em atraso";
    case "trialing":  return "Em teste";
    default:          return status ? status.replaceAll("_", " ") : "—";
  }
}

function chargeStatusLabel(status: string) {
  switch (status) {
    case "paid":             return "Pago";
    case "pending":          return "Pendente";
    case "processing":       return "Processando";
    case "awaiting_payment":
    case "pending_payment":  return "Aguardando pagamento";
    case "failed":           return "Falha";
    case "cancelled":
    case "canceled":         return "Cancelado";
    case "past_due":
    case "overdue":          return "Em atraso";
    default:                 return status ? status.replaceAll("_", " ") : "—";
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
    case "paid":          return "badge-success";
    case "pending":
    case "processing":
    case "awaiting_payment":
    case "pending_payment":
    case "trialing":      return "badge-pending";
    case "cancelled":
    case "canceled":
    case "failed":
    case "past_due":
    case "overdue":       return "badge-error";
    default:              return "badge-info";
  }
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`card p-5 ${accent ? "border-rose-200 bg-rose-50" : ""}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-widest mb-1 ${accent ? "text-rose-400" : "text-[#647B7B]"}`}>{label}</p>
      <p className={`text-[1.5rem] font-semibold tracking-tight leading-none ${accent ? "text-rose-600" : "text-[#1F2D2E]"}`}>{value}</p>
      {sub ? <p className={`text-[12px] mt-1.5 ${accent ? "text-rose-400" : "text-[#647B7B]"}`}>{sub}</p> : null}
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-[#DDE6E6] bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1">{label}</p>
      <p className={`text-[13px] text-[#1F2D2E] ${mono ? "font-mono break-all" : "font-medium"}`}>{value || "—"}</p>
    </div>
  );
}

function ChargeSection({ title, charges }: { title: string; charges: AdminPlansCharge[] }) {
  if (charges.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-[#1F2D2E]">{title}</p>
        <p className="text-[11px] text-[#647B7B]">{charges.length} registro{charges.length !== 1 ? "s" : ""}</p>
      </div>
      <div className="space-y-3">
        {charges.map((charge) => (
          <div key={charge.id} className="rounded-2xl border border-[#DDE6E6] bg-[#F8FAFC] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-semibold text-[#1F2D2E]">{charge.planName}</p>
                  <span className={statusBadgeClass(charge.status)}>{chargeStatusLabel(charge.status)}</span>
                </div>
                <p className="text-[12px] text-[#647B7B]">{formatDateTime(charge.createdAt)}</p>
                {charge.description ? <p className="text-[12px] text-[#647B7B]">{charge.description}</p> : null}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-[15px] font-semibold text-[#0E7C86] tabular-nums">{brl(charge.amount)}</p>
                {charge.invoiceUrl ? (
                  <a href={charge.invoiceUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center rounded-xl border border-[#DDE6E6] bg-white px-3 py-2 text-[12px] font-semibold text-[#0E7C86] hover:bg-[#E6F0F0] transition-colors">
                    Comprovante
                  </a>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DetailRow label="Data" value={formatDate(charge.createdAt)} />
              <DetailRow label="Hora" value={formatDateTime(charge.createdAt).split(" ").slice(-1)[0] ?? "—"} />
              <DetailRow label="Provedor" value={charge.provider || "ASAAS"} />
              <DetailRow label="Pago / processado em" value={formatDateTime(charge.processedAt)} />
              <DetailRow label="Pagamento Asaas" value={charge.paymentId ?? "—"} mono />
              <DetailRow label="Referencia" value={charge.id} mono />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Plan Settings Editor ──────────────────────────────────────────────────────

const PLAN_KEY_ORDER: Plan[] = ["free", "pro", "premium"];

const PLAN_THEME: Record<string, { border: string; badge: string; label: string }> = {
  free:    { border: "border-[#DDE6E6]",     badge: "bg-zinc-100 text-zinc-600",                       label: "Free" },
  pro:     { border: "border-[#1ABC9C]/30",  badge: "bg-[#E6F7F4] text-[#0E7C86]",                    label: "Pro" },
  premium: { border: "border-amber-200",     badge: "bg-amber-50 text-amber-700",                      label: "Premium" },
};

function PlanSettingsSection({
  initialSettings,
  activeByPlan,
  history,
}: {
  initialSettings: PlanSetting[];
  activeByPlan: { free: number; pro: number; premium: number };
  history: PlanSettingHistoryEntry[];
}) {
  const [settings, setSettings] = useState<PlanSetting[]>(
    PLAN_KEY_ORDER.map((key) => {
      const found = initialSettings.find((s) => s.plan_key === key);
      return found ?? {
        plan_key: key,
        name: key,
        price: 0,
        commission_percent: 0,
        is_available: true,
        job_limit: null,
        max_hires_per_job: null,
        included_agent_seats: key === "premium" ? 2 : null,
        extra_agent_seat_price: key === "premium" ? 0 : null,
      };
    }),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  function updateSetting(index: number, field: keyof PlanSetting, value: unknown) {
    setSettings((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
    setSaveSuccess(false);
    setSaveError(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/admin/plans/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) setSaveError(data.error ?? "Erro ao salvar configurações.");
      else setSaveSuccess(true);
    } catch {
      setSaveError("Erro de rede ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }

  const totalActive = activeByPlan.free + activeByPlan.pro + activeByPlan.premium;

  return (
    <div className="card p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold text-[#1F2D2E]">Configuração de Planos</h2>
          <p className="text-[13px] text-[#647B7B] mt-0.5">
            Fonte canônica de preço e comissão para novas assinaturas e contratos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl border border-[#DDE6E6] bg-white px-3 py-2 text-[12px] font-semibold text-[#647B7B] hover:bg-[#F8FAFC] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Histórico {history.length > 0 ? `(${history.length})` : ""}
        </button>
      </div>

      {/* Warning */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-[12px] text-amber-700 leading-relaxed">
          <strong>Atenção:</strong> alterações de preço afetam <strong>novas assinaturas imediatamente</strong> e atualizam o valor da próxima cobrança no Asaas para assinantes ativos.{" "}
          {totalActive > 0 && (
            <span>Há <strong>{totalActive} agência{totalActive !== 1 ? "s" : ""} com plano ativo</strong> — elas receberão uma notificação in-app ao salvar.</span>
          )}
          {" "}Faturas já pagas não são afetadas.
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[12px] leading-relaxed text-zinc-600">
        Alterações afetam novos espaços Premium. Espaços existentes podem ser ajustados em /admin/premium.
      </div>

      {/* Plan cards */}
      <div className="space-y-4">
        {settings.map((setting, index) => {
          const theme = PLAN_THEME[setting.plan_key] ?? PLAN_THEME.free;
          const activeCount = activeByPlan[setting.plan_key as keyof typeof activeByPlan] ?? 0;
          const isPremium = setting.plan_key === "premium";
          const premiumHighlights = isPremium ? premiumSeatHighlights(setting) : [];

          return (
            <div key={setting.plan_key} className={`rounded-2xl border-2 ${theme.border} bg-white p-5`}>
              <div className="flex items-center gap-3 mb-5">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-bold ${theme.badge}`}>
                  {theme.label}
                </span>
                {activeCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F7F4] border border-[#1ABC9C]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[#0E7C86]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1ABC9C]" />
                    {activeCount} ativa{activeCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div className={`grid grid-cols-2 gap-4 ${isPremium ? "lg:grid-cols-7" : "lg:grid-cols-5"}`}>
                {/* Price — fixed R$ prefix with flex, no absolute overlap */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1.5">
                    Preço (BRL)
                  </label>
                  <div className="flex items-stretch rounded-xl border border-zinc-200 overflow-hidden focus-within:border-[#0E7C86] transition-colors">
                    <span className="flex items-center px-3 text-[13px] font-medium text-zinc-500 bg-zinc-50 border-r border-zinc-200 select-none flex-shrink-0">
                      R$
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={setting.price}
                      onChange={(e) => updateSetting(index, "price", Number(e.target.value))}
                      className="flex-1 min-w-0 px-3 py-2.5 text-[13px] text-[#1F2D2E] bg-white focus:outline-none"
                    />
                  </div>
                </div>

                {/* Commission */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1.5">
                    Comissão
                  </label>
                  <div className="flex items-stretch rounded-xl border border-zinc-200 overflow-hidden focus-within:border-[#0E7C86] transition-colors">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={setting.commission_percent}
                      onChange={(e) => updateSetting(index, "commission_percent", Number(e.target.value))}
                      className="flex-1 min-w-0 px-3 py-2.5 text-[13px] text-[#1F2D2E] bg-white focus:outline-none"
                    />
                    <span className="flex items-center px-3 text-[13px] font-medium text-zinc-500 bg-zinc-50 border-l border-zinc-200 select-none flex-shrink-0">
                      %
                    </span>
                  </div>
                </div>

                {/* Job limit */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1.5">
                    Limite de vagas
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Ilimitado"
                    value={setting.job_limit === null ? "" : setting.job_limit}
                    onChange={(e) => updateSetting(index, "job_limit", e.target.value === "" ? null : Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] text-[#1F2D2E] focus:outline-none focus:border-[#0E7C86] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1.5">
                    Max. contratacoes
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Ilimitado"
                    value={setting.max_hires_per_job === null ? "" : setting.max_hires_per_job}
                    onChange={(e) => updateSetting(index, "max_hires_per_job", e.target.value === "" ? null : Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] text-[#1F2D2E] focus:outline-none focus:border-[#0E7C86] transition-colors"
                  />
                </div>

                {/* Availability */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1.5">
                    Disponível
                  </label>
                  <button
                    type="button"
                    onClick={() => updateSetting(index, "is_available", !setting.is_available)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-[13px] font-semibold transition-all ${
                      setting.is_available
                        ? "border-[#1ABC9C]/40 bg-[#E6F7F4] text-[#0E7C86]"
                        : "border-zinc-200 bg-zinc-50 text-zinc-400"
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${setting.is_available ? "bg-[#1ABC9C]" : "bg-zinc-300"}`} />
                    {setting.is_available ? "Ativo" : "Inativo"}
                  </button>
                </div>

                {isPremium ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1.5">
                        Agentes incluídos
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={setting.included_agent_seats === null ? "" : setting.included_agent_seats}
                        onChange={(e) => updateSetting(index, "included_agent_seats", e.target.value === "" ? null : Number(e.target.value))}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[13px] text-[#1F2D2E] focus:outline-none focus:border-[#0E7C86] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1.5">
                        Assento extra
                      </label>
                      <div className="flex items-stretch rounded-xl border border-zinc-200 overflow-hidden focus-within:border-[#0E7C86] transition-colors">
                        <span className="flex items-center px-3 text-[13px] font-medium text-zinc-500 bg-zinc-50 border-r border-zinc-200 select-none flex-shrink-0">
                          R$
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={setting.extra_agent_seat_price === null ? "" : setting.extra_agent_seat_price}
                          onChange={(e) => updateSetting(index, "extra_agent_seat_price", e.target.value === "" ? null : Number(e.target.value))}
                          className="flex-1 min-w-0 px-3 py-2.5 text-[13px] text-[#1F2D2E] bg-white focus:outline-none"
                          placeholder="Sob consulta"
                        />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {isPremium ? (
                <div className="mt-4 space-y-2">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-700">
                    Assentos extras são controlados manualmente nesta versão. Cobrança automática será adicionada depois.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {premiumHighlights.map((item) => (
                      <span key={item} className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-medium text-zinc-600">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0E7C86] text-white text-[13px] font-semibold hover:bg-[#0A6B74] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Salvando…
            </>
          ) : "Salvar configurações"}
        </button>
        {saveSuccess && (
          <div className="flex items-center gap-2 text-[#0E7C86]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-[13px] font-semibold">Salvo com sucesso</span>
          </div>
        )}
        {saveError && <p className="text-[13px] text-rose-600 font-medium">{saveError}</p>}
      </div>

      {/* Audit history */}
      {showHistory && (
        <div className="pt-2 border-t border-[#DDE6E6]">
          <p className="text-[13px] font-semibold text-[#1F2D2E] mb-3">Histórico de alterações</p>
          {history.length === 0 ? (
            <p className="text-[13px] text-[#647B7B]">Nenhuma alteração registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => {
                const priceChanged = entry.old_price !== entry.new_price;
                const commChanged = entry.old_commission_percent !== entry.new_commission_percent;
                const availChanged = entry.old_is_available !== entry.new_is_available;
                const includedSeatsChanged = entry.old_included_agent_seats !== entry.new_included_agent_seats;
                const extraSeatPriceChanged = entry.old_extra_agent_seat_price !== entry.new_extra_agent_seat_price;
                return (
                  <div key={entry.id} className="rounded-xl border border-[#DDE6E6] bg-[#F8FAFC] px-4 py-3">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-bold text-[#1F2D2E] uppercase">{entry.plan_key}</span>
                          {priceChanged && (
                            <span className="text-[11px] text-[#647B7B]">
                              Preço: <span className="font-mono">{brl(entry.old_price)}</span> → <span className="font-mono font-semibold text-[#0E7C86]">{brl(entry.new_price)}</span>
                            </span>
                          )}
                          {commChanged && (
                            <span className="text-[11px] text-[#647B7B]">
                              Comissão: {entry.old_commission_percent}% → <span className="font-semibold text-[#0E7C86]">{entry.new_commission_percent}%</span>
                            </span>
                          )}
                          {availChanged && (
                            <span className="text-[11px] text-[#647B7B]">
                              Disponível: {entry.old_is_available ? "Sim" : "Não"} → <span className="font-semibold text-[#0E7C86]">{entry.new_is_available ? "Sim" : "Não"}</span>
                            </span>
                          )}
                          {includedSeatsChanged && (
                            <span className="text-[11px] text-[#647B7B]">
                              Agentes incluídos: {entry.old_included_agent_seats ?? "—"} → <span className="font-semibold text-[#0E7C86]">{entry.new_included_agent_seats ?? "—"}</span>
                            </span>
                          )}
                          {extraSeatPriceChanged && (
                            <span className="text-[11px] text-[#647B7B]">
                              Assento extra: {entry.old_extra_agent_seat_price != null ? brl(entry.old_extra_agent_seat_price) : "Sob consulta"} → <span className="font-semibold text-[#0E7C86]">{entry.new_extra_agent_seat_price != null ? brl(entry.new_extra_agent_seat_price) : "Sob consulta"}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#647B7B] font-mono">
                          {entry.changed_by_email ?? entry.changed_by}
                        </p>
                      </div>
                      <p className="text-[11px] text-[#7FA9A8] flex-shrink-0">{formatDateTime(entry.changed_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

// ── All-agencies pending charges list ────────────────────────────────────────

function AllPendingCharges({ agencies }: { agencies: AdminPlansAgency[] }) {
  const [open, setOpen] = useState(false);
  const allPending = agencies.flatMap((a) =>
    a.pendingCharges.map((c) => ({ ...c, agencyName: a.agencyName, agencyEmail: a.email }))
  );
  if (allPending.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#F8FAFC] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-[#1F2D2E]">Cobranças pendentes</span>
          <span className="badge-pending">{allPending.length}</span>
        </div>
        <svg className={`w-4 h-4 text-[#7FA9A8] transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-[#DDE6E6]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#DDE6E6] bg-[#F8FAFC]">
                  <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">Agência</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">Plano</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] hidden sm:table-cell">Referência</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">Valor</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">Status</th>
                  <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] hidden md:table-cell">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDE6E6]">
                {allPending.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-6 py-3">
                      <p className="text-[13px] font-semibold text-[#1F2D2E] truncate max-w-[160px]">{c.agencyName}</p>
                      {c.agencyEmail && <p className="text-[11px] text-[#647B7B] font-mono truncate max-w-[160px]">{c.agencyEmail}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] text-[#1F2D2E]">{c.planName}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="font-mono text-[11px] text-[#647B7B]">{c.paymentId ?? c.id.slice(0, 12) + "…"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[13px] font-semibold text-[#0E7C86] tabular-nums">{brl(c.amount)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusBadgeClass(c.status)}>{chargeStatusLabel(c.status)}</span>
                    </td>
                    <td className="px-6 py-3 hidden md:table-cell">
                      <span className="text-[12px] text-[#647B7B]">{formatDate(c.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPlans({ agencies, summary, planSettings, planHistory, activeByPlan }: AdminPlansProps) {
  const { t } = useT();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | Plan>("all");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [ownerFilter, setOwnerFilter] = useState<"active_only" | "orphan" | "all">("active_only");
  const [expandedAgencyId, setExpandedAgencyId] = useState<string | null>(agencies[0]?.id ?? null);

  const freeJobLimit = planSettings.find((s) => s.plan_key === "free")?.job_limit ?? 1;

  const filteredAgencies = agencies.filter((agency) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      agency.agencyName.toLowerCase().includes(query) ||
      (agency.contactName ?? "").toLowerCase().includes(query) ||
      (agency.email ?? "").toLowerCase().includes(query);
    const matchesPlan = planFilter === "all" || agency.currentPlan === planFilter;
    const matchesStatus =
      statusFilter === "all" ||
      agency.planStatus === statusFilter ||
      (statusFilter === "cancelled" && agency.planStatus === "canceled") ||
      (statusFilter === "canceled" && agency.planStatus === "cancelled") ||
      (statusFilter === "past_due" && agency.planStatus === "overdue") ||
      (statusFilter === "overdue" && agency.planStatus === "past_due");
    const matchesOwner =
      ownerFilter === "all" ||
      (ownerFilter === "active_only" && !agency.isOrphan) ||
      (ownerFilter === "orphan" && agency.isOrphan);
    return matchesSearch && matchesPlan && matchesStatus && matchesOwner;
  });

  return (
    <div className="max-w-7xl space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1">Admin da Plataforma</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#1F2D2E] leading-tight">Planos</h1>
          <p className="text-[13px] text-[#647B7B] mt-1">Gerencie preços, comissões e acompanhe cobranças de agências.</p>
        </div>
        <div className="rounded-2xl border border-[#DDE6E6] bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">Agencias visiveis</p>
          <p className="text-[1.25rem] font-semibold text-[#1F2D2E]">{filteredAgencies.length}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Free" value={String(summary.freeCount)} />
        <SummaryCard label="Pro" value={String(summary.proCount)} />
        <SummaryCard label="Premium" value={String(summary.premiumCount)} />
        <SummaryCard label="Receita paga" value={brl(summary.totalRevenuePaid)} />
        <SummaryCard
          label="Cobranças pendentes"
          value={String(summary.pendingChargeCount)}
          sub={summary.pendingChargeCount > 0 ? brl(summary.pendingChargeAmount) : undefined}
        />
        <SummaryCard
          label="Cobranças com falha"
          value={String(summary.failedChargeCount)}
          accent={summary.failedChargeCount > 0}
        />
      </div>

      {/* Pending charges list */}
      {summary.pendingChargeCount > 0 && <AllPendingCharges agencies={agencies} />}

      {/* Plan settings editor */}
      <PlanSettingsSection
        initialSettings={planSettings}
        activeByPlan={activeByPlan}
        history={planHistory}
      />

      {/* Filter bar */}
      <div className="card p-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px_220px_220px]">
          <div className="flex items-center gap-2 rounded-xl border border-[#DDE6E6] bg-white px-3 py-2.5 focus-within:border-[#1ABC9C] focus-within:ring-2 focus-within:ring-[#1ABC9C]/20 transition-colors">
            <svg className="h-4 w-4 text-[#7FA9A8] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por agência, contato ou email"
              className="flex-1 min-w-0 bg-transparent text-[13px] text-[#1F2D2E] placeholder-[#7FA9A8] outline-none"
            />
          </div>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value as "all" | Plan)} className="input-base">
            {PLAN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_OPTIONS)[number])} className="input-base">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "Todos os status" : planStatusLabel(s)}</option>
            ))}
          </select>
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value as "active_only" | "orphan" | "all")} className="input-base">
            <option value="active_only">Apenas válidas</option>
            <option value="orphan">Apenas órfãs</option>
            <option value="all">Todas</option>
          </select>
        </div>
      </div>

      {/* Agency list */}
      <div className="space-y-4">
        {filteredAgencies.map((agency) => {
          const isExpanded = expandedAgencyId === agency.id;
          const totalHistoryCount = agency.paidCharges.length + agency.pendingCharges.length + agency.failedCharges.length;

          return (
            <div key={agency.id} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedAgencyId(isExpanded ? null : agency.id)}
                className="w-full px-6 py-5 text-left hover:bg-[#F8FAFC] transition-colors"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[16px] font-semibold text-[#1F2D2E]">{agency.agencyName}</h2>
                      <span className={agency.accountActive ? "badge-success" : "badge-error"}>{agency.accountActive ? "Ativo" : "Inativo"}</span>
                      {agency.isOrphan ? (
                        <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                          Agência órfã
                        </span>
                      ) : null}
                      <span className="badge-info">{agency.currentPlanLabel}</span>
                      {agency.currentPlan === "free" && freeJobLimit !== null && agency.activeJobCount >= freeJobLimit && (
                        <span className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">
                          {agency.activeJobCount}/{freeJobLimit} vaga usada
                        </span>
                      )}
                    </div>
                    {agency.contactName ? <p className="text-[12px] text-[#647B7B]">Responsavel: {agency.contactName}</p> : null}
                    {agency.email ? <p className="text-[12px] text-[#647B7B] font-mono">{agency.email}</p> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 xl:min-w-[720px]">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1">Proxima cobranca</p>
                      <p className="text-[13px] font-medium text-[#1F2D2E]">{formatDate(agency.nextChargeDate)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1">Ultimo pagamento</p>
                      <p className="text-[13px] font-medium text-[#1F2D2E]">{formatDate(agency.lastPaidAt)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1">Total pago</p>
                      <p className="text-[13px] font-semibold text-[#0E7C86] tabular-nums">{brl(agency.totalPaid)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1">Pagas</p>
                      <p className="text-[13px] font-medium text-[#1F2D2E]">{agency.paidChargeCount}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#647B7B] mb-1">Historico</p>
                      <p className="text-[13px] font-medium text-[#1F2D2E]">{totalHistoryCount} registro{totalHistoryCount !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                </div>
              </button>

              {isExpanded ? (
                <ExpandedAgencyPanel agency={agency} isExpanded={isExpanded} />
              ) : null}
            </div>
          );
        })}
        {filteredAgencies.length === 0 ? (
          <div className="card px-6 py-14 text-center">
            <p className="text-[14px] font-semibold text-[#647B7B]">Nenhuma agencia encontrada</p>
            <p className="text-[12px] text-[#7FA9A8] mt-1">Ajuste a busca ou os filtros para ver outros planos.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ExpandedAgencyPanel({ agency }: { agency: AdminPlansAgency; isExpanded: boolean }) {
  const [paymentMode, setPaymentMode] = useState<"internal" | "escrow">(agency.paymentMode ?? "escrow");
  const [commissionOverride, setCommissionOverride] = useState<string>(agency.commissionOverride !== null ? String(agency.commissionOverride) : "");
  const [escrowEnabled, setEscrowEnabled] = useState<boolean>(agency.escrowEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function handleSaveConfig() {
    setSaving(true);
    setSaveMsg(null);
    const body: Record<string, unknown> = {
      payment_mode: paymentMode,
      commission_percent_override: commissionOverride === "" ? null : Number(commissionOverride),
      escrow_enabled: paymentMode === "escrow" ? escrowEnabled : false,
    };
    const res = await fetch(`/api/admin/agencies/${agency.id}/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setSaveMsg(res.ok ? "Salvo com sucesso." : "Erro ao salvar.");
  }

  const totalHistoryCount =
    agency.paidCharges.length + agency.pendingCharges.length + agency.failedCharges.length;

  return (
                <div className="border-t border-[#DDE6E6] px-6 py-5 space-y-6 bg-[#FCFDFD]">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <DetailRow label="Asaas customer id" value={agency.asaasCustomerId ?? "—"} mono />
                    <DetailRow label="Asaas subscription id" value={agency.asaasSubscriptionId ?? "—"} mono />
                    <DetailRow label="Plano atual" value={agency.currentPlanLabel} />
                    <DetailRow label="Status do plano" value={planStatusLabel(agency.planStatus)} />
                    {agency.email ? <DetailRow label="Email" value={agency.email} mono /> : null}
                  </div>

                  {/* Payment config editor */}
                  <div className="rounded-2xl border border-[#DDE6E6] bg-white px-5 py-4 space-y-4">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#647B7B]">Configuração de pagamento</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1.5">Modo de pagamento</label>
                        <select
                          value={paymentMode}
                          onChange={(e) => setPaymentMode(e.target.value as "internal" | "escrow")}
                          className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#0E7C86]"
                        >
                          <option value="internal">Internal (sem custódia)</option>
                          <option value="escrow">Escrow (custódia BrisaHub)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-600 mb-1.5">Comissão override (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={commissionOverride}
                          onChange={(e) => setCommissionOverride(e.target.value)}
                          placeholder="— (usar padrão do plano)"
                          className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#0E7C86]"
                        />
                      </div>
                      {paymentMode === "escrow" && (
                        <div className="flex items-center gap-2 self-end pb-1.5">
                          <input
                            type="checkbox"
                            id={`escrow-${agency.id}`}
                            checked={escrowEnabled}
                            onChange={(e) => setEscrowEnabled(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          <label htmlFor={`escrow-${agency.id}`} className="text-[13px] font-medium text-zinc-700 cursor-pointer">
                            Custódia habilitada
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSaveConfig}
                        disabled={saving}
                        className="px-4 py-1.5 rounded-lg bg-[#0E7C86] hover:bg-[#0a6870] text-white text-[12px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {saving ? "Salvando…" : "Salvar configuração"}
                      </button>
                      {saveMsg && <p className={`text-[12px] font-medium ${saveMsg.startsWith("Erro") ? "text-rose-600" : "text-emerald-600"}`}>{saveMsg}</p>}
                    </div>
                  </div>
                  {totalHistoryCount > 0 ? (
                    <div className="space-y-6">
                      <ChargeSection title="Pagas" charges={agency.paidCharges} />
                      <ChargeSection title="Pendentes" charges={agency.pendingCharges} />
                      <ChargeSection title="Falhas/Canceladas" charges={agency.failedCharges} />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#DDE6E6] bg-white px-6 py-10 text-center">
                      <p className="text-[14px] font-semibold text-[#647B7B]">Nenhuma cobranca de plano encontrada</p>
                      <p className="text-[12px] text-[#7FA9A8] mt-1">Este painel mostra apenas registros ja existentes em wallet_transactions.</p>
                    </div>
                  )}
                </div>
  );
}
