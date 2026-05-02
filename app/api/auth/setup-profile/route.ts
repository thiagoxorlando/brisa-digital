import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const role = body.role as string | undefined;

  if (role !== profile.role) {
    return NextResponse.json({ error: "Função não corresponde ao perfil." }, { status: 403 });
  }

  if (role === "talent") {
    const t = (body.talent ?? {}) as Record<string, unknown>;

    const upsertPayload: Record<string, unknown> = {
      id:         user.id,
      deleted_at: null,
      full_name:  t.full_name  ?? null,
      phone:      t.phone      ?? null,
      country:    t.country    ?? null,
      city:       t.city       ?? null,
      gender:     t.gender     ?? null,
      age:        t.age        ?? null,
      bio:        t.bio        ?? null,
      categories: t.categories ?? [],
      instagram:  t.instagram  ?? null,
      tiktok:     t.tiktok     ?? null,
      youtube:    t.youtube    ?? null,
      linkedin:   t.linkedin   ?? null,
      website:    t.website    ?? null,
      main_role:  t.main_role  ?? null,
    };
    if (t.avatar_url) upsertPayload.avatar_url = t.avatar_url;

    const { error: talentErr } = await supabase
      .from("talent_profiles")
      .upsert(upsertPayload, { onConflict: "id" });

    if (talentErr) {
      console.error("[setup-profile/talent] upsert failed:", talentErr.message);
      return NextResponse.json({ error: talentErr.message }, { status: 400 });
    }

    const profileUpdate: Record<string, unknown> = { onboarding_completed: true };
    if (t.full_name) profileUpdate.full_name = t.full_name;

    await supabase.from("profiles").update(profileUpdate).eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  if (role === "agency") {
    const a = (body.agency ?? {}) as Record<string, unknown>;

    const { data: existing } = await supabase
      .from("agencies")
      .select("subscription_status")
      .eq("id", user.id)
      .maybeSingle();

    const upsertPayload: Record<string, unknown> = {
      id:                  user.id,
      user_id:             user.id,
      deleted_at:          null,
      subscription_status: existing?.subscription_status ?? "inactive",
      company_name:        a.company_name ?? null,
      contact_name:        a.contact_name ?? null,
      phone:               a.phone        ?? null,
      country:             a.country      ?? null,
      city:                a.city         ?? null,
      description:         a.description  ?? null,
      website:             a.website      ?? null,
    };
    if (a.avatar_url) upsertPayload.avatar_url = a.avatar_url;

    const { error: agencyErr } = await supabase
      .from("agencies")
      .upsert(upsertPayload, { onConflict: "id" });

    if (agencyErr) {
      console.error("[setup-profile/agency] upsert failed:", agencyErr.message);
      return NextResponse.json({ error: agencyErr.message }, { status: 400 });
    }

    const profileUpdate: Record<string, unknown> = { onboarding_completed: true };
    const name = a.company_name ?? a.contact_name;
    if (name) profileUpdate.full_name = name;

    await supabase.from("profiles").update(profileUpdate).eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Função inválida." }, { status: 400 });
}
