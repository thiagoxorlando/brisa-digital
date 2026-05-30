import { PLAN_DEFINITIONS, PLAN_KEYS, type Plan } from "@/lib/plans";
import { brlPlan } from "@/lib/brl";

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
  /** Promotional first-cycle price in BRL (0 = no intro offer). */
  intro_price: number;
  /** Number of billing cycles at intro_price before switching to recurring_price. */
  intro_cycles: number;
  /** Regular monthly price in BRL after the intro period. */
  recurring_price: number;
};

export function buildPlanSettingsFallback(): Record<Plan, PublicPlanSetting> {
  const result = {} as Record<Plan, PublicPlanSetting>;

  for (const plan of PLAN_KEYS) {
    const def = PLAN_DEFINITIONS[plan];
    result[plan] = {
      plan_key: plan,
      name: def.label,
      price: def.price,
      commission_percent: def.commissionRate * 100,
      commission_rate: def.commissionRate,
      is_available: def.available,
      job_limit: def.maxActiveJobs,
      max_hires_per_job: def.maxHiresPerJob,
      included_agent_seats: plan === "premium" ? 2 : null,
      extra_agent_seat_price: plan === "premium" ? 0 : null,
      trial_days: plan === "pro" ? 7 : 0,
      intro_price: plan === "pro" ? 97 : 0,
      intro_cycles: plan === "pro" ? 1 : 0,
      recurring_price: plan === "pro" ? 147 : 0,
    };
  }

  return result;
}

export function formatPlanPrice(price: number): string {
  return brlPlan(price);
}

export function formatPlanMonthlyPrice(price: number, lang: "pt-BR" | "en" = "pt-BR"): string {
  if (price === 0) return formatPlanPrice(price);
  const period = lang === "en" ? "/month" : "/mês";
  return `${formatPlanPrice(price)}${period}`;
}

export function formatPlanCommission(commissionPercent: number): string {
  return `${commissionPercent.toFixed(0)}%`;
}

type PremiumSeatSetting = Pick<
  PublicPlanSetting,
  "plan_key" | "included_agent_seats" | "extra_agent_seat_price"
>;

export function formatExtraSeatPriceLabel(
  setting: PremiumSeatSetting,
  lang: "pt-BR" | "en" = "pt-BR"
): string | null {
  if (setting.plan_key !== "premium") return null;
  if (setting.extra_agent_seat_price == null || setting.extra_agent_seat_price <= 0) {
    return lang === "en" ? "On request" : "Sob consulta";
  }
  return formatPlanMonthlyPrice(setting.extra_agent_seat_price, lang);
}

export function premiumSeatHighlights(
  setting: PremiumSeatSetting,
  lang: "pt-BR" | "en" = "pt-BR"
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

export function planLimitHighlights(setting: PublicPlanSetting, lang: "pt-BR" | "en" = "pt-BR"): string[] {
  if (lang === "en") {
    const jobs =
      setting.job_limit === null
        ? "Unlimited active jobs"
        : `${setting.job_limit} active job${setting.job_limit === 1 ? "" : "s"}`;
    const hires =
      setting.max_hires_per_job === null
        ? "Unlimited hires per job"
        : `Up to ${setting.max_hires_per_job} hire${setting.max_hires_per_job === 1 ? "" : "s"} per job`;
    return [
      jobs,
      hires,
      `Platform commission of ${formatPlanCommission(setting.commission_percent)}`,
    ];
  }

  const jobs =
    setting.job_limit === null
      ? "Vagas ativas ilimitadas"
      : `${setting.job_limit} vaga${setting.job_limit === 1 ? " ativa" : "s ativas"}`;

  const hires =
    setting.max_hires_per_job === null
      ? "Contratações ilimitadas por vaga"
      : `Até ${setting.max_hires_per_job} contratação${setting.max_hires_per_job === 1 ? "" : "es"} por vaga`;

  return [
    jobs,
    hires,
    `Comissão da plataforma de ${formatPlanCommission(setting.commission_percent)}`,
  ];
}
