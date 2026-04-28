import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import TalentJobDetail from "@/features/talent/TalentJobDetail";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).single();
  return { title: data ? `${data.title} — BrisaHub` : "Vaga — BrisaHub" };
}

export default async function TalentJobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) redirect("/login");

  const [jobRes, profileRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, description, category, budget, deadline, agency_id, location, gender, age_min, age_max, visibility, status, application_requirements")
      .eq("id", id)
      .single()
      .then(async (res) => {
        if (res.error?.message?.includes("application_requirements")) {
          return supabase
            .from("jobs")
            .select("id, title, description, category, budget, deadline, agency_id, location, gender, age_min, age_max, visibility, status")
            .eq("id", id)
            .single();
        }
        return res;
      }),
    supabase.from("talent_profiles").select("gender, age").eq("id", user.id).single(),
  ]);
  const data = jobRes.data;
  const talentProfile = profileRes.data;

  if (!data || data.status === "inactive") return notFound();

  if (data.visibility === "private") {
    const [{ data: invite }, { data: history }, { data: referralInvite }] = await Promise.all([
      supabase
        .from("job_invites")
        .select("id")
        .eq("job_id", id)
        .eq("talent_id", user.id)
        .maybeSingle(),
      data.agency_id
        ? supabase
            .from("agency_talent_history")
            .select("talent_id")
            .eq("agency_id", data.agency_id)
            .eq("talent_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("referral_invites")
        .select("id")
        .eq("job_id", id)
        .eq("referred_user_id", user.id)
        .neq("status", "fraud_reported")
        .maybeSingle(),
    ]);

    if (!invite && !history && !referralInvite) {
      return notFound();
    }
  }

  let agencyName = "";
  let agencyPlan = "free";
  if (data.agency_id) {
    const [{ data: agency }, { data: agencyProfile }] = await Promise.all([
      supabase.from("agencies").select("company_name").eq("id", data.agency_id).single(),
      supabase.from("profiles").select("plan").eq("id", data.agency_id).single(),
    ]);
    agencyName = agency?.company_name ?? "";
    agencyPlan = agencyProfile?.plan ?? "free";
  }

  const job = {
    id:          String(data.id),
    title:       data.title       ?? "",
    description: data.description ?? "",
    category:    data.category    ?? "",
    budget:      data.budget      ?? 0,
    deadline:    data.deadline    ?? "",
    agencyName,
    agencyPlan,
    location:    data.location    ?? "",
    gender:      data.gender      ?? "",
    ageMin:      data.age_min     ?? null,
    ageMax:      data.age_max     ?? null,
    applicationRequirements: (data as { application_requirements?: string[] }).application_requirements ?? [],
  };

  return (
    <TalentJobDetail
      job={job}
      talentGender={talentProfile?.gender ?? null}
      talentAge={talentProfile?.age ?? null}
    />
  );
}
