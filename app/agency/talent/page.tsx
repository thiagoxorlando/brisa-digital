import type { Metadata } from "next";
import TalentGrid from "@/features/agency/TalentGrid";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Talent — ucastanet" };

export default async function AgencyTalentPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id, full_name, bio, country, city, categories, avatar_url, photo_front_url, gender, age, ethnicity")
    .order("full_name");

  if (error) {
    console.error("[AgencyTalentPage]", error.message);
  }

  return <TalentGrid talent={data ?? []} />;
}
