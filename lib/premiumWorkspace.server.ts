/**
 * Server-only helpers for Premium workspace membership and seat management.
 * All functions use the service-role client — import only in Server Components
 * and Route Handlers, never in client components.
 */
import { createServerClient } from "@/lib/supabase";
import { getLivePlanSetting } from "@/lib/planSettings.server";

// -- Types -------------------------------------------------------------------

export type PremiumWorkspace = {
  id: string;
  ownerUserId: string;
  agencyId: string | null;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  brandAccentColor: string | null;
  welcomeMessage: string | null;
  status: string;
  includedAgentSeats: number;
  extraAgentSeats: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  onboardingCompleted: boolean;
};

export type PremiumMembership = {
  id: string;
  workspaceId: string;
  userId: string;
  role: "owner" | "agent";
  status: string;
  spendingLimit: number | null;
  createdAt: string;
};

export type WorkspaceSeatUsage = {
  activeAgentCount: number;   // agents with role='agent' and status='active' (owner excluded)
  pendingInviteCount: number; // pending non-expired invites
  usedSeats: number;          // activeAgentCount + pendingInviteCount
  includedSeats: number;
  extraSeats: number;
  totalAllowed: number;
  remaining: number;
};

export type PremiumAgentInvite = {
  id: string;
  workspaceId: string;
  invitedEmail: string;
  role: "owner" | "agent";
  token: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expiresAt: string;
  createdAt: string;
  spendingLimit: number | null;
};

export type WorkspaceMemberDetail = {
  id: string;
  workspaceId: string;
  userId: string;
  role: "owner" | "agent";
  status: string;
  spendingLimit: number | null;
  createdAt: string;
  displayName: string;
  email: string;
};

export type WorkspaceBranding = {
  name: string;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  brandAccentColor: string | null;
  welcomeMessage: string | null;
};

export type AgentBudgetUsage = {
  memberId: string;
  userId: string;
  spendingLimit: number | null;
  usedAmount: number;
  availableAmount: number | null; // null = unlimited
};

export type AgentLedgerBalance = {
  agentUserId: string;
  allocatedAmount: number;   // net: allocation - allocation_reversal
  committedAmount: number;   // active only: job_commitment - job_release - job_settlement - refund
  spentAmount: number;       // permanently consumed: job_settlement
  availableAmount: number;   // allocatedAmount - committedAmount - spentAmount
};

export type OwnerAllocationSummary = {
  ownerWalletBalance: number;
  totalAllocatedToAgents: number;
  ownerUnallocatedAvailable: number;
};

export type PremiumWorkspaceAccess = {
  workspace: PremiumWorkspace;
  membership: PremiumMembership;
};

// -- Public API --------------------------------------------------------------

/**
 * Returns the workspace + membership if the user is an active owner or agent.
 * Returns null if the user has no active premium workspace membership.
 */
export async function getUserPremiumWorkspace(userId: string): Promise<PremiumWorkspaceAccess | null> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: member } = await supabase
    .from("premium_workspace_members")
    .select("id, workspace_id, user_id, role, status, spending_limit, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member) return null;

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select(
      "id, owner_user_id, agency_id, name, slug, logo_url, brand_primary_color, brand_accent_color, welcome_message, status, included_agent_seats, extra_agent_seats, created_at, updated_at, deleted_at, onboarding_completed"
    )
    .eq("id", member.workspace_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!workspace) return null;

  return {
    workspace: mapWorkspace(workspace),
    membership: mapMembership(member),
  };
}

/**
 * Returns the active workspace access for a user inside a specific workspace.
 * Returns null if the user is not an active member of that workspace.
 */
export async function getPremiumWorkspaceAccessForUser(
  userId: string,
  workspaceId: string
): Promise<PremiumWorkspaceAccess | null> {
  const access = await getUserPremiumWorkspace(userId);
  if (!access || access.workspace.id !== workspaceId) return null;
  return access;
}

