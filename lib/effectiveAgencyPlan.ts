/**
 * Effective plan of an agency account — the single rule shared by the agency
 * layout (entitlements) and Admin > Planos (listing/counters).
 *
 * Source of truth: profiles.plan, promoted from "free" to "pro" while a trial is
 * active (plan_status "trialing" or trial_ends_at in the future). A canceled
 * subscription is never promoted (a webhook can leave a stale trial_ends_at).
 *
 * The agencies table row is optional configuration (company name, payment
 * mode); it does not decide whether an account exists or which plan it has.
 */
import { parsePlan, type Plan } from "@/lib/plans";

export type EffectivePlanProfile = {
  plan?: string | null;
  plan_status?: string | null;
  trial_ends_at?: string | null;
};

export function isAgencyTrialActive(profile: EffectivePlanProfile, now: Date = new Date()): boolean {
  if (profile.plan_status === "canceled") return false;
  if (profile.plan_status === "trialing") return true;
  return profile.trial_ends_at ? new Date(profile.trial_ends_at) > now : false;
}

export function resolveEffectiveAgencyPlan(profile: EffectivePlanProfile, now: Date = new Date()): Plan {
  const rawPlan = parsePlan(profile.plan ?? "free");
  return rawPlan === "free" && isAgencyTrialActive(profile, now) ? "pro" : rawPlan;
}
