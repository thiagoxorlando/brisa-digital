import type { Metadata } from "next";
import AdminPayouts, { type AdminPayoutRow } from "@/features/admin/AdminPayouts";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Payouts — Admin — BrisaHub" };

export default async function AdminPayoutsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: payoutTxs } = await supabase
    .from("wallet_transactions")
    .select("id, user_id, amount, reference_id, created_at")
    .eq("type", "payout")
    .order("created_at", { ascending: false });

  const txRows = payoutTxs ?? [];

  const contractIds = [...new Set(txRows.map((t) => t.reference_id).filter(Boolean))] as string[];

  const contractMap           = new Map<string, { payment_amount: number; commission_amount: number | null; net_amount: number | null; talent_id: string | null; agency_id: string | null; job_id: string | null }>();
  const contractJobMap        = new Map<string, { title: string; workspace_id: string | null }>();
  const talentMap             = new Map<string, string>();
  const agencyMap             = new Map<string, string>();
  const workspaceNameMap      = new Map<string, string>();

  if (contractIds.length) {
    const { data: contracts } = await supabase
      .from("contracts")
      .select("id, payment_amount, commission_amount, net_amount, talent_id, agency_id, job_id")
      .in("id", contractIds)
      .is("deleted_at", null);

    for (const c of contracts ?? []) {
      contractMap.set(c.id, {
        payment_amount:    c.payment_amount    ?? 0,
        commission_amount: c.commission_amount ?? null,
        net_amount:        c.net_amount        ?? null,
        talent_id:         c.talent_id         ?? null,
        agency_id:         c.agency_id         ?? null,
        job_id:            c.job_id            ?? null,
      });
    }

    const talentIds  = [...new Set([...contractMap.values()].map((c) => c.talent_id).filter(Boolean))] as string[];
    const agencyIds  = [...new Set([...contractMap.values()].map((c) => c.agency_id).filter(Boolean))] as string[];
    const jobIds     = [...new Set([...contractMap.values()].map((c) => c.job_id).filter(Boolean))] as string[];
    const [authUsersRes, profilesRes] = await Promise.all([
      // TODO: paginate auth users for platforms with >1000 users
      supabase.auth.admin.listUsers({ perPage: 1000 }),
      supabase.from("profiles").select("id").is("deleted_at", null),
    ]);
    const validUserIds    = new Set((authUsersRes.data?.users ?? []).map((u) => u.id));
    const validProfileIds = new Set((profilesRes.data ?? []).map((p) => p.id));

    await Promise.all([
      talentIds.length
        ? supabase.from("talent_profiles").select("id, full_name").in("id", talentIds).then(({ data }) => {
            for (const t of data ?? []) talentMap.set(t.id, t.full_name ?? "Talento sem nome");
          })
        : Promise.resolve(),
      agencyIds.length
        ? supabase.from("agencies").select("id, user_id, company_name").in("id", agencyIds).then(({ data }) => {
            for (const a of data ?? []) {
              const ownerId  = (a as { user_id?: string | null }).user_id ?? a.id;
              const isOrphan = !ownerId || !validUserIds.has(ownerId) || !validProfileIds.has(ownerId);
              agencyMap.set(a.id, isOrphan ? "Agência órfã / usuário deletado" : (a.company_name ?? "Agência sem nome"));
            }
          })
        : Promise.resolve(),
      jobIds.length
        ? supabase.from("jobs").select("id, title, workspace_id").in("id", jobIds).then(({ data }) => {
            for (const j of data ?? []) {
              contractJobMap.set(j.id, {
                title:        j.title ?? "Vaga sem título",
                workspace_id: (j as { workspace_id?: string | null }).workspace_id ?? null,
              });
            }
          })
        : Promise.resolve(),
    ]);

    const wsIds = [...new Set([...contractJobMap.values()].map((j) => j.workspace_id).filter(Boolean))] as string[];
    if (wsIds.length) {
      const { data: wsData } = await supabase
        .from("premium_workspaces")
        .select("id, name")
        .in("id", wsIds)
        .is("deleted_at", null);
      for (const ws of wsData ?? []) workspaceNameMap.set(ws.id, ws.name ?? "Premium");
    }
  }

  const rows: AdminPayoutRow[] = txRows.map((tx) => {
    const contract  = tx.reference_id ? contractMap.get(tx.reference_id) : undefined;
    const job       = contract?.job_id ? contractJobMap.get(contract.job_id) : undefined;
    const wsId      = job?.workspace_id ?? null;
    const gross      = contract?.payment_amount ?? 0;
    const net        = typeof contract?.net_amount === "number" ? contract.net_amount : Math.abs(tx.amount ?? 0);
    const commission = typeof contract?.commission_amount === "number" ? contract.commission_amount : (gross - net);

    return {
      id:            tx.id,
      contractId:    tx.reference_id ?? null,
      talentName:    contract?.talent_id ? (talentMap.get(contract.talent_id) ?? "Talento órfão / usuário deletado") : "—",
      agencyName:    contract?.agency_id ? (agencyMap.get(contract.agency_id) ?? "Agência órfã / usuário deletado") : "—",
      jobTitle:      job?.title ?? "Vaga órfã",
      gross,
      commission,
      net,
      payoutAmount:  Math.abs(tx.amount ?? 0),
      payoutDate:    tx.created_at ?? "",
      workspaceId:   wsId,
      workspaceName: wsId ? (workspaceNameMap.get(wsId) ?? "Workspace órfão") : null,
    };
  });

  return <AdminPayouts rows={rows} />;
}