/**
 * If the user has an active Premium plan and no workspace yet, creates one
 * automatically and inserts an owner membership row.
 *
 * Safe to call on every Premium page load — returns the existing workspace
 * immediately if it already exists. A unique partial index on owner_user_id
 * prevents duplicate workspaces even under concurrent calls.
 *
 * Returns null if the user is not on the Premium plan.
 */
export async function ensurePremiumWorkspaceForAgency(userId: string): Promise<PremiumWorkspaceAccess | null> {
  const supabase = createServerClient({ useServiceRole: true });

  // Verify Premium plan before doing anything else.
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.plan !== "premium") return null;

  // Return early if a workspace already exists.
  const existing = await getUserPremiumWorkspace(userId);
  if (existing) return existing;

  // Fetch agency name to seed the workspace name.
  const { data: agency } = await supabase
    .from("agencies")
    .select("id, company_name")
    .eq("user_id", userId)
    .maybeSingle();

  const workspaceName = agency?.company_name ?? "Meu Workspace Premium";
  const agencyId = agency?.id ?? null;
  const premiumPlan = await getLivePlanSetting("premium").catch(() => null);
  const includedAgentSeats = premiumPlan?.included_agent_seats ?? 2;

  // Create the workspace (the unique index prevents duplicates on race).
  const { data: newWorkspace, error: wsError } = await supabase
    .from("premium_workspaces")
    .insert({
      owner_user_id: userId,
      agency_id: agencyId,
      name: workspaceName,
      status: "active",
      included_agent_seats: includedAgentSeats,
      extra_agent_seats: 0,
    })
    .select(
      "id, owner_user_id, agency_id, name, slug, logo_url, brand_primary_color, brand_accent_color, welcome_message, status, included_agent_seats, extra_agent_seats, created_at, updated_at, deleted_at, onboarding_completed"
    )
    .single();

  // Workspace insert failed — another concurrent request likely beat us.
  // Re-fetch the existing workspace; then fall through to ensure owner membership.
  let resolvedWorkspace = newWorkspace;
  if (wsError || !newWorkspace) {
    if (wsError) console.error("[premiumWorkspace] Workspace insert error (likely race):", wsError.message);
    const { data: existingWorkspace } = await supabase
      .from("premium_workspaces")
      .select(
        "id, owner_user_id, agency_id, name, slug, logo_url, brand_primary_color, brand_accent_color, welcome_message, status, included_agent_seats, extra_agent_seats, created_at, updated_at, deleted_at, onboarding_completed"
      )
      .eq("owner_user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (!existingWorkspace) {
      console.error("[premiumWorkspace] Could not resolve workspace after race for user:", userId);
      return null;
    }
    resolvedWorkspace = existingWorkspace;
  }

  // Owner membership — select → update (if exists) → insert (if not) → re-select on race.
  // Avoids upsert against the partial unique index (WHERE removed_at IS NULL).
  const memberSelect = "id, workspace_id, user_id, role, status, spending_limit, created_at";

  const { data: existingMember } = await supabase
    .from("premium_workspace_members")
    .select(memberSelect)
    .eq("workspace_id", resolvedWorkspace!.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingMember) {
    const { data: updatedMember, error: updateErr } = await supabase
      .from("premium_workspace_members")
      .update({ role: "owner", status: "active", removed_at: null })
      .eq("id", existingMember.id)
      .select(memberSelect)
      .single();
    if (updateErr || !updatedMember) {
      console.error("[premiumWorkspace] Failed to update owner membership:", updateErr);
      return null;
    }
    return {
      workspace: mapWorkspace(resolvedWorkspace!),
      membership: mapMembership(updatedMember),
    };
  }

  const { data: newMember, error: insertErr } = await supabase
    .from("premium_workspace_members")
    .insert({
      workspace_id: resolvedWorkspace!.id,
      user_id: userId,
      role: "owner",
      status: "active",
      created_by: userId,
    })
    .select(memberSelect)
    .maybeSingle();

  if (insertErr || !newMember) {
    // Race: another concurrent call inserted first — re-fetch and update.
    const { data: raceMember } = await supabase
      .from("premium_workspace_members")
      .select(memberSelect)
      .eq("workspace_id", resolvedWorkspace!.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!raceMember) {
      console.error("[premiumWorkspace] Failed to create owner membership:", insertErr);
      return null;
    }
    const { data: raceUpdated, error: raceErr } = await supabase
      .from("premium_workspace_members")
      .update({ role: "owner", status: "active", removed_at: null })
      .eq("id", raceMember.id)
      .select(memberSelect)
      .single();
    if (raceErr || !raceUpdated) {
      console.error("[premiumWorkspace] Failed to update race membership:", raceErr);
      return null;
    }
    return {
      workspace: mapWorkspace(resolvedWorkspace!),
      membership: mapMembership(raceUpdated),
    };
  }

  return {
    workspace: mapWorkspace(resolvedWorkspace!),
    membership: mapMembership(newMember),
  };
}

