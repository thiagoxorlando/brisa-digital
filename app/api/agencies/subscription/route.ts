import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export async function PATCH(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status } = await req.json();

  if (status !== "active" && status !== "inactive") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { error } = await supabase
    .from("agencies")
    .update({ subscription_status: status })
    .eq("id", user.id);

  if (error) {
    console.error("[PATCH /api/agencies/subscription]", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Mirror status to profiles so billing and finances stay in sync
  await supabase
    .from("profiles")
    .update({ plan_status: status })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
