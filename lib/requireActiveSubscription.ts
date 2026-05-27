import { createServerClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { resolvePlanInfo, type Plan } from "@/lib/plans";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { formatPlanCommission, formatTalentShareLabel } from "@/lib/planSettings.shared";

/**
 * Returns null if the agency has an active paid plan (pro or premium).
 * Returns a 403 NextResponse otherwise.
 *
 * Reads only profiles.plan — the single reliable column. plan_status and
 * plan_expires_at are omitted because they may not be in the PostgREST
 * schema cache and selecting them nulls the entire row.
 */
export async function requireActiveSubscription(agencyId: string): Promise<NextResponse | null> {
  if (!agencyId) return null;

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", agencyId)
    .single();

  // Any non-free plan is considered active (admin grants, paid subscriptions)
  if (profile?.plan && profile.plan !== "free") return null;

  // Legacy fallback: agencies.subscription_status mirrors paid/trial access.
  const { data: agency } = await supabase
    .from("agencies")
    .select("subscription_status")
    .eq("id", agencyId)
    .single();

  if (agency?.subscription_status === "active" || agency?.subscription_status === "trialing") return null;

  return NextResponse.json(
    { error: "Assinatura inativa. Reative seu plano para realizar esta ação." },
    { status: 403 }
  );
}

// ── Plan-tier limits ──────────────────────────────────────────────────────────

/**
 * Returns null if the agency may create another job.
 * Reads job_limit from plan_settings (source of truth). null = unlimited.
 */
export async function requireJobLimit(agencyId: string): Promise<NextResponse | null> {
  if (!agencyId) return null;

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", agencyId)
    .single();

  const plan = (profile?.plan ?? "free") as Plan;

  // Live plan_settings is the source of truth; null job_limit = unlimited
  const liveSetting = await getLivePlanSetting(plan);
  const jobLimit = liveSetting.job_limit;
  if (jobLimit === null) return null;

  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .is("deleted_at", null);

  console.log("[plan] job_limit_check", {
    agencyId,
    plan,
    currentJobs: count ?? 0,
    jobLimit,
  });

  if ((count ?? 0) >= jobLimit) {
    return NextResponse.json(
      {
        error: "plan_limit",
        message: `O plano Free permite ${jobLimit} vaga${jobLimit > 1 ? "s" : ""}. Faça upgrade para publicar mais vagas.`,
        limit: jobLimit,
        resource: "jobs",
        plan,
      },
      { status: 402 }
    );
  }

  return null;
}

/**
 * Returns null if the agency may hire another person for a job.
 * Returns a 402 NextResponse with error="plan_limit" if they're on FREE
 * and already have 3 hires for this job.
 */
export async function requireHireLimit(agencyId: string, jobId: string | null): Promise<NextResponse | null> {
  if (!agencyId || !jobId) return null;

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", agencyId)
    .single();

  const plan = (profile?.plan ?? "free") as Plan;
  const liveSetting = await getLivePlanSetting(plan);
  const maxHiresPerJob = liveSetting.max_hires_per_job;
  if (maxHiresPerJob === null) return null;

  const { count } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("job_id", jobId)
    .not("status", "in", '("cancelled","rejected")')
    .is("deleted_at", null);

  console.log("[plan] hire_limit_check", { agencyId, jobId, plan, currentHires: count ?? 0, maxHiresPerJob });

  if ((count ?? 0) >= maxHiresPerJob) {
    return NextResponse.json(
      {
        error: "plan_limit",
        message: `O plano Free permite contratar até ${maxHiresPerJob} talentos por vaga.`,
        limit: maxHiresPerJob,
        resource: "hires",
        plan,
      },
      { status: 402 }
    );
  }

  return null;
}

/**
 * Returns null if number_of_talents_required is within the plan's per-job limit.
 * Returns a 402 NextResponse with error="plan_limit" if it exceeds the limit.
 * Uses plan_settings as the source of truth (null = unlimited).
 */
export async function requireTalentsNeededForJob(
  agencyId: string,
  talentsNeeded: number | null | undefined,
): Promise<NextResponse | null> {
  if (!agencyId || !talentsNeeded || talentsNeeded <= 1) return null;

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", agencyId).single();
  const plan = (profile?.plan ?? "free") as Plan;
  const liveSetting = await getLivePlanSetting(plan);
  const maxHires = liveSetting.max_hires_per_job;

  if (maxHires === null) return null;

  if (talentsNeeded > maxHires) {
    return NextResponse.json(
      {
        error: "plan_limit",
        message: `O plano Free permite contratar até ${maxHires} talentos por vaga.`,
        limit: maxHires,
        resource: "hires_per_job",
        plan,
      },
      { status: 402 },
    );
  }

  return null;
}

/**
 * Returns the plan info for a given user (for UI display).
 */
export async function getPlanInfo(userId: string) {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, wallet_balance")
    .eq("id", userId)
    .single();

  const plan = (profile?.plan ?? "free") as Plan;
  const planInfo = resolvePlanInfo({ plan });
  const liveSetting = await getLivePlanSetting(plan);

  return {
    plan:               planInfo.plan,
    planLabel:          liveSetting.name,
    planStatus:         plan === "free" ? "inactive" : "active",
    planExpiresAt:      null,
    walletBalance:      Number(profile?.wallet_balance ?? 0),
    isActive:           planInfo.isPaid,
    isUnlimited:        liveSetting.job_limit === null,
    maxActiveJobs:      liveSetting.job_limit,
    maxHiresPerJob:     liveSetting.max_hires_per_job,
    commissionRate:     liveSetting.commission_rate,
    commissionLabel:    formatPlanCommission(liveSetting.commission_percent),
    talentShareLabel:   formatTalentShareLabel(liveSetting.commission_percent),
    privateEnvironment: planInfo.privateEnvironment,
  };
}
