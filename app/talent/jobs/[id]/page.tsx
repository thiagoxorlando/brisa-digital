import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import TalentJobDetail from "@/features/talent/TalentJobDetail";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `${data.title} — Brisa Digital` : "Job — Brisa Digital" };
}

export default async function TalentJobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const { data } = await supabase
    .from("jobs")
    .select("id, title, description, category, budget, deadline, agency_id, location, gender, age_min, age_max")
    .eq("id", id)
    .single();

  // Fetch agency name
  let agencyName = "";
  if (data?.agency_id) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("company_name")
      .eq("id", data.agency_id)
      .single();
    agencyName = agency?.company_name ?? "";
  }

  const job = data
    ? {
        id:          String(data.id),
        title:       data.title       ?? "",
        description: data.description ?? "",
        category:    data.category    ?? "",
        budget:      data.budget      ?? 0,
        deadline:    data.deadline    ?? "",
        agencyName,
        location:    data.location    ?? "",
        gender:      data.gender      ?? "",
        ageMin:      data.age_min     ?? null,
        ageMax:      data.age_max     ?? null,
      }
    : null;

  return <TalentJobDetail job={job} />;
}
