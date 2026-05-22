/**
 * POST /api/admin/nav/seen
 *
 * Called client-side when an admin visits a badged sidebar section.
 * Upserts a seen_at timestamp for that nav_key, causing the badge to
 * disappear on the next server render unless newer activity has arrived.
 *
 * Body: { nav_key: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { ROUTE_TO_NAV_KEY } from "@/lib/adminSidebarMetrics";

const VALID_KEYS = new Set(Object.values(ROUTE_TO_NAV_KEY));

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

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { nav_key?: unknown };
  const navKey = typeof body.nav_key === "string" ? body.nav_key.trim() : "";

  if (!VALID_KEYS.has(navKey)) {
    return NextResponse.json({ error: "Invalid nav_key" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("admin_nav_seen")
    .upsert(
      {
        admin_user_id: user.id,
        nav_key:       navKey,
        seen_at:       now,
        updated_at:    now,
      },
      { onConflict: "admin_user_id,nav_key" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
