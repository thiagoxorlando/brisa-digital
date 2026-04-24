"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { SavedCard } from "@/components/ui/SavedCards";
import { AddCardForm } from "@/components/ui/SavedCards";
import { PLAN_DEFINITIONS, type Plan } from "@/lib/plans";

const SavedCardsWidget = dynamic(() => import("@/components/ui/SavedCards"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface WalletTransaction {
  id:           string;
  type:         string;
  amount:       number;
  description:  string | null;
  created_at:   string;
}

interface Props {
  userId:        string;
  plan:          string;
  planStatus:    string | null;
  planExpiresAt: string | null;
  walletBalance: number;
  savedCards:    SavedCard[];
  transactions:  WalletTransaction[];
  mpPublicKey:   string;
}

type PlanChangeResponse = {
  effectiveAt: string;
  expiresAt?: string | null;
  paidVia?: "wallet" | "card";
};

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLANS = [
  {
    key:           "free" as const,
    name:          PLAN_DEFINITIONS.free.label,
    price:         PLAN_DEFINITIONS.free.price,
    priceLabel:    "R$ 0",
    period:        "",
    badge:         null,
    gradient:      "from-zinc-300 to-zinc-400",
    headline:      "Versão de teste",
    commission:    "20% de comissão",
    features: [
      "1 vaga ativa",
      "Até 3 contratações por vaga",
      "Somente vagas públicas",
    ],
  },
  {
    key:           "pro" as const,
    name:          PLAN_DEFINITIONS.pro.label,
    price:         PLAN_DEFINITIONS.pro.price,
    priceLabel:    "R$ 247",
    period:        "/mês",
    badge:         "POPULAR" as const,
    gradient:      "from-indigo-500 to-violet-600",
    headline:      "Sistema completo de contratação",
    commission:    "10% de comissão",
    features: [
      "Vagas públicas ilimitadas",
      "Contratações ilimitadas",
      "Marketplace e descoberta de talentos",
      "Histórico completo de contratos e pagamentos",
    ],
  },
  {
    key:           "premium" as const,
    name:          PLAN_DEFINITIONS.premium.label,
    price:         PLAN_DEFINITIONS.premium.price,
    priceLabel:    "Sob consulta",
    period:        "",
    badge:         "EM BREVE" as const,
    gradient:      "from-violet-500 to-purple-700",
    headline:      "Sistema privado da sua agência",
    commission:    "10% de comissão",
    features: [
      "Tudo do Pro",
      "Vagas fechadas (apenas convidados)",
      "Gerencie sua equipe internamente",
      "Pool de talentos privado",
    ],
  },
] as const;

type PlanKey = Plan;
type PlanDef = typeof PLANS[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function getPlanChargeDescription(planKey: PlanKey, paidVia: "wallet" | "card") {
  const planLabel = planKey.charAt(0).toUpperCase() + planKey.slice(1);
  return paidVia === "wallet"
    ? `Plano ${planLabel} - debitado da carteira`
    : `Plano ${planLabel} - cobranca imediata`;
}

function isPlanChargeTransaction(tx: WalletTransaction) {
  const description = (tx.description ?? "").toLowerCase();
  return tx.type === "payment" && (
    description.includes("assinatura pro") ||
    description.includes("plano ")
  );
}

function getPlanChargeMethod(tx: WalletTransaction) {
  const description = (tx.description ?? "").toLowerCase();

  if (description.includes("carteira")) {
    return "Saldo da carteira";
  }

  if (
    description.includes("cobranca imediata") ||
    description.includes("assinatura pro")
  ) {
    return "Cartão de crédito";
  }

  return "Cobrança da plataforma";
}

const TX_ICON: Record<string, React.ReactNode> = {
  deposit: (
    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8l-8 8-8-8" />
    </svg>
  ),
  payment: (
    <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20V4m-8 8l8-8 8 8" />
    </svg>
  ),
  refund: (
    <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  ),
  admin_grant: (
    <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
};

function BrandBadge({ brand }: { brand: string | null }) {
  const BRAND_COLORS: Record<string, string> = {
    visa: "bg-[#1A1F71]", master: "bg-[#EB001B]", amex: "bg-[#2E77BC]",
    elo: "bg-zinc-800", hiper: "bg-orange-600",
  };
  const name = brand?.toLowerCase() ?? "";
  return (
    <span className={`${BRAND_COLORS[name] ?? "bg-zinc-700"} text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider`}>
      {name || "card"}
    </span>
  );
}

// ── Plan-change modal ─────────────────────────────────────────────────────────

interface ModalProps {
  plan:            PlanDef;
  currentPlanKey:  PlanKey;
  currentPrice:    number;
  planExpiresAt:   string | null;
  walletBalance:   number;
  savedCards:      SavedCard[];
  mpPublicKey:     string;
  onSuccess:       (newPlan: PlanKey, immediate: boolean, result: PlanChangeResponse) => void;
  onClose:         () => void;
}

function PlanChangeModal({
  plan, currentPlanKey, currentPrice, planExpiresAt,
  walletBalance, savedCards: initialCards, mpPublicKey, onSuccess, onClose,
}: ModalProps) {
  const isFromFree   = currentPlanKey === "free";
  const isUpgrade    = plan.price > currentPrice;
  const isDowngrade  = plan.price < currentPrice;
  const isToFree     = plan.key === "free";

  const forcedImmediate  = isFromFree && !isToFree;
  const forcedNextCycle  = isDowngrade;
  const [timing, setTiming] = useState<"immediate" | "next_cycle">(
    forcedImmediate ? "immediate" : "next_cycle"
  );

  const needsPayment = timing === "immediate" && !isToFree;
  const walletSufficient = walletBalance >= plan.price;

  type PayMethod = "wallet" | "card";
  const [payMethod, setPayMethod] = useState<PayMethod>(
    walletSufficient ? "wallet" : "card"
  );

  const [cards, setCards]             = useState<SavedCard[]>(initialCards);
  const [selectedCardId, setSelected] = useState<string | null>(initialCards[0]?.id ?? null);
  const [showCardForm, setShowCardForm] = useState(initialCards.length === 0 && !walletSufficient);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState("");

  // Compute "next billing date" label
  const nextBillingLabel = planExpiresAt ? fmtDate(planExpiresAt) : "no próximo ciclo";

  function handleCardSaved(card: SavedCard) {
    setCards((prev) => [card, ...prev]);
    setSelected(card.id);
    setShowCardForm(false);
  }

  async function handleConfirm() {
    if (needsPayment && payMethod === "card" && !selectedCardId) {
      setError("Selecione um cartão para continuar.");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/agencies/plan-change", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan:              plan.key,
        chargeImmediately: timing === "immediate",
        useWallet:         timing === "immediate" && payMethod === "wallet",
        savedCardId:       timing === "immediate" && payMethod === "card" ? selectedCardId : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Erro ao alterar plano. Tente novamente.");
      return;
    }
    onSuccess(plan.key, timing === "immediate", {
      effectiveAt: data.effectiveAt ?? new Date().toISOString(),
      expiresAt: data.expiresAt ?? null,
      paidVia: data.paidVia === "wallet" ? "wallet" : "card",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-zinc-100">
          <div>
            <div className={`h-[3px] w-12 rounded-full bg-gradient-to-r ${plan.gradient} mb-3`} />
            <h2 className="text-[17px] font-semibold text-zinc-900">
              {isToFree ? "Cancelar assinatura" : `Mudar para o plano ${plan.name}`}
            </h2>
            <p className="text-[13px] text-zinc-400 mt-0.5">
              {isToFree ? "Você passará para o plano gratuito" : `${plan.priceLabel}${plan.period}`}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors mt-0.5 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* ── Billing timing ── */}
          {forcedImmediate && !isToFree && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3.5 flex items-start gap-2.5">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px] text-amber-800">
                Você será cobrado <strong>{brl(plan.price)}</strong> agora e o plano será ativado imediatamente.
              </p>
            </div>
          )}

          {isToFree && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5">
              <p className="text-[13px] text-zinc-700">
                Seu plano encerrará em <strong>{nextBillingLabel}</strong>.
                Até lá você continua com acesso completo.
              </p>
            </div>
          )}

          {forcedNextCycle && !isToFree && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5">
              <p className="text-[13px] text-zinc-700">
                O downgrade para <strong>{plan.name}</strong> será ativado em <strong>{nextBillingLabel}</strong>.
                Nenhuma cobrança será feita hoje.
              </p>
            </div>
          )}

          {isUpgrade && !isFromFree && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Quando ativar?</p>
              <label className={[
                "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors",
                timing === "next_cycle" ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300",
              ].join(" ")}>
                <input
                  type="radio" name="timing" value="next_cycle"
                  checked={timing === "next_cycle"}
                  onChange={() => setTiming("next_cycle")}
                  className="mt-0.5 accent-zinc-900"
                />
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900">No próximo ciclo — {nextBillingLabel}</p>
                  <p className="text-[12px] text-zinc-400 mt-0.5">Sem cobrança hoje. Novo plano ativa na próxima renovação.</p>
                </div>
              </label>
              <label className={[
                "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors",
                timing === "immediate" ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300",
              ].join(" ")}>
                <input
                  type="radio" name="timing" value="immediate"
                  checked={timing === "immediate"}
                  onChange={() => setTiming("immediate")}
                  className="mt-0.5 accent-zinc-900"
                />
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900">Agora — cobrar {brl(plan.price)} hoje</p>
                  <p className="text-[12px] text-zinc-400 mt-0.5">Acesso imediato ao novo plano.</p>
                </div>
              </label>
            </div>
          )}

          {/* ── Payment method (only when charging now) ── */}
          {needsPayment && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Forma de pagamento</p>

              {/* Wallet option */}
              <label className={[
                "flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors",
                !walletSufficient ? "opacity-50 cursor-not-allowed" : payMethod === "wallet" ? "border-emerald-600 bg-emerald-50" : "border-zinc-200 hover:border-zinc-300",
              ].join(" ")}>
                <input
                  type="radio" name="payMethod" value="wallet"
                  checked={payMethod === "wallet"}
                  disabled={!walletSufficient}
                  onChange={() => { setPayMethod("wallet"); setShowCardForm(false); }}
                  className="accent-emerald-600"
                />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-900">Carteira Brisa</p>
                    <p className={[
                      "text-[12px] tabular-nums",
                      walletSufficient ? "text-emerald-600" : "text-rose-500",
                    ].join(" ")}>
                      {brl(walletBalance)} disponível
                      {!walletSufficient && ` — faltam ${brl(plan.price - walletBalance)}`}
                    </p>
                  </div>
                </div>
              </label>

              {/* Card option header */}
              <label className={[
                "flex items-center gap-3 px-3.5 pt-3.5 pb-1 rounded-t-xl border-x border-t cursor-pointer transition-colors",
                payMethod === "card" ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300",
              ].join(" ")}>
                <input
                  type="radio" name="payMethod" value="card"
                  checked={payMethod === "card"}
                  onChange={() => setPayMethod("card")}
                  className="accent-zinc-900"
                />
                <p className="text-[13px] font-semibold text-zinc-900">Cartão de crédito</p>
              </label>
              <div className={[
                "rounded-b-xl border-x border-b px-3.5 pb-3.5 space-y-2",
                payMethod === "card" ? "border-zinc-900 bg-zinc-50" : "border-zinc-200",
              ].join(" ")}>

              {cards.length > 0 && (
                <div className="space-y-2">
                  {cards.map((c) => {
                    const expiry = c.expiry_month && c.expiry_year
                      ? `${String(c.expiry_month).padStart(2, "0")}/${String(c.expiry_year).slice(-2)}`
                      : null;
                    return (
                      <label key={c.id} className={[
                        "flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors",
                        selectedCardId === c.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300",
                      ].join(" ")}>
                        <input
                          type="radio" name="card" value={c.id}
                          checked={selectedCardId === c.id}
                          onChange={() => { setSelected(c.id); setShowCardForm(false); }}
                          className="accent-zinc-900"
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <BrandBadge brand={c.brand} />
                          <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">•••• {c.last_four ?? "----"}</span>
                          {expiry && <span className="text-[12px] text-zinc-400">{expiry}</span>}
                          {c.holder_name && <span className="text-[12px] text-zinc-400 truncate">{c.holder_name}</span>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Add new card toggle */}
              {!showCardForm && (
                <button
                  type="button"
                  onClick={() => { setShowCardForm(true); setSelected(null); }}
                  className="flex items-center gap-2 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 border border-dashed border-zinc-300 hover:border-zinc-400 rounded-xl px-4 py-3 w-full transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {cards.length === 0 ? "Adicionar cartão para continuar" : "Usar outro cartão"}
                </button>
              )}

              {showCardForm && (
                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                  <AddCardForm
                    publicKey={mpPublicKey}
                    onSaved={handleCardSaved}
                    onCancel={() => { setShowCardForm(false); setSelected(cards[0]?.id ?? null); }}
                  />
                </div>
              )}
              </div>{/* end card section wrapper */}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        {!showCardForm && (
          <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-zinc-100">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || (needsPayment && payMethod === "card" && !selectedCardId) || (needsPayment && payMethod === "wallet" && !walletSufficient)}
              className={[
                "flex-1 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                isToFree || isDowngrade
                  ? "bg-zinc-700 hover:bg-zinc-600"
                  : "bg-zinc-900 hover:bg-zinc-800",
              ].join(" ")}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Processando…
                </span>
              ) : isToFree ? "Confirmar cancelamento"
                : timing === "immediate" ? `Cobrar ${brl(plan.price)} agora`
                : "Confirmar mudança"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BillingDashboard({
  userId,
  plan: initialPlan,
  planStatus,
  planExpiresAt,
  walletBalance,
  savedCards,
  transactions,
  mpPublicKey,
}: Props) {
  // A plan is active if it's not free — don't gate on plan_status so admin grants work
  const isActivePaid = initialPlan !== "free";

  const [activePlan, setActivePlan]       = useState<PlanKey>(
    (isActivePaid ? initialPlan : "free") as PlanKey
  );
  const [activePlanStatus, setActivePlanStatus] = useState(
    planStatus ?? (isActivePaid ? "active" : "inactive")
  );
  const [expiresAt, setExpiresAt]               = useState(planExpiresAt);
  const [currentWalletBalance, setCurrentWalletBalance] = useState(walletBalance);
  const [billingTransactions, setBillingTransactions]   = useState(transactions);
  const [pendingChange, setPendingChange] = useState<{ plan: PlanKey; effectiveAt: string } | null>(null);
  const [changingTo, setChangingTo]       = useState<PlanDef | null>(null);
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null);

  const currentPlanDef = getPlanDef(activePlan);
  const planChargeTransactions = billingTransactions.filter(isPlanChargeTransaction);
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
          label: pendingChange
            ? `Mudança para ${upcomingPlanDef.name}`
            : `Renovação do plano ${upcomingPlanDef.name}`,
        }
      : null;

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  }

  function handlePlanClick(p: PlanDef) {
    if (p.key === activePlan) return;
    setChangingTo(p);
  }

  function handleSuccess(newPlan: PlanKey, immediate: boolean, result: PlanChangeResponse) {
    setChangingTo(null);
    if (immediate) {
      const nextPlanDef = getPlanDef(newPlan);
      const nextExpiresAt = result.expiresAt ?? (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString();
      })();

      setActivePlan(newPlan);
      setActivePlanStatus(newPlan === "free" ? "inactive" : "active");
      setPendingChange(null);
      setExpiresAt(nextExpiresAt);

      if (nextPlanDef.price > 0) {
        const paidVia = result.paidVia === "wallet" ? "wallet" : "card";

        setBillingTransactions((prev) => [
          {
            id: `plan-charge-${Date.now()}`,
            type: "payment",
            amount: paidVia === "wallet" ? -nextPlanDef.price : nextPlanDef.price,
            description: getPlanChargeDescription(newPlan, paidVia),
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);

        if (paidVia === "wallet") {
          setCurrentWalletBalance((prev) => Math.max(0, prev - nextPlanDef.price));
        }
      }

      showToast(`Plano ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)} ativado com sucesso!`, true);
    } else if (newPlan === "free") {
      setPendingChange({ plan: newPlan, effectiveAt: result.effectiveAt });
      showToast(`Seu plano será cancelado em ${fmtDate(result.effectiveAt)}.`, true);
    } else {
      setPendingChange({ plan: newPlan, effectiveAt: result.effectiveAt });
      showToast(`Mudança para ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)} agendada para ${fmtDate(result.effectiveAt)}.`, true);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">

      {/* Toast */}
      {toast && (
        <div className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-[13px] font-medium text-white",
          toast.ok ? "bg-emerald-600" : "bg-rose-600",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      {/* Modal */}
      {changingTo && (
        <PlanChangeModal
          plan={changingTo}
          currentPlanKey={activePlan}
          currentPrice={currentPlanDef.price}
          planExpiresAt={expiresAt}
          walletBalance={currentWalletBalance}
          savedCards={savedCards}
          mpPublicKey={mpPublicKey}
          onSuccess={handleSuccess}
          onClose={() => setChangingTo(null)}
        />
      )}

      {/* ── Header ── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agência</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900">Plano & Cobrança</h1>
      </div>

      {/* Pending change banner */}
      {pendingChange && (
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3.5">
          <svg className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[13px] text-indigo-800">
            Mudança agendada: plano <strong>{pendingChange.plan.charAt(0).toUpperCase() + pendingChange.plan.slice(1)}</strong> ativará em <strong>{fmtDate(pendingChange.effectiveAt)}</strong>.
          </p>
        </div>
      )}

      {/* ── Plans ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Planos</p>
          {expiresAt && activePlan !== "free" && (
            <p className="text-[12px] text-zinc-400">Renova em {fmtDate(expiresAt)}</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((p) => {
            const isCurrent   = activePlan === p.key;
            const isDowngrade = p.price < currentPlanDef.price;
            const isPending   = pendingChange?.plan === p.key;
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
                    <span className="text-[15px] font-semibold text-zinc-900">{p.name}</span>
                    {p.badge && (
                      <span className={[
                        "text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider",
                        p.badge === "EM BREVE" ? "bg-zinc-200 text-zinc-500" : "bg-indigo-600 text-white",
                      ].join(" ")}>
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
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-[12px] text-zinc-600">
                        <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && !isPending && p.key === "premium" && (
                    <button
                      disabled
                      className="w-full mt-auto text-zinc-400 text-[13px] font-semibold py-2.5 rounded-xl bg-zinc-100 border border-zinc-200 cursor-not-allowed"
                    >
                      Em breve
                    </button>
                  )}
                  {!isCurrent && !isPending && p.key !== "free" && p.key !== "premium" && (
                    <button
                      onClick={() => handlePlanClick(p)}
                      className={[
                        "w-full mt-auto text-white text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer",
                        isDowngrade
                          ? "bg-zinc-500 hover:bg-zinc-600"
                          : "bg-zinc-900 hover:bg-zinc-800",
                      ].join(" ")}
                    >
                      {activePlan === "free"
                        ? `Assinar ${p.name}`
                        : isDowngrade
                          ? `Mudar para ${p.name}`
                          : `Fazer upgrade para ${p.name}`}
                    </button>
                  )}
                  {isPending && !isCurrent && (
                    <p className="text-[11px] text-indigo-600 text-center font-medium">
                      Ativará em {fmtDate(pendingChange!.effectiveAt)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Cancel subscription (paid plans only) ── */}
      {activePlan !== "free" && !pendingChange && (
        <div className="flex items-center justify-between bg-zinc-50 border border-zinc-100 rounded-2xl px-5 py-4">
          <div>
            <p className="text-[13px] font-semibold text-zinc-900">Cancelar assinatura</p>
            <p className="text-[12px] text-zinc-400 mt-0.5">Você voltará ao plano gratuito no fim do ciclo atual.</p>
          </div>
          <button
            onClick={() => {
              const freePlan = PLANS.find((p) => p.key === "free");
              if (freePlan) setChangingTo(freePlan);
            }}
            className="text-[13px] font-medium text-zinc-500 hover:text-rose-600 transition-colors border border-zinc-200 hover:border-rose-200 px-4 py-2 rounded-xl cursor-pointer"
          >
            Cancelar plano
          </button>
        </div>
      )}

      {/* ── Billing summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Última cobrança do plano</p>
          {latestPlanCharge ? (
            <div className="space-y-1">
              <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">
                {brl(Math.abs(latestPlanCharge.amount))}
              </p>
              <p className="text-[13px] text-zinc-600">{latestPlanCharge.description ?? "Cobrança de plano"}</p>
              <p className="text-[12px] text-zinc-400">{fmtDate(latestPlanCharge.created_at)}</p>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">Nenhuma cobrança de plano registrada ainda.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Próxima cobrança</p>
          {pendingChange?.plan === "free" ? (
            <div className="space-y-1">
              <p className="text-[15px] font-semibold text-zinc-900">Sem nova cobrança agendada</p>
              <p className="text-[13px] text-zinc-600">O plano atual será encerrado no fim do ciclo.</p>
              <p className="text-[12px] text-zinc-400">{fmtDate(pendingChange.effectiveAt)}</p>
            </div>
          ) : upcomingCharge ? (
            <div className="space-y-1">
              <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">
                {brl(upcomingCharge.amount)}
              </p>
              <p className="text-[13px] text-zinc-600">{upcomingCharge.label}</p>
              <p className="text-[12px] text-zinc-400">{fmtDate(upcomingCharge.chargeAt)}</p>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">Sem cobrança futura disponível no momento.</p>
          )}
        </div>
      </div>

      {/* ── Saved cards ── */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Cartões salvos</p>
        <SavedCardsWidget initialCards={savedCards} publicKey={mpPublicKey} />
      </div>

      {/* ── Transaction history ── */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Histórico de cobranças</p>

        {planChargeTransactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-10 text-center">
            <p className="text-[13px] text-zinc-400">Nenhuma cobrança de plano ainda.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
            {planChargeTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-8 h-8 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center flex-shrink-0">
                  {TX_ICON[tx.type] ?? TX_ICON.payment}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 truncate leading-snug">
                    {tx.description ?? "Cobrança de plano"}
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
