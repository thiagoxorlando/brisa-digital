import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import AgencyProfile from "@/features/agency/AgencyProfile";

export const metadata: Metadata = { title: "Profile — ucastanet" };

export default async function AgencyProfilePage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: agency } = await supabase
    .from("agencies")
    .select("company_name, avatar_url, subscription_status, phone, address")
    .eq("id", user?.id ?? "")
    .single();

  return (
    <AgencyProfile
      userId={user?.id ?? ""}
      companyName={agency?.company_name ?? ""}
      avatarUrl={agency?.avatar_url ?? null}
      email={user?.email ?? ""}
      subscriptionStatus={agency?.subscription_status ?? "active"}
      phone={agency?.phone ?? ""}
      address={agency?.address ?? ""}
    />
  );
}
