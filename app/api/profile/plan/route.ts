import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { fetchAgencySubscriptionProfile, recoverAgencyTrialingFromAsaas } from "@/lib/asaasPlanSync.server";
import { resolvePlanInfo, type Plan } from "@/lib/plans";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { formatPlanCommission, formatTalentShareLabel } from "@/lib/planSettings.shared";
import { getSubscriptionStatus, getTrialDaysRemaining } from "@/lib/trialStatus";

export async function GET() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });
  let profileRow = await fetchAgencySubscriptionProfile(supabase, user.id);
  if (profileRow && profileRow.plan === "free" && profileRow.asaas_customer_id) {
    const recovery = await recoverAgencyTrialingFromAsaas({
      supabase,
      userId: user.id,
      profile: profileRow,
    });

    if (recovery.ok) {
      console.log("[profile/plan] recovered free account to trialing", {
        userId: user.id,
        subscriptionId: recovery.subscriptionId,
        paymentId: recovery.paymentId,
        trialEndsAt: recovery.trialEndsAt,
      });
      profileRow = await fetchAgencySubscriptionProfile(supabase, user.id);
    } else if (recovery.reason !== "already_active" && recovery.reason !== "missing_subscription") {
      console.warn("[profile/plan] recovery skipped", { userId: user.id, reason: recovery.reason });
    }
  }
  const rawPlan = ((profileRow?.plan as string | null) ?? "free") as Plan;
  const trialEndsAt = profileRow?.trial_ends_at ?? null;
  const planStatusFromDb = profileRow?.plan_status ?? null;

  // Apply the same correction as the billing page and agency layout:
  // if plan is "free" but Stripe trial is active, treat as "pro".
  const trialActive =
    planStatusFromDb === "trialing" ||
    (trialEndsAt ? new Date(trialEndsAt) > new Date() : false);
  const plan: Plan = (rawPlan === "free" && trialActive) ? "pro" : rawPlan;

  const subscriptionStatus = getSubscriptionStatus({
    plan,
    plan_status:    profileRow?.plan_status ?? null,
    trial_ends_at:  trialEndsAt,
    plan_expires_at: profileRow?.plan_expires_at ?? null,
  });
  const planStatus = subscriptionStatus;

  const [planInfo, liveSetting] = await Promise.all([
    Promise.resolve(resolvePlanInfo({ plan })),
    getLivePlanSetting(plan),
  ]);

  console.log("[plan] current_user_plan", {
    userId: user.id,
    plan,
    planStatus,
    commissionRate: liveSetting.commission_rate,
  });

  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt);

  return NextResponse.json({
    plan,
    plan_label:              liveSetting.name,
    plan_status:             planStatus,
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
