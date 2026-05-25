/**
 * Trial and subscription status helpers.
 *
 * getSubscriptionStatus() is the single source of truth for the subscription
 * lifecycle state derived from profiles fields.
 *
 * Import only in server components and API routes — or pass the derived
 * SubscriptionStatus value as a prop to client components.
 */

export type SubscriptionStatus =
  | "free"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

type ProfileTrialFields = {
  plan?: string | null;
  plan_status?: string | null;
  trial_ends_at?: string | null;
  plan_expires_at?: string | null;
};

export function getSubscriptionStatus(
  profile: ProfileTrialFields | null | undefined,
): SubscriptionStatus {
  if (!profile) return "free";

  const plan = profile.plan ?? "free";
  const planStatus = (profile.plan_status ?? "").toLowerCase();

  if (plan === "free") return "free";

  if (planStatus === "trialing" || planStatus === "trial") {
    const stillActive = isTrialActive(profile.trial_ends_at);
    return stillActive ? "trialing" : "expired";
  }
  if (planStatus === "canceled" || planStatus === "cancelled") return "canceled";
  if (planStatus === "past_due")  return "past_due";
  if (planStatus === "inactive")  return "expired";

  // If plan_expires_at is in the past, treat as expired
  if (profile.plan_expires_at) {
    const expires = new Date(profile.plan_expires_at);
    if (expires < new Date()) return "expired";
  }

  return "active";
}

/**
 * Returns number of days remaining in the trial (rounded up), or null if not in trial.
 * Returns 0 if the trial has ended.
 */
export function getTrialDaysRemaining(
  trial_ends_at: string | null | undefined,
): number | null {
  if (!trial_ends_at) return null;
  const ends = new Date(trial_ends_at);
  const now  = new Date();
  if (ends <= now) return 0;
  return Math.ceil((ends.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isTrialActive(trial_ends_at: string | null | undefined): boolean {
  if (!trial_ends_at) return false;
  return new Date(trial_ends_at) > new Date();
}

export function formatTrialEndsAt(trial_ends_at: string | null | undefined): string | null {
  if (!trial_ends_at) return null;
  return new Date(trial_ends_at).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
