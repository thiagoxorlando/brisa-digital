import type { Metadata } from "next";
import EditJobForm from "@/features/agency/EditJobForm";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { redirect } from "next/navigation";
import { getUserPremiumWorkspace } from "@/lib/premiumWorkspace.server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `Editar: ${data.title} — BrisaHub` : "Editar vaga — BrisaHub" };
}

export default async function EditJobPage({ params }: Props) {
  const { id } = await params;

  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description, category, budget, deadline, job_date, job_time, status, location, gender, age_min, age_max, number_of_talents_required, application_requirements, agency_id, workspace_id, visibility")
    .eq("id", id)
    .single();

  if (!job) redirect("/agency/jobs");

  const workspaceId = (job as { workspace_id?: string | null }).workspace_id ?? null;
  if (workspaceId) {
    const workspaceAccess = await getUserPremiumWorkspace(user.id);
    const canAccessWorkspaceJob =
      workspaceAccess?.workspace.id === workspaceId &&
      workspaceAccess.membership.status === "active";

    if (canAccessWorkspaceJob) {
      redirect(`/agency/workspace/jobs/${id}/edit`);
    }
  }

  // Only the owning agency can edit
  if (job.agency_id !== user.id) redirect(`/agency/jobs/${id}`);

  // Closed jobs cannot be edited at all
  if (job.status === "closed") redirect(`/agency/jobs/${id}`);

  return (
    <EditJobForm
      job={{
        id:                          job.id,
        title:                       job.title       ?? "",
        description:                 job.description ?? "",
        category:                    job.category    ?? "",
        budget:                      job.budget      ?? 0,
        deadline:                    job.deadline    ?? "",
        job_date:                    (job as { job_date?: string | null }).job_date ?? "",
        job_time:                    (job as { job_time?: string | null }).job_time ?? "",
        status:                      (job.status     ?? "open") as "open" | "closed" | "draft" | "inactive" | "paused",
        location:                    job.location    ?? "",
        gender:                      job.gender      ?? "any",
        age_min:                     job.age_min     ?? null,
        age_max:                     job.age_max     ?? null,
        number_of_talents_required:  job.number_of_talents_required ?? 1,
        application_requirements:    (job as { application_requirements?: string[] }).application_requirements ?? [],
        visibility:                  (job.visibility ?? "public") as "public" | "private" | "private_invite",
        workspace_id:                workspaceId,
        detail_href:                 `/agency/jobs/${job.id}`,
      }}
    />
  );
}
