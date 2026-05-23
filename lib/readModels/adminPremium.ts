/**
 * Read model for the admin Premium workspace monitor page.
 * All functions use the service-role client — import only in server components.
 */
import { createServerClient } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

export type AdminPremiumSummary = {
  activeWorkspaceCount: number;
  activeAgentCount: number;
  privateJobCount: number;
  pendingInviteCount: number;
  totalUsedSeats: number;
  totalAllowedSeats: number;
};

export type AdminPremiumAgentRow = {
  memberId: string;
  userId: string;
  role: "owner" | "agent";
  status: string;
  allocatedAmount: number;
  committedAmount: number;
  availableAmount: number;
  displayName: string;
  email: string;
  createdAt: string;
};

export type AdminPremiumInviteRow = {
  id: string;
  invitedEmail: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  spendingLimit: number | null;
};

export type AdminPremiumJobRow = {
  id: string;
  title: string;
  visibility: string;
  status: string;
  budget: number | null;
  createdByDisplayName: string | null;
  candidateCount: number;
  createdAt: string;
};

export type AdminPremiumWorkspaceRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  brandAccentColor: string | null;
  welcomeMessage: string | null;
  status: string;
  includedSeats: number;
  extraSeats: number;
  totalSeats: number;
  ownerUserId: string;
  agencyId: string | null;
  ownerCompanyName: string;
  ownerEmail: string;
  ownerPlan: string;
  ownerWalletBalance: number;
  activeAgentCount: number;
  pendingInviteCount: number;
  usedSeats: number;
  remainingSeats: number;
  privateJobCount: number;
  totalJobCount: number;
  createdAt: string;
  deletedAt: string | null;
  hasLogo: boolean;
  hasWelcomeMessage: boolean;
  slug: string | null;
  portalTalentCount: number;
  isOrphan: boolean;
  orphanReason: string | null;
  // Expanded
  agents: AdminPremiumAgentRow[];
  pendingInvites: AdminPremiumInviteRow[];
  recentJobs: AdminPremiumJobRow[];
};

export type AdminPremiumData = {
  summary: AdminPremiumSummary;
  workspaces: AdminPremiumWorkspaceRow[];
};

// ── Main loader ───────────────────────────────────────────────────────────────

