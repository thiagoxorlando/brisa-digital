import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import TalentProfilePreview from "@/features/talent/TalentProfilePreview";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase
    .from("talent_profiles")
    .select("full_name, bio")
    .eq("instagram", username)
    .single();
  if (!data) return { title: "Profile not found — Brisa Digital" };
  return {
    title: `${data.full_name ?? username} — Brisa Digital`,
    description: data.bio ?? undefined,
  };
}

export default async function TalentProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const { data } = await supabase
    .from("talent_profiles")
    .select("id, full_name, bio, city, country, categories, avatar_url, instagram, tiktok, youtube, gender, age, photo_front_url, photo_left_url, photo_right_url")
    .eq("instagram", username)
    .single();

  if (!data) notFound();
  return <TalentProfilePreview talent={data} />;
}
