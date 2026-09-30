import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { ensurePortalTalentMarketplacePrivacy } from "@/lib/talentMarketplace";
import WorkspacePortalShell from "@/features/talent/WorkspacePortalShell";

type Props = {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase
    .from("premium_workspaces")
    .select("name")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { title: "Portal — CastAnet" };
  return { title: `${data.name} — CastAnet` };
}

export default async function WorkspacePortalLayout({ children, params }: Props) {
  const { workspaceSlug } = await params;

  // Talent auth is guaranteed by the parent talent layout.
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) notFound();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("id, name, logo_url, brand_primary_color, brand_accent_color, status, deleted_at")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!workspace) notFound();

  // Auto-join: ensure the talent has an active membership
  const { data: membership } = await supabase
    .from("premium_workspace_talents")
    .select("id, status")
    .eq("workspace_id", workspace.id)
    .eq("talent_user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();

  if (!membership) {
    await supabase.from("premium_workspace_talents").insert({
      workspace_id:   workspace.id,
      talent_user_id: user.id,
      status:         "active",
      source:         "portal",
    });
  } else if (membership.status !== "active") {
    await supabase
      .from("premium_workspace_talents")
      .update({ status: "active", removed_at: null })
      .eq("id", membership.id);
  }

  await ensurePortalTalentMarketplacePrivacy(supabase, user.id);

  return (
    <WorkspacePortalShell
      workspace={{
        name: workspace.name,
        logoUrl: (workspace.logo_url as string | null) ?? null,
        brandPrimaryColor: (workspace.brand_primary_color as string | null) ?? null,
        brandAccentColor: (workspace.brand_accent_color as string | null) ?? null,
      }}
      workspaceSlug={workspaceSlug}
    >
      {children}
    </WorkspacePortalShell>
  );
}
