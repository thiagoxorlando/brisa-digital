import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const agencyId = new URL(req.url).searchParams.get("agency_id");
  if (!agencyId) return NextResponse.json({ error: "agency_id required" }, { status: 400 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: history, error } = await supabase
    .from("agency_talent_history")
    .select("*")
    .eq("agency_id", agencyId)
    .order("is_favorite", { ascending: false })
    .order("last_worked_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (!history?.length) return NextResponse.json({ history: [] });

  const talentIds = history.map((h) => h.talent_id);
  const { data: profiles } = await supabase
    .from("talent_profiles")
    .select("id, full_name, avatar_url, city, country, main_role, categories")
    .in("id", talentIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return NextResponse.json({
    history: history.map((h) => ({ ...h, talent: profileMap.get(h.talent_id) ?? null })),
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, is_favorite } = body;
  if (!id || typeof is_favorite !== "boolean") {
    return NextResponse.json({ error: "id and is_favorite required" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("agency_talent_history")
    .update({ is_favorite })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ history: data });
}
