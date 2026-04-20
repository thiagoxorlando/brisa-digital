import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const talentId = searchParams.get("talent_id");
  const from     = searchParams.get("from");
  const to       = searchParams.get("to");

  if (!talentId) return NextResponse.json({ error: "talent_id required" }, { status: 400 });

  const supabase = createServerClient({ useServiceRole: true });
  let query = supabase
    .from("talent_availability")
    .select("*")
    .eq("talent_id", talentId)
    .order("date", { ascending: true });

  if (from) query = query.gte("date", from);
  if (to)   query = query.lte("date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ availability: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { talent_id, date, is_available, start_time, end_time } = body;

  if (!talent_id || !date) {
    return NextResponse.json({ error: "talent_id and date required" }, { status: 400 });
  }

  // Verify the caller is the talent
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || user.id !== talent_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("talent_availability")
    .upsert(
      {
        talent_id,
        date,
        is_available: is_available ?? true,
        start_time:   start_time  ?? null,
        end_time:     end_time    ?? null,
      },
      { onConflict: "talent_id,date" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ entry: data }, { status: 200 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const talentId = searchParams.get("talent_id");
  const date     = searchParams.get("date");

  if (!talentId || !date) {
    return NextResponse.json({ error: "talent_id and date required" }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || user.id !== talentId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { error } = await supabase
    .from("talent_availability")
    .delete()
    .eq("talent_id", talentId)
    .eq("date", date);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
