import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { user_id, role } = await req.json();

  if (!user_id || !role) {
    return NextResponse.json({ error: "Missing user_id or role" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user_id, role }, { onConflict: "id" });

  if (error) {
    console.error("[signup/route] profile insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Create role-specific profile row so FK constraints are satisfied
  if (role === "agency") {
    const { error: agencyErr } = await supabase
      .from("agencies")
      .upsert({ id: user_id, user_id, subscription_status: "active" }, { onConflict: "id" });

    if (agencyErr) {
      console.error("[signup/route] agency insert failed:", agencyErr.message);
      // Non-fatal: profile was created, agency row can be created later
    }
  }

  if (role === "talent") {
    const { error: talentErr } = await supabase
      .from("talent_profiles")
      .upsert({ id: user_id }, { onConflict: "id" });

    if (talentErr) {
      console.error("[signup/route] talent_profile insert failed:", talentErr.message);
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