/**
 * Returns true if the user holds the owner role in the given workspace.
 */
export async function isPremiumOwner(userId: string, workspaceId: string): Promise<boolean> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data } = await supabase
    .from("premium_workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  return !!data;
}

/**
 * Returns true if the user is an active member (owner or agent) in the workspace.
 */
export async function isPremiumAgent(userId: string, workspaceId: string): Promise<boolean> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data } = await supabase
    .from("premium_workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .in("role", ["owner", "agent"])
    .eq("status", "active")
    .maybeSingle();

  return !!data;
}

/**
 * Returns current seat usage for a workspace.
 * active_agent_count includes the owner seat.
 */
export async function getWorkspaceSeatUsage(workspaceId: string): Promise<WorkspaceSeatUsage> {
  const supabase = createServerClient({ useServiceRole: true });
  const now = new Date().toISOString();

  const [{ count: agentCount }, { count: pendingCount }, { data: workspace }] = await Promise.all([
    // Active agents only — owner does NOT count against seat limit
    supabase
      .from("premium_workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("role", "agent")
      .eq("status", "active"),
    // Pending non-expired invites count against seats to prevent over-inviting
    supabase
      .from("premium_agent_invites")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .gt("expires_at", now),
    supabase
      .from("premium_workspaces")
      .select("included_agent_seats, extra_agent_seats")
      .eq("id", workspaceId)
      .maybeSingle(),
  ]);

  const includedSeats = workspace?.included_agent_seats ?? 2;
  const extraSeats = workspace?.extra_agent_seats ?? 0;
  const totalAllowed = includedSeats + extraSeats;
  const activeAgentCount = agentCount ?? 0;
  const pendingInviteCount = pendingCount ?? 0;
  const usedSeats = activeAgentCount + pendingInviteCount;

  return {
    activeAgentCount,
    pendingInviteCount,
    usedSeats,
    includedSeats,
    extraSeats,
    totalAllowed,
    remaining: Math.max(0, totalAllowed - usedSeats),
  };
}

/**
 * Returns true if the workspace can accept another agent invite.
 * Compares active member count (including owner) against total allowed seats.
 */
export async function canInviteAgent(workspaceId: string): Promise<boolean> {
  const usage = await getWorkspaceSeatUsage(workspaceId);
  return usage.remaining > 0;
}

/**
 * Returns all non-removed members of a workspace, enriched with display name and email.
 */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberDetail[]> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: members } = await supabase
    .from("premium_workspace_members")
    .select("id, workspace_id, user_id, role, status, spending_limit, created_at")
    .eq("workspace_id", workspaceId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });

  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => String(m.user_id));

  // Batch-fetch agency names (company_name) for display
  const { data: agencies } = await supabase
    .from("agencies")
    .select("user_id, company_name")
    .in("user_id", userIds);

  const nameMap = new Map<string, string>(
    (agencies ?? []).map((a) => [String(a.user_id), String(a.company_name ?? "—")])
  );

  // Fetch emails via auth admin (parallel; workspace sizes are small)
  const emailResults = await Promise.all(
    userIds.map((uid) =>
      supabase.auth.admin
        .getUserById(uid)
        .then(({ data }) => ({ uid, email: data?.user?.email ?? "" }))
        .catch(() => ({ uid, email: "" }))
    )
  );
  const emailMap = new Map<string, string>(emailResults.map((r) => [r.uid, r.email]));

  return members.map((m) => {
    const uid = String(m.user_id);
    return {
      id: String(m.id),
      workspaceId: String(m.workspace_id),
      userId: uid,
      role: m.role === "owner" ? "owner" : "agent",
      status: String(m.status),
      spendingLimit: m.spending_limit != null ? Number(m.spending_limit) : null,
      createdAt: String(m.created_at),
      displayName: nameMap.get(uid) ?? emailMap.get(uid) ?? "—",
      email: emailMap.get(uid) ?? "",
    };
  });
}

