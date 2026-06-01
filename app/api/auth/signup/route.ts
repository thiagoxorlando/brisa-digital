import { NextRequest, NextResponse } from "next/server";
import { buildRateLimitKey, checkRateLimit, getRequestIp } from "@/lib/rateLimit";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { isValidCpf, isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/cpf";

const VALID_ROLES = ["agency", "talent"] as const;
const TERMS_VERSION = "terms_v1_2026_05";
const TERMS_ERROR = "Você precisa aceitar os Termos de Uso para continuar.";

export async function POST(req: NextRequest) {
  const { user_id, role, lang, termsAccepted, agency, talent, marketplaceVisible } = await req.json();

  if (!user_id || !role) {
    return NextResponse.json({ error: "Missing user_id or role" }, { status: 400 });
  }

  if (termsAccepted !== true) {
    return NextResponse.json({ error: TERMS_ERROR }, { status: 400 });
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const signupRateLimit = checkRateLimit({
    key: buildRateLimitKey("signup", getRequestIp(req), user.id),
    limit: 5,
    windowMs: 15 * 60 * 1000,
    message: "Muitas tentativas de cadastro. Tente novamente em alguns minutos.",
  });
  if (signupRateLimit) return signupRateLimit;

  if (user_id !== user.id) {
    return NextResponse.json({ error: "Cannot create profile for another user" }, { status: 403 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile?.role && existingProfile.role !== role) {
    return NextResponse.json({ error: "Profile role already set" }, { status: 409 });
  }

  // Write language_preference immediately so the DB default ('pt-BR') never
  // gets a chance to override the user's selected language in LanguageContext.
  const profileBase: Record<string, unknown> = { id: user.id, role };
  if (lang === "en" || lang === "pt-BR") profileBase.language_preference = lang;

  const { error } = await supabase
    .from("profiles")
    .upsert(profileBase, { onConflict: "id" });

  if (error) {
    console.error("[signup/route] profile upsert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (role === "agency") {
    const agencyData = (agency ?? {}) as Record<string, unknown>;
    const agencyCpfCnpj = normalizeCpfCnpj((agencyData.cpf_cnpj as string | null | undefined) ?? null);

    if (agencyCpfCnpj && !isValidCpfCnpj(agencyCpfCnpj)) {
      return NextResponse.json({ error: "CPF/CNPJ inválido." }, { status: 400 });
    }

    // Reactivate if soft-deleted, create if missing
    const { data: existing } = await supabase
      .from("agencies")
      .select("id, subscription_status")
      .eq("id", user.id)
      .maybeSingle();

    const agencyPayload: Record<string, unknown> = {
      id:                  user.id,
      user_id:             user.id,
      subscription_status: existing?.subscription_status ?? "inactive",
      deleted_at:          null,
    };

    if (agencyData.company_name) agencyPayload.company_name = agencyData.company_name;
    if (agencyData.contact_name) agencyPayload.contact_name = agencyData.contact_name;
    if (agencyData.phone) agencyPayload.phone = agencyData.phone;
    if (agencyData.country) agencyPayload.country = agencyData.country;
    if (agencyData.city) agencyPayload.city = agencyData.city;
    if (agencyData.state) agencyPayload.state = agencyData.state;
    if (agencyData.description) agencyPayload.description = agencyData.description;
    if (agencyData.website) agencyPayload.website = agencyData.website;
    if (agencyData.avatar_url) agencyPayload.avatar_url = agencyData.avatar_url;

    const { error: agencyErr } = await supabase
      .from("agencies")
      .upsert(agencyPayload, { onConflict: "id" });

    if (agencyErr) {
      console.error("[signup/route] agency upsert failed:", agencyErr.message);
      return NextResponse.json({ error: agencyErr.message }, { status: 400 });
    }

    const profileUpdate: Record<string, unknown> = {};
    const companyName = agencyData.company_name as string | undefined;
    const contactName = agencyData.contact_name as string | undefined;

    if (companyName?.trim()) profileUpdate.full_name = companyName.trim();
    else if (contactName?.trim()) profileUpdate.full_name = contactName.trim();
    if (agencyCpfCnpj) profileUpdate.cpf_cnpj = agencyCpfCnpj;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileUpdateErr } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", user.id);

      if (profileUpdateErr) {
        console.error("[signup/route] agency profile update failed:", profileUpdateErr.message);
        return NextResponse.json({ error: profileUpdateErr.message }, { status: 400 });
      }
    }
  }

  if (role === "talent") {
    const talentData = (talent ?? {}) as Record<string, unknown>;
    const talentCpf = normalizeCpfCnpj((talentData.cpf as string | null | undefined) ?? null);

    if (talentCpf && !isValidCpf(talentCpf)) {
      return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
    }

    // Reactivate if soft-deleted, create if missing
    const { error: talentErr } = await supabase
      .from("talent_profiles")
      .upsert(
        {
          id: user.id,
          user_id: user.id,
          deleted_at: null,
          full_name: talentData.full_name ?? null,
          phone: talentData.phone ?? null,
          country: talentData.country ?? null,
          city: talentData.city ?? null,
          state: talentData.state ?? null,
          gender: talentData.gender ?? null,
          age: talentData.age ?? null,
          bio: talentData.bio ?? null,
          categories: Array.isArray(talentData.categories) ? talentData.categories : [],
          instagram: talentData.instagram ?? null,
          tiktok: talentData.tiktok ?? null,
          youtube: talentData.youtube ?? null,
          linkedin: talentData.linkedin ?? null,
          website: talentData.website ?? null,
          avatar_url: talentData.avatar_url ?? null,
          marketplace_visible: marketplaceVisible === false ? false : true,
        },
        { onConflict: "id" },
      );

    if (talentErr) {
      console.error("[signup/route] talent_profile upsert failed:", talentErr.message);
      return NextResponse.json({ error: talentErr.message }, { status: 400 });
    }

    const profileUpdate: Record<string, unknown> = {};
    const fullName = talentData.full_name as string | undefined;

    if (fullName?.trim()) profileUpdate.full_name = fullName.trim();
    if (talentCpf) profileUpdate.cpf_cnpj = talentCpf;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileUpdateErr } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", user.id);

      if (profileUpdateErr) {
        console.error("[signup/route] talent profile update failed:", profileUpdateErr.message);
        return NextResponse.json({ error: profileUpdateErr.message }, { status: 400 });
      }
    }
  }

  const { error: termsError } = await supabase
    .from("terms_acceptances")
    .upsert(
      {
        user_id: user.id,
        terms_version: TERMS_VERSION,
        accepted_at: new Date().toISOString(),
        ip_address: getRequestIp(req),
        user_agent: req.headers.get("user-agent"),
      },
      { onConflict: "user_id,terms_version" },
    );

  if (termsError) {
    console.error("[signup/route] terms_acceptances upsert failed:", termsError.message);
    return NextResponse.json({ error: termsError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
