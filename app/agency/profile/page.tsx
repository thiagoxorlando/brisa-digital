import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyProfile from "@/features/agency/AgencyProfile";
import { formatCpfCnpj } from "@/lib/cpf";

export const metadata: Metadata = { title: "Perfil — BrisaHub" };

export default async function AgencyProfilePage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: agency }, { data: profile }] = await Promise.all([
    supabase
      .from("agencies")
      .select("company_name, contact_name, avatar_url, subscription_status, phone, address")
      .eq("id", user?.id ?? "")
      .single(),
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
  ]);

  // Pre-fill company name from DB; fall back to auth metadata when not yet set
  const fallbackName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    "";

  return (
    <AgencyProfile
      userId={user?.id ?? ""}
      companyName={agency?.company_name ?? fallbackName}
      agentName={agency?.contact_name ?? ""}
      avatarUrl={agency?.avatar_url ?? null}
      email={user?.email ?? ""}
      subscriptionStatus={agency?.subscription_status ?? "active"}
      phone={agency?.phone ?? ""}
      address={agency?.address ?? ""}
      cpfCnpj={formatCpfCnpj(typeof (profile as Record<string, unknown> | null)?.cpf_cnpj === "string" ? ((profile as Record<string, unknown>).cpf_cnpj as string) : "")}
    />
  );
}
