import type { Metadata } from "next";
import AdminJobs from "@/features/admin/AdminJobs";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Administracao - Vagas - BrisaHub" };

export default async function AdminJobsPage() {
  const supabase = createServerClient({ useServiceRole: true });

  const [jobsRes, agenciesRes, authUsersRes, profilesRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, category, budget, deadline, created_at, agency_id, status, description, location, gender, age_min, age_max, job_date, workspace_id, visibility")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("agencies").select("id, user_id, company_name").is("deleted_at", null),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("profiles").select("id").is("deleted_at", null),
  ]);

  const validUserIds = new Set((authUsersRes.data?.users ?? []).map((user) => user.id));
  const validProfileIds = new Set((profilesRes.data ?? []).map((profile) => profile.id));
  const agencyMap = new Map<string, { name: string; isOrphan: boolean }>();

  for (const agency of agenciesRes.data ?? []) {
    const ownerId = agency.user_id ?? agency.id;
    agencyMap.set(agency.id, {
      name: agency.company_name ?? "Agência sem nome",
      isOrphan: !ownerId || !validUserIds.has(ownerId) || !validProfileIds.has(ownerId),
    });
  }

  const jobIds = (jobsRes.data ?? []).map((job) => job.id);
  const premiumWorkspaceIds = [
    ...new Set(
      (jobsRes.data ?? [])
        .map((job) => (job as { workspace_id?: string | null }).workspace_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const workspaceNameMap = new Map<string, string>();
  if (premiumWorkspaceIds.length) {
    const { data: workspaces } = await supabase.from("premium_workspaces").select("id, name").in("id", premiumWorkspaceIds).is("deleted_at", null);
    for (const workspace of workspaces ?? []) workspaceNameMap.set(workspace.id, workspace.name ?? "Premium");
  }

  let contractsData: { job_id: string; talent_id: string; status: string }[] = [];
  let subsData: { job_id: string; talent_user_id: string; status: string }[] = [];

  if (jobIds.length) {
    const [contractsRes, subsRes] = await Promise.all([
      supabase.from("contracts").select("job_id, talent_id, status").in("job_id", jobIds),
      supabase.from("submissions").select("job_id, talent_user_id, status").in("job_id", jobIds),
    ]);
    contractsData = (contractsRes.data ?? []).filter((contract) => !["rejected", "cancelled"].includes(contract.status));
    subsData = subsRes.data ?? [];
  }

  const allTalentIds = [
    ...new Set(
      [...contractsData.map((contract) => contract.talent_id), ...subsData.map((submission) => submission.talent_user_id)].filter(Boolean),
    ),
  ];

  const talentNameMap = new Map<string, string>();
  if (allTalentIds.length) {
    const { data: profiles } = await supabase.from("talent_profiles").select("id, full_name").in("id", allTalentIds);
    for (const profile of profiles ?? []) talentNameMap.set(profile.id, profile.full_name ?? "Talento órfão / usuário deletado");
  }

  const assignedByJob = new Map<string, { id: string; name: string; status: string }[]>();
  for (const contract of contractsData) {
    if (!contract.job_id || !contract.talent_id) continue;
    const list = assignedByJob.get(contract.job_id) ?? [];
    list.push({
      id: contract.talent_id,
      name: talentNameMap.get(contract.talent_id) ?? "Talento órfão / usuário deletado",
      status: contract.status,
    });
    assignedByJob.set(contract.job_id, list);
  }

  const contractedByJob = new Map<string, Set<string>>();
  for (const contract of contractsData) {
    if (!contract.job_id || !contract.talent_id) continue;
    const current = contractedByJob.get(contract.job_id) ?? new Set<string>();
    current.add(contract.talent_id);
    contractedByJob.set(contract.job_id, current);
  }

  const submissionCountMap = new Map<string, number>();
  const invitedByJob = new Map<string, { id: string; name: string; status: string }[]>();
  for (const submission of subsData) {
    if (!submission.job_id) continue;
    submissionCountMap.set(submission.job_id, (submissionCountMap.get(submission.job_id) ?? 0) + 1);
    if (!submission.talent_user_id || contractedByJob.get(submission.job_id)?.has(submission.talent_user_id)) continue;
    const list = invitedByJob.get(submission.job_id) ?? [];
    list.push({
      id: submission.talent_user_id,
      name: talentNameMap.get(submission.talent_user_id) ?? "Talento órfão / usuário deletado",
      status: submission.status,
    });
    invitedByJob.set(submission.job_id, list);
  }

  const jobs = (jobsRes.data ?? []).map((job) => {
    const workspaceId = (job as { workspace_id?: string | null }).workspace_id ?? null;
    const visibility = (job as { visibility?: string | null }).visibility ?? null;
    const agency = job.agency_id ? agencyMap.get(job.agency_id) : null;

    return {
      id: job.id,
      title: job.title ?? "Untitled",
      category: job.category ?? null,
      budget: job.budget ?? null,
      deadline: job.deadline ?? null,
      created_at: job.created_at ?? "",
      status: job.status ?? "open",
      agencyName: job.agency_id
        ? agency?.isOrphan
          ? "Agência órfã / usuário deletado"
          : agency?.name ?? "Agência órfã / usuário deletado"
        : "—",
      submissionCount: submissionCountMap.get(job.id) ?? 0,
      description: job.description ?? null,
      location: job.location ?? null,
      gender: job.gender ?? null,
      ageMin: job.age_min ?? null,
      ageMax: job.age_max ?? null,
      jobDate: job.job_date ?? null,
      assignedTalents: assignedByJob.get(job.id) ?? [],
      invitedTalents: invitedByJob.get(job.id) ?? [],
      workspaceId,
      workspaceName: workspaceId ? (workspaceNameMap.get(workspaceId) ?? "Workspace órfão") : null,
      visibility,
    };
  });

  return <AdminJobs jobs={jobs} />;
}
