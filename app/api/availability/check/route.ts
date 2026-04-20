import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// GET /api/availability/check?date=2026-04-18&talent_ids=id1,id2,id3
// Returns: { availability: { [talent_id]: entry | null } }
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date       = searchParams.get("date");
  const talentIds  = searchParams.get("talent_ids");

  if (!date || !talentIds) {
    return NextResponse.json({ error: "date and talent_ids required" }, { status: 400 });
  }

  const ids = talentIds.split(",").filter(Boolean);
  if (!ids.length) return NextResponse.json({ availability: {} });

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("talent_availability")
    .select("talent_id, is_available, start_time, end_time")
    .in("talent_id", ids)
    .eq("date", date);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const map: Record<string, { is_available: boolean; start_time: string | null; end_time: string | null } | null> = {};
  for (const id of ids) map[id] = null;
  for (const row of data ?? []) {
    map[row.talent_id] = {
      is_available: row.is_available,
      start_time:   row.start_time,
      end_time:     row.end_time,
    };
  }

  return NextResponse.json({ availability: map });
}