/**
 * Returns all pending (non-expired) invites for a workspace.
 */
export async function getWorkspacePendingInvites(workspaceId: string): Promise<PremiumAgentInvite[]> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data } = await supabase
    .from("premium_agent_invites")
    .select("id, workspace_id, invited_email, role, token, status, expires_at, created_at, spending_limit")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    invitedEmail: String(row.invited_email),
    role: row.role === "owner" ? "owner" : "agent",
    token: String(row.token),
    status: row.status as PremiumAgentInvite["status"],
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    spendingLimit: row.spending_limit != null ? Number(row.spending_limit) : null,
  }));
}

/**
 * Returns the branding fields for a workspace.
 * Returns null if the workspace is not found or is deleted.
 */
export async function getWorkspaceBranding(workspaceId: string): Promise<WorkspaceBranding | null> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data } = await supabase
    .from("premium_workspaces")
    .select("name, logo_url, brand_primary_color, brand_accent_color, welcome_message")
    .eq("id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;

  return {
    name: data.name,
    logoUrl: (data.logo_url as string | null) ?? null,
    brandPrimaryColor: (data.brand_primary_color as string | null) ?? null,
    brandAccentColor: (data.brand_accent_color as string | null) ?? null,
    welcomeMessage: (data.welcome_message as string | null) ?? null,
  };
}

/**
 * Returns the budget usage for a single agent within a workspace.
 * usedAmount = sum of (budget * number_of_talents_required) for all active workspace jobs created by the agent.
 */
export async function getAgentBudgetUsage(
  workspaceId: string,
  agentUserId: string
): Promise<AgentBudgetUsage | null> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: member } = await supabase
    .from("premium_workspace_members")
    .select("id, spending_limit")
    .eq("workspace_id", workspaceId)
    .eq("user_id", agentUserId)
    .eq("status", "active")
    .maybeSingle();

  if (!member) return null;

  const { data: jobs } = await supabase
    .from("jobs")
    .select("budget, number_of_talents_required")
    .eq("workspace_id", workspaceId)
    .eq("created_by_user_id", agentUserId)
    .neq("status", "inactive")
    .is("deleted_at", null);

  const usedAmount = (jobs ?? []).reduce((sum, job) => {
    return sum + Number(job.budget ?? 0) * Number(job.number_of_talents_required ?? 1);
  }, 0);

  const spendingLimit = member.spending_limit != null ? Number(member.spending_limit) : null;

  return {
    memberId: String(member.id),
    userId: agentUserId,
    spendingLimit,
    usedAmount,
    availableAmount: spendingLimit != null ? Math.max(0, spendingLimit - usedAmount) : null,
  };
}

/**
 * Returns budget usage for all active agents in a workspace (owner excluded).
 * Returns a map of userId → AgentBudgetUsage.
 */
