import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { invite_id } = await req.json();
  if (!invite_id) return NextResponse.json({ error: "invite_id é obrigatório" }, { status: 400 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: invite, error } = await supabase
    .from("referral_invites")
    .select("id, token, referred_email, referred_name, job_id, referrer_id")
    .eq("id", invite_id)
    .single();

  if (error || !invite) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });

  // Only the referrer can resend their own invite
  if (invite.referrer_id !== user.id) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  if (!invite.referred_email) {
    return NextResponse.json({ error: "Email do indicado não disponível" }, { status: 400 });
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", invite.job_id)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signupLink = `${appUrl}/signup?role=talent&ref=${invite.token}`;
  const jobTitle = job?.title ?? "uma vaga";

  await sendEmail({
    to: invite.referred_email,
    subject: `Lembrete: Você foi indicado para "${jobTitle}" na Brisa Digital`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Você ainda tem um convite esperando!</h2>
        <p style="font-size:15px;color:#555;line-height:1.6;margin-bottom:24px">
          Você foi indicado para <strong>${jobTitle}</strong>.
          Crie sua conta gratuita na Brisa Digital e candidate-se com um clique.
        </p>
        <a href="${signupLink}"
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

  return NextResponse.json({ ok: true });
}
