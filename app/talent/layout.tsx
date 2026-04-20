import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function TalentLayout({ children }: { children: React.ReactNode }) {
  // ── Auth check ───────────────────────────────────────────────────────────────
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  // ── Onboarding gate ──────────────────────────────────────────────────────────
  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed")
    .eq("id", user.id)
    .single();

  // Wrong role — shouldn't be on a talent route
  if (profile?.role && profile.role !== "talent") {
    redirect(`/${profile.role}/dashboard`);
  }

  // Onboarding gate — only redirect genuinely new accounts
  if (!profile?.onboarding_completed) {
    // Check if they already have a talent profile (pre-existing account)
    const { data: existing } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (existing?.full_name) {
      // Existing account — silently mark onboarding complete and let through
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);
    } else {
      // Genuinely new account without a profile — redirect to setup
      redirect("/setup-profile");
    }
  }

  return <DashboardShell>{children}</DashboardShell>;
}
