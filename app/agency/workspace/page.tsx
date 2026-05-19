import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { brl } from "@/lib/brl";
import { getServerLang, getServerT } from "@/lib/i18n/server";
import { jobStatusLabel, jobStatusTone } from "@/lib/jobStatus";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { premiumSeatHighlights } from "@/lib/planSettings.shared";
import {
  ensurePremiumWorkspaceForAgency,
  getAgentLedgerBalance,
  getUserPremiumWorkspace,
  getWorkspaceMembers,
  getWorkspacePendingInvites,
  getWorkspaceSeatUsage,
  type PremiumMembership,
  type PremiumWorkspace,
} from "@/lib/premiumWorkspace.server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import WorkspaceOnboardingChecklist from "@/features/agency/WorkspaceOnboardingChecklist";

export const metadata: Metadata = { title: "Espaco Premium - BrisaHub" };

type WorkspaceJob = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  budget: number | null;
  createdAt: string;
  applicants: number;
  creatorName: string | null;
  createdByUserId: string | null;
};

type TFn = (key: string) => string;

function FeatureChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
      {children}
    </span>
  );
}

function LockedScreen({ premiumAvailable, t }: { premiumAvailable: boolean; t: TFn }) {
  const premiumHighlights = premiumSeatHighlights({
    plan_key: "premium",
    included_agent_seats: 2,
    extra_agent_seat_price: 0,
  });

  return (
    <div className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="bg-[radial-gradient(circle_at_top_left,rgba(26,188,156,0.30),transparent_36%),linear-gradient(135deg,#082326_0%,#0C2E33_45%,#143C43_100%)] px-6 py-10 text-white sm:px-10">
        <div className="max-w-3xl space-y-5">
          <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
            {t("workspace_premium_space")}
          </div>
          <div className="space-y-3">
            <h1 className="text-[1.6rem] font-bold tracking-tight sm:text-[2.6rem]">
              {t("workspace_premium_space")}
            </h1>
            <p className="max-w-2xl text-[15px] leading-7 text-white/72">
              {t("workspace_locked_description")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FeatureChip>{t("workspace_role_owner")}</FeatureChip>
            <FeatureChip>{t("workspace_role_agent")}</FeatureChip>
            <FeatureChip>{t("workspace_private_job")}</FeatureChip>
            <FeatureChip>{t("workspace_private_invite")}</FeatureChip>
            <FeatureChip>{t("workspace_usage_limit")}</FeatureChip>
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 sm:px-10">
        {[
          t("workspace_locked_private_space"),
          t("workspace_locked_internal_agents"),
          t("workspace_summary_private_jobs_hint"),
          t("workspace_locked_limit_control"),
          t("workspace_locked_branding"),
          t("workspace_locked_owner_supervision"),
        ].map((item) => (
          <div key={item} className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-[#E7FAF7] text-[#0E7C86]">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-zinc-800">{item}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 border-t border-zinc-100 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="text-[13px] text-zinc-500">
          {premiumAvailable ? t("workspace_locked_ready") : t("plan_coming_soon")}
        </div>
        {premiumAvailable ? (
          <Link
            href="/agency/billing"
            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_14px_30px_rgba(26,188,156,0.25)] transition-all hover:translate-y-[-1px]"
          >
            {t("workspace_view_plans")}
          </Link>
        ) : (
          <span className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 px-5 py-3 text-[14px] font-semibold text-zinc-400">
            {t("plan_coming_soon")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-zinc-100 px-6 py-4 sm:px-10">
        {premiumHighlights.slice(0, 5).map((item) => (
          <span key={item} className="text-[12px] text-zinc-400">{item}</span>
        ))}
      </div>
    </div>
  );
}

function WorkspaceHeader({
  workspace,
  membership,
  t,
  locale,
}: {
  workspace: PremiumWorkspace;
  membership: PremiumMembership;
  t: TFn;
  locale: string;
}) {
  const isOwner = membership.role === "owner";
  const primary = workspace.brandPrimaryColor ?? "#1ABC9C";
  const accent = workspace.brandAccentColor ?? "#27C1D6";
  const initials =
    workspace.name
      .split(" ")
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "P";

  return (
    <div className="overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div
        className="px-6 py-8 text-white sm:px-8"
        style={{
          background: `radial-gradient(circle at top left, ${primary}50, transparent 28%), linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
        }}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {workspace.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={workspace.logoUrl}
                alt={t("workspace_header_logo_alt")}
                className="h-16 w-16 rounded-2xl border border-white/20 object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/14 text-[18px] font-bold text-white shadow-lg">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                  {t("workspace_premium_space")}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                    isOwner ? "bg-white/18 text-white" : "bg-[#EEF4FF] text-[#3156A6]"
                  }`}
                >
                  {isOwner ? t("workspace_role_owner") : t("workspace_role_agent")}
                </span>
              </div>
              <h1 className="mt-3 truncate text-[1.6rem] font-bold tracking-tight sm:text-[2rem]">{workspace.name}</h1>
              <p className="mt-2 max-w-2xl text-[14px] leading-6 text-white/78">
                {workspace.welcomeMessage || t("workspace_header_default_welcome")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <div className="rounded-2xl border border-white/16 bg-white/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                {t("workspace_header_created_at")}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-white">
                {new Date(isOwner ? workspace.createdAt : membership.createdAt).toLocaleDateString(locale)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/16 bg-white/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                {t("workspace_header_access")}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-white">
                {isOwner ? t("workspace_header_access_owner") : t("workspace_header_access_agent")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[26px] border border-zinc-200 bg-white px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-2 text-[1.65rem] font-bold tracking-tight text-zinc-900">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] leading-5 text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 5v14m7-7H5" />
        </svg>
      </div>
      <p className="mt-4 text-[15px] font-semibold text-zinc-800">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-zinc-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function JobRow({
  job,
  lang,
  locale,
  t,
}: {
  job: WorkspaceJob;
  lang: "pt-BR" | "en";
  locale: string;
  t: TFn;
}) {
  return (
    <Link
      href={`/agency/workspace/jobs/${job.id}`}
      className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 transition-colors hover:bg-zinc-50 last:border-0 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[14px] font-semibold text-zinc-900">{job.title}</p>
          {job.visibility === "private_invite" ? (
            <span className="inline-flex items-center rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700">
              {t("workspace_private_job")}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[12px] text-zinc-500">
          {job.creatorName
            ? `${t("workspace_jobs_created_by")} ${job.creatorName}`
            : t("workspace_jobs_created_in_premium")}
        </p>
        <p className="mt-1 text-[11px] text-zinc-400">
          {new Date(job.createdAt).toLocaleDateString(locale, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {job.budget != null ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            {brl(job.budget)}
          </span>
        ) : null}
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600">
          {job.applicants}{" "}
          {job.applicants === 1
            ? t("workspace_job_application_singular")
            : t("workspace_job_application_plural")}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${jobStatusTone(job.status)}`}>
          {jobStatusLabel(job.status, lang)}
        </span>
      </div>
    </Link>
  );
}

function TeamSummary({
  isOwner,
  activeAgents,
  invites,
  seatUsage,
  membership,
  locale,
  t,
}: {
  isOwner: boolean;
  activeAgents: Awaited<ReturnType<typeof getWorkspaceMembers>>;
  invites: Awaited<ReturnType<typeof getWorkspacePendingInvites>>;
  seatUsage: Awaited<ReturnType<typeof getWorkspaceSeatUsage>>;
  membership: PremiumMembership;
  locale: string;
  t: TFn;
}) {
  if (isOwner) {
    return (
      <div className="space-y-3">
        {activeAgents.length === 0 ? (
          <p className="text-[13px] text-zinc-500">
            {t("workspace_team_empty_prefix")}{" "}
            <Link href="/agency/workspace/agents" className="text-[#1ABC9C] underline underline-offset-2">
              {t("workspace_team_invite_your_team")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {activeAgents.slice(0, 6).map((member) => {
              const initials = (member.displayName || member.email || "?")
                .split(" ")
                .slice(0, 2)
                .map((word) => word[0]?.toUpperCase() ?? "")
                .join("");

              return (
                <div key={member.id} className="flex items-center gap-2 rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-50 text-[11px] font-bold text-indigo-600">
                    {initials}
                  </div>
                  <span className="text-[12px] font-medium text-zinc-700">{member.displayName || member.email}</span>
                  {member.status === "suspended" ? (
                    <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                      {t("workspace_wallet_agent_suspended")}
                    </span>
                  ) : null}
                </div>
              );
            })}
            {activeAgents.length > 6 ? (
              <span className="flex items-center rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-[12px] text-zinc-500">
                +{activeAgents.length - 6} {t("workspace_team_more")}
              </span>
            ) : null}
          </div>
        )}
        {invites.length > 0 ? (
          <p className="text-[12px] text-zinc-500">
            {invites.length} {t(invites.length === 1 ? "workspace_invite_singular" : "workspace_invite_plural")}{" "}
            {t(invites.length === 1 ? "workspace_pending_singular" : "workspace_pending_plural")} •{" "}
            {t("workspace_team_manage_in")}{" "}
            <Link href="/agency/workspace/agents" className="text-[#1ABC9C] underline underline-offset-2">
              {t("nav_workspace_agents")}
            </Link>
            .
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[13px] text-zinc-700">
          {t("workspace_agent_active_since")}{" "}
          <span className="font-semibold">
            {new Date(membership.createdAt).toLocaleDateString(locale, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </p>
        <p className="mt-1 text-[12px] text-zinc-500">{t("workspace_agent_wallet_hint")}</p>
      </div>
      <Link
        href="/agency/workspace/wallet"
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-[12px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        {t("workspace_agent_view_wallet")}
      </Link>
    </div>
  );
}

export default async function WorkspacePage() {
  const [t, lang] = await Promise.all([getServerT(), getServerLang()]);
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const statusLang = lang === "en" ? "en" : "pt-BR";
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) redirect("/login");

  const supabase = createServerClient({ useServiceRole: true });
  const { data: profile } = await supabase.from("profiles").select("plan, role").eq("id", user.id).maybeSingle();

  if (!profile || profile.role !== "agency") {
    redirect("/agency/dashboard");
  }

  const premiumPlan = await getLivePlanSetting("premium");
  let workspaceAccess = await getUserPremiumWorkspace(user.id);

  if (!workspaceAccess) {
    if (profile.plan !== "premium") {
      return <LockedScreen premiumAvailable={premiumPlan.is_available} t={t} />;
    }
    workspaceAccess = await ensurePremiumWorkspaceForAgency(user.id);
    if (!workspaceAccess) return <LockedScreen premiumAvailable={premiumPlan.is_available} t={t} />;
  }

  const { workspace, membership } = workspaceAccess;
  const isOwner = membership.role === "owner";

  const [seatUsage, members, invites, jobsResult, selfLedger, ownerProfile, portalTalentCount] = await Promise.all([
    getWorkspaceSeatUsage(workspace.id),
    getWorkspaceMembers(workspace.id),
    isOwner ? getWorkspacePendingInvites(workspace.id) : Promise.resolve([]),
    supabase
      .from("jobs")
      .select("id, title, status, visibility, budget, created_at, created_by_user_id")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    !isOwner ? getAgentLedgerBalance(workspace.id, user.id) : Promise.resolve(null),
    supabase.from("profiles").select("wallet_balance").eq("id", workspace.ownerUserId).maybeSingle(),
    isOwner
      ? supabase.from("premium_workspace_talents").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id)
      : Promise.resolve({ count: 0 }),
  ]);

  const jobRows = jobsResult.data ?? [];
  const jobIds = jobRows.map((row) => row.id);
  const creatorIds = [
    ...new Set(jobRows.map((row) => row.created_by_user_id).filter((id): id is string => Boolean(id))),
  ];

  const [submissionRows, creatorAgencyRows, creatorTalentRows] = await Promise.all([
    jobIds.length ? supabase.from("submissions").select("job_id").in("job_id", jobIds) : Promise.resolve({ data: [] }),
    creatorIds.length
      ? supabase.from("agencies").select("user_id, company_name").in("user_id", creatorIds)
      : Promise.resolve({ data: [] }),
    creatorIds.length
      ? supabase.from("talent_profiles").select("user_id, full_name").in("user_id", creatorIds)
      : Promise.resolve({ data: [] }),
  ]);

  const submissionCountMap = new Map<string, number>();
  for (const row of submissionRows.data ?? []) {
    submissionCountMap.set(row.job_id, (submissionCountMap.get(row.job_id) ?? 0) + 1);
  }

  const creatorNameMap = new Map<string, string>();
  for (const row of creatorAgencyRows.data ?? []) {
    creatorNameMap.set(row.user_id, row.company_name ?? "");
  }
  for (const row of creatorTalentRows.data ?? []) {
    if (!creatorNameMap.has(row.user_id) && row.full_name) creatorNameMap.set(row.user_id, row.full_name);
  }

  const workspaceJobs: WorkspaceJob[] = jobRows.map((row) => ({
    id: String(row.id),
    title: row.title ?? "",
    status: row.status ?? "open",
    visibility: row.visibility ?? "public",
    budget: row.budget ?? null,
    createdAt: row.created_at ?? "",
    applicants: submissionCountMap.get(row.id) ?? 0,
    creatorName: row.created_by_user_id ? (creatorNameMap.get(row.created_by_user_id) ?? null) : null,
    createdByUserId: row.created_by_user_id ?? null,
  }));

  const myJobs = workspaceJobs.filter((job) => job.createdByUserId === user.id);
  const privateJobs = workspaceJobs;
  const walletBalance = Number(ownerProfile.data?.wallet_balance ?? 0);
  const seatLimitReached = isOwner && seatUsage.remaining === 0;
  const activeAgents = members.filter((member) => member.role === "agent" && member.status === "active");

  const checklistLang = lang === "en" ? "en" : "pt-BR";
  const onboardingItems = isOwner
    ? [
        {
          label: lang === "en" ? "Workspace created" : "Workspace criado",
          hint: "",
          href: "/agency/workspace",
          done: true,
        },
        {
          label: lang === "en" ? "Customize branding" : "Personalizar branding",
          hint: lang === "en" ? "Add your logo, colors and welcome message." : "Adicione seu logo, cores e mensagem de boas-vindas.",
          href: "/agency/workspace/branding",
          done: !!(workspace.logoUrl || workspace.welcomeMessage),
        },
        {
          label: lang === "en" ? "Invite your first agent" : "Convidar primeiro agente",
          hint: lang === "en" ? "Add an agent to your workspace team." : "Adicione um agente à sua equipe no workspace.",
          href: "/agency/workspace/agents",
          done: activeAgents.length > 0 || invites.length > 0,
        },
        {
          label: lang === "en" ? "Invite your first talent" : "Convidar primeiro talento",
          hint: lang === "en" ? "Add talent to your private portal." : "Adicione talentos ao seu portal privado.",
          href: "/agency/workspace/talents",
          done: (portalTalentCount.count ?? 0) > 0,
        },
        {
          label: lang === "en" ? "Add balance to wallet" : "Adicionar saldo à carteira",
          hint: lang === "en" ? "Fund your workspace wallet to cover bookings." : "Adicione saldo para cobrir reservas.",
          href: "/agency/workspace/wallet",
          done: walletBalance > 0,
        },
        {
          label: lang === "en" ? "Create your first private job" : "Criar primeira vaga privada",
          hint: lang === "en" ? "Post a private job visible only to invited talent." : "Publique uma vaga privada visível apenas para talentos convidados.",
          href: "/agency/workspace/jobs",
          done: privateJobs.length > 0,
        },
      ]
    : [];

  const showOnboarding = isOwner && !workspace.onboardingCompleted;

  return (
    <div className="space-y-6">
      <WorkspaceHeader workspace={workspace} membership={membership} t={t} locale={locale} />

      {showOnboarding && (
        <WorkspaceOnboardingChecklist items={onboardingItems} lang={checklistLang} />
      )}

      {isOwner ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label={t("workspace_seats")}
            value={`${seatUsage.usedSeats}/${seatUsage.totalAllowed}`}
            hint={`${seatUsage.remaining} ${t(seatUsage.remaining === 1 ? "workspace_available" : "workspace_available_plural")}`}
          />
          <SummaryCard
            label={t("workspace_agents")}
            value={String(activeAgents.length)}
            hint={t("workspace_summary_active_team")}
          />
          <SummaryCard
            label={t("workspace_private_invite")}
            value={String(invites.length)}
            hint={t("workspace_summary_pending_invites")}
          />
          <SummaryCard
            label={t("workspace_private_job")}
            value={String(privateJobs.length)}
            hint={t("workspace_summary_private_jobs_hint")}
          />
          <SummaryCard
            label={t("workspace_jobs_team_title")}
            value={String(workspaceJobs.length)}
            hint={t("workspace_summary_all_workspace_jobs")}
          />
          <SummaryCard
            label={t("nav_workspace_wallet")}
            value={brl(walletBalance)}
            hint={t("workspace_summary_main_account_balance")}
          />
          <SummaryCard
            label={t("nav_workspace_branding")}
            value={workspace.logoUrl ? t("workspace_summary_configured") : t("workspace_summary_pending")}
            hint={workspace.logoUrl ? t("workspace_summary_branding_ready") : t("workspace_summary_branding_missing")}
          />
          <SummaryCard
            label={t("workspace_role_owner")}
            value={t("workspace_summary_owner_value")}
            hint={t("workspace_summary_owner_hint")}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label={t("workspace_role_agent")}
            value={t("workspace_summary_role_operation")}
            hint={t("workspace_summary_agent_balance_usage")}
          />
          <SummaryCard
            label={t("workspace_wallet_allocated")}
            value={brl(selfLedger?.allocatedAmount ?? 0)}
            hint={t("workspace_wallet_total_sent_by_owner")}
          />
          <SummaryCard
            label={t("workspace_wallet_committed")}
            value={brl(selfLedger?.committedAmount ?? 0)}
            hint={t("workspace_summary_reserved_in_jobs")}
          />
          <SummaryCard
            label={t("workspace_wallet_available")}
            value={brl(selfLedger?.availableAmount ?? 0)}
            hint={t((selfLedger?.availableAmount ?? 0) === 0 ? "workspace_summary_balance_depleted" : "workspace_summary_remaining_balance")}
          />
        </div>
      )}

      {seatLimitReached ? (
        <div className="rounded-[26px] border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-[14px] font-semibold text-amber-800">{t("workspace_seat_limit_title")}</p>
          <p className="mt-1 text-[13px] leading-6 text-amber-700">{t("workspace_seat_limit_description")}</p>
          <Link
            href="/agency/support"
            className="mt-3 inline-flex items-center rounded-xl bg-amber-500 px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-amber-600"
          >
            {t("workspace_support_cta")}
          </Link>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-zinc-900">{t("workspace_identity_title")}</p>
            <p className="mt-1 text-[12px] text-zinc-500">{t("workspace_identity_summary")}</p>
          </div>
          {isOwner ? (
            <Link
              href="/agency/workspace/branding"
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-[12px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              {t("workspace_identity_edit")}
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-4 p-5">
          {workspace.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workspace.logoUrl} alt={t("workspace_identity_logo_alt")} className="h-14 w-14 rounded-xl border border-zinc-100 object-cover flex-shrink-0" />
          ) : (
            <div
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl text-[18px] font-bold text-white"
              style={{ backgroundColor: workspace.brandPrimaryColor ?? "#1ABC9C" }}
            >
              {workspace.name
                .split(" ")
                .slice(0, 2)
                .map((word) => word[0]?.toUpperCase() ?? "")
                .join("") || "P"}
            </div>
          )}
          <div>
            <p className="text-[15px] font-semibold text-zinc-900">{workspace.name}</p>
            {workspace.slug ? (
              <p className="mt-1 text-[12px] text-zinc-500">
                {t("workspace_identity_portal_url")}{" "}
                <span className="font-mono text-zinc-700">/{workspace.slug}</span>
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-zinc-400">{t("workspace_identity_portal_url_missing")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-zinc-900">
              {isOwner ? t("workspace_team_title") : t("workspace_team_agent_title")}
            </p>
            <p className="mt-1 text-[12px] text-zinc-500">
              {isOwner
                ? `${activeAgents.length} ${t(activeAgents.length === 1 ? "workspace_agent_singular" : "workspace_agent_plural")} • ${seatUsage.usedSeats}/${seatUsage.totalAllowed} ${t("workspace_seats").toLowerCase()}`
                : t("workspace_header_access_agent")}
            </p>
          </div>
          {isOwner ? (
            <Link
              href="/agency/workspace/agents"
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-[12px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              {t("workspace_team_manage")}
            </Link>
          ) : null}
        </div>
        <div className="p-5">
          <TeamSummary
            isOwner={isOwner}
            activeAgents={activeAgents}
            invites={invites}
            seatUsage={seatUsage}
            membership={membership}
            locale={locale}
            t={t}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-zinc-900">
              {isOwner ? t("workspace_jobs_team_title") : t("workspace_my_jobs_title")}
            </p>
            <p className="mt-1 text-[12px] text-zinc-500">
              {isOwner
                ? `${workspaceJobs.length} ${t(workspaceJobs.length === 1 ? "workspace_job_singular" : "workspace_job_plural")} ${t("workspace_jobs_count_in_space")}`
                : `${myJobs.length} ${t(myJobs.length === 1 ? "workspace_job_singular_created" : "workspace_job_plural_created")}`}
            </p>
          </div>
          <Link
            href="/agency/workspace/jobs"
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-[12px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            {t("workspace_view_all")}
          </Link>
        </div>
        {isOwner ? (
          workspaceJobs.length === 0 ? (
            <EmptyState
              title={t("workspace_jobs_empty_title")}
              description={t("workspace_jobs_owner_empty_description")}
            />
          ) : (
            <div>
              {workspaceJobs.slice(0, 5).map((job) => (
                <JobRow key={job.id} job={job} lang={statusLang} locale={locale} t={t} />
              ))}
            </div>
          )
        ) : myJobs.length === 0 ? (
          <EmptyState
            title={t("workspace_jobs_agent_empty_title")}
            description={t("workspace_jobs_agent_empty_description")}
          />
        ) : (
          <div>
            {myJobs.slice(0, 5).map((job) => (
              <JobRow key={job.id} job={job} lang={statusLang} locale={locale} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
