type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string, options?: Record<string, unknown>) => any;
  };
};

export type WorkspaceLifecycleInfo = {
  workspaceId: string;
  workspaceSlug: string | null;
};

export function isPremiumWorkspaceLifecycleJob(input: {
  workspace_id?: string | null;
  visibility?: string | null;
  invite_only?: boolean | null;
}) {
  return Boolean(
    input.workspace_id ||
    input.invite_only ||
    input.visibility === "private_invite" ||
    input.visibility === "workspace_only",
  );
}

export async function resolveWorkspaceLifecycleByJobId(
  supabase: SupabaseLike,
  jobId: string | null | undefined,
): Promise<WorkspaceLifecycleInfo | null> {
  if (!jobId) return null;

  const { data: job } = await supabase
    .from("jobs")
    .select("workspace_id")
    .eq("id", jobId)
    .maybeSingle();

  const workspaceId = (job as { workspace_id?: string | null } | null)?.workspace_id ?? null;
  if (!workspaceId) return null;

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("slug")
    .eq("id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  return {
    workspaceId,
    workspaceSlug: (workspace as { slug?: string | null } | null)?.slug ?? null,
  };
}

export function agencyWorkspaceBookingsHref(workspaceSlug: string | null | undefined) {
  return workspaceSlug ? "/agency/workspace/bookings" : "/agency/bookings";
}

export function agencyWorkspaceContractsHref(workspaceSlug: string | null | undefined) {
  return workspaceSlug ? "/agency/workspace/contracts" : "/agency/contracts";
}

export function agencyWorkspaceWalletHref(workspaceSlug: string | null | undefined) {
  return workspaceSlug ? "/agency/workspace/wallet" : "/agency/finances";
}

export function agencyWorkspaceJobsHref(workspaceSlug: string | null | undefined) {
  return workspaceSlug ? "/agency/workspace/jobs" : "/agency/jobs";
}

export function agencyWorkspaceJobDetailHref(
  workspaceSlug: string | null | undefined,
  jobId: string | null | undefined,
) {
  if (!jobId) return agencyWorkspaceJobsHref(workspaceSlug);
  return workspaceSlug ? `/agency/workspace/jobs/${jobId}` : `/agency/jobs/${jobId}`;
}

export function agencyWorkspaceJobEditHref(
  workspaceSlug: string | null | undefined,
  jobId: string | null | undefined,
) {
  if (!jobId) return agencyWorkspaceJobsHref(workspaceSlug);
  return workspaceSlug ? `/agency/workspace/jobs/${jobId}/edit` : `/agency/jobs/${jobId}/edit`;
}

export function talentWorkspaceContractsHref(workspaceSlug: string | null | undefined) {
  return workspaceSlug ? `/talent/workspaces/${workspaceSlug}/contracts` : "/talent/contracts";
}

export function talentWorkspaceApplicationsHref(workspaceSlug: string | null | undefined) {
  return workspaceSlug ? `/talent/workspaces/${workspaceSlug}/applications` : "/talent/jobs";
}

export function talentWorkspacePortalHref(workspaceSlug: string | null | undefined) {
  return workspaceSlug ? `/talent/workspaces/${workspaceSlug}` : "/talent/dashboard";
}

export function talentWorkspaceJobsHref(workspaceSlug: string | null | undefined) {
  return workspaceSlug ? `/talent/workspaces/${workspaceSlug}/jobs` : "/talent/jobs";
}

export function talentWorkspaceJobDetailHref(
  workspaceSlug: string | null | undefined,
  jobId: string | null | undefined,
) {
  if (!jobId) return talentWorkspaceJobsHref(workspaceSlug);
  return workspaceSlug ? `/talent/workspaces/${workspaceSlug}/jobs/${jobId}` : `/talent/jobs/${jobId}`;
}

export function talentWorkspaceFinancesHref(workspaceSlug: string | null | undefined) {
  return workspaceSlug ? `/talent/workspaces/${workspaceSlug}/finances` : "/talent/finances";
}
