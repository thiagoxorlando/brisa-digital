/**
 * POST /api/referrals/report
 *
 * Called when a referrer suspects fraud (referred person created an account
 * without using the invite link and applied independently).
 * Marks the invite as fraud_reported, bans the referred user, and notifies both parties.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { notify } from "@/lib/notify";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { invite_id } = body;

  if (!invite_id) {
    return NextResponse.json({ error: "invite_id é obrigatório" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const { data: invite, error: fetchErr } = await supabase
    .from("referral_invites")
    .select("id, referrer_id, referred_user_id, status")
    .eq("id", invite_id)
    .single();

  if (fetchErr || !invite) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  }

  if (invite.status === "fraud_reported") {
    return NextResponse.json({ error: "Fraude já reportada" }, { status: 409 });
  }

  // Mark invite as fraud_reported
  await supabase
    .from("referral_invites")
    .update({ status: "fraud_reported" })
    .eq("id", invite_id);

  // Ban the referred user if they have an account
  if (invite.referred_user_id) {
    await supabase
      .from("profiles")
      .update({ banned: true })
      .eq("id", invite.referred_user_id);

    await notify(
      invite.referred_user_id,
      "contract",
      "Sua conta foi suspensa por violação dos Termos de Uso.",
      "/"
    );
  }

  // Notify referrer that the report was received and commission won't apply
  await notify(
    invite.referrer_id,
    "contract",
    "Denúncia de fraude registrada. A comissão desta indicação não será aplicada.",
    "/talent/referrals"
  );

  return NextResponse.json({ ok: true });
}
