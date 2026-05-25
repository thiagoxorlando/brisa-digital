import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";
import { createServerClient } from "@/lib/supabase";
import { getGlobalPaymentDefaults } from "@/lib/platformSettings.server";
import { DISPUTE_STATUS_LABEL, DISPUTE_STATUS_TONE, type DisputeStatus } from "@/lib/disputePolicy";
import { brl } from "@/lib/brl";

export const metadata: Metadata = { title: "Disputas Premium — BrisaHub" };

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function WorkspaceDisputesPage() {
  const context = await requirePremiumWorkspacePageContext();
  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: agencyRow }, globalDefaults] = await Promise.all([
    supabase.from("agencies").select("payment_mode").eq("id", context.workspace.ownerUserId).maybeSingle(),
    getGlobalPaymentDefaults(),
  ]);
  const resolvedMode = (agencyRow?.payment_mode as string | null) ?? globalDefaults.default_payment_mode;
  if (resolvedMode === "internal") redirect("/agency/workspace");

  const { data: workspaceJobs } = await supabase
    .from("jobs")
    .select("id, title, created_by_user_id")
    .eq("workspace_id", context.workspace.id);

  const allJobs = workspaceJobs ?? [];
  const visibleJobs = context.isOwner
    ? allJobs
    : allJobs.filter((job) => job.created_by_user_id === context.userId);

  const visibleJobIds = new Set(visibleJobs.map((job) => job.id));
  const jobTitleMap = new Map(allJobs.map((job) => [job.id, job.title ?? "Vaga"]));
  const allJobIds = allJobs.map((j) => j.id);

  // Use two queries + merge (same pattern as workspace contracts page)
  const [workspaceContractsResult, jobContractsResult] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, job_id, job_description, job_date, payment_amount, status, workspace_id")
      .eq("workspace_id", context.workspace.id),
    allJobIds.length > 0
      ? supabase
          .from("contracts")
          .select("id, job_id, job_description, job_date, payment_amount, status, workspace_id")
          .in("job_id", allJobIds)
      : Promise.resolve({ data: [] }),
  ]);

  const contractMap = new Map<string, { id: string; job_id: string | null; job_description: string | null; job_date: string | null; payment_amount: number | null; status: string | null }>();
  for (const c of workspaceContractsResult.data ?? []) {
    contractMap.set(c.id, c);
  }
  for (const c of jobContractsResult.data ?? []) {
    if (!contractMap.has(c.id)) contractMap.set(c.id, c);
  }

  const filteredContracts = [...contractMap.values()].filter((c) => {
    if (context.isOwner) return true;
    if (!c.job_id) return false;
    return visibleJobIds.has(c.job_id);
  });

  const contractIds = filteredContracts.map((c) => c.id);

  const { data: disputeRows } = contractIds.length > 0
    ? await supabase
        .from("contract_disputes")
        .select("id, contract_id, status, reason, created_at, resolved_at, resolution_action")
        .in("contract_id", contractIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const disputes = disputeRows ?? [];

  return (
    <div className="max-w-5xl space-y-6 px-4 pb-10 sm:px-6">
      <div>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-950">Disputas Premium</h1>
        <p className="mt-1 text-[14px] text-zinc-500">
          Contratos em processo de disputa no workspace {context.workspace.name}.
        </p>
      </div>

      {disputes.length === 0 ? (
        <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center shadow-sm">
          <p className="text-[14px] text-zinc-500">Nenhuma disputa encontrada.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Vaga</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Motivo</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Aberta em</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Valor</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {disputes.map((dispute) => {
                const contract = contractMap.get(dispute.contract_id);
                const jobTitle = contract?.job_id
                  ? (jobTitleMap.get(contract.job_id) ?? contract.job_description ?? "Vaga")
                  : (contract?.job_description ?? "Vaga");
                return (
                  <tr key={dispute.id} className="transition-colors hover:bg-zinc-50/60">
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${DISPUTE_STATUS_TONE[dispute.status as DisputeStatus] ?? ""}`}>
                        {DISPUTE_STATUS_LABEL[dispute.status as DisputeStatus] ?? dispute.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-[13px] font-medium text-zinc-900">{jobTitle}</p>
                      <p className="font-mono text-[11px] text-zinc-400">{contract?.id.slice(0, 8)}</p>
                    </td>
                    <td className="max-w-[220px] px-4 py-4 text-[12px] text-zinc-500">
                      <span className="line-clamp-2">{dispute.reason ?? "-"}</span>
                    </td>
                    <td className="px-4 py-4 text-[12px] text-zinc-500">{fmtDate(dispute.created_at)}</td>
                    <td className="px-4 py-4 text-[13px] font-semibold text-zinc-900">
                      {brl(contract?.payment_amount ?? 0)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/agency/workspace/disputes/${dispute.id}`}
                        className="rounded-xl bg-zinc-900 px-3 py-2 text-[12px] font-semibold text-white hover:bg-zinc-700"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
