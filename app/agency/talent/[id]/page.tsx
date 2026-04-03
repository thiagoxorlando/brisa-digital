import type { Metadata } from "next";
import AgencyTalentProfile from "@/features/agency/AgencyTalentProfile";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Talent Profile — ucastanet" };

export default async function AgencyTalentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: talent }, { data: jobs }] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("*")
      .eq("id", id)
      .single(),
    supabase
      .from("jobs")
      .select("id, title")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <AgencyTalentProfile
      talent={talent}
      jobs={jobs ?? []}
    />
  );
}
