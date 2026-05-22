import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { isJobOpenForApplications, JOB_UNAVAILABLE_MESSAGE } from "@/lib/jobAvailability";
import { PLAN_DEFINITIONS, type Plan } from "@/lib/plans";
import {
  hasActivePremiumWorkspaceTalentMembership,
  hasPortalJobAccess,
} from "@/lib/workspacePortalJobs";
import TalentJobDetail from "@/features/talent/TalentJobDetail";

type Props = {
  params: Promise<{ workspaceSlug: string; jobId: string }>;
  searchParams: Promise<{ invite?: string }>;
};

function PortalJobState({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[28px] border border-zinc-200 bg-white px-7 py-10 text-center shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h1 className="mt-5 text-[1.35rem] font-bold tracking-tight text-zinc-950">{title}</h1>
        <p className="mx-auto mt-2 max-w-lg text-[14px] leading-relaxed text-zinc-500">{description}</p>
        <Link
          href={href}
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-[#1F2D2E] px-5 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#2D4142]"
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspaceSlug, jobId } = await params;
  const supabase = createServerClient({ useServiceRole: true });

  const [{ data: workspace }, { data: job }] = await Promise.all([
    supabase
      .from("premium_workspaces")
      .select("name")
      .eq("slug", workspaceSlug)
      .is("deleted_at", null)
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("jobs").select("title").eq("id", jobId).maybeSingle(),
  ]);

  if (!workspace || !job) {
    return { title: "Vaga privada - BrisaHub" };
  }

  return { title: `${job.title} - ${workspace.name}` };
}

export default async function WorkspaceJobDetailPage({ params, searchParams }: Props) {
  const [{ workspaceSlug, jobId }, query] = await Promise.all([params, searchParams]);
  const inviteToken = typeof query.invite === "string" ? query.invite.trim() : null;
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = createServerClient({ useServiceRole: true });
  const jobsHref = `/talent/workspaces/${workspaceSlug}/jobs`;
  const dashboardHref = `/talent/workspaces/${workspaceSlug}`;

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("id, name")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!workspace) {
    return (
      <PortalJobState
        title="Portal não encontrado"
        description="Este portal Premium não está disponível no momento."
        href="/talent/dashboard"
        cta="Voltar ao painel"
      />
    );
  }

  const isWorkspaceMember = await hasActivePremiumWorkspaceTalentMembership(supabase, workspace.id, user.id);

  const [jobRes, profileRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, description, category, budget, deadline, agency_id, workspace_id, location, gender, age_min, age_max, visibility, status, deleted_at, number_of_talents_required, application_requirements")
      .eq("id", jobId)
      .eq("workspace_id", workspace.id)
      .single()
      .then(async (res) => {
        if (res.error?.message?.includes("application_requirements")) {
          return supabase
            .from("jobs")
            .select("id, title, description, category, budget, deadline, agency_id, workspace_id, location, gender, age_min, age_max, visibility, status, deleted_at, number_of_talents_required")
            .eq("id", jobId)
            .eq("workspace_id", workspace.id)
            .single();
        }
        return res;
      }),
    supabase.from("talent_profiles").select("gender, age").eq("id", user.id).single(),
  ]);

  const data = jobRes.data;
  const talentProfile = profileRes.data;

  if (!data || data.status === "inactive") {
    return (
      <PortalJobState
        title="Vaga não encontrada neste portal."
        description="A vaga que você tentou abrir não pertence a este Espaço Premium ou não está mais disponível."
        href={jobsHref}
        cta="Voltar para vagas privadas"
      />
    );
  }

  const hasAccess = await hasPortalJobAccess({
    supabase,
    jobId,
    talentUserId: user.id,
    visibility: data.visibility,
    workspaceId: workspace.id,
    inviteToken,
  });

  if (!hasAccess) {
    return (
      <PortalJobState
        title="Acesso restrito ao portal"
        description={isWorkspaceMember
          ? "Esta vaga privada não está disponível para sua conta neste momento."
          : "Você precisa entrar no portal desta agência para acessar esta vaga."}
        href={`/${workspaceSlug}`}
        cta="Abrir portal da agência"
      />
    );
  }

  let agencyName = "";
  let agencyPlan = "free";
  let isAvailableForApplications = true;
  let liveCommissionRate = PLAN_DEFINITIONS.free.commissionRate;
  if (data.agency_id) {
    const [{ data: agency }, { data: agencyProfile }] = await Promise.all([
      supabase.from("agencies").select("company_name").eq("id", data.agency_id).single(),
      supabase.from("profiles").select("plan").eq("id", data.agency_id).single(),
    ]);
    agencyName = agency?.company_name ?? workspace.name;
    agencyPlan = agencyProfile?.plan ?? "free";

    const [{ count: activeHires }, liveSetting] = await Promise.all([
      supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .not("status", "in", '("cancelled","rejected")')
        .is("deleted_at", null),
      getLivePlanSetting((agencyProfile?.plan ?? "free") as Plan),
    ]);

    liveCommissionRate = liveSetting.commission_rate;
    isAvailableForApplications = isJobOpenForApplications({
      status: data.status ?? null,
      deletedAt: (data as { deleted_at?: string | null }).deleted_at ?? null,
      currentHires: activeHires ?? 0,
      talentsNeeded: (data as { number_of_talents_required?: number | null }).number_of_talents_required ?? 1,
      maxHiresPerJob: liveSetting.max_hires_per_job,
    });
  }

  const job = {
    id: String(data.id),
    title: data.title ?? "",
    description: data.description ?? "",
    category: data.category ?? "",
    budget: data.budget ?? 0,
    deadline: data.deadline ?? "",
    agencyName,
    agencyPlan,
    location: data.location ?? "",
    gender: data.gender ?? "",
    ageMin: data.age_min ?? null,
    ageMax: data.age_max ?? null,
    applicationRequirements: (data as { application_requirements?: string[] }).application_requirements ?? [],
    isAvailableForApplications,
    availabilityMessage: JOB_UNAVAILABLE_MESSAGE,
  };

  return (
    <TalentJobDetail
      job={job}
      talentGender={talentProfile?.gender ?? null}
      talentAge={talentProfile?.age ?? null}
      liveCommissionRate={liveCommissionRate}
      inviteToken={inviteToken}
      jobsHref={jobsHref}
      dashboardHref={dashboardHref}
      disableReferral
    />
  );
}
