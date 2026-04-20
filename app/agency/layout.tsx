import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import DashboardShell from "@/components/layout/DashboardShell";
import { SubscriptionProvider } from "@/lib/SubscriptionContext";
import SubscriptionBanner from "@/components/agency/SubscriptionBanner";
import { resolvePlanInfo } from "@/lib/plans";

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: agency }, { data: profile }] = await Promise.all([
    supabase
      .from("agencies")
      .select("subscription_status")
      .eq("id", user?.id ?? "")
      .single(),
    supabase
      .from("profiles")
      .select("plan")
      .eq("id", user?.id ?? "")
      .single(),
  ]);

  const planInfo = resolvePlanInfo(profile);
  const agencyStatus = agency?.subscription_status ?? "active";
  const isActive = planInfo.plan === "free"
    ? agencyStatus !== "cancelling" && agencyStatus !== "suspended"
    : planInfo.isPaid;

  return (
    <SubscriptionProvider initialPlan={planInfo.plan} initialIsActive={isActive} initialIsPro={planInfo.isPaid}>
      <DashboardShell>
        {!isActive && <SubscriptionBanner />}
        {children}
      </DashboardShell>
    </SubscriptionProvider>
  );
}
