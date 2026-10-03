import { PLAN_DEFINITIONS, PLAN_KEYS, type Plan } from "@/lib/plans";
import { resolvePlanPricing, type PlanCurrency, type PlanPricingInput, type ResolvedPlanPricing } from "@/lib/planPricing";

export type { PlanCurrency } from "@/lib/planPricing";

export type PublicPlanSetting = {
  plan_key: Plan;
  name: string;
  price: number;
  commission_percent: number;
  commission_rate: number;
  is_available: boolean;
  job_limit: number | null;
  max_hires_per_job: number | null;
  included_agent_seats: number | null;
  extra_agent_seat_price: number | null;
  /** Free trial length in days (0 = no trial). */
  trial_days: number;
  /** Promotional first-cycle price in the plan's currency (0 = no intro offer). */
  intro_price: number;
  /** Number of billing cycles at intro_price before switching to recurring_price. */
  intro_cycles: number;
  /** Regular monthly price in the plan's currency after the intro period. */
  recurring_price: number;
  /** Pricing currency — determines the money symbol only, never the copy language. */
  currency: PlanCurrency;
};

/**
 * Hardcoded fallback used only when plan_settings cannot be read (and as the
 * client's initial state before /api/plan-settings resolves). Mirrors the
 * release configuration: BRL, Asaas-billable.
 */
export function buildPlanSettingsFallback(): Record<Plan, PublicPlanSetting> {
  const result = {} as Record<Plan, PublicPlanSetting>;

  for (const plan of PLAN_KEYS) {
    const def = PLAN_DEFINITIONS[plan];
    const isProPlan = plan === "pro";
    result[plan] = {
      plan_key: plan,
      name: def.label,
      price: isProPlan ? 79 : def.price,
      commission_percent: def.commissionRate * 100,
      commission_rate: def.commissionRate,
      is_available: def.available,
      job_limit: def.maxActiveJobs,
      max_hires_per_job: def.maxHiresPerJob,
      included_agent_seats: plan === "premium" ? 2 : null,
      extra_agent_seat_price: plan === "premium" ? 0 : null,
      trial_days: isProPlan ? 7 : 0,
      intro_price: isProPlan ? 29 : 0,
      intro_cycles: isProPlan ? 1 : 0,
      recurring_price: isProPlan ? 79 : 0,
      currency: "BRL",
    };
  }

  return result;
}

/**
 * The single plan-price formatter used in every locale.
 *
 * The CURRENCY comes only from the plan's configuration; the language only
 * picks the number style. No conversion, no exchange rates:
 *   BRL 79  → pt-BR "R$ 79"   | en "R$79"
 *   USD 129 → pt-BR "US$ 129" | en "$129"
 */
