import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import TalentJobList from "@/features/talent/TalentJobList";
import { guardOpenSpacePage } from "@/lib/talentPortalLanding";

export const metadata: Metadata = { title: "Vagas — BrisaHub" };

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
      .select("job_id")
      .eq("talent_user_id", userId)
      .neq("status", "rejected"),
  ]);

  if (jobsResult.error) console.error("[TalentJobsPage]", jobsResult.error.message);

  const appliedJobIds = new Set((subsResult.data ?? []).map((s) => s.job_id as string));

  const jobs = (jobsResult.data ?? []).map((row) => ({
    id:          String(row.id),
    title:       row.title       ?? "",
    category:    row.category    ?? "",
    budget:      row.budget      ?? 0,
    deadline:    row.deadline    ?? "",
    jobDate:     row.job_date    ?? null,
    description: row.description ?? "",
    location:    row.location    ?? null,
    applied:     appliedJobIds.has(String(row.id)),
  }));

  return <TalentJobList jobs={jobs} />;
}
