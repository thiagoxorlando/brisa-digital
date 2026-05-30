import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import SetupProfile from "@/features/onboarding/SetupProfile";

export const metadata: Metadata = { title: "Set Up Profile — BrisaHub" };

type Props = { searchParams: Promise<{ next?: string; plan?: string }> };

function safeNextPath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default async function SetupProfilePage({ searchParams }: Props) {
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

  const nextPath = safeNextPath(next);

  if (profile?.onboarding_completed) {
    redirect(profile.role === "talent" && nextPath ? nextPath : `/${profile.role}/dashboard`);
  }

  if (profile?.role === "talent") {
    const [{ data: talentRow }, { data: profileRow }] = await Promise.all([
      supabase
        .from("talent_profiles")
        .select("full_name, phone, country, city, state, categories")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("cpf_cnpj")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const isComplete = Boolean(
      talentRow?.full_name &&
      talentRow?.phone &&
      talentRow?.country &&
      talentRow?.city &&
      talentRow?.state &&
      Array.isArray(talentRow?.categories) &&
      talentRow.categories.length > 0 &&
      profileRow?.cpf_cnpj,
    );

    if (isComplete) {
      redirect(nextPath ? `/onboarding?next=${encodeURIComponent(nextPath)}` : "/onboarding");
    }
  }

  if (profile?.role === "agency") {
    const [{ data: agencyRow }, { data: profileRow }] = await Promise.all([
      supabase
        .from("agencies")
        .select("company_name, contact_name, phone, country, city, state")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("cpf_cnpj")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const isComplete = Boolean(
      agencyRow?.company_name &&
      agencyRow?.contact_name &&
      agencyRow?.phone &&
      agencyRow?.country &&
      agencyRow?.city &&
      agencyRow?.state &&
      profileRow?.cpf_cnpj,
    );

    if (isComplete) {
      const params = new URLSearchParams();
      if (nextPath) params.set("next", nextPath);
      if (plan === "pro") params.set("plan", "pro");
      const qs = params.toString();
      redirect(qs ? `/onboarding?${qs}` : "/onboarding");
    }
  }

  return <SetupProfile nextPath={nextPath} initialPlan={plan === "pro" ? "pro" : "free"} />;
}
