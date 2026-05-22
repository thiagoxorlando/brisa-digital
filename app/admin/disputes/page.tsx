import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminDisputes, { type AdminDisputeRow } from "@/features/admin/AdminDisputes";
import { resolveContractAmounts } from "@/lib/contractStatus";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

export const metadata: Metadata = { title: "Administracao - Disputas - BrisaHub" };

type ContractSummary = {
  job_id: string | null;
  talent_id: string | null;
  talent_user_id?: string | null;
  agency_id: string | null;
  status: string | null;
  payment_amount: number | null;
  commission_amount: number | null;
  net_amount: number | null;
};

function urgencyFor(status: AdminDisputeRow["status"], openedAt: string | null | undefined): AdminDisputeRow["urgency"] {
  if (!["open", "under_review"].includes(status)) return "resolved";
  if (!openedAt) return "normal";
  const ageHours = (Date.now() - new Date(openedAt).getTime()) / (1000 * 60 * 60);
  if (ageHours >= 48) return "critical";
  if (ageHours >= 24) return "high";
  return "normal";
}

export default async function AdminDisputesPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const supabase = createServerClient({ useServiceRole: true });

  const { data: disputeRows, error } = await supabase
    .from("contract_disputes")
    .select(
      "id, contract_id, workspace_id, opened_by_user_id, reason, status, created_at, resolved_at, resolved_by_user_id, resolution_note, resolution_action, talent_amount, agency_refund_amount",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/disputes] query error", error.message);
    return <AdminDisputes rows={[]} />;
  }

  const rows = disputeRows ?? [];

  if (rows.length === 0) {
    return <AdminDisputes rows={[]} />;
  }

  const contractIds = [...new Set(rows.map((d) => d.contract_id).filter(Boolean))] as string[];

  const { data: contracts } = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, talent_user_id, agency_id, status, payment_amount, commission_amount, net_amount")
    .in("id", contractIds)
    .is("deleted_at", null);

  const contractMap = new Map<string, ContractSummary>();
  for (const c of contracts ?? []) {
    contractMap.set(c.id, {
      job_id: c.job_id ?? null,
      talent_id: c.talent_id ?? null,
      talent_user_id: (c as { talent_user_id?: string | null }).talent_user_id ?? null,
      agency_id: c.agency_id ?? null,
      status: c.status ?? null,
      payment_amount: c.payment_amount ?? null,
      commission_amount: c.commission_amount ?? null,
      net_amount: c.net_amount ?? null,
    });
  }

  const jobIds = [...new Set([...contractMap.values()].map((c) => c.job_id).filter(Boolean))] as string[];
  const talentIds = [
    ...new Set(
      [...contractMap.values()]
        .flatMap((c) => [c.talent_id, c.talent_user_id])
        .filter(Boolean),
    ),
  ] as string[];
  const agencyIds = [...new Set([...contractMap.values()].map((c) => c.agency_id).filter(Boolean))] as string[];

  const [jobsRes, talentsByIdRes, talentsByUserRes, agenciesRes] = await Promise.all([
    jobIds.length
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] }),
    talentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)
      : Promise.resolve({ data: [] }),
    talentIds.length
      ? supabase.from("talent_profiles").select("user_id, full_name").in("user_id", talentIds)
      : Promise.resolve({ data: [] }),
    agencyIds.length
      ? supabase.from("agencies").select("id, company_name").in("id", agencyIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const jobMap = new Map<string, string>();
  const talentMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();

  for (const j of jobsRes.data ?? []) jobMap.set(j.id, j.title ?? "Vaga sem titulo");
  for (const t of talentsByIdRes.data ?? []) talentMap.set(t.id, t.full_name ?? "Talento");
  for (const t of talentsByUserRes.data ?? []) {
    if (t.user_id) talentMap.set(t.user_id, t.full_name ?? "Talento");
  }
  for (const a of agenciesRes.data ?? []) agencyMap.set(a.id, a.company_name ?? "Agencia");

  const enriched: AdminDisputeRow[] = rows.map((d) => {
    const ctx = contractMap.get(d.contract_id);
    const amounts = ctx ? resolveContractAmounts(ctx) : { gross: 0, commission: 0, net: 0, commissionPct: 0 };
    const status = d.status as AdminDisputeRow["status"];
    const activeEscrow = (status === "open" || status === "under_review") && ctx?.status === "confirmed";

    return {
      id: d.id,
      contractId: d.contract_id,
      workspaceId: (d as { workspace_id?: string | null }).workspace_id ?? null,
      jobTitle: ctx?.job_id ? (jobMap.get(ctx.job_id) ?? null) : null,
      talentName: ctx?.talent_user_id || ctx?.talent_id
        ? (talentMap.get(ctx.talent_user_id ?? "") ?? talentMap.get(ctx.talent_id ?? "") ?? null)
        : null,
      agencyName: ctx?.agency_id ? (agencyMap.get(ctx.agency_id) ?? null) : null,
      status,
      openedAt: d.created_at ?? "",
      reason: d.reason ?? "",
      resolvedAt: d.resolved_at ?? null,
      resolution: (d as { resolution_note?: string | null }).resolution_note ?? null,
      grossAmount: amounts.gross,
      escrowAmount: activeEscrow ? amounts.gross : 0,
      contractStatus: ctx?.status ?? null,
      urgency: urgencyFor(status, d.created_at),
    };
  });

  return <AdminDisputes rows={enriched} />;
}
