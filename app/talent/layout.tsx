import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import DashboardShell from "@/components/layout/DashboardShell";
import type { WorkspacePortalData } from "@/lib/WorkspacePortalContext";
import { resolvePortalOnlyTalentLanding } from "@/lib/talentPortalLanding";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";

export default async function TalentLayout({ children }: { children: React.ReactNode }) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (profile?.role && profile.role !== "talent") {
    redirect(`/${profile.role}/dashboard`);
  }

  if (!profile?.onboarding_completed) {
    const { data: existing } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (existing?.full_name) {
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);
    } else {
      redirect("/setup-profile");
    }
  }

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  if (!pathname.startsWith("/talent/workspaces/")) {
    const portalLanding = await resolvePortalOnlyTalentLanding(supabase, user.id);
    if (portalLanding) {
      redirect(portalLanding);
    }
  }

  let initialWorkspacePortal: WorkspacePortalData | null = null;
  const workspaceSlug = pathname.match(/^\/talent\/workspaces\/([^/]+)/)?.[1] ?? null;

  if (workspaceSlug) {
    const { data: workspace } = await supabase
      .from("premium_workspaces")
      .select("slug, name, logo_url, brand_primary_color, brand_accent_color")
      .eq("slug", workspaceSlug)
      .is("deleted_at", null)
      .eq("status", "active")
      .maybeSingle();

    if (workspace) {
      initialWorkspacePortal = {
        slug: workspace.slug,
        name: workspace.name,
        logoUrl: (workspace.logo_url as string | null) ?? null,
        primaryColor: (workspace.brand_primary_color as string | null) ?? "#1ABC9C",
        accentColor: (workspace.brand_accent_color as string | null) ?? "#27C1D6",
        mode: "talent" as const,
      };
    }
  }

  const globalDefaults = await getGlobalPaymentDefaults();
  // In internal payment mode BrisaHub is not the payment intermediary.
  // Referrals (no commissions) and Disputes (handled between parties directly)
  // are not actionable — hide them from the talent sidebar.
  const hideEscrowNav = globalDefaults.default_payment_mode === "internal";

  return (
    <DashboardShell initialWorkspacePortal={initialWorkspacePortal} hideEscrowNav={hideEscrowNav}>
      {children}
    </DashboardShell>
  );
}
