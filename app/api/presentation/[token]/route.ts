import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerClient } from "@/lib/supabase";

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const candidate = crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const password = req.nextUrl.searchParams.get("password") ?? "";

  const supabase = createServerClient({ useServiceRole: true });

  const { data: presentation } = await supabase
    .from("workspace_presentations")
    .select("id, workspace_id, job_id, title, intro, password_hash, expires_at, view_count")
    .eq("token", token)
    .single();

  if (!presentation) return NextResponse.json({ error: "Apresentação não encontrada." }, { status: 404 });

  // Expiry check
  if (presentation.expires_at && new Date(presentation.expires_at) < new Date()) {
    return NextResponse.json({ error: "Esta apresentação expirou." }, { status: 410 });
  }

  // Password check
  if (presentation.password_hash) {
    if (!password) {
      return NextResponse.json({ requiresPassword: true }, { status: 401 });
    }
    if (!verifyPassword(password, presentation.password_hash)) {
      return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
    }
  }

  // Increment view count — fire-and-forget (do not block response)
  const currentViews = (presentation as { view_count?: number | null }).view_count ?? 0;
  void supabase
    .from("workspace_presentations")
    .update({ view_count: currentViews + 1 })
    .eq("id", presentation.id);

  // Fetch workspace branding
  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("name, logo_url, brand_primary_color, brand_accent_color, welcome_message")
    .eq("id", presentation.workspace_id)
    .single();

  // Fetch candidates in order
  const { data: presCandidate } = await supabase
    .from("workspace_presentation_candidates")
    .select("submission_id, position")
    .eq("presentation_id", presentation.id)
    .order("position", { ascending: true });

  const submissionIds = (presCandidate ?? []).map((c) => c.submission_id);

  if (!submissionIds.length) {
    return NextResponse.json({
      presentation: {
        id:         presentation.id,
        title:      presentation.title,
        intro:      presentation.intro ?? null,
        workspace:  { name: workspace?.name ?? "", logoUrl: workspace?.logo_url ?? null, brandColor: workspace?.brand_primary_color ?? "#1ABC9C", brandAccentColor: workspace?.brand_accent_color ?? null, welcomeMessage: workspace?.welcome_message ?? null },
        candidates: [],
      },
    });
  }

  // Fetch submissions — only safe public fields, NO notes/pipeline_status/booking info
  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, talent_user_id, talent_name, bio, photo_front_url, photo_left_url, photo_right_url, video_url, portfolio_url, curriculum_url")
    .in("id", submissionIds);

  const talentIds = [...new Set(
    (submissions ?? []).map((s) => s.talent_user_id).filter((id): id is string => !!id)
  )];

  const { data: profiles } = talentIds.length
    ? await supabase
        .from("talent_profiles")
        .select("id, full_name, avatar_url, age, city, gender, bio")
        .in("id", talentIds)
    : { data: [] as Array<{ id: string; full_name: string | null; avatar_url: string | null; age: number | null; city: string | null; gender: string | null; bio: string | null }> };

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  // Build ordered candidate list — strip all internal data
  const posMap = new Map((presCandidate ?? []).map((c) => [c.submission_id, c.position]));
  const candidates = (submissions ?? [])
    .sort((a, b) => (posMap.get(a.id) ?? 0) - (posMap.get(b.id) ?? 0))
    .map((s) => {
      const profile = s.talent_user_id ? profileMap.get(s.talent_user_id) : null;
      return {
        id:            s.id,
        name:          profile?.full_name ?? s.talent_name ?? "Talento",
        avatarUrl:     profile?.avatar_url ?? null,
        age:           profile?.age        ?? null,
        city:          profile?.city       ?? null,
        gender:        profile?.gender     ?? null,
        bio:           s.bio || (profile as { bio?: string | null } | null)?.bio || "",
        photoFrontUrl: s.photo_front_url   ?? null,
        photoLeftUrl:  s.photo_left_url    ?? null,
        photoRightUrl: s.photo_right_url   ?? null,
        videoUrl:      s.video_url         ?? null,
        portfolioUrl:  s.portfolio_url     ?? null,
        curriculumUrl: s.curriculum_url    ?? null,
      };
    });

  return NextResponse.json({
    presentation: {
      id:        presentation.id,
      title:     presentation.title,
      intro:     presentation.intro ?? null,
      workspace: {
        name:             workspace?.name                ?? "",
        logoUrl:          workspace?.logo_url             ?? null,
        brandColor:       workspace?.brand_primary_color  ?? "#1ABC9C",
        brandAccentColor: workspace?.brand_accent_color   ?? null,
        welcomeMessage:   workspace?.welcome_message      ?? null,
      },
      candidates,
    },
  });
}
