"use client";

import type { ContractComputedState } from "@/lib/contractState";

type Props = {
  raw: {
    contractId: string;
    rawStatus: string;
    rawPaidAt?: string | null;
    rawDepositPaidAt?: string | null;
    workspaceId?: string | null;
    jobId?: string | null;
  };
  computed: ContractComputedState;
};

/**
 * Dev-only inspector panel showing raw contract fields alongside the derived
 * ContractComputedState. Renders nothing outside development.
 *
 * Usage in a Server Component:
 *   {process.env.NODE_ENV === "development" && (
 *     <ContractDebugPanel raw={{ contractId: c.id, rawStatus: c.status, ... }} computed={state} />
 *   )}
 */
export default function ContractDebugPanel({ raw, computed }: Props) {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <details className="mt-4 rounded border border-yellow-400 bg-yellow-50 p-3 text-xs font-mono">
      <summary className="cursor-pointer font-semibold text-yellow-800">
        [DEV] Contract State — {raw.contractId.slice(0, 8)}
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-yellow-900">
        <span className="font-semibold text-yellow-700 col-span-2 mt-1">── Raw DB fields ──</span>
        <span className="font-semibold">status</span>
        <span>{raw.rawStatus}</span>
        <span className="font-semibold">paid_at</span>
        <span>{raw.rawPaidAt ?? "—"}</span>
        <span className="font-semibold">deposit_paid_at</span>
        <span>{raw.rawDepositPaidAt ?? "—"}</span>
        <span className="font-semibold">workspace_id</span>
        <span>{raw.workspaceId ?? "null (open space)"}</span>
        <span className="font-semibold">job_id</span>
        <span>{raw.jobId ?? "—"}</span>

        <span className="font-semibold text-yellow-700 col-span-2 mt-2">── Lifecycle ──</span>
        <span className="font-semibold">lifecycleStatus</span>
        <span>{computed.lifecycleStatus}</span>
        <span className="font-semibold">financialStatus</span>
        <span>{computed.financialStatus}</span>
        <span className="font-semibold">escrowStatus</span>
        <span>{computed.escrowStatus}</span>
        <span className="font-semibold">payoutStatus</span>
        <span>{computed.payoutStatus}</span>
        <span className="font-semibold">disputeStatus</span>
        <span>{computed.disputeStatus ?? "none"}</span>
        <span className="font-semibold">visibilityContext</span>
        <span>{computed.visibilityContext}</span>

        <span className="font-semibold text-yellow-700 col-span-2 mt-2">── Evidence ──</span>
        <span className="font-semibold">hasEscrowEvidence</span>
        <span>{String(computed.hasEscrowEvidence)}</span>
        <span className="font-semibold">hasActiveDispute</span>
        <span>{String(computed.hasActiveDispute)}</span>
        <span className="font-semibold">isEscrowBlocked</span>
        <span>{String(computed.isEscrowBlocked)}</span>
        <span className="font-semibold">isAgentReserved</span>
        <span>{String(computed.isAgentReserved)}</span>

        <span className="font-semibold text-yellow-700 col-span-2 mt-2">── Actions ──</span>
        <span className="font-semibold">canPay</span>
        <span>{String(computed.canPay)}</span>
        <span className="font-semibold">canOpenDispute</span>
        <span>{String(computed.canOpenDispute)}</span>
        <span className="font-semibold">canRefund</span>
        <span>{String(computed.canRefund)}</span>
        <span className="font-semibold">canCancel</span>
        <span>{String(computed.canCancel)}</span>

        <span className="font-semibold text-yellow-700 col-span-2 mt-2">── Amounts ──</span>
        <span className="font-semibold">gross</span>
        <span>R$ {computed.grossAmount.toFixed(2)}</span>
        <span className="font-semibold">net</span>
        <span>R$ {computed.netAmount.toFixed(2)}</span>
        <span className="font-semibold">commission</span>
        <span>R$ {computed.commissionAmount.toFixed(2)} ({computed.commissionPct}%)</span>
        <span className="font-semibold">escrowAmount</span>
        <span>R$ {computed.escrowAmount.toFixed(2)}</span>

        <span className="font-semibold text-yellow-700 col-span-2 mt-2">── Display ──</span>
        <span className="font-semibold">displayBadge</span>
        <span>{computed.displayBadge}</span>
        {computed.openedByRole && (
          <>
            <span className="font-semibold">openedByRole</span>
            <span>{computed.openedByRole}</span>
          </>
        )}
        {computed.paidByUserName && (
          <>
            <span className="font-semibold">paidBy</span>
            <span>{computed.paidByUserName} ({computed.paidByRole})</span>
          </>
        )}
      </div>
    </details>
  );
}
