import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import OnboardingFlow from "./OnboardingFlow";

export default async function OnboardingPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed")
    .eq("id", user.id)
    .single();

  // Non-agency roles have nothing to onboard
  if (!profile || profile.role !== "agency") redirect("/");

  // Already completed — redirect to smart landing
  if (profile.onboarding_completed) {
    const [{ count: paidCount }, { count: jobCount }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", user.id)
        .eq("status", "paid"),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", user.id),
    ]);
    if (paidCount && paidCount > 0) redirect("/agency/talent-history");
    if (jobCount  && jobCount  > 0) redirect("/agency/dashboard");
    redirect("/agency/first-job");
  }

  return <OnboardingFlow />;
}
