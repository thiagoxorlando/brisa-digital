import { createServerClient } from "@/lib/supabase";

type AdminSupabaseClient = ReturnType<typeof createServerClient>;

export async function resolvePortalOnlyTalentLanding(
  supabase: AdminSupabaseClient,
  userId: string,
) {
  const [portalRes, profileRes] = await Promise.all([
    supabase
      .from("premium_workspace_talents")
      .select("workspace_id")
      .eq("talent_user_id", userId)
      .eq("status", "active")
      .is("removed_at", null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("talent_profiles")
      .select("marketplace_visible")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const isPortalOnly =
    portalRes.data?.workspace_id != null &&
    profileRes.data?.marketplace_visible !== true;

  if (!isPortalOnly) return null;
  const workspaceId = portalRes.data?.workspace_id;
  if (!workspaceId) return null;

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("slug")
    .eq("id", workspaceId)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!workspace?.slug) return null;

  return `/talent/workspaces/${workspace.slug}`;
}
