import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import TalentJobList from "@/features/talent/TalentJobList";

export const metadata: Metadata = { title: "Jobs — Brisa Digital" };

export default async function TalentJobsPage() {
  const supabase = createServerClient({ useServiceRole: true });
  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const [jobsResult, subsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, category, budget, deadline, job_date, description, status, location")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    user
      ? supabase
          .from("submissions")
          .select("job_id")
          .eq("talent_user_id", user.id)
          .neq("status", "rejected")
      : Promise.resolve({ data: [] }),
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
