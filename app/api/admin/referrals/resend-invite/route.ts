import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildReferralEmail, buildReferralJobUrl, getAppUrl } from "@/lib/referralEmail";
import { getEmailErrorHttpStatus, sendEmail } from "@/lib/resend";

type InviteForEmail = {
  id: string;
  token: string;
  referred_email: string;
  job_id: string;
  referrer_id: string;
  submission_id: string | null;
  status: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServerClient({ useServiceRole: true });

  const { invite_id, submission_id } = await req.json();
  if (!invite_id && !submission_id) {
    return NextResponse.json({ error: "invite_id ou submission_id é obrigatório" }, { status: 400 });
  }

  let invite: InviteForEmail | null = null;

  if (invite_id) {
    const { data } = await supabase
      .from("referral_invites")
      .select("id, token, referred_email, job_id, referrer_id, submission_id, status")
      .eq("id", invite_id)
      .maybeSingle();

    invite = data as InviteForEmail | null;
  }

  if (!invite && submission_id) {
    const { data: sub } = await supabase
      .from("submissions")
      .select("id, email, talent_name, job_id, referrer_id")
      .eq("id", submission_id)
      .maybeSingle();

    const email = typeof sub?.email === "string" ? sub.email.trim().toLowerCase() : "";

    if (sub?.job_id && sub.referrer_id && email) {
      const { data: existingRows } = await supabase
        .from("referral_invites")
        .select("id, token, referred_email, job_id, referrer_id, submission_id, status")
        .eq("job_id", sub.job_id)
        .ilike("referred_email", email)
        .limit(1);

      invite = (existingRows?.[0] ?? null) as InviteForEmail | null;

      if (!invite) {
        const { data: createdInvite, error: createErr } = await supabase
          .from("referral_invites")
          .insert({
            job_id: sub.job_id,
            referrer_id: sub.referrer_id,
            referred_email: email,
            referred_name: sub.talent_name ?? null,
            submission_id,
            status: "pending",
          })
          .select("id, token, referred_email, job_id, referrer_id, submission_id, status")
          .single();

        if (createErr) {
          return NextResponse.json({ error: createErr.message }, { status: 400 });
        }

        invite = createdInvite as InviteForEmail;
      } else if (!invite.submission_id) {
        await supabase
          .from("referral_invites")
          .update({ submission_id })
          .eq("id", invite.id);
        invite = { ...invite, submission_id };
      }
    }
  }

  if (!invite) {
    return NextResponse.json(
      { error: "Convite de indicação não encontrado para reenviar com rastreamento." },
      { status: 404 }
    );
  }

  if (invite.status === "fraud_reported") {
    return NextResponse.json({ error: "Esta indicação está em revisão." }, { status: 409 });
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
    supabase.from("talent_profiles").select("full_name").eq("id", invite.referrer_id).maybeSingle(),
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
    referrerName: referrerProfile?.full_name ?? "Um talento da BrisaHub",
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
    inviteId: invite.id,
    referralUrl,
    emailSent: true,
    emailStatus: emailResult.status,
  });
}
