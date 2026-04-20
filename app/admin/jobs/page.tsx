import type { Metadata } from "next";
import AdminJobs from "@/features/admin/AdminJobs";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Admin — Jobs — Brisa Digital" };

export default async function AdminJobsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  // ── Round 1: jobs + agencies (parallel) ──────────────────────────────────
  const [jobsRes, agenciesRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, category, budget, deadline, created_at, agency_id, status, description, location, gender, age_min, age_max, job_date")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("agencies").select("id, company_name"),
  ]);

  const agencyMap = new Map<string, string>();
  for (const a of agenciesRes.data ?? []) {
    agencyMap.set(a.id, a.company_name ?? "Agência sem nome");
  }

  const jobIds = (jobsRes.data ?? []).map((j) => j.id);

  // ── Round 2: contracts + submissions for these jobs (parallel) ────────────
  let contractsData: { job_id: string; talent_id: string; status: string }[] = [];
  let subsData: { job_id: string; talent_user_id: string; status: string }[] = [];

  if (jobIds.length) {
    const [contractsRes, subsRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("job_id, talent_id, status")
        .in("job_id", jobIds),
      supabase
        .from("submissions")
        .select("job_id, talent_user_id, status")
        .in("job_id", jobIds),
    ]);
    // Exclude rejected/cancelled contracts from the assigned list
    contractsData = (contractsRes.data ?? []).filter(
      (c) => !["rejected", "cancelled"].includes(c.status)
    );
    subsData = subsRes.data ?? [];
  }

  // ── Round 3: resolve all talent names in one query ────────────────────────
  const allTalentIds = [
    ...new Set([
      ...contractsData.map((c) => c.talent_id),
      ...subsData.map((s) => s.talent_user_id),
    ].filter(Boolean)),
  ];

  let talentNameMap = new Map<string, string>();
  if (allTalentIds.length) {
    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, full_name")
      .in("id", allTalentIds);
    for (const t of profiles ?? []) {
      talentNameMap.set(t.id, t.full_name ?? "Sem nome");
    }
  }

  // ── Per-job lookup maps ───────────────────────────────────────────────────

  // Assigned: talents with active contracts
  const assignedByJob = new Map<string, { id: string; name: string; status: string }[]>();
  for (const c of contractsData) {
    if (!c.job_id || !c.talent_id) continue;
    const list = assignedByJob.get(c.job_id) ?? [];
    list.push({ id: c.talent_id, name: talentNameMap.get(c.talent_id) ?? "Sem nome", status: c.status });
    assignedByJob.set(c.job_id, list);
  }

  // Contracted talent IDs per job — to avoid double-listing in submissions
  const contractedByJob = new Map<string, Set<string>>();
  for (const c of contractsData) {
    if (!c.job_id || !c.talent_id) continue;
    const s = contractedByJob.get(c.job_id) ?? new Set<string>();
    s.add(c.talent_id);
    contractedByJob.set(c.job_id, s);
  }

  // Invited/applied: submissions without a contract for that job
  const submissionCountMap = new Map<string, number>();
  const invitedByJob = new Map<string, { id: string; name: string; status: string }[]>();
  for (const s of subsData) {
    if (!s.job_id) continue;
    submissionCountMap.set(s.job_id, (submissionCountMap.get(s.job_id) ?? 0) + 1);
    if (!s.talent_user_id) continue;
    if (contractedByJob.get(s.job_id)?.has(s.talent_user_id)) continue;
    const list = invitedByJob.get(s.job_id) ?? [];
    list.push({ id: s.talent_user_id, name: talentNameMap.get(s.talent_user_id) ?? "Sem nome", status: s.status });
    invitedByJob.set(s.job_id, list);
  }

  // ── Assemble final jobs array ─────────────────────────────────────────────
  const jobs = (jobsRes.data ?? []).map((j) => ({
    id:              j.id,
    title:           j.title       ?? "Untitled",
    category:        j.category    ?? null,
    budget:          j.budget      ?? null,
    deadline:        j.deadline    ?? null,
    created_at:      j.created_at  ?? "",
    status:          j.status      ?? "open",
    agencyName:      j.agency_id ? (agencyMap.get(j.agency_id) ?? "Agência sem nome") : "—",
    submissionCount: submissionCountMap.get(j.id) ?? 0,
    description:     j.description ?? null,
    location:        j.location    ?? null,
    gender:          j.gender      ?? null,
    ageMin:          j.age_min     ?? null,
    ageMax:          j.age_max     ?? null,
    jobDate:         j.job_date    ?? null,
    assignedTalents: assignedByJob.get(j.id) ?? [],
    invitedTalents:  invitedByJob.get(j.id)  ?? [],
  }));

  return <AdminJobs jobs={jobs} />;
}
