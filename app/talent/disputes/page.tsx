import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { DISPUTE_STATUS_LABEL, DISPUTE_STATUS_TONE, type DisputeStatus } from "@/lib/disputePolicy";
import { brl } from "@/lib/brl";

export const metadata: Metadata = { title: "Disputas — BrisaHub" };

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function TalentDisputesPage() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });

  const { data: talentProfile } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!talentProfile) redirect("/talent/dashboard");

  const { data: contractRows } = await supabase
    .from("contracts")
    .select("id, job_id, job_description, job_date, payment_amount, net_amount, status")
    .or(`talent_id.eq.${talentProfile.id},talent_user_id.eq.${user.id}`)
    .is("workspace_id", null);

  const contractMap = new Map((contractRows ?? []).map((c) => [c.id, c]));
  const contractIds = [...contractMap.keys()];

  const jobIds = [...new Set((contractRows ?? []).map((c) => c.job_id).filter((id): id is string => !!id))];

  const [disputeResult, jobResult] = await Promise.all([
    contractIds.length > 0
      ? supabase
          .from("contract_disputes")
          .select("id, contract_id, status, reason, created_at, resolved_at, resolution_action")
          .in("contract_id", contractIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    jobIds.length > 0
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] }),
  ]);

  const jobTitleMap = new Map((jobResult.data ?? []).map((j) => [j.id, j.title ?? "Vaga"]));
  const disputes = disputeResult.data ?? [];

  return (
    <div className="max-w-5xl space-y-6 px-4 pb-10 sm:px-6">
      <div>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-950">Minhas disputas</h1>
        <p className="mt-1 text-[14px] text-zinc-500">
          Contratos em processo de disputa na plataforma aberta.
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
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Você recebe</th>
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
                      {brl(contract?.net_amount ?? contract?.payment_amount ?? 0)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/talent/disputes/${dispute.id}`}
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
