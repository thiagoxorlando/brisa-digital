import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { isJobOpenForApplications } from "@/lib/jobAvailability";
import { isPremiumInviteOnlyJob, isPremiumPortalVisibleJob } from "@/lib/jobVisibility";
import { PLAN_DEFINITIONS, type Plan } from "@/lib/plans";
import { hasActivePremiumWorkspaceTalentMembership } from "@/lib/workspacePortalJobs";
import { isGenderEligible } from "@/lib/genderNormalization";
import WorkspaceJobListClient, { type WorkspaceJob } from "@/features/talent/WorkspaceJobListClient";

export const metadata: Metadata = { title: "Vagas do portal Premium — BrisaHub" };

type Props = { params: Promise<{ workspaceSlug: string }> };

export default async function WorkspaceJobsPage({ params }: Props) {
  const { workspaceSlug } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) notFound();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("id, name, logo_url, brand_primary_color, brand_accent_color, agency_id")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!workspace) notFound();

  const primary = (workspace.brand_primary_color as string | null) ?? "#1ABC9C";
  const accent = (workspace.brand_accent_color as string | null) ?? "#27C1D6";

  const isWorkspaceMember = await hasActivePremiumWorkspaceTalentMembership(supabase, workspace.id, user.id);

  const [{ data: jobRows }, agencyProfileResult] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, title, category, budget, description, location, deadline, job_date, created_at, visibility, status, deleted_at, number_of_talents_required, gender, age_min, age_max"
      )
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    workspace.agency_id
      ? supabase.from("profiles").select("plan").eq("id", workspace.agency_id).single()
      : Promise.resolve({ data: { plan: PLAN_DEFINITIONS.free.key } }),
  ]);

  const [{ data: talentProfile }, liveSetting] = await Promise.all([
    supabase.from("talent_profiles").select("gender, age").eq("id", user.id).maybeSingle(),
    getLivePlanSetting((agencyProfileResult.data?.plan ?? "free") as Plan),
  ]);
  const allWorkspaceJobs = isWorkspaceMember ? (jobRows ?? []) : [];
  const jobIds = allWorkspaceJobs.map((job) => job.id);

  const [allContractsResult, talentContractsResult, directInvitesResult] = await Promise.all([
    jobIds.length
      ? supabase
          .from("contracts")
          .select("job_id")
          .in("job_id", jobIds)
          .not("status", "in", '("cancelled","rejected")')
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase
          .from("contracts")
          .select("job_id")
          .in("job_id", jobIds)
          .or(`talent_user_id.eq.${user.id},talent_id.eq.${user.id}`)
          .not("status", "in", '("cancelled","rejected")')
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? supabase
          .from("job_invites")
          .select("job_id")
          .in("job_id", jobIds)
          .eq("talent_id", user.id)
      : Promise.resolve({ data: [] }),
  ]);

  const activeHireCountByJob = new Map<string, number>();
  for (const row of allContractsResult.data ?? []) {
    const key = String(row.job_id);
    activeHireCountByJob.set(key, (activeHireCountByJob.get(key) ?? 0) + 1);
  }
  const talentActiveContractJobIds = new Set(
    (talentContractsResult.data ?? []).map((row) => String(row.job_id)),
  );
  const invitedJobIds = new Set(
    (directInvitesResult.data ?? []).map((row) => String(row.job_id)),
  );

  const { data: allWorkspaceSubmissions } = jobIds.length
    ? await supabase
        .from("submissions")
        .select("id, job_id, status")
        .eq("talent_user_id", user.id)
        .in("job_id", jobIds)
        .neq("status", "rejected")
    : { data: [] };

  const submissionByJobId = new Map(
    (allWorkspaceSubmissions ?? []).map((submission) => [String(submission.job_id), submission]),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const hiddenJobs: Array<{ jobId: string; title: string; reason: string }> = [];

  const rawJobs = allWorkspaceJobs.filter((job) => {
    const appliedSubmission = submissionByJobId.get(String(job.id));
    const portalVisible = isPremiumPortalVisibleJob({ visibility: job.visibility, workspaceId: workspace.id });
    const inviteOnly = isPremiumInviteOnlyJob({ visibility: job.visibility, workspaceId: workspace.id });

    if (inviteOnly && !invitedJobIds.has(String(job.id)) && !appliedSubmission) {
      hiddenJobs.push({
        jobId: String(job.id),
        title: job.title ?? "Vaga",
        reason: "invite_required",
      });
      return false;
    }

    if (!portalVisible && !inviteOnly && !appliedSubmission) {
      hiddenJobs.push({
        jobId: String(job.id),
        title: job.title ?? "Vaga",
        reason: "not_visible_in_portal",
      });
      return false;
    }

    if (
      job.deadline &&
      !Number.isNaN(new Date(`${job.deadline}T00:00:00`).getTime()) &&
      new Date(`${job.deadline}T00:00:00`) < today
    ) {
      hiddenJobs.push({
        jobId: String(job.id),
        title: job.title ?? "Vaga",
        reason: "deadline_passed",
      });
      return false;
    }

    if (!isGenderEligible(job.gender ?? null, talentProfile?.gender ?? null)) {
      hiddenJobs.push({
        jobId: String(job.id),
        title: job.title ?? "Vaga",
        reason: "gender_mismatch",
      });
      return false;
    }

    const talentAge = Number(talentProfile?.age ?? NaN);
    const hasTalentAge = Number.isFinite(talentAge);
    if (hasTalentAge && job.age_min != null && talentAge < Number(job.age_min)) {
      hiddenJobs.push({
        jobId: String(job.id),
        title: job.title ?? "Vaga",
        reason: "below_min_age",
      });
      return false;
    }
    if (hasTalentAge && job.age_max != null && talentAge > Number(job.age_max)) {
      hiddenJobs.push({
        jobId: String(job.id),
        title: job.title ?? "Vaga",
        reason: "above_max_age",
      });
      return false;
    }

    const openForApplications = isJobOpenForApplications({
      status: job.status ?? null,
      deletedAt: (job as { deleted_at?: string | null }).deleted_at ?? null,
      currentHires: activeHireCountByJob.get(String(job.id)) ?? 0,
      talentsNeeded: (job as { number_of_talents_required?: number | null }).number_of_talents_required ?? 1,
      maxHiresPerJob: liveSetting.max_hires_per_job,
    });

    if (!openForApplications && !appliedSubmission) {
      hiddenJobs.push({
        jobId: String(job.id),
        title: job.title ?? "Vaga",
        reason: job.status !== "open" ? `status_${String(job.status ?? "unknown")}` : "no_available_spots",
      });
      return false;
    }

    if ((job.status ?? null) !== "open" && !appliedSubmission) {
      hiddenJobs.push({
        jobId: String(job.id),
        title: job.title ?? "Vaga",
        reason: `status_${String(job.status ?? "unknown")}`,
      });
      return false;
    }

    return (job.status ?? null) === "open" || Boolean(appliedSubmission);
  });

  console.log("[workspace portal jobs]", {
    workspaceId: workspace.id,
    talentUserId: user.id,
    totalJobsInWorkspace: allWorkspaceJobs.length,
    openJobsInWorkspace: allWorkspaceJobs.filter((job) => job.status === "open").length,
    visibleJobs: rawJobs.map((job) => ({ id: job.id, title: job.title ?? "Vaga" })),
    hiddenJobs,
  });

  const jobs: WorkspaceJob[] = rawJobs.map((job) => {
    const submission = submissionByJobId.get(String(job.id));
    const submissionStatus = String(submission?.status ?? "");
    const hasActiveContract = talentActiveContractJobIds.has(String(job.id));
    const canCancelApplication =
      Boolean(submission?.id) &&
      (submissionStatus === "pending" || submissionStatus === "in_review") &&
      !hasActiveContract;

    let cancelReason: string | null = null;
    if (submission?.id && !canCancelApplication) {
      if (!(submissionStatus === "pending" || submissionStatus === "in_review")) {
        cancelReason = "Esta candidatura já avançou e não pode mais ser cancelada.";
      } else if (hasActiveContract) {
        cancelReason = "Esta candidatura já possui contrato enviado.";
      }
    }

    return {
      id: String(job.id),
      title: job.title ?? "",
      description: job.description ?? "",
      category: job.category ?? "",
      budget: job.budget ?? null,
      deadline: job.deadline ?? null,
      jobDate: job.job_date ?? null,
      location: job.location ?? null,
      createdAt: job.created_at ?? "",
      applied: Boolean(submission?.id),
      submissionId: submission?.id ? String(submission.id) : null,
      submissionStatus: submissionStatus || null,
      canCancelApplication,
      cancelReason,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        {workspace.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={workspace.logo_url as string}
            alt={workspace.name as string}
            className="h-10 w-10 flex-shrink-0 rounded-xl border border-zinc-200 object-cover shadow-sm"
          />
        ) : (
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
          >
            {(workspace.name as string).slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-400">
            {workspace.name as string}
          </p>
          <h1 className="text-[1.3rem] font-bold leading-tight text-zinc-950">Vagas do portal Premium</h1>
        </div>
      </div>

      {rawJobs.length === 0 ? (
        <div className="rounded-[22px] border border-zinc-200 bg-white px-6 py-14 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: `linear-gradient(135deg, ${primary}20, ${accent}10)` }}
          >
            <svg className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-zinc-600">Nenhuma vaga disponível no momento.</p>
          <p className="mt-1 text-[13px] text-zinc-400">
            Novas oportunidades aparecerão aqui quando a agência as publicar.
          </p>
        </div>
      ) : (
        <WorkspaceJobListClient jobs={jobs} workspaceSlug={workspaceSlug} />
      )}
    </div>
  );
}


