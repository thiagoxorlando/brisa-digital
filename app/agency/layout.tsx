import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import DashboardShell from "@/components/layout/DashboardShell";
import { SubscriptionProvider } from "@/lib/SubscriptionContext";
import { AgencyConfigProvider } from "@/lib/AgencyConfigContext";
import SubscriptionBanner from "@/components/agency/SubscriptionBanner";
import { resolvePlanInfo, parsePlan } from "@/lib/plans";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";
import { resolveAgencyConfig } from "@/lib/agencyConfig";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";

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
        .select("plan")
        .eq("id", user?.id ?? "")
        .single(),
    ]),
    getUserPremiumWorkspace(user.id),
    getGlobalPaymentDefaults(),
  ]);

  const planSetting = await getLivePlanSetting(parsePlan(profile?.plan));
  const agencyConfig = resolveAgencyConfig(agency, planSetting.commission_percent, globalDefaults);

  // Invited workspace agents (role="agent") are NOT the plan payer —
  // their access derives from membership, not their own profiles.plan.
  const isWorkspaceAgent = ws?.membership.role === "agent" && ws.membership.status === "active";
  const isWorkspaceMember = !!ws;

  // Guard: private agents must not access open-platform routes.
  if (isWorkspaceAgent) {
    const hdrs = await headers();
    const pathname = hdrs.get("x-pathname") ?? "";
    if (AGENT_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      redirect("/agency/workspace");
    }
  }

  const planInfo = resolvePlanInfo(profile);
  const agencyStatus = agency?.subscription_status ?? "active";

  // Workspace members (owner or agent) are always considered active in the layout.
  const isActive = isWorkspaceMember
    ? true
    : (planInfo.plan === "free"
        ? agencyStatus !== "cancelling" && agencyStatus !== "suspended"
        : planInfo.isPaid);

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
      >
        <DashboardShell initialWorkspacePortal={agentWorkspacePortal}>
          {!isActive && <SubscriptionBanner />}
          {children}
        </DashboardShell>
      </SubscriptionProvider>
    </AgencyConfigProvider>
  );
}
