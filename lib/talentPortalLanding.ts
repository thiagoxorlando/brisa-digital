import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

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
    // Query by user_id (canonical FK) with fallback to id (legacy profiles).
    supabase
      .from("talent_profiles")
      .select("marketplace_visible")
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .limit(1)
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

/**
 * Call at the top of any open-space talent page (Server Component).
 * Redirects portal-only talents to their workspace if accessed via
 * client-side navigation (router.push), which bypasses the layout guard.
 * Returns the userId for convenience so callers don't need a second auth call.
 */
export async function guardOpenSpacePage(): Promise<string> {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });
  const landing = await resolvePortalOnlyTalentLanding(supabase, user.id);
  if (landing) redirect(landing);

  return user.id;
}
