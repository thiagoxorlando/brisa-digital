/**
 * POST /api/referrals/link
 *
 * Links a referral_invite token to the authenticated talent user.
 * This is called from signup, login, and the public referral job page.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { notify } from "@/lib/notify";

type ReferralInvite = {
  id: string;
  token: string;
  job_id: string | null;
  referrer_id: string;
  referred_email: string | null;
  referred_user_id: string | null;
  submission_id: string | null;
  status: string | null;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, user_id } = body;

  if (!token || !user_id) {
    return NextResponse.json({ error: "token e user_id são obrigatórios" }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (user_id !== user.id) {
    return NextResponse.json({ error: "Não é possível vincular convite para outro usuário" }, { status: 403 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "talent") {
    return NextResponse.json({ error: "Apenas contas de talento podem aceitar indicações" }, { status: 403 });
  }

  const { data, error: fetchErr } = await supabase
    .from("referral_invites")
    .select("id, token, job_id, referrer_id, referred_email, referred_user_id, submission_id, status")
    .eq("token", token)
    .single();

  const invite = data as ReferralInvite | null;

  if (fetchErr || !invite) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  }

  if (invite.referrer_id === user.id) {
    return NextResponse.json({ error: "Você não pode aceitar a própria indicação" }, { status: 400 });
  }

  if (invite.status === "fraud_reported") {
    return NextResponse.json({ error: "Esta indicação está em revisão" }, { status: 409 });
  }

  if (invite.referred_user_id && invite.referred_user_id !== user.id) {
    return NextResponse.json({ error: "Este convite já foi usado por outro usuário" }, { status: 409 });
  }

  if (invite.referred_user_id === user.id && invite.status && invite.status !== "pending") {
    return NextResponse.json({
      ok: true,
      alreadyLinked: true,
      invite_id: invite.id,
      job_id: invite.job_id,
      status: invite.status,
    });
  }

  if (
    invite.referred_email &&
    user.email &&
    invite.referred_email.toLowerCase() !== user.email.toLowerCase()
  ) {
    return NextResponse.json({ error: "Este convite pertence a outro email" }, { status: 403 });
  }

  if (invite.job_id) {
    const { data: existingForUser } = await supabase
      .from("referral_invites")
      .select("id, status")
      .eq("job_id", invite.job_id)
      .eq("referred_user_id", user.id)
      .limit(1);

    const existing = existingForUser?.[0] as { id: string; status: string | null } | undefined;
    if (existing && existing.id !== invite.id) {
      return NextResponse.json({
        ok: true,
        alreadyLinked: true,
        invite_id: existing.id,
        status: existing.status,
      });
    }
  }

  const now = new Date().toISOString();
  const nextStatus = invite.status === "applied" ? "applied" : "signed_up";

  const { error: updateErr } = await supabase
    .from("referral_invites")
    .update({
      referred_user_id: user.id,
      status: nextStatus,
      signed_up_at: now,
    })
    .eq("id", invite.id);

  if (updateErr) {
    console.error("[referrals/link] update failed:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (invite.submission_id) {
    await supabase
      .from("submissions")
      .update({ talent_user_id: user.id })
      .eq("id", invite.submission_id)
      .is("talent_user_id", null);
  }

  if (invite.status !== "signed_up" && invite.status !== "applied") {
    await notify(
      invite.referrer_id,
      "booking",
      "Seu indicado se cadastrou na plataforma!",
      "/talent/referrals",
    );
  }

  return NextResponse.json({
    ok: true,
    invite_id: invite.id,
    job_id: invite.job_id,
    status: nextStatus,
  });
}
