import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";
import WorkspaceAgentProfile from "@/features/agency/WorkspaceAgentProfile";

export const metadata: Metadata = { title: "My Profile — BrisaHub" };

export default async function WorkspaceAgentProfilePage() {
  const context = await requirePremiumWorkspacePageContext();
  const supabase = createServerClient({ useServiceRole: true });

  const [agencyRes, authRes] = await Promise.all([
    supabase
      .from("agencies")
      .select("contact_name, avatar_url, phone")
      .eq("id", context.userId)
      .maybeSingle(),
    supabase.auth.admin.getUserById(context.userId),
  ]);

  const agency = agencyRes.data;
  const email  = authRes.data.user?.email ?? "";

  return (
    <WorkspaceAgentProfile
      userId={context.userId}
      contactName={agency?.contact_name ?? ""}
      avatarUrl={(agency?.avatar_url as string | null) ?? null}
      email={email}
      phone={agency?.phone ?? ""}
    />
  );
}
