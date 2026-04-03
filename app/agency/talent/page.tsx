import type { Metadata } from "next";
import TalentGrid from "@/features/agency/TalentGrid";
import TalentList from "@/features/agency/TalentList";
import TalentViewToggle from "@/features/agency/TalentViewToggle";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Talent — ucastanet" };

export default async function AgencyTalentPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id, full_name, bio, country, city, categories, avatar_url, photo_front_url, gender, age, ethnicity, instagram")
    .order("full_name");

  if (error) {
    console.error("[AgencyTalentPage]", error.message);
  }

  const talent = data ?? [];

  return (
    <TalentViewToggle
      gridView={<TalentGrid talent={talent} />}
      listView={<TalentList talent={talent} />}
      totalCount={talent.length}
    />
  );
}
