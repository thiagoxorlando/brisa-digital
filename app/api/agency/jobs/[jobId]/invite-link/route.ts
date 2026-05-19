import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";
import { randomBytes } from "crypto";

type Params = { params: Promise<{ jobId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { jobId } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const ws = await getUserPremiumWorkspace(user.id);
  if (!ws) {
    return NextResponse.json(
      { error: "Vagas privadas estão disponíveis apenas no Premium." },
      { status: 403 }
    );
  }

  const supabase = createServerClient({ useServiceRole: true });

  // Verify the job belongs to this user's workspace and is private
  const { data: job } = await supabase
    .from("jobs")
    .select("id, status, deleted_at, invite_only, workspace_id, visibility")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });

  if (job.workspace_id !== ws.workspace.id) {
    return NextResponse.json({ error: "Sem permissão para esta vaga." }, { status: 403 });
  }

  if (job.deleted_at || job.status === "inactive" || job.status === "cancelled") {
    return NextResponse.json({ error: "Esta vaga não está disponível." }, { status: 409 });
  }

  // Reuse existing active link if available
  const { data: existing } = await supabase
    .from("job_invite_links")
    .select("id, token")
    .eq("job_id", jobId)
    .eq("workspace_id", ws.workspace.id)
    .eq("status", "active")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const origin = new URL(req.url).origin;
    return NextResponse.json({
      token: existing.token,
      inviteUrl: `${origin}/jobs/invite/${existing.token}`,
    });
  }

  // Create new invite link
  const token = randomBytes(32).toString("hex");
  const { data: link, error } = await supabase
    .from("job_invite_links")
    .insert({
      job_id:       jobId,
      workspace_id: ws.workspace.id,
      created_by:   user.id,
      token,
      status:       "active",
      expires_at:   null,
      max_uses:     null,
    })
    .select("id, token")
    .single();

  if (error || !link) {
    console.error("[invite-link] insert failed", error);
    return NextResponse.json({ error: "Não foi possível gerar o link." }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    token: link.token,
    inviteUrl: `${origin}/jobs/invite/${link.token}`,
  });
}
