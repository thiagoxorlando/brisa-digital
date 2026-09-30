import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import TalentProfilePreview from "@/features/talent/TalentProfilePreview";
import { canViewerAccessTalentProfile } from "@/lib/talentMarketplace";

type Props = { params: Promise<{ username: string }> };

async function getTalentByUsername(username: string) {
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase
    .from("talent_profiles")
    .select("id, user_id, full_name, bio, city, country, categories, avatar_url, instagram, tiktok, youtube, gender, age, photo_front_url, photo_left_url, photo_right_url, marketplace_visible")
    .eq("instagram", username)
    .maybeSingle();

  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const talent = await getTalentByUsername(username);
  if (!talent) return { title: "Perfil nao encontrado - CastAnet" };

  return {
    title: `${talent.full_name ?? username} - CastAnet`,
    description: talent.bio ?? undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function TalentProfilePage({ params }: Props) {
  const { username } = await params;
  const talent = await getTalentByUsername(username);
  if (!talent) notFound();

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  const supabase = createServerClient({ useServiceRole: true });

  const canAccess = await canViewerAccessTalentProfile(
    supabase,
    {
      id: String(talent.id),
      user_id: (talent.user_id as string | null) ?? null,
      marketplace_visible: (talent.marketplace_visible as boolean | null) ?? null,
    },
    user?.id ?? null,
  );

  if (!canAccess) notFound();

  const { marketplace_visible: _marketplaceVisible, ...publicTalent } = talent;
  return <TalentProfilePreview talent={publicTalent} />;
}
