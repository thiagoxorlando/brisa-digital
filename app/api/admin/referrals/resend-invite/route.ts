import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServerClient({ useServiceRole: true });

  const { invite_id, submission_id } = await req.json();
  if (!invite_id && !submission_id) {
    return NextResponse.json({ error: "invite_id ou submission_id é obrigatório" }, { status: 400 });
  }

  let toEmail: string | null = null;
  let toName: string | null = null;
  let jobId: string | null = null;
  let inviteToken: string | null = null;

  // Try invite first
  if (invite_id) {
    const { data: invite } = await supabase
      .from("referral_invites")
      .select("token, referred_email, referred_name, job_id")
      .eq("id", invite_id)
      .single();
    if (invite) {
      toEmail     = invite.referred_email ?? null;
      toName      = invite.referred_name  ?? null;
      jobId       = invite.job_id         ?? null;
      inviteToken = invite.token          ?? null;
    }
  }

  // Fallback to submission
  if (!toEmail && submission_id) {
    const { data: sub } = await supabase
      .from("submissions")
      .select("email, talent_name, job_id")
      .eq("id", submission_id)
      .single();
    if (sub) {
      toEmail = sub.email       ?? sub.talent_name ?? null;
      toName  = sub.talent_name ?? null;
      jobId   = sub.job_id      ?? null;
    }

    // Also try to get the invite token from submissions
    if (!inviteToken && submission_id) {
      const { data: inv } = await supabase
        .from("referral_invites")
        .select("token")
        .eq("submission_id", submission_id)
        .maybeSingle();
      inviteToken = inv?.token ?? null;
    }
  }

  if (!toEmail) return NextResponse.json({ error: "Email do indicado não disponível" }, { status: 400 });

  const { data: job } = jobId
    ? await supabase.from("jobs").select("title").eq("id", jobId).maybeSingle()
    : { data: null };

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const jobTitle = job?.title ?? "uma vaga";
  const link     = inviteToken
    ? `${appUrl}/signup?role=talent&ref=${inviteToken}`
    : `${appUrl}/signup?role=talent`;

  const emailResult = await sendEmail({
    to: toEmail,
    subject: `Lembrete: Você foi indicado para "${jobTitle}" na Brisa Digital`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Você ainda tem um convite esperando!</h2>
        <p style="font-size:15px;color:#555;line-height:1.6;margin-bottom:24px">
          Você foi indicado para <strong>${jobTitle}</strong>.
          Crie sua conta gratuita na Brisa Digital e candidate-se com um clique.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#18181b;color:#fff;font-size:14px;font-weight:600;
                  padding:12px 28px;border-radius:12px;text-decoration:none">
          Criar conta e candidatar-se
        </a>
        <p style="font-size:12px;color:#aaa;margin-top:32px">
          Se você não esperava este e-mail, pode ignorá-lo com segurança.
        </p>
      </div>
    `,
  });

  if (!emailResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        emailSent: false,
        emailStatus: emailResult.status,
        error: "Convite encontrado, mas o email nao foi enviado.",
        emailError: emailResult.error,
      },
      { status: emailResult.status === "missing_key" ? 500 : 502 }
    );
  }

  return NextResponse.json({ ok: true, emailSent: true, emailStatus: emailResult.status });
}
