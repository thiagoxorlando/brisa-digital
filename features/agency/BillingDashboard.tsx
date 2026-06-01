"use client";

import { useEffect, useState } from "react";
import { useSubscription } from "@/lib/SubscriptionContext";
import { useT } from "@/lib/LanguageContext";
import { PLAN_DEFINITIONS, type Plan } from "@/lib/plans";
import { brl, usd } from "@/lib/brl";
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
    headlineKey: "billing_plan_free_headline",
    features: [
      "1 active job",
      "Up to 3 hires per job",
      "Digital contracts",
    ],
  },
  {
    key: "pro" as const,
    name: PLAN_DEFINITIONS.pro.label,
    price: PLAN_DEFINITIONS.pro.price,
    period: "/month",
    badge: "POPULAR" as const,
    gradient: "from-indigo-500 to-violet-600",
    headlineKey: "billing_plan_pro_headline",
    features: [
      "Unlimited active jobs",
      "Unlimited hires per job",
      "Payment receipt uploads",
      "Full contract history",
    ],
  },
  {
    key: "premium" as const,
    name: PLAN_DEFINITIONS.premium.label,
    price: PLAN_DEFINITIONS.premium.price,
    period: "",
    badge: null,
    gradient: "from-violet-500 to-purple-700",
    headlineKey: "billing_plan_premium_headline",
    features: [
      "Premium Space with branding",
      "Private invite-only jobs",
      "Team and seat management",
      "Per-agent usage limits",
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
  if (params.get("stripe") === "success" || params.get("success") === "true") return "success";
  if (params.get("canceled") === "true") return "canceled";
  return null;
}

function fmtDate(s: string | Date, lang: string) {
  return new Date(s).toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(s: string | Date, lang: string) {
  return new Date(s).toLocaleString(lang === "en" ? "en-US" : "pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtChargeAmount(amount: number, provider: string | null): string {
  return provider === "stripe" ? usd(amount) : brl(amount);
}

function getPlanDef(planKey: PlanKey) {
  return PLANS.find((plan) => plan.key === planKey) ?? PLANS[0];
}

// ── Comprovante modal ─────────────────────────────────────────────────────────

function ReceiptModal({ charge, onClose, t, lang }: { charge: PlanCharge; onClose: () => void; t: (k: string) => string; lang: string }) {
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
          <p className="text-[17px] font-semibold">{t("billing_receipt_title")}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3">
          <Row label={t("billing_receipt_plan")} value={charge.description ?? t("billing_subscription_label")} />
          <Row label={t("billing_receipt_amount")} value={fmtChargeAmount(charge.amount, charge.provider)} />
          <Row
            label={t("billing_receipt_status")}
            value={chargeStatusLabel(charge.status, t)}
            valueClass={charge.status === "paid" ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}
          />
          <Row label={t("billing_receipt_date")} value={fmtDateTime(charge.created_at, lang)} />
          {charge.asaas_payment_id && (
            <Row label="ID" value={charge.asaas_payment_id} mono />
          )}
          <Row label={t("billing_receipt_provider")} value={charge.provider === "stripe" ? t("billing_provider_stripe") : "Asaas"} />
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
              {t("billing_receipt_view_invoice")}
            </a>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer"
          >
            {t("billing_receipt_close")}
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

// ── Plan status label helpers ─────────────────────────────────────────────────

function planStatusLabel(status: string | null, t: (k: string) => string): string {
  switch (status) {
    case "active":      return t("billing_status_active");
    case "inactive":    return t("billing_status_inactive");
    case "pending":     return t("billing_status_pending");
    case "cancelled":
    case "canceled":    return t("billing_status_cancelled");
    case "past_due":
    case "overdue":     return t("billing_status_overdue");
    case "trialing":    return t("billing_status_trialing");
    case "paused":      return t("billing_status_paused");
    case "cancelling":  return t("billing_status_cancelling");
    default:            return t("billing_status_unavailable");
  }
}

function chargeStatusLabel(status: string | null, t: (k: string) => string): string {
  switch (status) {
    case "paid":      return t("billing_charge_paid");
    case "pending":   return t("billing_charge_pending");
    case "overdue":
    case "past_due":  return t("billing_charge_overdue");
    case "failed":    return t("billing_charge_failed");
    case "cancelled": return t("billing_charge_cancelled");
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
  t,
}: Pick<ModalProps, "plan" | "onUnavailable" | "onClose"> & { displayName: string; displayPriceLabel: string; t: (k: string) => string }) {
  const isToFree = plan.key === "free";
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitting(false);
    onClose();
    onUnavailable(t("common_unexpected_error"));
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
              {isToFree ? t("billing_plan_cancel") : `${t("billing_plan_upgrade_to")} ${displayName}`}
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
          <p className="text-[13px] text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
            {t("common_unexpected_error")}
          </p>
        </div>

        <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-zinc-100">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-[13px] font-medium text-zinc-600 hover:border-zinc-300 transition-colors cursor-pointer">
            {t("action_cancel")}
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
            {submitting ? t("billing_plan_processing") : t("action_confirm")}
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
}: Props) {
  const { t, lang } = useT();
  const isActivePaid = initialPlan !== "free";
  const [activePlan, setActivePlan] = useState<PlanKey>((isActivePaid ? initialPlan : "free") as PlanKey);
  const [activePlanStatus, setActivePlanStatus] = useState(planStatus ?? (isActivePaid ? "active" : "inactive"));
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const { refreshPlan } = useSubscription();

  const [currentTrialEndsAt, setCurrentTrialEndsAt] = useState<string | null>(trialEndsAt ?? null);
  // Use trial_ends_at being in the future as the authoritative trial signal.
  // plan_status may be "active" if the subscription.updated webhook fired before
  // checkout.session.completed during race conditions — this makes the check robust.
  const isEffectivelyTrialing =
    activePlanStatus === "trialing" ||
    (currentTrialEndsAt !== null &&
      new Date(currentTrialEndsAt) > new Date() &&
      activePlan !== "free");
  const isTrialing = isEffectivelyTrialing;
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
    return setting.is_available ? formatPlanPricing(setting, lang).primaryPrice : t("billing_plan_soon");
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

  async function handleStripeCheckout() {
    setProLoading(true);
    try {
      const res  = await fetch("/api/stripe/create-checkout", { method: "POST" });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        showToast(data.error ?? t("general_error"), false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      showToast(t("general_error"), false);
    } finally {
      setProLoading(false);
    }
  }

  function handlePlanClick(p: PlanDef) {
    const setting = effectiveSetting(p);
    if (!setting.is_available) {
      showToast(t("billing_plan_soon"), false);
      return;
    }
    if (p.key === "free" && activePlan !== "free") { void handleCancelSubscription(); return; }
    if (p.key === activePlan) return;
    if (p.key === "pro") { void handleStripeCheckout(); return; }
    if (setting.price > 0) { setChangingTo(p); return; }
    setChangingTo(p);
  }

  async function handleCancelSubscription() {
    if (!confirm(t("billing_cancel_confirm"))) return;
    setCancelingSubscription(true);
    try {
      const res = await fetch("/api/agency/subscription/cancel", { method: "POST" });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok) {
        showToast(data.error ?? t("general_error"), false);
        return;
      }
      setActivePlan("free");
      setActivePlanStatus("canceled");
      setCurrentTrialEndsAt(null);
      await refreshPlan();
      showToast(lang === "en" ? "Subscription cancelled. You are now on the Free plan." : "Assinatura cancelada. Você está no plano Free.", true);
    } finally {
      setCancelingSubscription(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Trial countdown banner — prominent version with days + pricing */}
      {isTrialing && trialDaysLeft !== null && (
        <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-5 text-white shadow-[0_8px_28px_rgba(99,102,241,0.3)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
                  {t("billing_trial_active")}
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
                  {t("billing_plan_trial_tag")}
                </span>
              </div>
              {trialDaysLeft > 0 ? (
                <>
                  <p className="text-[2rem] font-black tracking-[-0.04em] leading-none text-white">
                    {trialDaysLeft} {trialDaysLeft === 1 ? t("billing_trial_day_remaining") : t("billing_trial_days_remaining")}
                  </p>
                  {currentTrialEndsAt && (() => {
                    const setting = effectiveSetting(getPlanDef("pro"));
                    const fmt = (n: number) => formatPlanPrice(n, setting.currency);
                    const perMonth = setting.currency === "USD" ? "/month" : "/mês";
                    return (
                      <div className="space-y-0.5">
                        <p className="text-[13px] text-white/90">
                          {t("billing_trial_first_charge")} {fmtDate(currentTrialEndsAt, lang)}
                        </p>
                        {setting.intro_price > 0 && setting.recurring_price > 0 ? (
                          <p className="text-[12px] text-white/70">
                            {fmt(setting.intro_price)} {t("billing_trial_promo_first_month")} · {t("billing_trial_promo_then")} {fmt(setting.recurring_price)}{perMonth}
                          </p>
                        ) : setting.recurring_price > 0 ? (
                          <p className="text-[12px] text-white/70">
                            {fmt(setting.recurring_price)}{perMonth}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <p className="text-[15px] font-semibold text-white">{t("billing_trial_ended")}</p>
              )}
            </div>
            {trialDaysLeft > 0 && (
              <div className="flex-shrink-0">
                <button
                  onClick={handleCancelSubscription}
                  disabled={cancelingSubscription}
                  className="rounded-xl border border-white/30 bg-white/10 hover:bg-white/20 px-4 py-2.5 text-[13px] font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  {cancelingSubscription ? t("billing_canceling") : t("billing_cancel_before_charge")}
                </button>
              </div>
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
            <p className="text-[13px] font-semibold text-rose-800">{t("billing_payment_failed")}</p>
            <p className="text-[12px] text-rose-700 mt-0.5">{t("billing_payment_failed_desc")}</p>
          </div>
        </div>
      )}

      {returnBanner === "success" && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3.5">
          <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-emerald-800">{t("billing_checkout_success")}</p>
            <p className="text-[12px] text-emerald-700 mt-0.5">{t("billing_checkout_success_desc")}</p>
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
            <p className="text-[13px] font-semibold text-amber-800">{t("billing_checkout_cancelled")}</p>
            <p className="text-[12px] text-amber-700 mt-0.5">{t("billing_checkout_cancelled_desc")}</p>
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
          t={t}
        />
      )}
      {receiptCharge && (
        <ReceiptModal charge={receiptCharge} onClose={() => setReceiptCharge(null)} t={t} lang={lang} />
      )}

      {/* Page title */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("portal_agency")}</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900">{t("billing_title")}</h1>
      </div>

      {/* Current plan card */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{t("billing_current_plan")}</p>
            <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">{effectiveSetting(currentPlanDef).name}</p>
            <p className="text-[13px] text-zinc-500">
              {t("billing_plan_status")}: <strong className="text-zinc-800">
                {isEffectivelyTrialing ? t("billing_status_trialing") : planStatusLabel(activePlanStatus ?? "inactive", t)}
              </strong>
              {isEffectivelyTrialing && currentTrialEndsAt
                ? ` · ${t("billing_first_charge_on")} ${fmtDate(currentTrialEndsAt, lang)}`
                : expiresAt && activePlan !== "free"
                  ? ` · ${t("billing_renews_on")} ${fmtDate(expiresAt, lang)}`
                  : ""}
            </p>
            <p className="text-[13px] text-zinc-400">{t("billing_stripe_note")}</p>
          </div>
          {activePlan !== "free" && (
            <div className="flex-shrink-0">
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={cancelingSubscription}
                className="rounded-xl border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-600 hover:border-rose-200 hover:text-rose-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelingSubscription ? t("billing_canceling") : t("billing_plan_cancel")}
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
            <p className="text-[13px] font-semibold text-amber-800">{t("billing_cancellation_scheduled_title")}</p>
            <p className="text-[12px] text-amber-700 mt-0.5">
              {t("billing_cancellation_desc")} {fmtDate(expiresAt, lang)}.
            </p>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{t("billing_plans_heading")}</p>
          {(expiresAt || (isEffectivelyTrialing && currentTrialEndsAt)) && activePlan !== "free" && (
            <p className="text-[12px] text-zinc-400">
              {isEffectivelyTrialing
                ? `${t("billing_trial_first_charge")} ${fmtDate((expiresAt ?? currentTrialEndsAt)!, lang)}`
                : `${t("billing_renews_on")} ${fmtDate(expiresAt!, lang)}`}
            </p>
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
            const baseFeatures = available ? planLimitHighlights(setting).slice(0, 2) : [t("billing_plan_soon")];
            const featureList = p.key === "premium"
              ? available
                ? [lang === "en" ? "Premium Space" : "Espaço Premium", ...premiumSeatHighlights(setting)]
                : [t("billing_plan_soon")]
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
                        {t("billing_plan_soon")}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-auto">
                        {t("billing_plan_current_badge")}
                      </span>
                    )}
                    {isPending && !isCurrent && (
                      <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full ml-auto">
                        {t("billing_plan_scheduled_badge")}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mb-3 leading-snug">{t(p.headlineKey)}</p>
                  <div className="mb-1">
                    <span className="text-[1.75rem] font-bold tracking-tighter text-zinc-900">{effectivePriceLabel(p)}</span>
                  </div>
                  {available ? (() => {
                    const pricingLines = formatPlanPricing(effectiveSetting(p), lang);
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
                    <p className="text-[11px] font-semibold mb-4 text-zinc-400">{t("billing_plan_soon")}</p>
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
                        ? t("billing_plan_soon")
                        : isLoading
                        ? t("billing_plan_processing")
                        : p.key === "pro" && activePlan === "free" && proTrialEnabled && !proTrialUsed
                          ? t("billing_plan_start_trial")
                        : p.key === "premium" && activePlan === "free"
                          ? t("billing_plan_choose_premium")
                        : activePlan === "free"
                          ? `${t("billing_plan_subscribe")} ${setting.name}`
                          : isDowngrade
                            ? `${t("billing_plan_downgrade")} ${setting.name}`
                            : p.key === "premium"
                              ? t("billing_plan_upgrade_premium")
                              : `${t("billing_plan_upgrade_to")} ${setting.name}`}
                    </button>
                  )}
                  {isPending && !isCurrent && (
                    <p className="text-[11px] text-indigo-600 text-center font-medium">
                      {t("billing_plan_activates_on")} {fmtDate(pendingChange!.effectiveAt, lang)}
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
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">{t("billing_last_charge")}</p>
          {latestCharge ? (
            <div className="space-y-1.5">
              <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">{fmtChargeAmount(latestCharge.amount, latestCharge.provider)}</p>
              <p className="text-[13px] text-zinc-600">{latestCharge.description ?? t("billing_subscription_label")}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${chargeStatusColor(latestCharge.status)}`}>
                  {chargeStatusLabel(latestCharge.status, t)}
                </span>
                <span className="text-[11px] text-zinc-400">{fmtDate(latestCharge.created_at, lang)}</span>
                {latestCharge.asaas_payment_id && (
                  <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[120px]" title={latestCharge.asaas_payment_id}>
                    {latestCharge.asaas_payment_id.slice(0, 16)}…
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">
                {lang === "en" ? "Provider:" : "Provedor:"} {latestCharge.provider === "stripe" ? t("billing_provider_stripe") : "Asaas"}
              </p>
              <button
                onClick={() => setReceiptCharge(latestCharge)}
                className="mt-1 text-[12px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
              >
                {t("billing_view_receipt")}
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">
              {isEffectivelyTrialing && currentTrialEndsAt
                ? `${t("billing_charges_trialing")} ${fmtDate(currentTrialEndsAt, lang)}.`
                : t("billing_no_charge")}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">{t("billing_next_charge")}</p>
          {(expiresAt || nextChargeDate || (isEffectivelyTrialing && currentTrialEndsAt)) && activePlan !== "free" ? (
            <div className="space-y-1.5">
              {(() => {
                const setting = effectiveSetting(currentPlanDef);
                const introPrice = setting.intro_price;
                const recurringPrice = setting.recurring_price;
                const perMonth = setting.currency === "USD" ? "/month" : "/mês";
                const fmt = (n: number) => formatPlanPrice(n, setting.currency);
                // During trial: show intro price as first charge amount
                if (isEffectivelyTrialing && introPrice > 0) {
                  return (
                    <>
                      <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">{fmt(introPrice)}</p>
                      {recurringPrice > 0 && recurringPrice !== introPrice && (
                        <p className="text-[11px] text-indigo-600 font-medium">
                          {t("billing_trial_promo_first_month")} · {t("billing_trial_promo_then")} {fmt(recurringPrice)}{perMonth}
                        </p>
                      )}
                    </>
                  );
                }
                // Active plan (post-trial): show recurring price
                return (
                  <>
                    <p className="text-[1.5rem] font-bold tracking-tight text-zinc-900">{effectivePriceLabel(currentPlanDef)}</p>
                    {introCyclesRemaining != null && introCyclesRemaining > 0 && recurringPrice > 0 && (
                      <p className="text-[11px] text-indigo-600 font-medium">
                        {lang === "en" ? "Intro price · then " : "Preço intro · depois "}{fmt(recurringPrice)}{perMonth}
                      </p>
                    )}
                  </>
                );
              })()}
              <p className="text-[13px] text-zinc-600">
                {isEffectivelyTrialing
                  ? `${t("billing_plan_first_charge")} ${effectiveSetting(currentPlanDef).name}`
                  : `${t("billing_plan_renewal")} ${effectiveSetting(currentPlanDef).name}`}
              </p>
              <p className="text-[12px] text-zinc-400">{fmtDate((expiresAt ?? nextChargeDate ?? currentTrialEndsAt)!, lang)}</p>
              <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                {isEffectivelyTrialing ? t("billing_plan_trial_tag") : expiresAt ? t("billing_plan_next_charge_tag") : t("billing_plan_scheduled_tag")}
              </span>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">{t("billing_next_charge_na")}</p>
          )}
        </div>
      </div>

      {/* Charge history */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{t("billing_charge_history")}</p>
        {planCharges.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-10 text-center px-6">
            <p className="text-[13px] text-zinc-400">
              {isEffectivelyTrialing && currentTrialEndsAt
                ? `${t("billing_charges_trialing")} ${fmtDate(currentTrialEndsAt, lang)}.`
                : t("billing_no_charges_yet")}
            </p>
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
                    {charge.description ?? t("billing_subscription_label")}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${chargeStatusColor(charge.status)}`}>
                      {chargeStatusLabel(charge.status, t)}
                    </span>
                    <span className="text-[11px] text-zinc-400">{fmtDateTime(charge.created_at, lang)}</span>
                    {charge.asaas_payment_id && (
                      <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline" title={charge.asaas_payment_id}>
                        {charge.asaas_payment_id.slice(0, 12)}…
                      </span>
                    )}
                    <span className="text-[11px] text-zinc-300">· {charge.provider === "stripe" ? t("billing_provider_stripe") : "Asaas"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="text-[14px] font-bold tabular-nums text-zinc-900">{fmtChargeAmount(charge.amount, charge.provider)}</p>
                  <button
                    onClick={() => setReceiptCharge(charge)}
                    className="text-[12px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {t("billing_comprovante")}
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
