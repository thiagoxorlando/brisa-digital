import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { getWorkspaceMembers } from "@/lib/premiumWorkspace.server";
import { requirePremiumWorkspacePageContext } from "@/lib/premiumWorkspaceApp.server";
import WorkspaceJobsBoard, { type WorkspaceJob } from "@/features/agency/WorkspaceJobsBoard";

export const metadata: Metadata = { title: "Premium Jobs — BrisaHub" };

export default async function WorkspaceJobsPage() {
  const context = await requirePremiumWorkspacePageContext();
  const supabase = createServerClient({ useServiceRole: true });

  const [members, jobsResult] = await Promise.all([
    getWorkspaceMembers(context.workspace.id),
    supabase
      .from("jobs")
      .select(
        "id, title, visibility, status, budget, deadline, created_at, created_by_user_id, job_date, job_time, location, category, number_of_talents_required"
      )
      .eq("workspace_id", context.workspace.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const jobs = jobsResult.data ?? [];
  const jobIds = jobs.map((j) => j.id);

  const memberNameMap = new Map(members.map((m) => [m.userId, m.displayName || m.email]));
  const memberRoleMap = new Map(members.map((m) => [m.userId, m.role as "owner" | "agent"]));

  // Submissions and contracts in parallel
  const [subsResult, contractsResult] = await Promise.all([
    jobIds.length > 0
      ? supabase.from("submissions").select("job_id, status").in("job_id", jobIds)
      : Promise.resolve({ data: [] as { job_id: string; status: string }[] }),
    jobIds.length > 0
      ? supabase
          .from("contracts")
          .select("job_id, status")
          .in("job_id", jobIds)
          .is("deleted_at", null)
          .not("status", "in", '("cancelled","rejected")')
      : Promise.resolve({ data: [] as { job_id: string; status: string }[] }),
  ]);

  // Submission counts
  const subTotalMap  = new Map<string, number>();
  const subPendMap   = new Map<string, number>();
  for (const row of subsResult.data ?? []) {
    subTotalMap.set(row.job_id, (subTotalMap.get(row.job_id) ?? 0) + 1);
    if (row.status === "pending") {
      subPendMap.set(row.job_id, (subPendMap.get(row.job_id) ?? 0) + 1);
    }
  }

  // Contract counts by status
  const contractMap = new Map<string, WorkspaceJob["contractCounts"]>();
  for (const row of contractsResult.data ?? []) {
    const cur = contractMap.get(row.job_id) ?? { sent: 0, signed: 0, confirmed: 0, paid: 0 };
    if      (row.status === "sent")      cur.sent++;
    else if (row.status === "signed")    cur.signed++;
    else if (row.status === "confirmed") cur.confirmed++;
    else if (row.status === "paid")      cur.paid++;
    contractMap.set(row.job_id, cur);
  }

  const workspaceJobs: WorkspaceJob[] = jobs.map((job) => ({
    id:              String(job.id),
    title:           job.title           ?? "",
    status:          job.status          ?? "open",
    visibility:      job.visibility      ?? "public",
    budget:          job.budget          ?? null,
    deadline:        job.deadline        ?? null,
    jobDate:         job.job_date        ?? null,
    jobTime:         (job as { job_time?: string | null }).job_time   ?? null,
    location:        (job as { location?: string | null }).location   ?? null,
    category:        (job as { category?: string | null }).category   ?? null,
    talentsRequired: (job as { number_of_talents_required?: number }).number_of_talents_required ?? 1,
    createdAt:       job.created_at      ?? "",
    createdByUserId: job.created_by_user_id ?? null,
    createdByName:   memberNameMap.get(job.created_by_user_id ?? "") ?? "Equipe",
    createdByRole:   memberRoleMap.get(job.created_by_user_id ?? "") ?? "agent",
    submissionCount: subTotalMap.get(job.id)  ?? 0,
    pendingCount:    subPendMap.get(job.id)   ?? 0,
    contractCounts:  contractMap.get(job.id)  ?? { sent: 0, signed: 0, confirmed: 0, paid: 0 },
  }));

  return (
    <WorkspaceJobsBoard
      jobs={workspaceJobs}
      userId={context.userId}
      isOwner={context.isOwner}
      brandPrimary={context.workspace.brandPrimaryColor ?? "#1ABC9C"}
      brandAccent={context.workspace.brandAccentColor ?? "#27C1D6"}
    />
  );
}


