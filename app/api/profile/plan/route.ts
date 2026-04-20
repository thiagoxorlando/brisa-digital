import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import { PLAN_KEYS, resolvePlanInfo } from "@/lib/plans";

function buildResponse(plan: string, planStatus: string, planExpiresAt: string | null) {
  const planInfo = resolvePlanInfo({ plan, plan_status: planStatus, plan_expires_at: planExpiresAt });
  return {
    plan:               planInfo.plan,
    plan_label:         planInfo.planLabel,
    plan_status:        planStatus,
    plan_expires_at:    planExpiresAt,
    is_pro:             planInfo.isPaid,
    is_premium:         planInfo.plan === "premium",
    is_active:          true,
    is_unlimited:       planInfo.isUnlimited,
    max_active_jobs:    planInfo.maxActiveJobs,
    max_hires_per_job:  planInfo.maxHiresPerJob,
    commission_rate:    planInfo.commissionRate,
    commission_label:   planInfo.commissionLabel,
    talent_share_label: planInfo.talentShareLabel,
    private_environment: planInfo.privateEnvironment,
  };
}

export async function GET() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  // Select only `plan` — plan_status/plan_expires_at may be absent from the
  // PostgREST schema cache and selecting them nulls the entire row.
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  const plan       = profile?.plan ?? "free";
  const planStatus = plan === "free" ? "free" : "active";

  console.log("[plan] current_user_plan", {
    userId: user.id,
    plan,
    planStatus,
    commissionLabel: resolvePlanInfo({ plan }).commissionLabel,
  });

  return NextResponse.json(buildResponse(plan, planStatus, null));
}

export async function PATCH(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json();
  const { plan } = body as { plan: string };

  if (!PLAN_KEYS.includes(plan as typeof PLAN_KEYS[number])) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const supabase    = createServerClient({ useServiceRole: true });
  const planStatus  = plan === "free" ? "inactive" : "active";
  const expiresAt   = plan === "free" ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Attempt full update (plan + plan_status + plan_expires_at)
  const { error: fullError } = await supabase
    .from("profiles")
    .update({ plan, plan_status: planStatus, plan_expires_at: expiresAt })
    .eq("id", user.id);

  if (fullError) {
    // Columns may not be in schema cache yet — fall back to plan-only update
    const { error: fallbackError } = await supabase
      .from("profiles")
      .update({ plan })
      .eq("id", user.id);
    if (fallbackError) {
      return NextResponse.json({ error: fallbackError.message }, { status: 500 });
    }
  }

  // Mirror to agencies.subscription_status for legacy compat
  await supabase
    .from("agencies")
    .update({ subscription_status: planStatus })
    .eq("id", user.id);

  return NextResponse.json(buildResponse(plan, planStatus, expiresAt));
}
