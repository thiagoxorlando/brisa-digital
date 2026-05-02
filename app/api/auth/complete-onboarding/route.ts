import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

export async function POST(_req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }

  // Verify the role-specific row exists before marking onboarding complete
  if (profile.role === "talent") {
    const { data: talentRow } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!talentRow) {
      return NextResponse.json(
        { error: "Complete os dados do perfil antes de continuar." },
        { status: 400 },
      );
    }
  }

  if (profile.role === "agency") {
    const { data: agencyRow } = await supabase
      .from("agencies")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!agencyRow) {
      return NextResponse.json(
        { error: "Complete os dados do perfil antes de continuar." },
        { status: 400 },
      );
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  if (error) {
    console.error("[complete-onboarding] update failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
