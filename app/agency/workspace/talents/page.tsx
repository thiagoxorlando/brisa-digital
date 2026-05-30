import type { Metadata } from "next";
import WorkspaceTalentsBoard, {
  type WorkspaceTalentCard,
  type WorkspaceTalentContractHistory,
} from "@/features/agency/WorkspaceTalentsBoard";
import { createServerClient } from "@/lib/supabase";
import { brl } from "@/lib/brl";
import { getContractComputedState } from "@/lib/contractState";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";

export const metadata: Metadata = { title: "Invited Talents — BrisaHub" };

type TalentProfileRow = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  phone: string | null;
  marketplace_visible: boolean | null;
};

type AuthUserRow = {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
};

type WorkspaceContractRow = {
  id: string;
  talent_id: string | null;
  talent_user_id?: string | null;
  job_id: string | null;
  status: string;
  payment_amount: number | null;
  commission_amount: number | null;
  net_amount: number | null;
  paid_at: string | null;
  created_at: string;
};

type TalentAgg = {
  jobIds: Set<string>;
  latestActivity: string;
  applicationCount: number;
  contractCount: number;
  hasPortalMembership: boolean;
};

async function getTalentProfileMap(
  supabase: ReturnType<typeof createServerClient>,
  userIds: string[],
) {
  if (userIds.length === 0) return new Map<string, TalentProfileRow>();

  const [byUserIdResult, byIdResult] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("id, user_id, full_name, avatar_url, city, country, bio, phone, marketplace_visible")
      .in("user_id", userIds),
    supabase
      .from("talent_profiles")
      .select("id, user_id, full_name, avatar_url, city, country, bio, phone, marketplace_visible")
      .in("id", userIds),
  ]);

  const profileMap = new Map<string, TalentProfileRow>();
  for (const row of [...(byUserIdResult.data ?? []), ...(byIdResult.data ?? [])]) {
    profileMap.set(String(row.user_id ?? row.id), {
      id: String(row.id),
      user_id: (row.user_id as string | null) ?? null,
      full_name: (row.full_name as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
      city: (row as { city?: string | null }).city ?? null,
      country: (row as { country?: string | null }).country ?? null,
      bio: (row as { bio?: string | null }).bio ?? null,
      phone: (row as { phone?: string | null }).phone ?? null,
      marketplace_visible: (row as { marketplace_visible?: boolean | null }).marketplace_visible ?? null,
    });
  }

  return profileMap;
}

function maxIso(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort((left, right) => String(right).localeCompare(String(left)))[0] ?? "";
}

function buildSourceLabel(hasPortalMembership: boolean, hasDirectHistory: boolean) {
  if (hasPortalMembership && hasDirectHistory) return "portal/direct";
  if (hasPortalMembership) return "portal";
  return "direct";
}

