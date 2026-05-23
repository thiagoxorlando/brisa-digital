import {
  isPremiumInviteOnlyJob,
  isPremiumPortalVisibleJob,
} from "@/lib/jobVisibility";

const PORTAL_JOB_VISIBILITY = new Set(["private_invite", "private_portal", "workspace_only", "public"]);

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string, options?: Record<string, unknown>) => any;
  };
};

export function isWorkspacePortalJobVisibility(
  visibility: string | null | undefined,
  workspaceId?: string | null,
) {
  if (!visibility) return false;
  if (!workspaceId) return PORTAL_JOB_VISIBILITY.has(visibility) && visibility !== "public";
  return isPremiumPortalVisibleJob({ visibility, workspaceId }) || isPremiumInviteOnlyJob({ visibility, workspaceId });
}

async function hasDirectJobInvite(
  supabase: SupabaseLike,
  jobId: string,
  talentUserId: string,
) {
  const { data: invite } = await supabase
    .from("job_invites")
    .select("id")
    .eq("job_id", jobId)
    .eq("talent_id", talentUserId)
    .maybeSingle();

  return Boolean(invite);
}

export async function hasActivePremiumWorkspaceTalentMembership(
  supabase: SupabaseLike,
  workspaceId: string | null | undefined,
  talentUserId: string,
) {
  if (!workspaceId) return false;

  const { data: membership } = await supabase
    .from("premium_workspace_talents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("talent_user_id", talentUserId)
    .eq("status", "active")
    .is("removed_at", null)
    .maybeSingle();

  return Boolean(membership);
}

export async function hasExistingTalentSubmission(
  supabase: SupabaseLike,
  jobId: string,
  talentUserId: string,
) {
  const { data: submission } = await supabase
    .from("submissions")
    .select("id")
    .eq("job_id", jobId)
    .eq("talent_user_id", talentUserId)
    .maybeSingle();

  return Boolean(submission);
}

export async function hasValidJobInviteLink(
  supabase: SupabaseLike,
  jobId: string,
  inviteToken: string | null,
) {
  if (!inviteToken) return false;

  const { data: link } = await supabase
    .from("job_invite_links")
    .select("id, status, expires_at, revoked_at")
    .eq("token", inviteToken)
    .eq("job_id", jobId)
    .maybeSingle();

  return !!(
    link &&
    link.status === "active" &&
    !link.revoked_at &&
    (!link.expires_at || new Date(link.expires_at) > new Date())
  );
}

export async function hasPortalJobAccess({
  supabase,
  jobId,
  talentUserId,
  visibility,
  workspaceId,
  inviteToken = null,
}: {
  supabase: SupabaseLike;
  jobId: string;
  talentUserId: string;
  visibility: string | null | undefined;
  workspaceId: string | null | undefined;
  inviteToken?: string | null;
}) {
  if (await hasExistingTalentSubmission(supabase, jobId, talentUserId)) {
    return true;
  }

  const isWorkspaceMember =
    workspaceId &&
    await hasActivePremiumWorkspaceTalentMembership(supabase, workspaceId, talentUserId);

  if (isPremiumPortalVisibleJob({ visibility, workspaceId })) {
    return Boolean(isWorkspaceMember);
  }

  if (isPremiumInviteOnlyJob({ visibility, workspaceId })) {
    const [directInvite, validLink] = await Promise.all([
      hasDirectJobInvite(supabase, jobId, talentUserId),
      hasValidJobInviteLink(supabase, jobId, inviteToken ?? null),
    ]);
    return directInvite || validLink;
  }

  return false;
}