export async function loadAdminPremiumData(): Promise<AdminPremiumData> {
  const supabase = createServerClient({ useServiceRole: true });

  // ── 1. Fetch active workspaces only (exclude soft-deleted) ───────────────
  const { data: workspaces } = await supabase
    .from("premium_workspaces")
    .select(
      "id, owner_user_id, agency_id, name, slug, logo_url, brand_primary_color, brand_accent_color, welcome_message, status, included_agent_seats, extra_agent_seats, created_at, deleted_at"
    )
    .is("deleted_at", null)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (!workspaces || workspaces.length === 0) {
    return {
      summary: {
        activeWorkspaceCount: 0,
        activeAgentCount: 0,
        privateJobCount: 0,
        pendingInviteCount: 0,
        totalUsedSeats: 0,
        totalAllowedSeats: 0,
      },
      workspaces: [],
    };
  }

  const workspaceIds = workspaces.map((w) => String(w.id));
  const ownerUserIds = [...new Set(workspaces.map((w) => String(w.owner_user_id)))];
  const agencyIds = workspaces.map((w) => w.agency_id).filter((id): id is string => !!id);

  // ── 2. Batch-fetch all related data ───────────────────────────────────────
  const now = new Date().toISOString();

  const [
    { data: allMembers },
    { data: allInvites },
    { data: allJobs },
    { data: ownerProfiles },
    { data: ownerAgencies },
    { data: { users: authUsers } },
  ] = await Promise.all([
    supabase
      .from("premium_workspace_members")
      .select("id, workspace_id, user_id, role, status, spending_limit, created_at")
      .in("workspace_id", workspaceIds)
      .eq("status", "active"),
    supabase
      .from("premium_agent_invites")
      .select("id, workspace_id, invited_email, status, expires_at, created_at, spending_limit")
      .in("workspace_id", workspaceIds)
      .eq("status", "pending")
      .gt("expires_at", now),
    supabase
      .from("jobs")
      .select("id, workspace_id, title, visibility, status, budget, created_at, created_by_user_id")
      .in("workspace_id", workspaceIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, plan, wallet_balance")
      .in("id", ownerUserIds),
    agencyIds.length
      ? supabase.from("agencies").select("id, user_id, company_name").in("id", agencyIds)
      : Promise.resolve({ data: [] }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  // Fetch portal talent counts per workspace
  const { data: allPortalTalents } = workspaceIds.length
    ? await supabase
        .from("premium_workspace_talents")
        .select("workspace_id")
        .in("workspace_id", workspaceIds)
        .eq("status", "active")
        .is("removed_at", null)
    : { data: [] };

  const portalTalentCountMap = new Map<string, number>();
  for (const pt of allPortalTalents ?? []) {
    const wsId = String(pt.workspace_id);
    portalTalentCountMap.set(wsId, (portalTalentCountMap.get(wsId) ?? 0) + 1);
  }

  // Fetch ledger transactions for all workspaces
  const { data: allLedgerTxs } = workspaceIds.length
    ? await supabase
        .from("premium_agent_wallet_transactions")
        .select("workspace_id, agent_user_id, type, amount")
        .in("workspace_id", workspaceIds)
        .eq("status", "completed")
        .is("reversed_at", null)
    : { data: [] };

  // Submission counts — fetched after allJobs is resolved to avoid circular reference
  const jobIds = (allJobs ?? []).map((j) => String(j.id));
  const { data: submissionCounts } = jobIds.length
    ? await supabase.from("submissions").select("job_id").in("job_id", jobIds)
    : { data: [] };

  // Also fetch agencies for non-owner members
  const allMemberUserIds = [...new Set(
    (allMembers ?? []).map((m) => String(m.user_id)).filter((id) => !ownerUserIds.includes(id))
  )];
  const { data: memberAgencies } = allMemberUserIds.length
    ? await supabase.from("agencies").select("id, user_id, company_name").in("user_id", allMemberUserIds)
    : { data: [] };

  // ── 3. Build lookup maps ──────────────────────────────────────────────────

  // Auth email map (userId → email)
  const authEmailMap = new Map<string, string>(
    (authUsers ?? []).map((u) => [u.id, u.email ?? ""])
  );
  const authUserIdSet = new Set((authUsers ?? []).map((u) => u.id));

  // Profile map (userId → { plan, wallet_balance })
  const profileMap = new Map<string, { plan: string; walletBalance: number }>(
    (ownerProfiles ?? []).map((p) => [
      String(p.id),
      { plan: String(p.plan ?? "free"), walletBalance: Number(p.wallet_balance ?? 0) },
    ])
  );

  // Agency map by id (agencyId → company_name)
  const agencyByIdMap = new Map<string, string>(
    (ownerAgencies ?? []).map((a) => [String(a.id), String(a.company_name ?? "")])
  );

  // Agency map by user_id (userId → company_name), for members
  const agencyByUserIdMap = new Map<string, string>([
    ...(ownerAgencies ?? []).map((a): [string, string] => [String(a.user_id), String(a.company_name ?? "")]),
    ...(memberAgencies ?? []).map((a): [string, string] => [String(a.user_id), String(a.company_name ?? "")]),
  ]);

  // Resolve display name: agency.company_name → auth.email → "Usuário removido"
  function resolveDisplayName(userId: string): string {
    return agencyByUserIdMap.get(userId) || authEmailMap.get(userId) || "Usuário removido";
  }

  // Submission count per job
  const subCountMap = new Map<string, number>();
  for (const s of submissionCounts ?? []) {
    const jid = String(s.job_id);
    subCountMap.set(jid, (subCountMap.get(jid) ?? 0) + 1);
  }

  // Jobs per workspace
  const jobsByWorkspace = new Map<string, typeof allJobs>((workspaceIds.map((id) => [id, []])));
  for (const job of allJobs ?? []) {
    const wsId = String(job.workspace_id);
    if (!jobsByWorkspace.has(wsId)) jobsByWorkspace.set(wsId, []);
    jobsByWorkspace.get(wsId)!.push(job);
  }

  // Members per workspace
  const membersByWorkspace = new Map<string, typeof allMembers>(workspaceIds.map((id) => [id, []]));
  for (const m of allMembers ?? []) {
    const wsId = String(m.workspace_id);
    if (!membersByWorkspace.has(wsId)) membersByWorkspace.set(wsId, []);
    membersByWorkspace.get(wsId)!.push(m);
  }

  // Invites per workspace
  const invitesByWorkspace = new Map<string, typeof allInvites>(workspaceIds.map((id) => [id, []]));
  for (const inv of allInvites ?? []) {
    const wsId = String(inv.workspace_id);
    if (!invitesByWorkspace.has(wsId)) invitesByWorkspace.set(wsId, []);
    invitesByWorkspace.get(wsId)!.push(inv);
  }

  // Ledger balances per agent from premium_agent_wallet_transactions
  type LedgerEntry = { allocated: number; committed: number; spent: number };
  const ledgerByAgent = new Map<string, LedgerEntry>();
  for (const tx of allLedgerTxs ?? []) {
    const uid = String(tx.agent_user_id);
    if (!ledgerByAgent.has(uid)) ledgerByAgent.set(uid, { allocated: 0, committed: 0, spent: 0 });
    const entry = ledgerByAgent.get(uid)!;
    const amt = Number(tx.amount);
    switch (tx.type) {
      case "allocation":           entry.allocated += amt;  break;
      case "allocation_reversal":  entry.allocated -= amt;  break;
      case "job_commitment":       entry.committed += amt;  break;
      case "job_release":          entry.committed -= amt;  break;
      case "refund":               entry.committed -= amt;  break;
      case "job_settlement":       entry.committed -= amt; entry.spent += amt; break;
    }
  }

  // ── 4. Assemble workspace rows ─────────────────────────────────────────────

  const workspaceRows: AdminPremiumWorkspaceRow[] = workspaces.map((ws) => {
    const wsId = String(ws.id);
    const ownerUserId = String(ws.owner_user_id);
    const agencyId = ws.agency_id ? String(ws.agency_id) : null;

    const ownerCompanyName = (agencyId ? agencyByIdMap.get(agencyId) : undefined)
      || agencyByUserIdMap.get(ownerUserId)
      || authEmailMap.get(ownerUserId)
      || "—";
    const ownerEmail = authEmailMap.get(ownerUserId) ?? "";
    const ownerProfile = profileMap.get(ownerUserId);
    const ownerAgencyName = (agencyId ? agencyByIdMap.get(agencyId) : undefined) || agencyByUserIdMap.get(ownerUserId) || null;
    const ownerPlan = ownerProfile?.plan ?? "—";
    const ownerWalletBalance = ownerProfile?.walletBalance ?? 0;
    const missingAuthUser = !authUserIdSet.has(ownerUserId);
    const missingProfile = !ownerProfile;
    const missingAgency = !ownerAgencyName;
    const isOrphan = missingAuthUser || missingProfile || missingAgency;
    const orphanReason = missingAuthUser
      ? "Usuário deletado"
      : missingProfile
        ? "Perfil deletado"
        : missingAgency
          ? "Agência deletada"
          : null;

    const wsMembers = membersByWorkspace.get(wsId) ?? [];
    const activeAgents = wsMembers.filter((m) => m.role === "agent" && m.status === "active");
    const wsInvites = invitesByWorkspace.get(wsId) ?? [];
    const wsJobs = jobsByWorkspace.get(wsId) ?? [];
    const privateJobs = wsJobs;

    const includedSeats = Number(ws.included_agent_seats ?? 2);
    const extraSeats = Number(ws.extra_agent_seats ?? 0);
    const totalSeats = includedSeats + extraSeats;
    const usedSeats = activeAgents.length + (wsInvites?.length ?? 0);

    // Build agent rows
    const agents: AdminPremiumAgentRow[] = wsMembers.map((m) => {
      const uid = String(m.user_id);
      const ledger = ledgerByAgent.get(uid) ?? { allocated: 0, committed: 0, spent: 0 };
      return {
        memberId: String(m.id),
        userId: uid,
        role: m.role === "owner" ? "owner" : "agent",
        status: String(m.status),
        allocatedAmount:  Math.max(0, ledger.allocated),
        committedAmount:  Math.max(0, ledger.committed),
        availableAmount:  Math.max(0, ledger.allocated - ledger.committed - ledger.spent),
        displayName: resolveDisplayName(uid),
        email: authEmailMap.get(uid) ?? "",
        createdAt: String(m.created_at),
      };
    });

    // Build invite rows (no tokens shown)
    const pendingInvites: AdminPremiumInviteRow[] = (wsInvites ?? []).map((inv) => ({
      id: String(inv.id),
      invitedEmail: String(inv.invited_email),
      status: String(inv.status),
      expiresAt: String(inv.expires_at),
      createdAt: String(inv.created_at),
      spendingLimit: inv.spending_limit != null ? Number(inv.spending_limit) : null,
    }));

    // Build job rows (recent 10)
    const recentJobs: AdminPremiumJobRow[] = wsJobs.slice(0, 10).map((j) => ({
      id: String(j.id),
      title: String(j.title ?? ""),
      visibility: String(j.visibility ?? "public"),
      status: String(j.status ?? ""),
      budget: j.budget != null ? Number(j.budget) : null,
      createdByDisplayName: j.created_by_user_id ? resolveDisplayName(String(j.created_by_user_id)) : null,
      candidateCount: subCountMap.get(String(j.id)) ?? 0,
      createdAt: String(j.created_at),
    }));

    return {
      id: wsId,
      name: String(ws.name),
      logoUrl: (ws.logo_url as string | null) ?? null,
      brandPrimaryColor: (ws.brand_primary_color as string | null) ?? null,
      brandAccentColor: (ws.brand_accent_color as string | null) ?? null,
      welcomeMessage: (ws.welcome_message as string | null) ?? null,
      status: String(ws.status),
      includedSeats,
      extraSeats,
      totalSeats,
      ownerUserId,
      agencyId,
      ownerCompanyName,
      ownerEmail,
      ownerPlan,
      ownerWalletBalance,
      activeAgentCount: activeAgents.length,
      pendingInviteCount: wsInvites?.length ?? 0,
      usedSeats,
      remainingSeats: Math.max(0, totalSeats - usedSeats),
      privateJobCount: privateJobs.length,
      totalJobCount: wsJobs.length,
      createdAt: String(ws.created_at),
      deletedAt: (ws.deleted_at as string | null) ?? null,
      hasLogo: !!(ws.logo_url),
      hasWelcomeMessage: !!(ws.welcome_message),
      slug: (ws.slug as string | null) ?? null,
      portalTalentCount: portalTalentCountMap.get(wsId) ?? 0,
      isOrphan,
      orphanReason,
      agents,
      pendingInvites,
      recentJobs,
    };
  });

  const activeWorkspaceRows = workspaceRows.filter((row) => row.status === "active" && !row.deletedAt);

  return {
    summary: {
      activeWorkspaceCount: activeWorkspaceRows.length,
      activeAgentCount: activeWorkspaceRows.reduce((sum, row) => sum + row.activeAgentCount, 0),
      privateJobCount: activeWorkspaceRows.reduce((sum, row) => sum + row.privateJobCount, 0),
      pendingInviteCount: activeWorkspaceRows.reduce((sum, row) => sum + row.pendingInviteCount, 0),
      totalUsedSeats: activeWorkspaceRows.reduce((sum, row) => sum + row.usedSeats, 0),
      totalAllowedSeats: activeWorkspaceRows.reduce((sum, row) => sum + row.totalSeats, 0),
    },
    workspaces: workspaceRows,
  };
}