export async function getWorkspaceAgentBudgets(
  workspaceId: string
): Promise<Map<string, AgentBudgetUsage>> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: agents } = await supabase
    .from("premium_workspace_members")
    .select("id, user_id, spending_limit")
    .eq("workspace_id", workspaceId)
    .eq("role", "agent")
    .eq("status", "active");

  if (!agents || agents.length === 0) return new Map();

  const agentIds = agents.map((a) => String(a.user_id));

  const { data: jobs } = await supabase
    .from("jobs")
    .select("created_by_user_id, budget, number_of_talents_required")
    .eq("workspace_id", workspaceId)
    .in("created_by_user_id", agentIds)
    .neq("status", "inactive")
    .is("deleted_at", null);

  const usedByAgent = new Map<string, number>();
  for (const job of jobs ?? []) {
    const uid = String(job.created_by_user_id);
    const est = Number(job.budget ?? 0) * Number(job.number_of_talents_required ?? 1);
    usedByAgent.set(uid, (usedByAgent.get(uid) ?? 0) + est);
  }

  const result = new Map<string, AgentBudgetUsage>();
  for (const agent of agents) {
    const uid = String(agent.user_id);
    const spendingLimit = agent.spending_limit != null ? Number(agent.spending_limit) : null;
    const usedAmount = usedByAgent.get(uid) ?? 0;
    result.set(uid, {
      memberId: String(agent.id),
      userId: uid,
      spendingLimit,
      usedAmount,
      availableAmount: spendingLimit != null ? Math.max(0, spendingLimit - usedAmount) : null,
    });
  }

  return result;
}

/**
 * Returns the internal allocation ledger balance for a single agent in a workspace.
 * Reads from premium_agent_wallet_transactions — no wallet_balance mutations.
 */
export async function getAgentLedgerBalance(
  workspaceId: string,
  agentUserId: string
): Promise<AgentLedgerBalance> {
  const supabase = createServerClient({ useServiceRole: true });

  const { data: txs } = await supabase
    .from("premium_agent_wallet_transactions")
    .select("type, amount")
    .eq("workspace_id", workspaceId)
    .eq("agent_user_id", agentUserId)
    .eq("status", "completed")
    .is("reversed_at", null);

  let allocated = 0;
  let committed = 0;
  let spent     = 0;

  for (const tx of txs ?? []) {
    const amt = Number(tx.amount);
    switch (tx.type) {
      case "allocation":           allocated += amt;  break;
      case "allocation_reversal":  allocated -= amt;  break;
      case "job_commitment":       committed += amt;  break;
      case "job_release":          committed -= amt;  break;
      case "refund":               committed -= amt;  break;
      // job_settlement: moves committed → spent (permanently consumed)
      case "job_settlement":       committed -= amt; spent += amt; break;
      // adjustment: intentionally no-op in automatic computation
    }
  }

  return {
    agentUserId,
    allocatedAmount:  Math.max(0, allocated),
    committedAmount:  Math.max(0, committed),
    spentAmount:      Math.max(0, spent),
    availableAmount:  Math.max(0, allocated - committed - spent),
  };
}

/**
 * Returns ledger balances for all active agents in a workspace.
 * Returns a map of agentUserId → AgentLedgerBalance.
 */
