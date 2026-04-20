/**
 * requireAdmin — call at the top of any admin Route Handler.
 *
 * Returns { userId } on success, or a NextResponse (401/403) on failure.
 * Use with:
 *
 *   const result = await requireAdmin();
 *   if (result instanceof NextResponse) return result;
 *   const { userId } = result;
 */
import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase.server";
import { createServerClient } from "@/lib/supabase";

export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  // 1. Get authenticated user from session cookies
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify admin role via service-role client (bypasses RLS)
  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId: user.id };
}
