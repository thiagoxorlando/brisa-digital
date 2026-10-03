/**
 * Single source of truth for how a plan_settings row becomes an offer.
 *
 * Every surface that shows or charges a plan price — public pricing cards,
 * signup, onboarding, Billing and the Asaas checkout route — must read the
 * effective values from resolvePlanPricing() instead of interpreting the raw
 * plan_settings columns itself.
 *
 * Fields used (all from plan_settings):
 *   currency        the plan's currency — the ONLY thing that decides the money
 *                   symbol. Never inferred from the UI language.
 *   trial_days      free-trial length for any paid plan (0 = no trial)
 *   intro_price     promotional price for the first intro_cycles months
 *   intro_cycles    number of monthly cycles charged at intro_price
 *   recurring_price regular monthly price
 *   is_available    admin availability switch (Admin > Plans)
 *
 * Legacy `price` column: it duplicates recurring_price. It is used ONLY as a
 * backward-compatible fallback when recurring_price is missing entirely
 * (rows created before the column existed). It is never the checkout amount
 * when recurring_price is present.
 *
 * Client-safe: no server imports.
 */
import type { Plan } from "@/lib/plans";

export type PlanCurrency = "USD" | "BRL";

/** Minimal plan_settings shape the resolver needs. */
export type PlanPricingInput = {
  plan_key: Plan;
  is_available: boolean;
  currency?: PlanCurrency | string | null;
  trial_days?: number | null;
  intro_price?: number | null;
  intro_cycles?: number | null;
  recurring_price?: number | null;
  /** @deprecated legacy duplicate of recurring_price — fallback only. */
  price?: number | null;
};

/**
 * Asaas is the only active processor and bills BRL only. A paid plan configured
 * in another currency can be displayed, but has no online checkout yet.
 */
export const CHECKOUT_CURRENCY: PlanCurrency = "BRL";

export type ResolvedPlanPricing = {
  planKey: Plan;
  currency: PlanCurrency;
  /** Raw admin switch (plan_settings.is_available). */
  isAvailable: boolean;
  /** Regular price > 0. */
  isPaid: boolean;
  /**
   * The plan can be shown as a live offer and selected/purchased: available,
   * and either free or with a real recurring price. A paid plan without a
   * recurring price is treated as not offered ("Coming soon").
   */
  isOffered: boolean;
  /**
   * The plan can be bought online right now: offered, and either free or priced
   * in the active processor's currency. False for e.g. a USD plan while only
   * Asaas (BRL) is active — pages must stop before creating a checkout.
   */
  isCheckoutSupported: boolean;
  trialDays: number;
  hasTrial: boolean;
  introPrice: number;
  introCycles: number;
  hasIntro: boolean;
  /** Regular monthly price after any intro period. */
  recurringPrice: number;
  /** Amount of the first charge the subscription is created with. */
  firstChargeAmount: number;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type ResolvePlanPricingOptions = {
  /**
   * False for agencies that already used their one-time trial
   * (profiles.pro_trial_used). The trial and the intro offer are a single
   * first-subscription promotion: a returning subscriber pays the regular
   * recurring price from the first charge.
   */
  trialEligible?: boolean;
};

export function resolvePlanPricing(
  setting: PlanPricingInput,
  { trialEligible = true }: ResolvePlanPricingOptions = {},
): ResolvedPlanPricing {
  const currency: PlanCurrency = setting.currency === "USD" ? "USD" : "BRL";

  // recurring_price is the regular price; legacy `price` only when it is absent.
  const recurringPrice = Math.max(
    0,
    setting.recurring_price != null ? num(setting.recurring_price) : num(setting.price),
  );

  const introPrice = Math.max(0, num(setting.intro_price));
  const introCycles = Math.max(0, Math.floor(num(setting.intro_cycles)));
  const hasIntro = trialEligible && introPrice > 0 && introCycles > 0 && recurringPrice > 0;

  const isPaid = recurringPrice > 0;
  // Trial is plan configuration: any paid plan with trial_days > 0 has one.
  const trialDays = trialEligible && isPaid ? Math.max(0, Math.floor(num(setting.trial_days))) : 0;

  const isAvailable = Boolean(setting.is_available);
  const isOffered = isAvailable && (setting.plan_key === "free" || isPaid);
  const isCheckoutSupported = isOffered && (!isPaid || currency === CHECKOUT_CURRENCY);

  return {
    planKey: setting.plan_key,
    currency,
    isAvailable,
    isPaid,
    isOffered,
    isCheckoutSupported,
    trialDays,
    hasTrial: trialDays > 0,
    introPrice,
    introCycles,
    hasIntro,
    recurringPrice,
    firstChargeAmount: hasIntro ? introPrice : recurringPrice,
  };
}
