import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";
import SetupProfile from "@/features/onboarding/SetupProfile";

export const metadata: Metadata = { title: "Configurar perfil — BrisaHub" };

type Props = { searchParams: Promise<{ next?: string }> };

function safeNextPath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default async function SetupProfilePage({ searchParams }: Props) {
  const { next } = await searchParams;
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed) {
    const nextPath = safeNextPath(next);
    redirect(profile.role === "talent" && nextPath ? nextPath : `/${profile.role}/dashboard`);
  }

  return <SetupProfile nextPath={safeNextPath(next)} />;
}
