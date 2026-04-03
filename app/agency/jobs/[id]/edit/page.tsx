import type { Metadata } from "next";
import EditJobForm from "@/features/agency/EditJobForm";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `Edit: ${data.title} — ucastanet` : "Edit Job — ucastanet" };
}

export default async function EditJobPage({ params }: Props) {
  const { id } = await params;

  const session  = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description, category, budget, deadline, status, location, gender, age_min, age_max, number_of_talents_required, agency_id")
    .eq("id", id)
    .single();

  if (!job) redirect("/agency/jobs");

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
        status:                      (job.status     ?? "open") as "open" | "closed" | "draft" | "inactive",
        location:                    job.location    ?? "",
        gender:                      job.gender      ?? "any",
        age_min:                     job.age_min     ?? null,
        age_max:                     job.age_max     ?? null,
        number_of_talents_required:  job.number_of_talents_required ?? 1,
      }}
    />
  );
}
