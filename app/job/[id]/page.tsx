import type { Metadata } from "next";
import JobSubmitForm from "@/features/jobs/JobSubmitForm";
import { createServerClient } from "@/lib/supabase";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `Candidatar-se para ${data.title} — CastAnet` : "Enviar candidatura — CastAnet" };
}

export default async function JobSubmitPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description, category, budget, deadline")
    .eq("id", id)
    .single();

  return <JobSubmitForm job={job ?? null} />;
}
