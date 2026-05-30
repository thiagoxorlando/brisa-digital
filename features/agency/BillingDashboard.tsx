"use client";

import { useEffect, useState } from "react";
import { useSubscription } from "@/lib/SubscriptionContext";
import { PLAN_DEFINITIONS, type Plan } from "@/lib/plans";
import { brl } from "@/lib/brl";
import { buildPlanSettingsFallback, formatPlanPricing, planLimitHighlights, premiumSeatHighlights, type PublicPlanSetting } from "@/lib/planSettings.shared";
import { formatPlanPrice } from "@/lib/planSettings.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlanCharge {
  id: string;
  amount: number;
  description: string | null;
  created_at: string;
  status: string | null;
  asaas_payment_id: string | null;
  invoice_url: string | null;
  provider: string | null;
}

interface Props {
  plan: string;
  planStatus: string | null;
  planExpiresAt: string | null;
  planCharges: PlanCharge[];
  nextChargeDate: string | null;
  trialEndsAt?: string | null;
  proTrialEnabled?: boolean;
  proTrialDays?: number;
  /** True when this agency has already used their one-time PRO trial. */
  proTrialUsed?: boolean;
  /** Current intro_cycles_remaining from the profile row (null = no intro, 0 = done). */
  introCyclesRemaining?: number | null;
  /** Unused for Stripe flow — kept for Asaas backward compatibility. */
  checkoutDefaults?: {
    email?: string;
    holderName?: string;
    cpfCnpj?: string;
    phone?: string;
  };
}

type PlanChangeResponse = {
  effectiveAt?: string;
  url?: string;
  provider?: string;
  mode?: string;
  planStatus?: string;
  trialEndsAt?: string | null;
  nextChargeDate?: string | null;
};

// ── Plan definitions (UI only) ────────────────────────────────────────────────

const PLANS = [
  {
    key: "free" as const,
    name: PLAN_DEFINITIONS.free.label,
    price: PLAN_DEFINITIONS.free.price,
    period: "",
    badge: null,
    gradient: "from-zinc-300 to-zinc-400",
    headline: "Para conhecer a plataforma",
    features: [
      "1 vaga ativa",
      "Ate 3 contratacoes por vaga",
      "Contratos digitais",
    ],
  },
  {
    key: "pro" as const,
    name: PLAN_DEFINITIONS.pro.label,
    price: PLAN_DEFINITIONS.pro.price,
    period: "/mes",
    badge: "POPULAR" as const,
    gradient: "from-indigo-500 to-violet-600",
    headline: "Operacao completa sem limites",
    features: [
      "Vagas ilimitadas",
      "Contratacoes ilimitadas",
      "Upload de comprovantes de pagamento",
      "Historico completo de contratos",
    ],
  },
  {
    key: "premium" as const,
    name: PLAN_DEFINITIONS.premium.label,
    price: PLAN_DEFINITIONS.premium.price,
    period: "",
    badge: null,
    gradient: "from-violet-500 to-purple-700",
    headline: "Espaço Premium para operação privada da agência",
    features: [
      "Espaço Premium com branding próprio",
      "Vagas privadas por convite",
      "Gestão de equipe e assentos",
      "Controle de limites por agente",
    ],
  },
] as const;

type PlanKey = Plan;
type PlanDef = typeof PLANS[number];

type LivePlanMap = Record<string, PublicPlanSetting>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBillingReturnBanner(): "success" | "canceled" | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  // Stripe return: ?stripe=success or legacy ?success=true
  if (params.get("stripe") === "success" || params.get("success") === "true") return "success";
  if (params.get("canceled") === "true") return "canceled";
  return null;
}

