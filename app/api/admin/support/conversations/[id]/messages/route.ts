import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";
import { notify } from "@/lib/notify";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { userId: adminId } = auth;

  const { id } = await params;
  const body = await req.json() as { message?: string };
  const message = (body.message ?? "").trim();

  if (!message) return NextResponse.json({ error: "Mensagem é obrigatória." }, { status: 400 });
  if (message.length > 5000) return NextResponse.json({ error: "Mensagem muito longa (máx. 5000 caracteres)." }, { status: 400 });

  const supabase = createServerClient({ useServiceRole: true });

  const { data: conv } = await supabase
    .from("support_conversations")
    .select("id, user_id, status")
    .eq("id", id)
    .single();

  if (!conv) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const now = new Date().toISOString();

  const { data: msg, error: msgErr } = await supabase
    .from("support_messages")
    .insert({ conversation_id: id, sender_id: adminId, sender_role: "admin", message })
    .select("id, sender_id, sender_role, message, created_at")
    .single();

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 400 });

  await supabase
    .from("support_conversations")
    .update({ status: "waiting_user", last_message_at: now, updated_at: now })
    .eq("id", id);

  // Determine notification link based on user role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", conv.user_id)
    .single();

  const notifLink = profile?.role === "talent" ? "/talent/support" : "/agency/support";

  await notify(
    conv.user_id,
    "support",
    "A equipe da CastAnet respondeu sua solicitação de suporte.",
    notifLink,
    `support-admin-reply:${msg.id}`,
  );

  return NextResponse.json({ message: msg }, { status: 201 });
}