export default async function WorkspaceTalentsPage() {
  const context = await requirePremiumWorkspacePageContext();
  const supabase = createServerClient({ useServiceRole: true });
  const workspaceId = context.workspace.id;

  const { data: allJobs } = await supabase
    .from("jobs")
    .select("id, title, created_by_user_id")
    .eq("workspace_id", workspaceId);

  const visibleJobs = context.isOwner
    ? (allJobs ?? [])
    : (allJobs ?? []).filter((job) => job.created_by_user_id === context.userId);

  const jobIds = visibleJobs.map((job) => String(job.id));
  const jobTitleMap = new Map(visibleJobs.map((job) => [String(job.id), job.title ?? "Vaga privada"]));

  const [portalMemberResult, workspaceMemberResult] = await Promise.all([
    supabase
      .from("premium_workspace_talents")
      .select("talent_user_id, status, joined_at, created_at")
      .eq("workspace_id", workspaceId)
      .is("removed_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("premium_workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
  ]);

  const portalMemberRows = portalMemberResult.data ?? [];
  // Exclude workspace agents/owners who may have ended up in premium_workspace_talents
  const workspaceMemberIds = new Set(
    (workspaceMemberResult.data ?? []).map((m) => String(m.user_id)),
  );

  const portalMemberIds = [...new Set(
    portalMemberRows
      .map((member) => String(member.talent_user_id))
      .filter((id) => !workspaceMemberIds.has(id)),
  )];

  const [submissionsResult, bookingsResult, contractsResult, authResult] = await Promise.all([
    jobIds.length > 0
      ? supabase
          .from("submissions")
          .select("talent_user_id, job_id, created_at")
          .in("job_id", jobIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    jobIds.length > 0
      ? supabase
          .from("bookings")
          .select("talent_user_id, job_id, status")
          .in("job_id", jobIds)
          .not("status", "eq", "cancelled")
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    jobIds.length > 0
      ? supabase
          .from("contracts")
          .select("id, talent_id, talent_user_id, job_id, status, payment_amount, commission_amount, net_amount, paid_at, created_at")
          .in("job_id", jobIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const submissions = submissionsResult.data ?? [];
  const bookings = bookingsResult.data ?? [];
  const contracts = (contractsResult.data ?? []) as WorkspaceContractRow[];

  const aggMap = new Map<string, TalentAgg>();
  for (const memberId of portalMemberIds) {
    aggMap.set(memberId, {
      jobIds: new Set<string>(),
      latestActivity: "",
      applicationCount: 0,
      contractCount: 0,
      hasPortalMembership: true,
    });
  }

  for (const submission of submissions) {
    if (!submission.talent_user_id) continue;
    const userId = String(submission.talent_user_id);
    const current = aggMap.get(userId) ?? {
      jobIds: new Set<string>(),
      latestActivity: "",
      applicationCount: 0,
      contractCount: 0,
      hasPortalMembership: false,
    };
    current.jobIds.add(String(submission.job_id));
    current.applicationCount += 1;
    current.latestActivity = maxIso(current.latestActivity, String(submission.created_at ?? ""));
    aggMap.set(userId, current);
  }

  for (const booking of bookings) {
    if (!booking.talent_user_id) continue;
    const userId = String(booking.talent_user_id);
    const current = aggMap.get(userId) ?? {
      jobIds: new Set<string>(),
      latestActivity: "",
      applicationCount: 0,
      contractCount: 0,
      hasPortalMembership: false,
    };
    current.jobIds.add(String(booking.job_id));
    aggMap.set(userId, current);
  }

  for (const contract of contracts) {
    const talentUserId = contract.talent_user_id ?? contract.talent_id;
    if (!talentUserId) continue;
    const userId = String(talentUserId);
    const current = aggMap.get(userId) ?? {
      jobIds: new Set<string>(),
      latestActivity: "",
      applicationCount: 0,
      contractCount: 0,
      hasPortalMembership: false,
    };
    current.jobIds.add(String(contract.job_id));
    current.contractCount += 1;
    current.latestActivity = maxIso(current.latestActivity, String(contract.paid_at ?? contract.created_at ?? ""));
    aggMap.set(userId, current);
  }

  const allTalentIds = [...new Set([...portalMemberIds, ...aggMap.keys()])];
  const profileMap = await getTalentProfileMap(supabase, allTalentIds);

  const authUsers = (authResult.data?.users ?? []) as AuthUserRow[];
  const authEmailMap = new Map(authUsers.map((user) => [user.id, user.email ?? ""]));
  const authCreatedMap = new Map(authUsers.map((user) => [user.id, user.created_at ?? ""]));
  const authLastSignInMap = new Map(authUsers.map((user) => [user.id, user.last_sign_in_at ?? ""]));

  const contractIds = contracts.map((contract) => String(contract.id));
  const payoutMap = new Map<string, number>();
  if (contractIds.length > 0) {
    const payoutResult = await supabase
      .from("wallet_transactions")
      .select("reference_id, amount")
      .eq("type", "payout")
      .in("reference_id", contractIds);

    for (const payout of payoutResult.data ?? []) {
      if (!payout.reference_id) continue;
      payoutMap.set(String(payout.reference_id), Number(payout.amount ?? 0));
    }
  }

  const contractHistoryMap = new Map<string, WorkspaceTalentContractHistory[]>();
  for (const contract of contracts) {
    const talentUserId = contract.talent_user_id ?? contract.talent_id;
    if (!talentUserId) continue;
    const userId = String(talentUserId);
    const state = getContractComputedState(
      { status: contract.status, paid_at: contract.paid_at as string | null,
        payment_amount: contract.payment_amount, commission_amount: contract.commission_amount,
        net_amount: contract.net_amount, workspace_id: "ws" },
      { viewerRole: "agency" },
    );
    const paidToTalent =
      payoutMap.get(String(contract.id))
      ?? (contract.net_amount != null ? Number(contract.net_amount) : null)
      ?? Math.max(0, state.grossAmount - state.commissionAmount);

    const item: WorkspaceTalentContractHistory = {
      id: String(contract.id),
      jobTitle: jobTitleMap.get(String(contract.job_id)) ?? "Vaga privada",
      statusLabel: state.displayBadge,
      statusTone: state.displayTone,
      grossLabel: brl(state.grossAmount),
      netLabel: brl(paidToTalent ?? state.netAmount),
      paidAt: (contract.paid_at as string | null) ?? null,
      createdAt: String(contract.created_at ?? ""),
    };

    const current = contractHistoryMap.get(userId) ?? [];
    current.push(item);
    contractHistoryMap.set(userId, current);
  }

  for (const [userId, items] of contractHistoryMap) {
    items.sort((left, right) => maxIso(right.paidAt, right.createdAt).localeCompare(maxIso(left.paidAt, left.createdAt)));
    contractHistoryMap.set(userId, items);
  }

  const portalJoinedMap = new Map<string, string>();
  for (const member of portalMemberRows ?? []) {
    portalJoinedMap.set(String(member.talent_user_id), String(member.joined_at ?? member.created_at ?? ""));
  }

  const bookedSet = new Set(
    bookings
      .map((booking) => booking.talent_user_id ? String(booking.talent_user_id) : null)
      .filter((value): value is string => Boolean(value)),
  );

  const talents: WorkspaceTalentCard[] = allTalentIds
    .map((userId) => {
      const profile = profileMap.get(userId);
      const agg = aggMap.get(userId);
      const joinedAt = portalJoinedMap.get(userId) ?? authCreatedMap.get(userId) ?? "";
      const lastActivity = maxIso(
        agg?.latestActivity,
        contractHistoryMap.get(userId)?.[0]?.paidAt,
        contractHistoryMap.get(userId)?.[0]?.createdAt,
        authLastSignInMap.get(userId),
        joinedAt,
      );

      return {
        userId,
        name: profile?.full_name ?? authEmailMap.get(userId) ?? "Talento",
        email: authEmailMap.get(userId) ?? "",
        phone: profile?.phone ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        joinedAt,
        lastActivity,
        applicationCount: agg?.applicationCount ?? 0,
        contractCount: agg?.contractCount ?? 0,
        jobsCount: agg?.jobIds.size ?? 0,
        jobTitles: agg ? Array.from(agg.jobIds).map((jobId) => jobTitleMap.get(jobId) ?? "Vaga privada") : [],
        isPortalMember: agg?.hasPortalMembership ?? portalMemberIds.includes(userId),
        isCandidate: (agg?.applicationCount ?? 0) > 0,
        isContracted: bookedSet.has(userId) || (agg?.contractCount ?? 0) > 0,
        city: profile?.city ?? null,
        country: profile?.country ?? null,
        bio: profile?.bio ?? null,
        sourceLabel: buildSourceLabel(
          agg?.hasPortalMembership ?? portalMemberIds.includes(userId),
          ((agg?.applicationCount ?? 0) > 0) || ((agg?.contractCount ?? 0) > 0),
        ),
        contractHistory: contractHistoryMap.get(userId) ?? [],
        marketplaceVisible: profile?.marketplace_visible === true,
      } satisfies WorkspaceTalentCard;
    })
    .sort((left, right) => {
      if (left.isContracted !== right.isContracted) return left.isContracted ? -1 : 1;
      if (left.isPortalMember !== right.isPortalMember) return left.isPortalMember ? -1 : 1;
      return left.name.localeCompare(right.name);
    });

  return (
    <WorkspaceTalentsBoard
      talents={talents}
      workspaceSlug={context.workspace.slug}
      brandPrimary={context.workspace.brandPrimaryColor ?? "#0E7C86"}
      brandAccent={context.workspace.brandAccentColor ?? "#1ABC9C"}
    />
  );
}
