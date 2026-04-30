"use client";

import { useState } from "react";
import { PLAN_DEFINITIONS, type Plan } from "@/lib/plans";

interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

interface Props {
  plan: string;
  planStatus: string | null;
  planExpiresAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  transactions: WalletTransaction[];
}

type PlanChangeResponse = {
  effectiveAt?: string;
  url?: string;
  provider?: string;
};

const PLANS = [
  {
    key: "free" as const,
    name: PLAN_DEFINITIONS.free.label,
    price: PLAN_DEFINITIONS.free.price,
    priceLabel: "R$ 0",
    period: "",
    badge: null,
    gradient: "from-zinc-300 to-zinc-400",
    headline: "Versao de teste",
    commission: "20% de comissao",
    features: [
      "1 vaga ativa",
      "Ate 3 contratacoes por vaga",
      "Somente vagas publicas",
    ],
  },
  {
    key: "pro" as const,
    name: PLAN_DEFINITIONS.pro.label,
    price: PLAN_DEFINITIONS.pro.price,
    priceLabel: "R$ 247",
    period: "/mes",
    badge: "POPULAR" as const,
    gradient: "from-indigo-500 to-violet-600",
    headline: "Sistema completo de contratacao",
    commission: "10% de comissao",
    features: [
      "Vagas publicas ilimitadas",
      "Contratacoes ilimitadas",
      "Marketplace e descoberta de talentos",
      "Historico completo de contratos e pagamentos",
    ],
  },
  {
    key: "premium" as const,
    name: PLAN_DEFINITIONS.premium.label,
    price: PLAN_DEFINITIONS.premium.price,
    priceLabel: "R$ 297",
    period: "/mes",
    badge: "EM BREVE" as const,
    gradient: "from-violet-500 to-purple-700",
    headline: "Operacao premium com cobranca recorrente",
    commission: "10% de comissao",
    available: false,
    features: [
      "Tudo do Pro",
      "Vagas fechadas",
      "Gerencie sua equipe internamente",
      "Pool de talentos privado",
    ],
  },
] as const;

type PlanKey = Plan;
type PlanDef = typeof PLANS[number];

