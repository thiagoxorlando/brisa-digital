import type { Metadata } from "next";
import JobList from "@/features/agency/JobList";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Jobs — ucastanet" };

export default async function JobsPage() {
  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  let query = supabase
    .from("jobs")
    .select("id, title, category, budget, deadline, description, status, created_at")
    .order("created_at", { ascending: false });

  if (user) query = query.eq("agency_id", user.id);

  const { data, error } = await query;

  if (error) {
    console.error("[JobsPage] Failed to fetch jobs:", error.message);
  }

  const rows = data ?? [];

  // Fetch submission counts per job
  const jobIds = rows.map((r) => r.id);
  const countMap = new Map<string, number>();
  if (jobIds.length) {
    const { data: subs } = await supabase
      .from("submissions")
      .select("job_id")
      .in("job_id", jobIds);
    for (const s of subs ?? []) {
      countMap.set(s.job_id, (countMap.get(s.job_id) ?? 0) + 1);
    }
  }

  const jobs = rows.map((row) => ({
    id:          String(row.id),
    title:       row.title       ?? "",
    category:    row.category    ?? "",
    budget:      row.budget      ?? 0,
    deadline:    row.deadline    ?? "",
    description: row.description ?? "",
    status:      (row.status     ?? "open") as "open" | "closed" | "draft" | "inactive",
    applicants:  countMap.get(row.id) ?? 0,
    postedAt:    row.created_at  ?? "",
  }));

  return <JobList jobs={jobs} />;
}
