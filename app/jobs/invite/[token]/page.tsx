import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { isJobOpenForApplications } from "@/lib/jobAvailability";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import type { Plan } from "@/lib/plans";
import InviteJobClient from "./InviteJobClient";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data: link } = await supabase.from("job_invite_links").select("job_id").eq("token", token).maybeSingle();
  if (!link) return { title: "Convite inválido — CastAnet" };
  const { data: job } = await supabase.from("jobs").select("title").eq("id", link.job_id).maybeSingle();
  return { title: job?.title ? `${job.title} — Convite CastAnet` : "Convite privado — CastAnet" };
}

function formatBudget(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!amount) return "A combinar";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function InviteState({
  tone,
  title,
  description,
}: {
  tone: "neutral" | "warning";
  title: string;
  description: string;
}) {
  const isWarning = tone === "warning";
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F3F7F8_0%,#FFFFFF_100%)] px-5 py-12">
      <div className="mx-auto max-w-xl overflow-hidden rounded-[30px] border border-zinc-200 bg-white text-center shadow-[0_18px_46px_rgba(15,23,42,0.07)]">
        <div className={`px-8 py-10 ${isWarning ? "bg-amber-50" : "bg-zinc-50"}`}>
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${isWarning ? "bg-white text-amber-500" : "bg-white text-zinc-400"}`}>
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d={isWarning ? "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" : "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"}
              />
            </svg>
          </div>
          <h1 className="mt-5 text-[24px] font-bold tracking-tight text-zinc-900">{title}</h1>
          <p className="mt-3 text-[14px] leading-7 text-zinc-500">{description}</p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl bg-[#1F2D2E] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-zinc-700"
            >
              Voltar ao início
            </Link>
          </div>
        </div>
        <div className="border-t border-zinc-100 px-6 py-4 text-[12px] text-zinc-400">
          Powered by CastAnet
        </div>
      </div>
    </main>
  );
}

export default async function InviteJobPage({ params }: Props) {
  const { token } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  const { data: link } = await supabase
    .from("job_invite_links")
    .select("id, job_id, workspace_id, status, expires_at, revoked_at, use_count, max_uses")
    .eq("token", token)
    .maybeSingle();

  const validLink =
    !!link &&
    link.status === "active" &&
    !link.revoked_at &&
    (!link.expires_at || new Date(link.expires_at) > new Date()) &&
    (link.max_uses == null || Number(link.use_count ?? 0) < Number(link.max_uses));

  if (!validLink) {
    return (
      <InviteState
        tone="neutral"
        title="Convite inválido ou expirado."
        description="Este convite privado não está mais disponível. Peça um novo link à agência responsável."
      />
    );
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description, category, budget, deadline, job_date, job_time, location, agency_id, status, deleted_at, number_of_talents_required, visibility")
    .eq("id", link.job_id)
    .maybeSingle();

  if (!job || job.visibility !== "private_invite" || job.status === "inactive" || job.deleted_at) {
    return (
      <InviteState
        tone="warning"
        title="Vaga não disponível para novas candidaturas."
        description="Esta vaga privada pode ter sido encerrada, cancelada ou atingido o número máximo de talentos."
      />
    );
  }

  const [{ data: agencyProfile }, { count: activeHires }] = await Promise.all([
    job.agency_id
      ? supabase.from("profiles").select("plan").eq("id", job.agency_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .not("status", "in", '("cancelled","rejected")')
      .is("deleted_at", null),
  ]);

  const liveSetting = await getLivePlanSetting((agencyProfile?.plan ?? "free") as Plan);
  const isOpen = isJobOpenForApplications({
    status: job.status ?? null,
    deletedAt: (job as { deleted_at?: string | null }).deleted_at ?? null,
    currentHires: activeHires ?? 0,
    talentsNeeded: (job as { number_of_talents_required?: number | null }).number_of_talents_required ?? 1,
    maxHiresPerJob: liveSetting.max_hires_per_job,
  });

  if (!isOpen) {
    return (
      <InviteState
        tone="warning"
        title="Vaga não disponível para novas candidaturas."
        description="Esta vaga privada não está aceitando novas candidaturas no momento."
      />
    );
  }

  let workspaceName: string | null = null;
  let workspaceSlug: string | null = null;
  let workspaceWelcome: string | null = null;
  let workspaceLogoUrl: string | null = null;
  let workspacePrimaryColor: string | null = null;
  let workspaceAccentColor: string | null = null;

  if (link.workspace_id) {
    const { data: workspace } = await supabase
      .from("premium_workspaces")
      .select("slug, name, welcome_message, logo_url, brand_primary_color, brand_accent_color")
      .eq("id", link.workspace_id)
      .maybeSingle();

    workspaceSlug = (workspace?.slug as string | null) ?? null;
    workspaceName = workspace?.name ?? null;
    workspaceWelcome = (workspace?.welcome_message as string | null) ?? null;
    workspaceLogoUrl = (workspace?.logo_url as string | null) ?? null;
    workspacePrimaryColor = (workspace?.brand_primary_color as string | null) ?? null;
    workspaceAccentColor = (workspace?.brand_accent_color as string | null) ?? null;
  }

  let agencyName: string | null = null;
  if (job.agency_id && !workspaceName) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("company_name")
      .eq("id", job.agency_id)
      .maybeSingle();
    agencyName = agency?.company_name ?? null;
  }

  let userRole: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    userRole = profile?.role ?? null;
  }

  return (
    <InviteJobClient
      token={token}
      job={{
        id: String(job.id),
        title: job.title ?? "",
        description: job.description ?? "",
        category: job.category ?? "",
        budget: formatBudget(job.budget),
        deadline: formatDate(job.deadline),
        jobDate: formatDate(job.job_date),
        jobTime: job.job_time ? String(job.job_time).slice(0, 5) : null,
        location: job.location ?? null,
      }}
      workspaceSlug={workspaceSlug}
      workspaceName={workspaceName}
      workspaceWelcome={workspaceWelcome}
      workspaceLogoUrl={workspaceLogoUrl}
      workspacePrimaryColor={workspacePrimaryColor}
      workspaceAccentColor={workspaceAccentColor}
      agencyName={agencyName}
      isLoggedIn={!!user}
      userRole={userRole}
    />
  );
}