function getBillingReturnBanner(): "success" | "canceled" | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("success") === "true") return "success";
  if (params.get("canceled") === "true") return "canceled";
  return null;
}

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtDate(s: string | Date) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(s: string | Date) {
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPlanDef(planKey: PlanKey) {
  return PLANS.find((plan) => plan.key === planKey) ?? PLANS[0];
}

function hasManagedStripeSubscription(stripeSubscriptionId: string | null, stripeSubscriptionStatus: string | null) {
  if (!stripeSubscriptionId) return false;
  return ["active", "trialing", "past_due", "cancel_at_period_end"].includes(stripeSubscriptionStatus ?? "active");
}

function isPlanChargeTransaction(tx: WalletTransaction) {
  const description = (tx.description ?? "").toLowerCase();
  return tx.type === "payment" && (
    description.includes("stripe billing") ||
    description.includes("assinatura") ||
    description.includes("plano ")
  );
}

function getPlanChargeMethod(tx: WalletTransaction) {
  const description = (tx.description ?? "").toLowerCase();
  if (description.includes("stripe")) return "Stripe Billing";
  if (description.includes("carteira")) return "Saldo da carteira";
  return "Cobranca da plataforma";
}

interface ModalProps {
  plan: PlanDef;
  currentPlanKey: PlanKey;
  currentPrice: number;
  planExpiresAt: string | null;
  onSuccess: (newPlan: PlanKey, result: PlanChangeResponse) => void;
  onClose: () => void;
}

function PlanChangeModal({
  plan,
  currentPlanKey,
  currentPrice,
  planExpiresAt,
  onSuccess,
  onClose,
}: ModalProps) {
  const isFromFree = currentPlanKey === "free";
  const isUpgrade = plan.price > currentPrice;
  const isDowngrade = plan.price < currentPrice;
  const isToFree = plan.key === "free";
  const forcedImmediate = !isToFree;
  const [timing, setTiming] = useState<"immediate" | "next_cycle">(
    forcedImmediate ? "immediate" : "next_cycle",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const nextBillingLabel = planExpiresAt ? fmtDate(planExpiresAt) : "no proximo ciclo";
  const needsStripeCheckout = timing === "immediate" && !isToFree;

  async function handleConfirm() {
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/agencies/plan-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: plan.key,
        chargeImmediately: needsStripeCheckout,
      }),
    });
    const data = await res.json().catch(() => ({})) as PlanChangeResponse & { error?: string };

    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao alterar plano. Tente novamente.");
      return;
    }

    if (data.url) {
      window.location.assign(data.url);
      return;
    }

    onSuccess(plan.key, data);
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
              {isToFree ? "Cancelar assinatura" : `Mudar para o plano ${plan.name}`}
            </h2>
            <p className="text-[13px] text-zinc-400 mt-0.5">
              {isToFree ? "Voce passara para o plano gratuito" : `${plan.priceLabel}${plan.period}`}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors mt-0.5 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {forcedImmediate && !isToFree && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3.5">
              <p className="text-[13px] text-amber-800">
                Voce sera enviado ao Stripe para assinar <strong>{brl(plan.price)}/mes</strong>.
              </p>
            </div>
          )}

          {isToFree && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5">
              <p className="text-[13px] text-zinc-700">
                O cancelamento sera agendado no Stripe. Ate o fim do ciclo voce continua com acesso ao plano atual.
              </p>
            </div>
          )}

          {isUpgrade && !isFromFree && !isToFree && !forcedImmediate && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Quando ativar?</p>
              <label className={[
                "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors",
                timing === "next_cycle" ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300",
              ].join(" ")}>
                <input
                  type="radio"
                  name="timing"
                  value="next_cycle"
                  checked={timing === "next_cycle"}
                  onChange={() => setTiming("next_cycle")}
                  className="mt-0.5 accent-zinc-900"
                />
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900">No proximo ciclo</p>
                  <p className="text-[12px] text-zinc-400 mt-0.5">Sem cobranca hoje. Novo plano ativa em {nextBillingLabel}.</p>
                </div>
              </label>
              <label className={[
                "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors",
                timing === "immediate" ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300",
              ].join(" ")}>
                <input
                  type="radio"
                  name="timing"
                  value="immediate"
                  checked={timing === "immediate"}
                  onChange={() => setTiming("immediate")}
                  className="mt-0.5 accent-zinc-900"
                />
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900">Agora via Stripe</p>
                  <p className="text-[12px] text-zinc-400 mt-0.5">Abre o Stripe Billing para confirmar a assinatura.</p>
                </div>
              </label>
            </div>
          )}

          {isDowngrade && !isToFree && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5">
              <p className="text-[13px] text-zinc-700">
                Mudancas de plano pago devem ser ajustadas no Stripe Billing. Esta acao abre o checkout quando houver cobranca imediata.
              </p>
            </div>
          )}

          {needsStripeCheckout && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Forma de pagamento</p>
              <p className="text-[13px] text-zinc-700 mt-1">Stripe Billing</p>
            </div>
          )}

          {error && (
            <p className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-zinc-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className={[
              "flex-1 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
              isToFree || isDowngrade
                ? "bg-[#647B7B] hover:bg-[#4A6262]"
                : "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2]",
            ].join(" ")}
          >
            {submitting ? "Processando..." : needsStripeCheckout ? "Continuar no Stripe" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingDashboard({
  plan: initialPlan,
  planStatus,
  planExpiresAt,
  stripeCustomerId,
  stripeSubscriptionId,
  stripeSubscriptionStatus,
  transactions,
}: Props) {
  const isActivePaid = initialPlan !== "free";
  const [activePlan, setActivePlan] = useState<PlanKey>((isActivePaid ? initialPlan : "free") as PlanKey);
  const [activePlanStatus, setActivePlanStatus] = useState(planStatus ?? (isActivePaid ? "active" : "inactive"));
  const [expiresAt, setExpiresAt] = useState(planExpiresAt);
  const [pendingChange, setPendingChange] = useState<{ plan: PlanKey; effectiveAt: string } | null>(null);
  const [changingTo, setChangingTo] = useState<PlanDef | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [returnBanner, setReturnBanner] = useState<"success" | "canceled" | null>(getBillingReturnBanner);
  const [portalLoading, setPortalLoading] = useState(false);

  const currentPlanDef = getPlanDef(activePlan);
  const hasExternalActiveSubscription = hasManagedStripeSubscription(stripeSubscriptionId, stripeSubscriptionStatus);
  const isCancellationScheduled = activePlan !== "free" && activePlanStatus === "cancelling";
  const planChargeTransactions = transactions.filter(isPlanChargeTransaction);
  const latestPlanCharge = planChargeTransactions[0] ?? null;
  const upcomingPlanKey = pendingChange?.plan ?? activePlan;
  const upcomingPlanDef = getPlanDef(upcomingPlanKey);
  const upcomingChargeDate = pendingChange?.effectiveAt ?? expiresAt;
  const upcomingCharge = upcomingPlanKey !== "free"
    && upcomingPlanDef.price > 0
    && Boolean(upcomingChargeDate)
    && activePlanStatus !== "past_due"
      ? {
          amount: upcomingPlanDef.price,
          chargeAt: upcomingChargeDate!,
          label: pendingChange ? `Mudanca para ${upcomingPlanDef.name}` : `Renovacao do plano ${upcomingPlanDef.name}`,
        }
      : null;

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  }

  function handlePlanClick(p: PlanDef) {
    if ("available" in p && p.available === false) {
      showToast("Premium ainda nao esta disponivel.", false);
      return;
    }
    if (p.key === "free" && activePlan !== "free") {
      void handleOpenBillingPortal();
      return;
    }
    if (p.key === activePlan) return;
    setChangingTo(p);
  }

  async function handleOpenBillingPortal() {
    setPortalLoading(true);
    const res = await fetch("/api/agencies/billing-portal", { method: "POST" });
    const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
    setPortalLoading(false);

    if (!res.ok || !data.url) {
      showToast(data.error ?? "Nao foi possivel abrir o portal Stripe.", false);
      return;
    }

    window.location.assign(data.url);
  }

  function handleSuccess(newPlan: PlanKey, result: PlanChangeResponse) {
    setChangingTo(null);
    if (newPlan === "free") {
      const effectiveAt = result.effectiveAt ?? (() => {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date.toISOString();
      })();
      setActivePlanStatus("cancelling");
      setPendingChange({ plan: newPlan, effectiveAt });
      showToast(`Cancelamento agendado. Acesso ate ${fmtDate(effectiveAt)}.`, true);
      return;
    }

    setActivePlan(newPlan);
    setActivePlanStatus("active");
    setPendingChange(null);
    setExpiresAt(result.effectiveAt ?? expiresAt);
    showToast(`Plano ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)} atualizado.`, true);
  }

  return (
    <div className="max-w-3xl space-y-8">
      {(activePlanStatus === "past_due" || activePlanStatus === "unpaid") && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3.5">
          <svg className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-rose-800">
              {activePlanStatus === "unpaid" ? "Assinatura vencida" : "Falha no pagamento"}
            </p>
            <p className="text-[12px] text-rose-700 mt-0.5">
              {activePlanStatus === "unpaid"
                ? "Sua assinatura esta vencida. Acesse o portal do Stripe para regularizar o pagamento."
                : "Houve uma falha no pagamento da sua assinatura. O Stripe tentara novamente em breve."}
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
            <p className="text-[13px] font-semibold text-emerald-800">Assinatura confirmada</p>
            <p className="text-[12px] text-emerald-700 mt-0.5">Seu plano sera atualizado automaticamente apos confirmacao do Stripe.</p>
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

      {changingTo && (
        <PlanChangeModal
          plan={changingTo}
          currentPlanKey={activePlan}
          currentPrice={currentPlanDef.price}
          planExpiresAt={expiresAt}
          onSuccess={handleSuccess}
          onClose={() => setChangingTo(null)}
        />
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agencia</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900">Plano & Cobranca</h1>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Plano atual</p>
            <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">
              {currentPlanDef.name}
            </p>
            <p className="text-[13px] text-zinc-500">
              Status: <strong className="text-zinc-800">{activePlanStatus ?? "inactive"}</strong>
              {expiresAt && activePlan !== "free" ? ` · renova em ${fmtDate(expiresAt)}` : ""}
            </p>
            <p className="text-[13px] text-zinc-600">
              O cartão é salvo com segurança pela Stripe para cobranças mensais automáticas.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={handleOpenBillingPortal}
              disabled={portalLoading || !stripeCustomerId}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-[13px] font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {portalLoading ? "Abrindo..." : "Gerenciar/cancelar assinatura"}
            </button>
            <p className="text-[11px] text-zinc-400">
              {stripeCustomerId
                ? `Stripe Customer: ${stripeCustomerId.slice(0, 14)}...`
                : "O portal Stripe sera habilitado apos a primeira assinatura paga."}
            </p>
            {stripeSubscriptionId && (
              <p className="text-[11px] text-zinc-400">
                Subscrição Stripe: {stripeSubscriptionStatus ?? "active"} · {stripeSubscriptionId.slice(0, 14)}...
              </p>
            )}
          </div>
        </div>
      </div>

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

      {pendingChange && (
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3.5">
          <svg className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[13px] text-indigo-800">
            Mudanca agendada: plano <strong>{pendingChange.plan.charAt(0).toUpperCase() + pendingChange.plan.slice(1)}</strong> em <strong>{fmtDate(pendingChange.effectiveAt)}</strong>.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Planos</p>
          {expiresAt && activePlan !== "free" && (
            <p className="text-[12px] text-zinc-400">Renova em {fmtDate(expiresAt)}</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((p) => {
            const isCurrent = activePlan === p.key;
            const isDowngrade = p.price < currentPlanDef.price;
            const isPending = pendingChange?.plan === p.key;
            const isAvailable = !("available" in p) || p.available !== false;
            const isDuplicateBlocked = p.key !== "free" && !isCurrent && hasExternalActiveSubscription;
            const shouldManageInPortal = p.key === "free" && activePlan !== "free";
            return (
              <div
                key={p.key}
                className={[
                  "rounded-2xl border overflow-hidden flex flex-col transition-shadow",
                  isCurrent
                    ? "bg-white border-zinc-300 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.07)]"
                    : isAvailable
                      ? "bg-zinc-50 border-zinc-100"
                      : "bg-zinc-50/70 border-zinc-200 opacity-80",
                ].join(" ")}
              >
                <div className={`h-[3px] bg-gradient-to-r ${p.gradient}`} />
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[15px] font-semibold text-zinc-900">{p.name}</span>
                    {p.badge && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider bg-indigo-600 text-white">
                        {p.badge}
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
                    <span className="text-[1.75rem] font-bold tracking-tighter text-zinc-900">{p.priceLabel}</span>
                    {p.period && <span className="text-[12px] text-zinc-400 ml-1">{p.period}</span>}
                  </div>
                  {p.key !== "premium" && (
                    <p className={[
                      "text-[11px] font-semibold mb-4",
                      p.key === "free" ? "text-zinc-400" : "text-indigo-600",
                    ].join(" ")}>{p.commission}</p>
                  )}
                  <ul className="space-y-1.5 mb-5 flex-1">
                    {p.features.map((feature) => (
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
                      disabled={!isAvailable || isDuplicateBlocked || (shouldManageInPortal && (!stripeCustomerId || portalLoading))}
                      className={[
                        "w-full mt-auto text-white text-[13px] font-semibold py-2.5 rounded-xl transition-colors",
                        !isAvailable || isDuplicateBlocked || (shouldManageInPortal && (!stripeCustomerId || portalLoading))
                          ? "bg-zinc-300 cursor-not-allowed"
                          : isDowngrade
                          ? "bg-zinc-500 hover:bg-zinc-600"
                          : "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] cursor-pointer",
                      ].join(" ")}
                    >
                      {!isAvailable
                        ? "Em breve"
                        : isDuplicateBlocked
                          ? "Assinatura ativa"
                        : shouldManageInPortal
                          ? portalLoading
                            ? "Abrindo..."
                            : "Gerenciar no Stripe"
                        : activePlan === "free"
                          ? `Assinar ${p.name}`
                          : isDowngrade
                            ? `Mudar para ${p.name}`
                            : `Fazer upgrade para ${p.name}`}
                    </button>
                  )}
                  {!isAvailable && (
                    <p className="mt-3 text-[11px] text-zinc-500 text-center">
                      Premium ainda nao esta disponivel para novas assinaturas.
                    </p>
                  )}
                  {isDuplicateBlocked && (
                    <p className="mt-3 text-[11px] text-zinc-500 text-center">
                      Voce ja possui uma assinatura ativa vinculada a este cliente Stripe.
                    </p>
                  )}
                  {isPending && !isCurrent && (
                    <p className="text-[11px] text-indigo-600 text-center font-medium">
                      Ativara em {fmtDate(pendingChange!.effectiveAt)}
                    </p>
                  )}
                  {shouldManageInPortal && !isPending && (
                    <p className="mt-3 text-[11px] text-zinc-500 text-center">
                      Cancelamentos da assinatura paga sao feitos no portal da Stripe.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Ultima cobranca do plano</p>
          {latestPlanCharge ? (
            <div className="space-y-1">
              <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">
                {brl(Math.abs(latestPlanCharge.amount))}
              </p>
              <p className="text-[13px] text-zinc-600">{latestPlanCharge.description ?? "Cobranca de plano"}</p>
              <p className="text-[12px] text-zinc-400">{fmtDate(latestPlanCharge.created_at)}</p>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">Nenhuma cobranca de plano registrada ainda.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Proxima cobranca</p>
          {pendingChange?.plan === "free" ? (
            <div className="space-y-1">
              <p className="text-[15px] font-semibold text-zinc-900">Sem nova cobranca agendada</p>
              <p className="text-[13px] text-zinc-600">O plano atual sera encerrado no fim do ciclo.</p>
              <p className="text-[12px] text-zinc-400">{fmtDate(pendingChange.effectiveAt)}</p>
            </div>
          ) : upcomingCharge ? (
            <div className="space-y-1">
              <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">{brl(upcomingCharge.amount)}</p>
              <p className="text-[13px] text-zinc-600">{upcomingCharge.label}</p>
              <p className="text-[12px] text-zinc-400">{fmtDate(upcomingCharge.chargeAt)}</p>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">Sem cobranca futura disponivel no momento.</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Historico de cobrancas</p>
        {planChargeTransactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-10 text-center">
            <p className="text-[13px] text-zinc-400">Nenhuma cobranca de plano ainda.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
            {planChargeTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-8 h-8 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20V4m-8 8l8-8 8 8" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 truncate leading-snug">
                    {tx.description ?? "Cobranca de plano"}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {fmtDateTime(tx.created_at)} · {getPlanChargeMethod(tx)}
                  </p>
                </div>
                <p className="text-[14px] font-bold tabular-nums flex-shrink-0 text-rose-500">
                  {brl(Math.abs(tx.amount))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
