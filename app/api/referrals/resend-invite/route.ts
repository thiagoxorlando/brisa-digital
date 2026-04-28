import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { buildReferralEmail, buildReferralJobUrl, getAppUrl } from "@/lib/referralEmail";
import { getEmailErrorHttpStatus, sendEmail } from "@/lib/resend";

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { invite_id } = await req.json();
  if (!invite_id) return NextResponse.json({ error: "invite_id é obrigatório" }, { status: 400 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: invite, error } = await supabase
    .from("referral_invites")
    .select("id, token, referred_email, job_id, referrer_id, status")
    .eq("id", invite_id)
    .single();

  if (error || !invite) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });

  if (invite.referrer_id !== user.id) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  if (invite.status === "fraud_reported") {
    return NextResponse.json({ error: "Esta indicação está em revisão." }, { status: 409 });
  }

  if (!invite.referred_email) {
    return NextResponse.json({ error: "Email do indicado não disponível" }, { status: 400 });
  }
  if (!invite.job_id) {
    return NextResponse.json({ error: "Convite sem vaga vinculada; não é possível reenviar com rastreamento." }, { status: 400 });
  }

  const [{ data: job }, { data: referrerProfile }] = await Promise.all([
    supabase
      .from("jobs")
      .select("title, agency_id, location")
      .eq("id", invite.job_id)
      .maybeSingle(),
    supabase.from("talent_profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  const { data: agency } = job?.agency_id
    ? await supabase.from("agencies").select("company_name").eq("id", job.agency_id).maybeSingle()
    : { data: null };

  const referralUrl = buildReferralJobUrl({
    appUrl: getAppUrl(),
    jobId: invite.job_id,
    token: invite.token,
  });
  const email = buildReferralEmail({
    referrerName: referrerProfile?.full_name ?? user.email ?? "Um talento da BrisaHub",
    jobTitle: job?.title ?? "uma oportunidade",
    agencyName: agency?.company_name ?? null,
    location: job?.location ?? null,
    jobUrl: referralUrl,
  });

  const emailResult = await sendEmail({
    to: invite.referred_email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  if (!emailResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        emailSent: false,
        emailStatus: emailResult.status,
        error: "Convite encontrado, mas o email não foi enviado.",
        emailError: emailResult.error,
      },
      { status: getEmailErrorHttpStatus(emailResult.status) }
    );
  }

  return NextResponse.json({
    ok: true,
    referralUrl,
    emailSent: true,
    emailStatus: emailResult.status,
  });
}
