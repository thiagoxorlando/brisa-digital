import type { Metadata } from "next";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";
import { getAgentLedgerBalance } from "@/lib/premiumWorkspace.server";
import WorkspaceCreateJobForm from "@/features/agency/WorkspaceCreateJobForm";

export const metadata: Metadata = { title: "Create Premium Job — BrisaHub" };

export default async function WorkspaceCreateJobPage() {
  const context = await requirePremiumWorkspacePageContext();

  // Fetch current ledger balance for agents so the form can display it
  // and warn before submitting. Owners have no per-agent cap.
  let agentBalance: number | null = null;
  if (!context.isOwner) {
    const ledger = await getAgentLedgerBalance(context.workspace.id, context.userId);
    agentBalance = ledger.availableAmount;
  }

  return (
    <div className="max-w-2xl">
      <WorkspaceCreateJobForm
        agentBalance={agentBalance}
        isOwner={context.isOwner}
      />
    </div>
  );
}


