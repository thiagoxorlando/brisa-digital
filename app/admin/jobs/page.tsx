import type { Metadata } from "next";
import AdminJobs from "@/features/admin/AdminJobs";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Admin — Jobs — Brisa Digital" };

export default async function AdminJobsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: jobsData }, { data: agenciesData }, { data: submissionsData }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, category, budget, deadline, created_at, agency_id, status, description, location, gender, age_min, age_max, job_date")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("agencies").select("id, company_name"),
    supabase.from("submissions").select("job_id"),
  ]);

  const agencyMap = new Map<string, string>();
  for (const a of agenciesData ?? []) {
    agencyMap.set(a.id, a.company_name ?? "Unknown Agency");
  }

  const submissionCountMap = new Map<string, number>();
  for (const s of submissionsData ?? []) {
    if (s.job_id) submissionCountMap.set(s.job_id, (submissionCountMap.get(s.job_id) ?? 0) + 1);
  }

  const jobs = (jobsData ?? []).map((j) => ({
    id:              j.id,
    title:           j.title       ?? "Untitled",
    category:        j.category    ?? null,
    budget:          j.budget      ?? null,
    deadline:        j.deadline    ?? null,
    created_at:      j.created_at  ?? "",
    status:          j.status      ?? "open",
    agencyName:      j.agency_id ? (agencyMap.get(j.agency_id) ?? "Unknown Agency") : "—",
    submissionCount: submissionCountMap.get(j.id) ?? 0,
    description:     j.description ?? null,
    location:        j.location    ?? null,
    gender:          j.gender      ?? null,
    ageMin:          j.age_min     ?? null,
    ageMax:          j.age_max     ?? null,
    jobDate:         j.job_date    ?? null,
  }));

  return <AdminJobs jobs={jobs} />;
}
