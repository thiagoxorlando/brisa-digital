import type { Metadata } from "next";
import AdminEscrow, { type AdminEscrowRow } from "@/features/admin/AdminEscrow";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Escrow — Admin — BrisaHub" };

export default async function AdminEscrowPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: contractRows } = await supabase
    .from("contracts")
    .select("id, job_id, talent_id, agency_id, payment_amount, status, created_at, signed_at, deposit_paid_at, confirmed_at, paid_at")
    .is("deleted_at", null)
    .in("status", ["sent", "signed", "confirmed"])
    .order("created_at", { ascending: false });

  const rows = contractRows ?? [];

  const talentIds   = [...new Set(rows.map((r) => r.talent_id).filter(Boolean))] as string[];
  const agencyIds   = [...new Set(rows.map((r) => r.agency_id).filter(Boolean))] as string[];
  const jobIds      = [...new Set(rows.map((r) => r.job_id).filter(Boolean))] as string[];

  const [talentRes, agencyRes, jobsRes, authUsersRes, profilesRes] = await Promise.all([
    talentIds.length
      ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds)
      : Promise.resolve({ data: [] }),
    agencyIds.length
      ? supabase.from("agencies").select("id, user_id, company_name").in("id", agencyIds)
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase.from("jobs").select("id, title, job_date, workspace_id").in("id", jobIds)
      : Promise.resolve({ data: [] }),
    // TODO: paginate auth users for platforms with >1000 users
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("profiles").select("id").is("deleted_at", null),
  ]);

  const validUserIds    = new Set((authUsersRes.data?.users ?? []).map((u) => u.id));
  const validProfileIds = new Set((profilesRes.data ?? []).map((p) => p.id));

  const talentMap      = new Map<string, string>();
  const agencyMap      = new Map<string, string>();
  const jobTitleMap    = new Map<string, string>();
  const jobDateMap     = new Map<string, string | null>();
  const jobWorkspaceMap = new Map<string, string | null>();

  for (const t of talentRes.data ?? []) {
    talentMap.set(t.id, t.full_name ?? "Talento órfão / usuário deletado");
  }
  for (const a of agencyRes.data ?? []) {
    const ownerId  = (a as { user_id?: string | null }).user_id ?? a.id;
    const isOrphan = !ownerId || !validUserIds.has(ownerId) || !validProfileIds.has(ownerId);
    agencyMap.set(a.id, isOrphan ? "Agência órfã / usuário deletado" : (a.company_name ?? "Agência sem nome"));
  }
  for (const j of jobsRes.data ?? []) {
    jobTitleMap.set(j.id, j.title ?? "Vaga sem título");
    jobDateMap.set(j.id, (j as { job_date?: string | null }).job_date ?? null);
    jobWorkspaceMap.set(j.id, (j as { workspace_id?: string | null }).workspace_id ?? null);
  }

  const workspaceIds = [...new Set([...jobWorkspaceMap.values()].filter((id): id is string => !!id))];
  const workspaceNameMap = new Map<string, string>();
  if (workspaceIds.length) {
    const { data: wsData } = await supabase
      .from("premium_workspaces")
      .select("id, name")
      .in("id", workspaceIds)
      .is("deleted_at", null);
    for (const ws of wsData ?? []) workspaceNameMap.set(ws.id, ws.name ?? "Premium");
  }

  const escrowRows: AdminEscrowRow[] = rows.map((r) => {
    const wsId = r.job_id ? (jobWorkspaceMap.get(r.job_id) ?? null) : null;
    return {
      id:            r.id,
      jobTitle:      r.job_id ? (jobTitleMap.get(r.job_id) ?? "Vaga órfã") : "Vaga órfã",
      talentName:    r.talent_id ? (talentMap.get(r.talent_id) ?? "Talento órfão / usuário deletado") : "Talento órfão / usuário deletado",
      agencyName:    r.agency_id ? (agencyMap.get(r.agency_id) ?? "Agência órfã / usuário deletado") : "—",
      amount:        r.payment_amount ?? 0,
      status:        r.status ?? "sent",
      createdAt:     r.created_at ?? "",
      signedAt:      r.signed_at ?? null,
      depositPaidAt: r.deposit_paid_at ?? null,
      confirmedAt:   r.confirmed_at ?? null,
      paidAt:        r.paid_at ?? null,
      jobDate:       r.job_id ? (jobDateMap.get(r.job_id) ?? null) : null,
      workspaceId:   wsId,
      workspaceName: wsId ? (workspaceNameMap.get(wsId) ?? "Workspace órfão") : null,
    };
  });

  return <AdminEscrow rows={escrowRows} />;
}
