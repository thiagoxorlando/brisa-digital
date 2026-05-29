import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import OnboardingFlow from "./OnboardingFlow";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";

type Props = { searchParams: Promise<{ next?: string; plan?: string }> };

function safeNextPath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default async function OnboardingPage({ searchParams }: Props) {
  const { next, plan } = await searchParams;
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (!profile?.role) redirect("/onboarding/role");

  const nextPath = safeNextPath(next);

  if (profile.role !== "agency" && profile.role !== "talent") {
    redirect(`/${profile.role}/dashboard`);
  }

  if (profile.onboarding_completed) {
    if (profile.role === "talent") redirect(nextPath ?? "/talent/dashboard");
    if (profile.role !== "agency") redirect(`/${profile.role}/dashboard`);

    // Agency with completed onboarding — honour ?next= so invite links survive
    if (nextPath) redirect(nextPath);

    const { count: jobCount } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", user.id);

    if (jobCount && jobCount > 0) redirect("/agency/dashboard");
    redirect("/agency/first-job");
  }

  const { default_payment_mode } = await getGlobalPaymentDefaults();

  return (
    <OnboardingFlow
      role={profile.role as "agency" | "talent"}
      nextPath={nextPath}
      initialPlan={plan === "pro" ? "pro" : "free"}
      paymentMode={default_payment_mode}
    />
  );
}
