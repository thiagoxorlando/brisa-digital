import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createSessionClient } from "@/lib/supabase.server";
import { getEmailErrorHttpStatus, sendEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

async function sendAdminTestEmail() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  const to = user?.email?.trim();
  if (!to) {
    return NextResponse.json(
      { ok: false, error: "Authenticated admin user does not have an email address." },
      { status: 400 }
    );
  }

  const sentAt = new Date().toISOString();
  const emailResult = await sendEmail({
    to,
    subject: "CastAnet email test",
    text: `CastAnet email sending is configured. Sent at ${sentAt}.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#18181b">
        <h1 style="font-size:22px;line-height:1.2;margin:0 0 12px">CastAnet email test</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 18px">
          CastAnet email sending through Resend is configured.
        </p>
        <p style="font-size:13px;line-height:1.5;margin:0;color:#71717a">
          Sent at ${sentAt}.
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
        error: emailResult.error ?? "Email was not sent.",
      },
      { status: getEmailErrorHttpStatus(emailResult.status) }
    );
  }

  return NextResponse.json({
    ok: true,
    emailSent: true,
    emailStatus: emailResult.status,
    emailId: emailResult.id,
  });
}

export async function GET() {
  return sendAdminTestEmail();
}

export async function POST() {
  return sendAdminTestEmail();
}
