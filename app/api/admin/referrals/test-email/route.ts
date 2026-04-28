import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createServerClient } from "@/lib/supabase";
import { buildReferralEmail, buildReferralJobUrl, getAppUrl } from "@/lib/referralEmail";
import { getEmailErrorHttpStatus, sendEmail } from "@/lib/resend";

type TestReferralInput = {
  job_id?: string;
  referrer_id?: string;
  to_email?: string;
  referred_name?: string;
  confirm?: string;
};

type ExistingReferralInvite = {
  id: string;
  token: string;
  referrer_id: string;
  submission_id: string | null;
  status: string | null;
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function getInput(req: NextRequest): Promise<TestReferralInput> {
  if (req.method === "GET") {
    const params = req.nextUrl.searchParams;
    return {
      job_id: params.get("job_id") ?? undefined,
      referrer_id: params.get("referrer_id") ?? undefined,
      to_email: params.get("to_email") ?? undefined,
      referred_name: params.get("referred_name") ?? undefined,
      confirm: params.get("confirm") ?? undefined,
    };
  }

  return (await req.json().catch(() => ({}))) as TestReferralInput;
}

async function sendTestReferralEmail(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const input = await getInput(req);
  const jobId = input.job_id?.trim();
  const referrerId = input.referrer_id?.trim();
  const toEmail = normalizeEmail(input.to_email);

  if (input.confirm !== "send-one") {
    return NextResponse.json(
      { error: "Set confirm=send-one to send exactly one referral test email." },
      { status: 400 }
    );
  }

  if (!jobId || !referrerId || !toEmail) {
    return NextResponse.json(
      { error: "job_id, referrer_id, to_email e confirm=send-one são obrigatórios" },
      { status: 400 }
    );
  }

  if (!/\S+@\S+\.\S+/.test(toEmail)) {
    return NextResponse.json({ error: "to_email inválido" }, { status: 400 });
  }

  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: job }, { data: referrerProfile }, { data: referrerRole }, referrerAuth] = await Promise.all([
    supabase
      .from("jobs")
      .select("title, agency_id, location")
      .eq("id", jobId)
      .maybeSingle(),
    supabase.from("talent_profiles").select("full_name").eq("id", referrerId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", referrerId).maybeSingle(),
    supabase.auth.admin.getUserById(referrerId),
  ]);

  if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  if (referrerRole?.role !== "talent") {
    return NextResponse.json({ error: "referrer_id precisa ser um usuário talento" }, { status: 400 });
  }
  if (referrerAuth.data.user?.email?.toLowerCase() === toEmail) {
    return NextResponse.json({ error: "O talento indicador não pode indicar o próprio email" }, { status: 400 });
  }

  const { data: existingRows } = await supabase
    .from("referral_invites")
    .select("id, token, referrer_id, submission_id, status")
    .eq("job_id", jobId)
    .ilike("referred_email", toEmail)
    .limit(1);

  const existingInvite = (existingRows?.[0] ?? null) as ExistingReferralInvite | null;

  if (existingInvite && existingInvite.referrer_id !== referrerId) {
    return NextResponse.json(
      { error: "Este email já foi indicado para esta vaga por outro talento." },
      { status: 409 }
    );
  }
  if (existingInvite?.status === "fraud_reported") {
    return NextResponse.json({ error: "Esta indicação está em revisão." }, { status: 409 });
  }

  let submissionId = existingInvite?.submission_id ?? null;
  if (!submissionId) {
    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .insert({
        job_id: jobId,
        talent_user_id: null,
        talent_name: input.referred_name?.trim() || null,
        email: toEmail,
        bio: "Referral email test sent by admin.",
        referrer_id: referrerId,
        status: "pending",
        mode: "other",
      })
      .select("id")
      .single();

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 400 });
    submissionId = submission.id;
  }

  let invite = existingInvite
    ? { id: existingInvite.id, token: existingInvite.token }
    : null;

  if (!invite) {
    const { data: createdInvite, error: inviteErr } = await supabase
      .from("referral_invites")
      .insert({
        job_id: jobId,
        referrer_id: referrerId,
        referred_email: toEmail,
        referred_name: input.referred_name?.trim() || null,
        submission_id: submissionId,
        status: "pending",
      })
      .select("id, token")
      .single();

    if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 });
    invite = createdInvite;
  } else if (!existingInvite?.submission_id && submissionId) {
    await supabase
      .from("referral_invites")
      .update({ submission_id: submissionId })
      .eq("id", invite.id);
  }

  const { data: agency } = job.agency_id
    ? await supabase.from("agencies").select("company_name").eq("id", job.agency_id).maybeSingle()
    : { data: null };

  const referralUrl = buildReferralJobUrl({
    appUrl: getAppUrl(),
    jobId,
    token: invite.token,
  });
  const email = buildReferralEmail({
    referrerName: referrerProfile?.full_name ?? "Um talento da BrisaHub",
    jobTitle: job.title ?? "uma oportunidade",
    agencyName: agency?.company_name ?? null,
    location: job.location ?? null,
    jobUrl: referralUrl,
  });

  const emailResult = await sendEmail({
    to: toEmail,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  if (!emailResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        emailSent: false,
        inviteId: invite.id,
        referralUrl,
        emailStatus: emailResult.status,
        error: emailResult.error ?? "Email was not sent.",
      },
      { status: getEmailErrorHttpStatus(emailResult.status) }
    );
  }

  return NextResponse.json({
    ok: true,
    emailSent: true,
    inviteId: invite.id,
    submissionId,
    referralUrl,
    emailStatus: emailResult.status,
  });
}

export async function GET(req: NextRequest) {
  return sendTestReferralEmail(req);
}

export async function POST(req: NextRequest) {
  return sendTestReferralEmail(req);
}
