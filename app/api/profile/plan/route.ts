import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { fetchAgencySubscriptionProfile, recoverAgencyTrialingFromAsaas } from "@/lib/asaasPlanSync.server";
import { resolvePlanInfo, type Plan } from "@/lib/plans";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { formatPlanCommission, formatTalentShareLabel } from "@/lib/planSettings.shared";
import { getSubscriptionStatus, getTrialDaysRemaining } from "@/lib/trialStatus";
import { isStripeConfigured, getStripe, mapStripeStatusToPlanStatus } from "@/lib/stripe";

export async function GET() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });
  let profileRow = await fetchAgencySubscriptionProfile(supabase, user.id);

  // Asaas recovery for legacy accounts
  if (profileRow && profileRow.plan === "free" && profileRow.asaas_customer_id) {
    const recovery = await recoverAgencyTrialingFromAsaas({
      supabase,
      userId: user.id,
      profile: profileRow,
    });
    if (recovery.ok) {
      profileRow = await fetchAgencySubscriptionProfile(supabase, user.id);
    } else if (recovery.reason !== "already_active" && recovery.reason !== "missing_subscription") {
      console.warn("[profile/plan] Asaas recovery skipped", { userId: user.id, reason: recovery.reason });
    }
  }

  // ── Direct query for Stripe columns (fetchAgencySubscriptionProfile may fall ──
  // back to a legacy select that omits stripe_subscription_id).
  let stripeSubId:    string | null = null;
  let stripeCustomer: string | null = null;
  let directPlanStatus: string | null = profileRow?.plan_status ?? null;
  let directTrialEndsAt: string | null = profileRow?.trial_ends_at ?? null;
  try {
    const { data: direct } = await supabase
      .from("profiles")
      .select("stripe_subscription_id, stripe_customer_id, plan_status, trial_ends_at")
      .eq("id", user.id)
      .maybeSingle();
    if (direct) {
      const r = direct as Record<string, unknown>;
      stripeSubId       = (r.stripe_subscription_id as string | null) ?? null;
      stripeCustomer    = (r.stripe_customer_id      as string | null) ?? null;
      directPlanStatus  = (r.plan_status              as string | null) ?? directPlanStatus;
      directTrialEndsAt = (r.trial_ends_at             as string | null) ?? directTrialEndsAt;
    }
  } catch { /* non-fatal */ }

  const rawPlan = ((profileRow?.plan as string | null) ?? "free") as Plan;
  const trialEndsAt = directTrialEndsAt;
  const planStatusFromDb = directPlanStatus;
  const isCanceled = planStatusFromDb === "canceled";

  // ── Stripe live sync ──────────────────────────────────────────────────────────
  // If the DB says "free" but a Stripe subscription ID exists and isn't canceled,
  // check Stripe live. This is the same logic as billing page Pass 2 and ensures
  // SubscriptionContext.refreshPlan() (called on every mount) returns the correct
  // plan immediately — fixing the stale FREE badge in Topbar.
  let livePlan: Plan = rawPlan;
  const needsStripeCheck = isStripeConfigured() && !isCanceled &&
    (stripeSubId || stripeCustomer) && rawPlan === "free";

  if (needsStripeCheck) {
    try {
      const stripe = getStripe();
      type StripeSub = import("stripe").default.Subscription;
      let sub: StripeSub | null = null;

      if (stripeSubId) {
        sub = await stripe.subscriptions.retrieve(stripeSubId) as StripeSub;
      } else if (stripeCustomer) {
        const list = await stripe.subscriptions.list({ customer: stripeCustomer, limit: 5 });
        const found = list.data.find(
          (s) => s.status === "trialing" || s.status === "active",
        );
        sub = found ? (found as StripeSub) : null;
      }

      if (sub && (sub.status === "trialing" || sub.status === "active")) {
        livePlan = "pro";
        // Sync DB asynchronously so subsequent layout renders get the right value
        const syncPatch: Record<string, unknown> = {
          plan:                   "pro",
          plan_status:            mapStripeStatusToPlanStatus(sub.status),
          stripe_subscription_id: sub.id,
          pro_trial_used:         true,
        };
        if (typeof sub.customer === "string") syncPatch.stripe_customer_id = sub.customer;
        if (sub.trial_end) syncPatch.trial_ends_at = new Date(sub.trial_end * 1000).toISOString();
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
        if (periodEnd) syncPatch.plan_expires_at = new Date(periodEnd * 1000).toISOString();
        void supabase.from("profiles").update(syncPatch).eq("id", user.id);

      } else if (sub && sub.status === "canceled") {
        // Subscription canceled in Stripe — ensure DB is clean
        void supabase.from("profiles").update({
          plan: "free", plan_status: "canceled",
          trial_ends_at: null, stripe_subscription_id: null, plan_expires_at: null,
        } as Record<string, unknown>).eq("id", user.id);
      }
    } catch { /* non-fatal — fall through to DB-derived plan */ }
  }

  const plan: Plan = livePlan;

  // ── Resolve subscription status ───────────────────────────────────────────────
  const trialActive = !isCanceled && (
    planStatusFromDb === "trialing" ||
    (trialEndsAt ? new Date(trialEndsAt) > new Date() : false) ||
    livePlan === "pro"
  );
  const effectivePlanStatus = isCanceled
    ? "canceled"
    : (trialActive ? (planStatusFromDb === "trialing" ? "trialing" : (trialEndsAt ? "trialing" : "active")) : planStatusFromDb ?? "inactive");

  const subscriptionStatus = getSubscriptionStatus({
    plan,
    plan_status:    effectivePlanStatus,
    trial_ends_at:  trialEndsAt,
    plan_expires_at: profileRow?.plan_expires_at ?? null,
  });

  const [planInfo, liveSetting] = await Promise.all([
    Promise.resolve(resolvePlanInfo({ plan })),
    getLivePlanSetting(plan),
  ]);

  console.log("[plan] current_user_plan", { userId: user.id, plan, subscriptionStatus });

  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt);

  return NextResponse.json({
    plan,
    plan_label:              liveSetting.name,
    plan_status:             subscriptionStatus,
    subscription_status:     subscriptionStatus,
    subscription_provider:   profileRow?.subscription_provider ?? "asaas",
    plan_expires_at:         profileRow?.plan_expires_at ?? null,
    trial_started_at:        profileRow?.trial_started_at ?? null,
    trial_ends_at:           trialEndsAt,
    is_trialing:             subscriptionStatus === "trialing",
    trial_days_remaining:    trialDaysRemaining,
    is_pro:                  planInfo.isPaid,
    is_premium:              plan === "premium",
    is_active:               subscriptionStatus === "active" || subscriptionStatus === "trialing",
    is_unlimited:            liveSetting.job_limit === null,
    max_active_jobs:         liveSetting.job_limit,
    max_hires_per_job:       liveSetting.max_hires_per_job,
    commission_rate:         liveSetting.commission_rate,
    commission_label:        formatPlanCommission(liveSetting.commission_percent),
    talent_share_label:      formatTalentShareLabel(liveSetting.commission_percent),
    private_environment:     planInfo.privateEnvironment,
  });
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Plan changes must go through billing checkout" },
    { status: 405 }
  );
}
