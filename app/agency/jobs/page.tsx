import type { Metadata } from "next";
import JobList from "@/features/agency/JobList";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

export const metadata: Metadata = { title: "Jobs — Brisa Digital" };

export default async function JobsPage() {
  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  const supabase = createServerClient({ useServiceRole: true });

  let query = supabase
    .from("jobs")
    .select("id, title, category, budget, deadline, job_date, description, status, created_at, number_of_talents_required, visibility")
    .order("created_at", { ascending: false });

  if (user) query = query.eq("agency_id", user.id);

  const { data, error } = await query;
  if (error) console.error("[JobsPage] Failed to fetch jobs:", error.message);

  const rows = data ?? [];
  const jobIds = rows.map((r) => r.id);

  // Submission count per job
  const submissionsCountMap = new Map<string, number>();
  // Selected talent count per job (bookings that are not cancelled)
  const selectedCountMap = new Map<string, number>();

  if (jobIds.length) {
    const [subsRes, bookingsRes] = await Promise.all([
      supabase.from("submissions").select("job_id").in("job_id", jobIds),
      supabase
        .from("bookings")
        .select("job_id")
        .in("job_id", jobIds)
        .not("status", "eq", "cancelled"),
    ]);

    for (const s of subsRes.data ?? []) {
      submissionsCountMap.set(s.job_id, (submissionsCountMap.get(s.job_id) ?? 0) + 1);
    }
    for (const b of bookingsRes.data ?? []) {
      if (b.job_id) selectedCountMap.set(b.job_id, (selectedCountMap.get(b.job_id) ?? 0) + 1);
    }
  }

  const jobs = rows.map((row) => ({
    id:              String(row.id),
    title:           row.title       ?? "",
    category:        row.category    ?? "",
    budget:          row.budget      ?? 0,
    deadline:        row.deadline    ?? "",
    jobDate:         row.job_date    ?? null,
    description:     row.description ?? "",
    status:          (row.status     ?? "open") as "open" | "closed" | "draft" | "inactive",
    visibility:      (row.visibility ?? "public") as "public" | "private",
    applicants:      submissionsCountMap.get(row.id) ?? 0,
    talentsNeeded:   row.number_of_talents_required ?? 1,
    talentsSelected: selectedCountMap.get(row.id) ?? 0,
    postedAt:        row.created_at  ?? "",
  }));

  return <JobList jobs={jobs} />;
}
