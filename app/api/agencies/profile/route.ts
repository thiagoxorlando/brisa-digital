import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export async function PATCH(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { company_name, avatar_url, phone, address } = await req.json();

  const updates: Record<string, string | null> = {};
  if (company_name !== undefined) updates.company_name = company_name;
  if (avatar_url   !== undefined) updates.avatar_url   = avatar_url;
  if (phone        !== undefined) updates.phone        = phone;
  if (address      !== undefined) updates.address      = address;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { error } = await supabase
    .from("agencies")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    console.error("[PATCH /api/agencies/profile]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from("agencies")
    .select("company_name, avatar_url, subscription_status")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ profile: data });
}
