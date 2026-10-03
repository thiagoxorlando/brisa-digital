/**
 * Client entry point for paid-plan checkout. Asaas is the only active
 * processor: every page (signup, onboarding, Billing) starts a paid plan
 * through POST /api/asaas/plan/checkout, which prices the plan with the shared
 * resolver in lib/planPricing.ts.
 *
 *  - PRO: pass the card payload collected by ProTrialCheckoutModal. The route
 *    validates the card and returns { mode: "trialing" | "pending_confirmation" }.
 *  - Other paid plans: no card payload; the route returns { url } for the
 *    hosted Asaas invoice.
 */
import type { ProTrialCheckoutPayload } from "@/features/agency/ProTrialCheckoutModal";
import type { Plan } from "@/lib/plans";

export type PlanCheckoutResult = {
  url?: string;
  mode?: "trialing" | "pending_confirmation" | string;
  error?: string;
};

export async function startPlanCheckout(
  plan: Exclude<Plan, "free">,
  extra: Partial<ProTrialCheckoutPayload> & { cpfCnpj?: string } = {},
): Promise<PlanCheckoutResult> {
  const res = await fetch("/api/asaas/plan/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...extra, plan }),
  });
  const json = (await res.json().catch(() => ({}))) as PlanCheckoutResult;
  if (!res.ok) {
    throw new Error(json.error ?? "Nao foi possivel iniciar a assinatura. Tente novamente.");
  }
  return json;
}
