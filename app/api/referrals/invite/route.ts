/**
 * POST /api/referrals/invite
 *
 * Called when a talent refers someone to a specific job.
 * Creates or reuses one job-specific referral_invite row, then emails the referred person.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { buildReferralEmail, buildReferralJobUrl, getAppUrl } from "@/lib/referralEmail";
import { sendEmail, validateEmailConfig } from "@/lib/resend";
import { notify } from "@/lib/notify";

type ExistingReferralInvite = {
  id: string;
  token: string;
  referrer_id: string;
  submission_id: string | null;
  status: string | null;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { job_id, referrer_id, referred_email, referred_name, bio, video_url } = body;
  const normalizedEmail = typeof referred_email === "string" ? referred_email.trim().toLowerCase() : "";

  if (!job_id || !referrer_id || !normalizedEmail) {
    return NextResponse.json(
      { error: "job_id, referrer_id e referred_email são obrigatórios" },
      { status: 400 }
    );
  }

  if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
    return NextResponse.json({ error: "Email do indicado inválido" }, { status: 400 });
  }

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.email?.toLowerCase() === normalizedEmail) {
    return NextResponse.json({ error: "Você não pode indicar o próprio email" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });
  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "talent" || referrer_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const emailConfig = validateEmailConfig();
  if (!emailConfig.ok) {
    return NextResponse.json({ error: emailConfig.error }, { status: 500 });
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("title, agency_id, visibility, location")
    .eq("id", job_id)
    .single();

  if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (job.visibility === "private") {
    const { data: invite } = await supabase
      .from("job_invites")
      .select("id")
      .eq("job_id", job_id)
      .eq("talent_id", user.id)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json(
        { error: "Esta vaga privada aceita indicações apenas de talentos convidados." },
        { status: 403 }
      );
    }
  }

  const { data: existingInvites } = await supabase
    .from("referral_invites")
    .select("id, token, referrer_id, submission_id, status")
    .eq("job_id", job_id)
    .ilike("referred_email", normalizedEmail)
    .limit(1);

  const existingInvite = (existingInvites?.[0] ?? null) as ExistingReferralInvite | null;

  if (existingInvite && existingInvite.referrer_id !== user.id) {
    return NextResponse.json(
      { error: "Este email já foi indicado para esta vaga." },
      { status: 409 }
    );
  }

  if (existingInvite?.status === "fraud_reported") {
    return NextResponse.json(
      { error: "Esta indicação está em revisão e não pode ser reenviada agora." },
      { status: 409 }
    );
  }

  let invite = existingInvite
    ? { id: existingInvite.id, token: existingInvite.token }
    : null;
  let submissionId = existingInvite?.submission_id ?? null;

  if (!submissionId) {
    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .insert({
        job_id,
        talent_user_id: null,
        talent_name: referred_name ?? null,
        email: normalizedEmail,
        bio: bio ?? null,
        video_url: video_url ?? null,
        referrer_id: user.id,
        status: "pending",
        mode: "other",
      })
      .select("id")
      .single();

    if (subErr) {
      console.error("[POST /api/referrals/invite] submission error:", subErr);
      return NextResponse.json({ error: subErr.message }, { status: 400 });
    }

    submissionId = submission.id;
  }

  if (!invite) {
    const { data: createdInvite, error: inviteErr } = await supabase
      .from("referral_invites")
      .insert({
        job_id,
        referrer_id: user.id,
        referred_email: normalizedEmail,
        referred_name: referred_name ?? null,
        submission_id: submissionId,
        status: "pending",
      })
      .select("id, token")
      .single();

    if (inviteErr) {
      console.error("[POST /api/referrals/invite] invite error:", inviteErr);
      return NextResponse.json({ error: inviteErr.message }, { status: 400 });
    }

    invite = createdInvite;
  } else if (!existingInvite?.submission_id && submissionId) {
    await supabase
      .from("referral_invites")
      .update({ submission_id: submissionId })
      .eq("id", invite.id);
  }

  const [{ data: referrerProfile }, { data: agency }] = await Promise.all([
    supabase.from("talent_profiles").select("full_name").eq("id", user.id).maybeSingle(),
    job.agency_id
      ? supabase.from("agencies").select("company_name").eq("id", job.agency_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const jobTitle = job.title ?? "uma oportunidade";
  const referralUrl = buildReferralJobUrl({
    appUrl: getAppUrl(),
    jobId: job_id,
    token: invite.token,
  });
  const email = buildReferralEmail({
    referrerName: referrerProfile?.full_name ?? user.email ?? "Um talento da BrisaHub",
    jobTitle,
    agencyName: agency?.company_name ?? null,
    location: job.location ?? null,
    jobUrl: referralUrl,
  });

  let emailSent = false;
  let emailStatus: number | string | null = null;
  let emailError: string | null = null;

  try {
    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    emailSent = emailResult.ok;
    emailStatus = emailResult.status;
    emailError = emailResult.error ?? null;
  } catch (error) {
    console.error("[POST /api/referrals/invite] email error:", error);
    emailStatus = "unexpected_error";
    emailError = error instanceof Error ? error.message : "Unexpected email error";
  }

  if (job.agency_id) {
    await notify(
      job.agency_id,
      "referral",
      `Nova indicação: ${referred_name ?? normalizedEmail} para "${jobTitle}"`,
      "/agency/submissions"
    );
  }

  return NextResponse.json(
    {
      ok: true,
      invite_id: invite.id,
      referralUrl,
      emailSent,
      emailStatus,
      ...(emailError ? { emailError } : {}),
    },
    { status: 201 }
  );
}
