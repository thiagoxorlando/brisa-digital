import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import DashboardShell from "@/components/layout/DashboardShell";
import { SubscriptionProvider } from "@/lib/SubscriptionContext";
import SubscriptionBanner from "@/components/agency/SubscriptionBanner";

export default async function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: agency } = await supabase
    .from("agencies")
    .select("subscription_status")
    .eq("id", user?.id ?? "")
    .single();

  const isActive = (agency?.subscription_status ?? "active") === "active";

  return (
    <SubscriptionProvider isActive={isActive}>
      <DashboardShell>
        {!isActive && <SubscriptionBanner />}
        {children}
      </DashboardShell>
    </SubscriptionProvider>
  );
}
