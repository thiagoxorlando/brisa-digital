import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import TalentJobList from "@/features/talent/TalentJobList";
import { guardOpenSpacePage } from "@/lib/talentPortalLanding";

export const metadata: Metadata = { title: "Jobs — BrisaHub" };

export default async function TalentJobsPage() {
  const userId = await guardOpenSpacePage();
  const supabase = createServerClient({ useServiceRole: true });

  const [jobsResult, subsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, category, budget, deadline, job_date, description, status, location, visibility")
      .eq("status", "open")
      .is("workspace_id", null)
      .not("visibility", "in", '("private","private_invite")')
      .order("created_at", { ascending: false }),
    supabase
      .from("submissions")
      .select("job_id, status")
      .eq("talent_user_id", userId),
  ]);

  if (jobsResult.error) console.error("[TalentJobsPage]", jobsResult.error.message);

  // Build a map of job_id → submission status for display and filtering.
  const submissionMap = new Map(
    (subsResult.data ?? []).map((s) => [String(s.job_id), String(s.status ?? "pending")])
  );

  const jobs = (jobsResult.data ?? []).map((row) => {
    const rowId = String(row.id);
    const submissionStatus = submissionMap.get(rowId) ?? null;
    return {
      id:               rowId,
      title:            row.title       ?? "",
      category:         row.category    ?? "",
      budget:           row.budget      ?? 0,
      deadline:         row.deadline    ?? "",
      jobDate:          row.job_date    ?? null,
      description:      row.description ?? "",
      location:         row.location    ?? null,
      applied:          submissionStatus !== null,
      submissionStatus,
    };
  });

  return <TalentJobList jobs={jobs} />;
}
