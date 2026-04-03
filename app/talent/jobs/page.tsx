import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import TalentJobList from "@/features/talent/TalentJobList";

export const metadata: Metadata = { title: "Jobs — ucastanet" };

export default async function TalentJobsPage() {
  const supabase = createServerClient({ useServiceRole: true });
  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const [jobsResult, subsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, category, budget, deadline, description, status")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    user
      ? supabase
          .from("submissions")
          .select("job_id")
          .eq("talent_user_id", user.id)
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
    description: row.description ?? "",
    applied:     appliedJobIds.has(String(row.id)),
  }));

  return <TalentJobList jobs={jobs} />;
}
