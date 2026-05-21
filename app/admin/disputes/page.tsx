import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminDisputes, { type AdminDisputeRow } from "@/features/admin/AdminDisputes";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/requireAdmin";

export const metadata: Metadata = { title: "Administração — Disputas — BrisaHub" };

export default async function AdminDisputesPage() {
  const auth = await requireAdmin();
  if (!("userId" in auth)) redirect("/");

  const supabase = createServerClient({ useServiceRole: true });

  const { data: disputeRows, error } = await supabase
    .from("contract_disputes")
    .select(
      "id, contract_id, workspace_id, opened_by_user_id, reason, status, created_at, resolved_at, resolved_by_user_id, resolution_note",
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

  // Enrich with contract → job title, talent name, agency name.
  const contractIds = [...new Set(rows.map((d) => d.contract_id).filter(Boolean))] as string[];

  const { data: contracts } = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, agency_id")
    .in("id", contractIds)
    .is("deleted_at", null);

  const contractMap = new Map<string, { job_id: string | null; talent_id: string | null; agency_id: string | null }>();
  for (const c of contracts ?? []) {
    contractMap.set(c.id, {
      job_id:    c.job_id    ?? null,
      talent_id: c.talent_id ?? null,
      agency_id: c.agency_id ?? null,
    });
  }

  const jobIds    = [...new Set([...contractMap.values()].map((c) => c.job_id).filter(Boolean))] as string[];
  const talentIds = [...new Set([...contractMap.values()].map((c) => c.talent_id).filter(Boolean))] as string[];
  const agencyIds = [...new Set([...contractMap.values()].map((c) => c.agency_id).filter(Boolean))] as string[];

  const [jobsRes, talentsRes, agenciesRes] = await Promise.all([
    jobIds.length
      ? supabase.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] }),
    talentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)
      : Promise.resolve({ data: [] }),
    agencyIds.length
      ? supabase.from("agencies").select("id, company_name").in("id", agencyIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const jobMap    = new Map<string, string>();
  const talentMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();
  for (const j of jobsRes.data    ?? []) jobMap.set(j.id,    j.title        ?? "Vaga sem título");
  for (const t of talentsRes.data ?? []) talentMap.set(t.id, t.full_name    ?? "Talento");
  for (const a of agenciesRes.data ?? []) agencyMap.set(a.id, a.company_name ?? "Agência");

  const enriched: AdminDisputeRow[] = rows.map((d) => {
    const ctx = contractMap.get(d.contract_id);
    return {
      id:           d.id,
      contractId:   d.contract_id,
      workspaceId:  (d as { workspace_id?: string | null }).workspace_id ?? null,
      jobTitle:     ctx?.job_id    ? (jobMap.get(ctx.job_id)       ?? null) : null,
      talentName:   ctx?.talent_id ? (talentMap.get(ctx.talent_id) ?? null) : null,
      agencyName:   ctx?.agency_id ? (agencyMap.get(ctx.agency_id) ?? null) : null,
      status:       d.status as AdminDisputeRow["status"],
      openedAt:     d.created_at ?? "",
      reason:       d.reason ?? "",
      resolvedAt:   d.resolved_at ?? null,
      resolution:   (d as { resolution_note?: string | null }).resolution_note ?? null,
    };
  });

  return <AdminDisputes rows={enriched} />;
}
