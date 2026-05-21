/**
 * GET /api/referrals/info?token=xxx
 *
 * Returns the referred_email for a valid pending referral invite.
 * Used by the signup page to prefill the email field and show referral context.
 * Public endpoint — the token itself is the secret (UUID, unguessable).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data, error } = await supabase
    .from("referral_invites")
    .select("referred_email")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ referred_email: data.referred_email ?? null });
}
