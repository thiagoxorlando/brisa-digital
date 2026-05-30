import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import InviteAccept from "./InviteAccept";

export const metadata: Metadata = { title: "Workspace Invite — BrisaHub" };

function BuildingIcon() {
  return (
    <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function InvalidPage({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-[18px] font-bold text-zinc-900">Convite inválido</h1>
        <p className="text-[14px] text-zinc-500">{reason}</p>
        <a href="/" className="inline-block text-[13px] text-zinc-400 hover:text-zinc-600 underline">
          Ir para a página inicial
        </a>
      </div>
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = createServerClient({ useServiceRole: true });

  const { data: invite } = await supabase
    .from("premium_agent_invites")
    .select("id, workspace_id, invited_email, status, expires_at, role")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return <InvalidPage reason="Este convite não existe ou já foi usado." />;
  }
  if (invite.status !== "pending") {
    const labels: Record<string, string> = {
      accepted: "Este convite já foi aceito.",
      expired: "Este convite expirou.",
      cancelled: "Este convite foi cancelado.",
    };
    return (
      <InvalidPage
        reason={labels[invite.status as string] ?? "Este convite não está mais disponível."}
      />
    );
  }
  if (new Date(invite.expires_at as string) < new Date()) {
    return <InvalidPage reason="Este convite expirou." />;
  }

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("id, name, logo_url")
    .eq("id", invite.workspace_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!workspace) {
    return <InvalidPage reason="O workspace deste convite não está mais disponível." />;
  }

  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  let userRole: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    userRole = profile?.role ?? null;
  }

  const expiresDate = new Date(invite.expires_at as string).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">
        {/* Powered by */}
        <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          Powered by BrisaHub
        </p>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="h-[3px] bg-gradient-to-r from-amber-400 to-amber-600" />
          <div className="p-8 space-y-6">
            {/* Workspace header */}
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto overflow-hidden">
                {workspace.logo_url ? (
                  <img
                    src={workspace.logo_url as string}
                    alt={workspace.name as string}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <BuildingIcon />
                )}
              </div>

              <div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-100 mb-2">
                  Workspace Premium
                </span>
                <h1 className="text-[18px] font-bold text-zinc-900">{workspace.name as string}</h1>
              </div>

              <p className="text-[14px] text-zinc-600">
                Você foi convidado para atuar como{" "}
                <strong className="text-zinc-800">agente</strong> neste workspace.
              </p>

              <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-left space-y-1">
                <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">
                  Convite enviado para
                </p>
                <p className="text-[13px] text-zinc-700 font-medium">
                  {invite.invited_email as string}
                </p>
                <p className="text-[11px] text-zinc-400">Expira em {expiresDate}</p>
              </div>
            </div>

            {/* Accept section */}
            <InviteAccept
              token={token}
              isLoggedIn={!!user}
              userRole={userRole}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