function fmtDate(s: string | Date) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(s: string | Date) {
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getPlanDef(planKey: PlanKey) {
  return PLANS.find((plan) => plan.key === planKey) ?? PLANS[0];
}

function planStatusLabel(status: string | null) {
  switch (status) {
    case "active":    return "Ativo";
    case "inactive":  return "Inativo";
    case "pending":   return "Pendente";
    case "cancelled":
    case "canceled":  return "Cancelado";
    case "past_due":
    case "overdue":   return "Em atraso";
    case "trialing":  return "Em teste";
    case "paused":    return "Pausado";
    case "cancelling": return "Cancelamento agendado";
    default:          return "Indisponível";
  }
}

function chargeStatusLabel(status: string | null) {
  switch (status) {
    case "paid":      return "Pago";
    case "pending":   return "Pendente";
    case "overdue":
    case "past_due":  return "Em atraso";
    case "failed":    return "Falhou";
    case "cancelled": return "Cancelado";
    default:          return status ?? "—";
  }
}

function chargeStatusColor(status: string | null) {
  switch (status) {
    case "paid":    return "text-emerald-700 bg-emerald-50";
    case "pending": return "text-amber-700 bg-amber-50";
    case "overdue":
    case "past_due":
    case "failed":  return "text-rose-700 bg-rose-50";
    default:        return "text-zinc-600 bg-zinc-100";
  }
}

// ── Comprovante modal ─────────────────────────────────────────────────────────

function ReceiptModal({ charge, onClose }: { charge: PlanCharge; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 px-6 py-5 text-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-widest opacity-80">BrisaHub</span>
            <button onClick={onClose} className="opacity-70 hover:opacity-100 transition-opacity cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-[17px] font-semibold">Comprovante de assinatura</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          <Row label="Plano" value={charge.description ?? "Assinatura BrisaHub"} />
          <Row label="Valor" value={brl(charge.amount)} />
          <Row
            label="Status"
            value={chargeStatusLabel(charge.status)}
            valueClass={charge.status === "paid" ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}
          />
          <Row label="Data" value={fmtDateTime(charge.created_at)} />
          {charge.asaas_payment_id && (
            <Row label="ID Asaas" value={charge.asaas_payment_id} mono />
          )}
          <Row label="Provedor" value="Asaas" />
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-2 flex gap-3">
          {charge.invoice_url && (
            <a
              href={charge.invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
            >
              Ver fatura Asaas
            </a>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-[13px]">
      <span className="text-zinc-400 flex-shrink-0">{label}</span>
      <span className={["text-zinc-800 text-right break-all", mono ? "font-mono text-[11px]" : "", valueClass ?? ""].join(" ")}>
        {value}
      </span>
    </div>
  );
}

// ── Plan change modal ─────────────────────────────────────────────────────────

interface ModalProps {
  plan: PlanDef;
  currentPlanKey: PlanKey;
  currentPrice: number;
  planExpiresAt: string | null;
  onSuccess: (newPlan: PlanKey, result: PlanChangeResponse) => void;
  onUnavailable: (message: string) => void;
  onClose: () => void;
}

function PlanChangeModal({
  plan,
  displayName,
  displayPriceLabel,
  onUnavailable,
  onClose,
}: Pick<ModalProps, "plan" | "onUnavailable" | "onClose"> & { displayName: string; displayPriceLabel: string }) {
  const isToFree = plan.key === "free";
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitting(false);
    onClose();
    onUnavailable("Alteração de plano pelo painel ainda não está disponível. Entre em contato com o suporte.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-zinc-100">
          <div>
            <div className={`h-[3px] w-12 rounded-full bg-gradient-to-r ${plan.gradient} mb-3`} />
            <h2 className="text-[17px] font-semibold text-zinc-900">
              {isToFree ? "Cancelar assinatura" : `Mudar para o plano ${displayName}`}
            </h2>
            <p className="text-[13px] text-zinc-400 mt-0.5">
              {"period" in plan && plan.period ? `${displayPriceLabel}${plan.period}` : displayPriceLabel}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors mt-0.5 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {isToFree && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5">
              <p className="text-[13px] text-zinc-700">
                Seu acesso ao plano atual continuara ate o fim do ciclo de cobranca.
              </p>
            </div>
          )}
          <p className="text-[13px] text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
            Alteração de plano pelo painel ainda não está disponível. Entre em contato com o suporte.
          </p>
        </div>

        <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-zinc-100">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={[
              "flex-1 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
              isToFree
                ? "bg-[#647B7B] hover:bg-[#4A6262]"
                : "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2]",
            ].join(" ")}
          >
            {submitting ? "Processando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BillingDashboard({
  plan: initialPlan,
  planStatus,
  planExpiresAt,
  planCharges,
  nextChargeDate,
  trialEndsAt,
  proTrialEnabled = true,
  proTrialDays = 7,
  proTrialUsed = false,
  introCyclesRemaining = null,
  checkoutDefaults,
}: Props) {
  const isActivePaid = initialPlan !== "free";
  const [activePlan, setActivePlan] = useState<PlanKey>((isActivePaid ? initialPlan : "free") as PlanKey);
  const [activePlanStatus, setActivePlanStatus] = useState(planStatus ?? (isActivePaid ? "active" : "inactive"));
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const { refreshPlan } = useSubscription();

  const isTrialing = activePlanStatus === "trialing";
  const [currentTrialEndsAt, setCurrentTrialEndsAt] = useState<string | null>(trialEndsAt ?? null);
  const trialDaysLeft = currentTrialEndsAt ? Math.max(0, Math.ceil((new Date(currentTrialEndsAt).getTime() - Date.now()) / 86_400_000)) : null;
  const [expiresAt, setExpiresAt] = useState(planExpiresAt);
  const [pendingChange] = useState<{ plan: PlanKey; effectiveAt: string } | null>(null);
  const [changingTo, setChangingTo] = useState<PlanDef | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [returnBanner, setReturnBanner] = useState<"success" | "canceled" | null>(getBillingReturnBanner);
  const [proLoading, setProLoading] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [receiptCharge, setReceiptCharge] = useState<PlanCharge | null>(null);

  const [livePlans, setLivePlans] = useState<LivePlanMap>(buildPlanSettingsFallback);
  useEffect(() => {
    void fetch("/api/plan-settings").then(async (res) => {
      if (!res.ok) return;
      const data = await res.json() as LivePlanMap;
      setLivePlans((prev) => ({ ...prev, ...data }));
    }).catch(() => undefined);
  }, []);

  function effectiveSetting(p: PlanDef) {
    return livePlans[p.key] ?? buildPlanSettingsFallback()[p.key];
  }
  function effectivePrice(p: PlanDef) {
    return effectiveSetting(p).price;
  }
  function effectivePriceLabel(p: PlanDef) {
    const setting = effectiveSetting(p);
    return setting.is_available ? formatPlanPricing(setting).primaryPrice : "Em breve";
  }
  function effectiveTrialLabel(p: PlanDef) {
    if (p.key !== "pro" || !proTrialEnabled) return null;
    const setting = effectiveSetting(p);
    const { currency } = setting;
    const trialDays      = setting.trial_days > 0 ? setting.trial_days : proTrialDays;
    const introPrice     = setting.intro_price;
    const introCycles    = setting.intro_cycles;
    const recurringPrice = setting.recurring_price;
    const fmt      = (n: number) => formatPlanPrice(n, currency);
    const perMonth = currency === "USD" ? "/month" : "/mês";

    if (introCyclesRemaining != null && introCyclesRemaining > 0) {
      return recurringPrice > 0 ? `Then ${fmt(recurringPrice)}${perMonth}` : null;
    }
    if (introCyclesRemaining === 0) {
      return recurringPrice > 0 ? `${fmt(recurringPrice)}${perMonth}` : null;
    }
    // Trial already used — show only the regular recurring price, no trial copy.
    if (proTrialUsed) {
      return recurringPrice > 0 ? `${fmt(recurringPrice)}${perMonth}` : null;
    }
    if (trialDays > 0 && introPrice > 0 && introCycles > 0 && recurringPrice > 0) {
      return `${trialDays}-day free trial · then ${fmt(introPrice)}${perMonth}`;
    }
    if (introPrice > 0 && introCycles > 0 && recurringPrice > 0) {
      return `${fmt(introPrice)} first month · then ${fmt(recurringPrice)}${perMonth}`;
    }
    if (trialDays > 0) {
      return `${trialDays}-day free trial`;
    }
    return null;
  }

  const currentPlanDef = getPlanDef(activePlan);
  const isCancellationScheduled = activePlan !== "free" && activePlanStatus === "cancelling";
  const latestCharge = planCharges[0] ?? null;

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  }

  /** Redirects the user to Stripe Checkout for the PRO plan. */
  async function handleStripeCheckout() {
    setProLoading(true);
    try {
      const res  = await fetch("/api/stripe/create-checkout", { method: "POST" });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        showToast(data.error ?? "Could not start checkout. Please try again.", false);
        return;
      }
      // Full-page redirect to Stripe Checkout hosted page
      window.location.assign(data.url);
    } catch {
      showToast("Network error. Please try again.", false);
    } finally {
      setProLoading(false);
    }
  }

  function handlePlanClick(p: PlanDef) {
    const setting = effectiveSetting(p);
    if (!setting.is_available) {
      showToast("This plan is not yet available.", false);
      return;
    }
    if (p.key === "free" && activePlan !== "free") { void handleCancelSubscription(); return; }
    if (p.key === activePlan) return;
    if (p.key === "pro") { void handleStripeCheckout(); return; }
    // Premium and other paid plans still use the legacy modal/flow
    if (setting.price > 0) { setChangingTo(p); return; }
    setChangingTo(p);
  }

  async function handleCancelSubscription() {
    if (!confirm("Cancel your subscription? You will lose PRO access immediately and will not be charged again.")) return;
    setCancelingSubscription(true);
    try {
      const res = await fetch("/api/agency/subscription/cancel", { method: "POST" });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok) {
        showToast(data.error ?? "Failed to cancel subscription. Please try again.", false);
        return;
      }
      // Update local UI state immediately — do not wait for webhook
      setActivePlan("free");
      setActivePlanStatus("canceled");
      setCurrentTrialEndsAt(null);
      // Refresh SubscriptionContext so isPremium / isActive are revoked now
      await refreshPlan();
      showToast("Subscription cancelled. You are now on the Free plan.", true);
    } finally {
      setCancelingSubscription(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Banners */}
      {/* Trial countdown banner */}
      {isTrialing && trialDaysLeft !== null && (
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3.5">
          <svg className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-indigo-800">
              {trialDaysLeft > 0
                ? "Teste grátis ativo"
                : "Período de teste encerrado"}
            </p>
            {currentTrialEndsAt && trialDaysLeft > 0 && (
              <p className="text-[12px] text-indigo-700 mt-0.5">
                Primeira cobrança em {new Date(currentTrialEndsAt).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}.{" "}
                <button
                  onClick={handleCancelSubscription}
                  disabled={cancelingSubscription}
                  className="underline hover:no-underline disabled:opacity-50 cursor-pointer"
                >
                  {cancelingSubscription ? "Cancelando..." : "Cancelar antes da cobrança"}
                </button>
              </p>
            )}
          </div>
        </div>
      )}

      {(activePlanStatus === "past_due" || activePlanStatus === "unpaid") && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3.5">
          <svg className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-rose-800">Falha no pagamento</p>
            <p className="text-[12px] text-rose-700 mt-0.5">
              Houve uma falha no pagamento da sua assinatura. Entre em contato com o suporte.
            </p>
          </div>
        </div>
      )}
      {returnBanner === "success" && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3.5">
          <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-emerald-800">Pagamento realizado</p>
            <p className="text-[12px] text-emerald-700 mt-0.5">Seu plano sera ativado automaticamente apos confirmacao do pagamento.</p>
          </div>
          <button type="button" onClick={() => setReturnBanner(null)} className="text-emerald-500 hover:text-emerald-700 flex-shrink-0 cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {returnBanner === "canceled" && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-800">Checkout cancelado</p>
            <p className="text-[12px] text-amber-700 mt-0.5">Nenhum pagamento foi realizado. Voce pode tentar novamente quando quiser.</p>
          </div>
          <button type="button" onClick={() => setReturnBanner(null)} className="text-amber-500 hover:text-amber-700 flex-shrink-0 cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {toast && (
        <div className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-[13px] font-medium text-white",
          toast.ok ? "bg-emerald-600" : "bg-rose-600",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {changingTo && (
        <PlanChangeModal
          plan={changingTo}
          displayName={effectiveSetting(changingTo).name}
          displayPriceLabel={effectivePriceLabel(changingTo)}
          onUnavailable={(message) => showToast(message, false)}
          onClose={() => setChangingTo(null)}
        />
      )}
      {receiptCharge && (
        <ReceiptModal charge={receiptCharge} onClose={() => setReceiptCharge(null)} />
      )}
      {/* Page title */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agencia</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900">Plano & Cobranca</h1>
      </div>

      {/* Current plan card */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Plano atual</p>
            <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">{effectiveSetting(currentPlanDef).name}</p>
            <p className="text-[13px] text-zinc-500">
              Status: <strong className="text-zinc-800">{planStatusLabel(activePlanStatus ?? "inactive")}</strong>
              {isTrialing && currentTrialEndsAt
                ? ` · primeira cobranca em ${fmtDate(currentTrialEndsAt)}`
                : expiresAt && activePlan !== "free"
                  ? ` · renova em ${fmtDate(expiresAt)}`
                  : ""}
            </p>
            <p className="text-[13px] text-zinc-400">Payments securely processed via Stripe.</p>
          </div>
          {activePlan !== "free" && (
            <div className="flex-shrink-0">
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={cancelingSubscription}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-600 hover:border-rose-200 hover:text-rose-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelingSubscription ? "Cancelling…" : "Cancel subscription"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cancellation scheduled banner */}
      {isCancellationScheduled && expiresAt && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-800">Cancelamento agendado</p>
            <p className="text-[12px] text-amber-700 mt-0.5">
              Seu plano continuara ativo ate o fim do ciclo atual em {fmtDate(expiresAt)}.
            </p>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Planos</p>
          {expiresAt && activePlan !== "free" && (
            <p className="text-[12px] text-zinc-400">{isTrialing ? `Primeira cobranca em ${fmtDate(expiresAt)}` : `Renova em ${fmtDate(expiresAt)}`}</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((p) => {
            const setting = effectiveSetting(p);
            const available = setting.is_available;
            const isLoading = (p.key === "pro" && proLoading) || (p.key === "premium" && premiumLoading);
            const isCurrent  = activePlan === p.key;
            const isDowngrade = effectivePrice(p) < effectivePrice(currentPlanDef);
            const isPending  = pendingChange?.plan === p.key;
            const baseFeatures = available ? planLimitHighlights(setting).slice(0, 2) : ["Em breve"];
            const featureList = p.key === "premium"
              ? available
                ? ["Espaço Premium", ...premiumSeatHighlights(setting)]
                : ["Em breve"]
              : baseFeatures;
            return (
              <div
                key={p.key}
                className={[
                  "rounded-2xl border overflow-hidden flex flex-col transition-shadow",
                  isCurrent
                    ? "bg-white border-zinc-300 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.07)]"
                    : "bg-zinc-50 border-zinc-100",
                ].join(" ")}
              >
                <div className={`h-[3px] bg-gradient-to-r ${p.gradient}`} />
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[15px] font-semibold text-zinc-900">{setting.name}</span>
                    {p.badge && available && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider bg-indigo-600 text-white">
                        {p.badge}
                      </span>
                    )}
                    {!available && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider bg-zinc-100 text-zinc-500">
                        Em breve
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-auto">
                        Atual
                      </span>
                    )}
                    {isPending && !isCurrent && (
                      <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full ml-auto">
                        Agendado
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mb-3 leading-snug">{p.headline}</p>
                  <div className="mb-1">
                    <span className="text-[1.75rem] font-bold tracking-tighter text-zinc-900">{effectivePriceLabel(p)}</span>
                  </div>
                  {available ? (() => {
                    const pricingLines = formatPlanPricing(effectiveSetting(p));
                    const trialLabel = effectiveTrialLabel(p);
                    if (pricingLines.isIntroOffer && !introCyclesRemaining) {
                      return (
                        <div className="mb-4 space-y-0.5">
                          {pricingLines.trialLine && (
                            <p className="text-[11px] font-semibold text-emerald-600">{pricingLines.trialLine}</p>
                          )}
                          {pricingLines.introLine && (
                            <p className="text-[11px] text-zinc-500">{pricingLines.introLine}</p>
                          )}
                          {pricingLines.recurringLine && (
                            <p className="text-[11px] text-zinc-400">{pricingLines.recurringLine}</p>
                          )}
                        </div>
                      );
                    }
                    return (
                      <p className="text-[11px] font-semibold mb-4 text-indigo-600">
                        {trialLabel ?? ""}
                      </p>
                    );
                  })() : (
                    <p className="text-[11px] font-semibold mb-4 text-zinc-400">Em breve</p>
                  )}
                  <ul className="space-y-1.5 mb-5 flex-1">
                    {featureList.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-[12px] text-zinc-600">
                        <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && !isPending && (
                    <button
                      onClick={() => handlePlanClick(p)}
                      disabled={!available || isLoading}
                      className={[
                        "w-full mt-auto text-white text-[13px] font-semibold py-2.5 rounded-xl transition-colors",
                        !available
                          ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                          : isLoading
                          ? "bg-zinc-300 cursor-not-allowed"
                          : isDowngrade
                          ? "bg-zinc-500 hover:bg-zinc-600"
                          : "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] cursor-pointer",
                      ].join(" ")}
                    >
                      {!available
                        ? "Em breve"
                        : isLoading
                        ? "Aguarde..."
                        : p.key === "pro" && activePlan === "free" && proTrialEnabled
                          ? "Iniciar teste grátis"
                        : p.key === "premium" && activePlan === "free"
                          ? "Escolher Premium"
                        : activePlan === "free"
                          ? `Assinar ${setting.name}`
                          : isDowngrade
                            ? `Mudar para ${setting.name}`
                            : p.key === "premium"
                              ? "Fazer upgrade"
                              : `Fazer upgrade para ${setting.name}`}
                    </button>
                  )}
                  {isPending && !isCurrent && (
                    <p className="text-[11px] text-indigo-600 text-center font-medium">
                      Ativara em {fmtDate(pendingChange!.effectiveAt)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Last charge + Next charge */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Ultima cobranca do plano</p>
          {latestCharge ? (
            <div className="space-y-1.5">
              <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">{brl(latestCharge.amount)}</p>
              <p className="text-[13px] text-zinc-600">{latestCharge.description ?? "Assinatura BrisaHub"}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${chargeStatusColor(latestCharge.status)}`}>
                  {chargeStatusLabel(latestCharge.status)}
                </span>
                <span className="text-[11px] text-zinc-400">{fmtDate(latestCharge.created_at)}</span>
                {latestCharge.asaas_payment_id && (
                  <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[120px]" title={latestCharge.asaas_payment_id}>
                    {latestCharge.asaas_payment_id.slice(0, 16)}…
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">Provider: {latestCharge.provider === "stripe" ? "Stripe" : "Asaas"}</p>
              <button
                onClick={() => setReceiptCharge(latestCharge)}
                className="mt-1 text-[12px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
              >
                Ver comprovante →
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">Nenhuma cobranca de plano registrada ainda.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Proxima cobranca</p>
          {(expiresAt || nextChargeDate) && activePlan !== "free" ? (
            <div className="space-y-1.5">
              {(() => {
                const setting = effectiveSetting(currentPlanDef);
                const introPrice = setting.intro_price;
                const recurringPrice = setting.recurring_price;
                const showIntroPrice = isTrialing && introCyclesRemaining != null && introCyclesRemaining > 0 && introPrice > 0;
                const displayPrice = showIntroPrice
                  ? formatPlanPrice(introPrice, setting.currency)
                  : effectivePriceLabel(currentPlanDef);
                const perMonth = setting.currency === "USD" ? "/month" : "/mês";
                return (
                  <>
                    <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">{displayPrice}</p>
                    {showIntroPrice && recurringPrice > 0 && (
                      <p className="text-[11px] text-indigo-600 font-medium">
                        Intro price · then {formatPlanPrice(recurringPrice, setting.currency)}{perMonth}
                      </p>
                    )}
                  </>
                );
              })()}
              <p className="text-[13px] text-zinc-600">
                {isTrialing
                  ? `Primeira cobranca do plano ${effectiveSetting(currentPlanDef).name}`
                  : `Renovacao do plano ${effectiveSetting(currentPlanDef).name}`}
              </p>
              <p className="text-[12px] text-zinc-400">{fmtDate((expiresAt ?? nextChargeDate)!)}</p>
              <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                {isTrialing ? "Trial" : expiresAt ? "Agendada" : "Prevista"}
              </span>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">Proxima cobranca ainda nao disponivel.</p>
          )}
        </div>
      </div>

      {/* Charge history */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Historico de cobrancas</p>
        {planCharges.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-10 text-center">
            <p className="text-[13px] text-zinc-400">Nenhuma cobranca de plano ainda.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
            {planCharges.map((charge) => (
              <div key={charge.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-8 h-8 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 truncate leading-snug">
                    {charge.description ?? "Assinatura BrisaHub"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${chargeStatusColor(charge.status)}`}>
                      {chargeStatusLabel(charge.status)}
                    </span>
                    <span className="text-[11px] text-zinc-400">{fmtDateTime(charge.created_at)}</span>
                    {charge.asaas_payment_id && (
                      <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline" title={charge.asaas_payment_id}>
                        {charge.asaas_payment_id.slice(0, 12)}…
                      </span>
                    )}
                    <span className="text-[11px] text-zinc-300">· {charge.provider === "stripe" ? "Stripe" : "Asaas"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="text-[14px] font-bold tabular-nums text-zinc-900">{brl(charge.amount)}</p>
                  <button
                    onClick={() => setReceiptCharge(charge)}
                    className="text-[12px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Comprovante
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
