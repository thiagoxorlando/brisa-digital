import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import DashboardShell from "@/components/layout/DashboardShell";
import { SubscriptionProvider } from "@/lib/SubscriptionContext";
import { AgencyConfigProvider } from "@/lib/AgencyConfigContext";
import FrozenBanner from "@/components/agency/FrozenBanner";
import { resolvePlanInfo, parsePlan } from "@/lib/plans";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";
import { resolveAgencyConfig } from "@/lib/agencyConfig";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";

// ── Routes private workspace agents may NOT access ────────────────────────────

const AGENT_BLOCKED_PREFIXES = [
  "/agency/dashboard",
  "/agency/jobs",
  "/agency/talent",
  "/agency/bookings",
  "/agency/contracts",
  "/agency/finances",
  "/agency/billing",
  "/agency/plan",
  "/agency/referrals",
  "/agency/post-job",
  "/agency/first-job",
  "/agency/talent-history",
  "/agency/create",
  "/agency/submissions",
];

// ── Routes a FROZEN (no active subscription) agency owner can still access ───
// All other /agency/* paths redirect to /agency/billing with a frozen message.

const FROZEN_ALLOWED_PREFIXES = [
  "/agency/billing",
  "/agency/support",
  "/agency/profile",
];

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });

  const [[{ data: agency }, { data: profile }], ws, globalDefaults] = await Promise.all([
    Promise.all([
      supabase
        .from("agencies")
        .select("subscription_status, payment_mode, commission_percent_override, escrow_enabled, receipt_uploads_enabled")
        .eq("id", user?.id ?? "")
        .single(),
      supabase
        .from("profiles")
        .select("plan, plan_status, trial_ends_at")
        .eq("id", user?.id ?? "")
        .single(),
    ]),
    getUserPremiumWorkspace(user.id),
    getGlobalPaymentDefaults(),
  ]);

  const planSetting = await getLivePlanSetting(parsePlan(profile?.plan));
  const agencyConfig = resolveAgencyConfig(agency, planSetting.commission_percent, globalDefaults);

  const isWorkspaceAgent  = ws?.membership.role === "agent" && ws.membership.status === "active";
  const isWorkspaceMember = !!ws;

  // Guard: private agents must not access open-platform routes.
  if (isWorkspaceAgent) {
    const hdrs = await headers();
    const pathname = hdrs.get("x-pathname") ?? "";
    if (AGENT_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      redirect("/agency/workspace");
    }
  }

  // ── Resolve effective plan ────────────────────────────────────────────────────
  // Promote "free" → "pro" when Stripe trial is confirmed active in DB.
  // Guard: never promote when plan_status="canceled" (webhook may leave a stale
  // trial_ends_at timestamp on canceled subscriptions).
  const rawPlan    = profile?.plan ?? "free";
  const isCanceled = profile?.plan_status === "canceled";
  const trialActive = !isCanceled && (
    profile?.plan_status === "trialing" ||
    (profile?.trial_ends_at ? new Date(profile.trial_ends_at as string) > new Date() : false)
  );
  const effectivePlan = rawPlan === "free" && trialActive ? "pro" : rawPlan;

  // ── Active / frozen determination ─────────────────────────────────────────────
  // An agency is ACTIVE when they have a live PRO or Premium subscription.
  // Workspace agents/members inherit the workspace owner's entitlement.
  //
  // IMPORTANT: do NOT default null plan_status to "inactive".
  // During the checkout → webhook propagation window, the DB may have
  // plan_status = null even though a real Stripe subscription exists.
  // Defaulting to "inactive" would freeze a trialing account before the
  // webhook has had a chance to update the row.
  // Only freeze when plan_status is EXPLICITLY a frozen/bad status.
  const FROZEN_STATUSES = new Set(["canceled", "past_due", "unpaid", "overdue"]);
  const planStatusRaw = profile?.plan_status ?? null;  // null = unknown, not frozen
  const subscriptionIsActive =
    effectivePlan === "pro" || effectivePlan === "premium";
  const isFrozen = !isWorkspaceMember &&
    !subscriptionIsActive &&
    planStatusRaw !== null &&
    FROZEN_STATUSES.has(planStatusRaw);

  const planInfo = resolvePlanInfo({ ...profile, plan: effectivePlan });

  // isActive controls SubscriptionBanner visibility and feature limits.
  const isActive = isWorkspaceMember || subscriptionIsActive;

  // ── Freeze gate ───────────────────────────────────────────────────────────────
  // Frozen agencies (canceled/inactive subscription) can only access billing,
  // support, and profile. All other routes redirect to billing.
  if (isFrozen && !isWorkspaceAgent) {
    const hdrs = await headers();
    const pathname = hdrs.get("x-pathname") ?? "";
    const allowed = FROZEN_ALLOWED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (!allowed) {
      redirect("/agency/billing?frozen=1");
    }
  }

  const agentWorkspacePortal = isWorkspaceAgent && ws
    ? {
        slug:         ws.workspace.slug ?? "",
        name:         ws.workspace.name,
        logoUrl:      ws.workspace.logoUrl,
        primaryColor: ws.workspace.brandPrimaryColor ?? "#1ABC9C",
        accentColor:  ws.workspace.brandAccentColor  ?? "#27C1D6",
        mode:         "agent" as const,
      }
    : null;

  return (
    <AgencyConfigProvider initial={agencyConfig}>
      <SubscriptionProvider
        initialPlan={planInfo.plan}
        initialIsActive={isActive}
        initialIsPro={planInfo.isPaid}
        initialIsWorkspaceAgent={isWorkspaceAgent}
        initialIsFrozen={isFrozen}
      >
        <DashboardShell initialWorkspacePortal={agentWorkspacePortal}>
          {/* FrozenBanner reads isFrozen from SubscriptionContext (client state).
              Always rendered so it can self-hide after refreshPlan() resolves.
              Server-side isFrozen only controls the redirect gate below. */}
          <FrozenBanner />
          {children}
        </DashboardShell>
      </SubscriptionProvider>
    </AgencyConfigProvider>
  );
}