export async function getWorkspaceAgentLedgerBalances(
  workspaceId: string
): Promise<Map<string, AgentLedgerBalance>> {
  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: agents }, { data: txs }] = await Promise.all([
    supabase
      .from("premium_workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "agent")
      .eq("status", "active"),
    supabase
      .from("premium_agent_wallet_transactions")
      .select("agent_user_id, type, amount")
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .is("reversed_at", null),
  ]);

  const ledger = new Map<string, { allocated: number; committed: number; spent: number }>();
  for (const agent of agents ?? []) {
    ledger.set(String(agent.user_id), { allocated: 0, committed: 0, spent: 0 });
  }
  for (const tx of txs ?? []) {
    const uid = String(tx.agent_user_id);
    if (!ledger.has(uid)) ledger.set(uid, { allocated: 0, committed: 0, spent: 0 });
    const entry = ledger.get(uid)!;
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

  const result = new Map<string, AgentLedgerBalance>();
  for (const [uid, entry] of ledger) {
    result.set(uid, {
      agentUserId:     uid,
      allocatedAmount: Math.max(0, entry.allocated),
      committedAmount: Math.max(0, entry.committed),
      spentAmount:     Math.max(0, entry.spent),
      availableAmount: Math.max(0, entry.allocated - entry.committed - entry.spent),
    });
  }
  return result;
}

/**
 * Returns the owner's wallet allocation summary for a workspace.
 * ownerUnallocatedAvailable = wallet_balance - sum of all active agent allocations.
 */
export async function getOwnerAllocationSummary(
  workspaceId: string,
  ownerUserId: string
): Promise<OwnerAllocationSummary> {
  const supabase = createServerClient({ useServiceRole: true });

  const [profileResult, { data: txs }] = await Promise.all([
    supabase.from("profiles").select("wallet_balance").eq("id", ownerUserId).maybeSingle(),
    supabase
      .from("premium_agent_wallet_transactions")
      .select("type, amount")
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .is("reversed_at", null)
      .in("type", ["allocation", "allocation_reversal", "job_settlement"]),
  ]);

  let totalAllocated = 0;
  let totalSettled   = 0;
  for (const tx of txs ?? []) {
    const amt = Number(tx.amount);
    if (tx.type === "allocation")               totalAllocated += amt;
    else if (tx.type === "allocation_reversal") totalAllocated -= amt;
    else if (tx.type === "job_settlement")      totalSettled   += amt;
  }

  // Active virtual reservation = what's allocated but not yet spent from owner wallet
  const activelyAllocated = Math.max(0, totalAllocated - totalSettled);
  const ownerWalletBalance = Number(profileResult.data?.wallet_balance ?? 0);

  return {
    ownerWalletBalance,
    totalAllocatedToAgents: activelyAllocated,
    ownerUnallocatedAvailable: Math.max(0, ownerWalletBalance - activelyAllocated),
  };
}

/**
 * Returns total actively allocated funds across ALL workspaces owned by this user.
 * activelyAllocated = sum(allocation) - sum(allocation_reversal) - sum(job_settlement)
 *
 * Used by Open Space finances page and withdrawal API to compute the owner's
 * true usable balance. Agent allocations do not touch profiles.wallet_balance,
 * so this must be subtracted explicitly.
 */
export async function getOwnerTotalActiveAllocations(ownerUserId: string): Promise<number> {
  const supabase = createServerClient({ useServiceRole: true });
  const { data: txs } = await supabase
    .from("premium_agent_wallet_transactions")
    .select("type, amount")
    .eq("owner_user_id", ownerUserId)
    .eq("status", "completed")
    .is("reversed_at", null)
    .in("type", ["allocation", "allocation_reversal", "job_settlement", "job_release"]);

  let totalAllocated = 0;
  let totalSettled = 0;
  for (const tx of txs ?? []) {
    const amt = Number(tx.amount);
    if (tx.type === "allocation")               totalAllocated += amt;
    else if (tx.type === "allocation_reversal") totalAllocated -= amt;
    else if (tx.type === "job_settlement")      totalSettled   += amt;
    else if (tx.type === "job_release")         totalSettled   += amt;
  }
  return Math.max(0, totalAllocated - totalSettled);
}

// -- Internal mappers --------------------------------------------------------

function mapWorkspace(row: Record<string, unknown>): PremiumWorkspace {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    agencyId: (row.agency_id as string | null) ?? null,
    name: String(row.name),
    slug: (row.slug as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    brandPrimaryColor: (row.brand_primary_color as string | null) ?? null,
    brandAccentColor: (row.brand_accent_color as string | null) ?? null,
    welcomeMessage: (row.welcome_message as string | null) ?? null,
    status: String(row.status),
    includedAgentSeats: Number(row.included_agent_seats ?? 2),
    extraAgentSeats: Number(row.extra_agent_seats ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: (row.deleted_at as string | null) ?? null,
    onboardingCompleted: Boolean(row.onboarding_completed ?? false),
  };
}

function mapMembership(row: Record<string, unknown>): PremiumMembership {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    role: row.role === "owner" ? "owner" : "agent",
    status: String(row.status),
    spendingLimit: row.spending_limit != null ? Number(row.spending_limit) : null,
    createdAt: String(row.created_at),
  };
}
