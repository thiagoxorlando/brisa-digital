export type Plan = "free" | "pro" | "premium";

export type PlanDefinition = {
  key: Plan;
  label: string;
  price: number;
  priceLabel: string;
  maxActiveJobs: number | null;
  maxHiresPerJob: number | null;
  commissionRate: number;
  commissionLabel: string;
  privateEnvironment: boolean;
  features: string[];
};

export type PlanProfile = {
  plan?: string | null;
  plan_status?: string | null;
  plan_expires_at?: string | null;
};

export const PLAN_KEYS: Plan[] = ["free", "pro", "premium"];
export const PLAN_DEFAULT: Plan = "free";
export const REFERRAL_RATE = 0.02;

export const PLAN_DEFINITIONS: Record<Plan, PlanDefinition> = {
  free: {
    key: "free",
    label: "Free",
    price: 0,
    priceLabel: "R$0",
    maxActiveJobs: 1,
    maxHiresPerJob: 3,
    commissionRate: 0.2,
    commissionLabel: "20%",
    privateEnvironment: false,
    features: [
      "1 vaga ativa",
      "Ate 3 contratacoes por vaga",
      "Comissao da plataforma de 20%",
    ],
  },
  pro: {
    key: "pro",
    label: "Pro",
    price: 127,
    priceLabel: "R$127",
    maxActiveJobs: null,
    maxHiresPerJob: null,
    commissionRate: 0.15,
    commissionLabel: "15%",
    privateEnvironment: false,
    features: [
      "Vagas ilimitadas",
      "Contratacoes ilimitadas",
      "Comissao da plataforma de 15%",
    ],
  },
  premium: {
    key: "premium",
    label: "Premium",
    price: 297,
    priceLabel: "R$297",
    maxActiveJobs: null,
    maxHiresPerJob: null,
    commissionRate: 0.1,
    commissionLabel: "10-12%",
    privateEnvironment: true,
    features: [
      "Vagas ilimitadas",
      "Contratacoes ilimitadas",
      "Comissao da plataforma a partir de 10%",
      "Ambiente privado opcional",
    ],
  },
};

export function parsePlan(plan: string | null | undefined): Plan {
  return PLAN_KEYS.includes(plan as Plan) ? (plan as Plan) : PLAN_DEFAULT;
}

export function getPlanDefinition(plan: string | null | undefined): PlanDefinition {
  return PLAN_DEFINITIONS[parsePlan(plan)];
}

export function getPlanLabel(plan: string | null | undefined): string {
  return getPlanDefinition(plan).label;
}

export function getPlanPrice(plan: string | null | undefined): number {
  return getPlanDefinition(plan).price;
}

export function isPaidPlan(plan: string | null | undefined): boolean {
  return parsePlan(plan) !== "free";
}

export function canUsePrivateEnvironment(plan: string | null | undefined): boolean {
  return getPlanDefinition(plan).privateEnvironment;
}

export function calculateCommission(amount: number, plan: string | null | undefined): number {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return roundMoney(safeAmount * getPlanDefinition(plan).commissionRate);
}

export function calculateNetAmount(amount: number, plan: string | null | undefined): number {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return roundMoney(safeAmount - calculateCommission(safeAmount, plan));
}

export function getTalentShareLabel(plan: string | null | undefined): string {
  return `${Math.round((1 - getPlanDefinition(plan).commissionRate) * 100)}%`;
}

export function getPlanLimitsSummary(plan: string | null | undefined): string[] {
  const definition = getPlanDefinition(plan);
  return [
    definition.maxActiveJobs === null
      ? "Vagas ativas ilimitadas"
      : `Ate ${definition.maxActiveJobs} vaga ativa`,
    definition.maxHiresPerJob === null
      ? "Contratacoes ilimitadas por vaga"
      : `Ate ${definition.maxHiresPerJob} contratacoes por vaga`,
    `Comissao da plataforma: ${definition.commissionLabel}`,
  ];
}

export function resolvePlanInfo(profile: PlanProfile | null | undefined) {
  const plan = parsePlan(profile?.plan);
  const definition = PLAN_DEFINITIONS[plan];

  return {
    plan,
    planLabel: definition.label,
    planStatus: profile?.plan_status ?? null,
    planExpiresAt: profile?.plan_expires_at ?? null,
    isPaid: plan !== "free",
    isUnlimited: definition.maxActiveJobs === null && definition.maxHiresPerJob === null,
    maxActiveJobs: definition.maxActiveJobs,
    maxHiresPerJob: definition.maxHiresPerJob,
    commissionRate: definition.commissionRate,
    commissionLabel: definition.commissionLabel,
    talentShareLabel: getTalentShareLabel(plan),
    privateEnvironment: definition.privateEnvironment,
  };
}

export function formatPlanLimit(limit: number | null, noun: string): string {
  return limit === null ? `${noun} ilimitados` : `${limit} ${noun}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
