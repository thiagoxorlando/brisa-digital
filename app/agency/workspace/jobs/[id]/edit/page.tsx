import type { Metadata } from "next";
import { redirect } from "next/navigation";
import EditJobForm from "@/features/agency/EditJobForm";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `Editar: ${data.title} — BrisaHub Premium` : "Editar vaga do Espaco Premium — BrisaHub" };
}

export default async function WorkspaceEditJobPage({ params }: Props) {
  const { id } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });
  const workspaceAccess = await getUserPremiumWorkspace(user.id);
  if (!workspaceAccess || workspaceAccess.membership.status !== "active") {
    redirect("/agency/workspace/jobs");
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description, category, budget, deadline, job_date, job_time, status, location, gender, age_min, age_max, number_of_talents_required, application_requirements, agency_id, workspace_id, created_by_user_id")
    .eq("id", id)
    .single();

  if (!job) redirect("/agency/workspace/jobs");

  const workspaceId = (job as { workspace_id?: string | null }).workspace_id ?? null;
  const isWorkspaceOwner =
    workspaceAccess.workspace.id === workspaceId &&
    workspaceAccess.membership.role === "owner";
  const isWorkspaceCreator =
    workspaceAccess.workspace.id === workspaceId &&
    (job as { created_by_user_id?: string | null }).created_by_user_id === user.id;

  if (!workspaceId || (!isWorkspaceOwner && !isWorkspaceCreator)) {
    redirect(`/agency/workspace/jobs/${id}`);
  }

  if (job.status === "closed") redirect(`/agency/workspace/jobs/${id}`);

  return (
    <EditJobForm
      job={{
        id: job.id,
        title: job.title ?? "",
        description: job.description ?? "",
        category: job.category ?? "",
        budget: job.budget ?? 0,
        deadline: job.deadline ?? "",
        job_date: (job as { job_date?: string | null }).job_date ?? "",
        job_time: (job as { job_time?: string | null }).job_time ?? "",
        status: (job.status ?? "open") as "open" | "closed" | "draft" | "inactive" | "paused",
        location: job.location ?? "",
        gender: job.gender ?? "any",
        age_min: job.age_min ?? null,
        age_max: job.age_max ?? null,
        number_of_talents_required: job.number_of_talents_required ?? 1,
        application_requirements: (job as { application_requirements?: string[] }).application_requirements ?? [],
      }}
    />
  );
}

