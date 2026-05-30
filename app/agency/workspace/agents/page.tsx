import type { Metadata } from "next";
import { redirect } from "next/navigation";
import WorkspaceAgentManager from "@/features/agency/WorkspaceAgentManager";
import {
  getWorkspaceMembers,
  getWorkspacePendingInvites,
  getWorkspaceSeatUsage,
} from "@/lib/premiumWorkspace.server";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";

export const metadata: Metadata = { title: "Agents — BrisaHub" };

export default async function WorkspaceAgentsPage() {
  const context = await requirePremiumWorkspacePageContext();

  // Agents page is owner-only: seat management, invites, and member removal
  // are owner responsibilities. Non-owners are redirected to the workspace hub.
  if (!context.isOwner) {
    redirect("/agency/workspace");
  }

  const [seatUsage, members, invites] = await Promise.all([
    getWorkspaceSeatUsage(context.workspace.id),
    getWorkspaceMembers(context.workspace.id),
    getWorkspacePendingInvites(context.workspace.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.8rem] font-bold tracking-tight text-zinc-950">Agentes</h1>
        <p className="mt-1 text-[14px] text-zinc-500">
          Convide, remova e gerencie os membros do Espaço Premium.
          Para alocações de saldo, acesse a <a href="/agency/workspace/wallet" className="text-[#1ABC9C] underline underline-offset-2">Carteira</a>.
        </p>
      </div>

      <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.05)]">
        <WorkspaceAgentManager
          membership={context.membership}
          initialSeatUsage={seatUsage}
          initialMembers={members}
          initialInvites={invites}
        />
      </div>
    </div>
  );
}