export function formatPlanPrice(
  price: number,
  currency: PlanCurrency = "BRL",
  lang: "pt-BR" | "en" = "pt-BR",
): string {
  const amount = Number.isFinite(Number(price)) ? Number(price) : 0;
  return new Intl.NumberFormat(lang === "en" ? "en-US" : "pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPlanMonthlyPrice(
  price: number,
  lang: "pt-BR" | "en" = "en",
  currency: PlanCurrency = "BRL",
): string {
  if (price === 0) return formatPlanPrice(0, currency, lang);
  const period = lang === "en" ? "/month" : "/mês";
  return `${formatPlanPrice(price, currency, lang)}${period}`;
}

export type PlanPricingLines = {
  /** The resolved offer every line below is derived from. */
  pricing: ResolvedPlanPricing;
  /** Headline price: intro price/month for intro offers, else regular price/month. */
  primaryPrice: string;
  /** "1 DIA GRÁTIS" / "7 DIAS GRÁTIS" | "1 DAY FREE" / "7 DAYS FREE". Null without a trial. */
  trialHeadline: string | null;
  /** "1 dia grátis" / "7 dias grátis" | "1-day free trial". Null without a trial. */
  trialLine: string | null;
  /** "R$ 29 no primeiro mês" | "R$29 first month". Null without an intro offer. */
  introLine: string | null;
  /** "Depois US$ 129/mês" | "Then $129/month". Null when there is nothing after a trial/intro. */
  recurringLine: string | null;
  /** Compact single-line summary for modals/tooltips. */
  promoSummary: string | null;
  /** "US$ 0 hoje" | "$0 today". Null without a trial. */
  todayLine: string | null;
  /** "Depois R$ 29 no primeiro mês" | "Then R$29 for the first month". Null without an intro offer. */
  introThenLine: string | null;
  /** "R$ 79/mês após o período promocional" | "R$79/month afterwards". Null without an intro offer. */
  afterPromoLine: string | null;
  isIntroOffer: boolean;
  hasTrial: boolean;
};

/**
 * Display lines for a plan, derived from resolvePlanPricing() — never from raw
 * columns. Every amount uses the plan's configured currency; `lang` only
 * changes the wording and number style. Portuguese does not mean BRL and
 * English does not mean USD.
 * Use this everywhere a plan's price is shown — never hardcode amounts.
 */
export function formatPlanPricing(
  setting: PlanPricingInput,
  lang: "pt-BR" | "en" = "en",
): PlanPricingLines {
  const pricing = resolvePlanPricing(setting);
  const { currency, trialDays, introPrice, introCycles, recurringPrice, hasIntro, hasTrial } = pricing;
  const pt = lang !== "en";
  const perMonth = pt ? "/mês" : "/month";
  const fmt = (amount: number) => formatPlanPrice(amount, currency, lang);

  const trialHeadline = hasTrial
    ? (pt ? `${trialDays} ${trialDays === 1 ? "DIA GRÁTIS" : "DIAS GRÁTIS"}` : `${trialDays} ${trialDays === 1 ? "DAY FREE" : "DAYS FREE"}`)
    : null;
  const trialLine = hasTrial
    ? (pt ? `${trialDays} ${trialDays === 1 ? "dia grátis" : "dias grátis"}` : `${trialDays}-day free trial`)
    : null;
  const todayLine = hasTrial ? (pt ? `${fmt(0)} hoje` : `${fmt(0)} today`) : null;

  if (hasIntro) {
    const introLine = pt
      ? (introCycles === 1 ? `${fmt(introPrice)} no primeiro mês` : `${fmt(introPrice)}/mês por ${introCycles} meses`)
      : (introCycles === 1 ? `${fmt(introPrice)} first month` : `${fmt(introPrice)}/month for ${introCycles} months`);
    const introThenLine = pt
      ? (introCycles === 1 ? `Depois ${fmt(introPrice)} no primeiro mês` : `Depois ${fmt(introPrice)}/mês por ${introCycles} meses`)
      : (introCycles === 1 ? `Then ${fmt(introPrice)} for the first month` : `Then ${fmt(introPrice)}/month for ${introCycles} months`);
    const recurringLine = pt
      ? `Depois ${fmt(recurringPrice)}${perMonth}`
      : `Then ${fmt(recurringPrice)}${perMonth}`;
    const afterPromoLine = pt
      ? `${fmt(recurringPrice)}${perMonth} após o período promocional`
      : `${fmt(recurringPrice)}${perMonth} afterwards`;

    return {
      pricing,
      primaryPrice: `${fmt(introPrice)}${perMonth}`,
      trialHeadline,
      trialLine,
      introLine,
      recurringLine,
      promoSummary: [trialLine, introLine, recurringLine].filter(Boolean).join(" · "),
      todayLine,
      introThenLine,
      afterPromoLine,
      isIntroOffer: true,
      hasTrial,
    };
  }

  // No intro offer: after a trial (if any) the regular price applies directly.
  const recurringLine = hasTrial
    ? (pt ? `Depois ${fmt(recurringPrice)}${perMonth}` : `Then ${fmt(recurringPrice)}${perMonth}`)
    : null;

  return {
    pricing,
    primaryPrice: formatPlanMonthlyPrice(recurringPrice, lang, currency),
    trialHeadline,
    trialLine,
    introLine: null,
    recurringLine,
    promoSummary: [trialLine, recurringLine].filter(Boolean).join(" · ") || null,
    todayLine,
    introThenLine: null,
    afterPromoLine: null,
    isIntroOffer: false,
    hasTrial,
  };
}

export function formatPlanCommission(commissionPercent: number): string {
  return `${commissionPercent.toFixed(0)}%`;
}

type PremiumSeatSetting = Pick<
  PublicPlanSetting,
  "plan_key" | "included_agent_seats" | "extra_agent_seat_price" | "currency"
>;

export function formatExtraSeatPriceLabel(
  setting: PremiumSeatSetting,
  lang: "pt-BR" | "en" = "en"
): string | null {
  if (setting.plan_key !== "premium") return null;
  if (setting.extra_agent_seat_price == null || setting.extra_agent_seat_price <= 0) {
    return lang === "en" ? "On request" : "Sob consulta";
  }
  return formatPlanMonthlyPrice(setting.extra_agent_seat_price, lang, setting.currency);
}

export function premiumSeatHighlights(
  setting: PremiumSeatSetting,
  lang: "pt-BR" | "en" = "en"
): string[] {
  if (setting.plan_key !== "premium") return [];

  const includedSeats = setting.included_agent_seats ?? 2;
  const extraSeatPrice = formatExtraSeatPriceLabel(setting, lang);

  if (lang === "en") {
    return [
      "Private agency workspace",
      `${includedSeats} agents included`,
      "Invite-only private jobs",
      "Custom branding",
      "Team management",
      "Agent spending controls",
      `Extra agent seat: ${extraSeatPrice ?? "On request"}`,
    ];
  }

  return [
    "Ambiente privado da agência",
    `${includedSeats} agentes incluídos`,
    "Vagas privadas por convite",
    "Personalização com logo e cores",
    "Gestão da equipe",
    "Controle de limites por agente",
    `Assento extra: ${extraSeatPrice ?? "Sob consulta"}`,
  ];
}

export function formatTalentShareLabel(commissionPercent: number): string {
  return `${Math.round(100 - commissionPercent)}%`;
}

/**
 * Returns display highlights for a plan card.
 * Pass showCommission=false in Internal payment mode to omit the commission
 * line — in internal mode BrisaHub does not process payments, so per-hire
 * commission cannot be charged.
 */
export function planLimitHighlights(
  setting: PublicPlanSetting,
  lang: "pt-BR" | "en" = "en",
  showCommission = true,
): string[] {
  if (lang === "en") {
    const jobs =
      setting.job_limit === null
        ? "Unlimited active jobs"
        : `${setting.job_limit} active job${setting.job_limit === 1 ? "" : "s"}`;
    const hires =
      setting.max_hires_per_job === null
        ? "Unlimited hires per job"
        : `Up to ${setting.max_hires_per_job} hire${setting.max_hires_per_job === 1 ? "" : "s"} per job`;
    const lines: string[] = [jobs, hires];
    if (showCommission && setting.commission_percent > 0) {
      lines.push(`Platform commission of ${formatPlanCommission(setting.commission_percent)}`);
    }
    return lines;
  }

  const jobs =
    setting.job_limit === null
      ? "Vagas ativas ilimitadas"
      : `${setting.job_limit} vaga${setting.job_limit === 1 ? " ativa" : "s ativas"}`;

  const hires =
    setting.max_hires_per_job === null
      ? "Contratações ilimitadas por vaga"
      : `Até ${setting.max_hires_per_job} contratação${setting.max_hires_per_job === 1 ? "" : "es"} por vaga`;

  const lines: string[] = [jobs, hires];
  if (showCommission && setting.commission_percent > 0) {
    lines.push(`Comissão da plataforma de ${formatPlanCommission(setting.commission_percent)}`);
  }
  return lines;
}
