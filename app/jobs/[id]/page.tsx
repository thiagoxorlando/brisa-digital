import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReferralClaimOnView from "@/components/referrals/ReferralClaimOnView";
import { getLivePlanSetting } from "@/lib/planSettings.server";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import { isJobOpenForApplications, JOB_UNAVAILABLE_MESSAGE } from "@/lib/jobAvailability";
import { formatJobLocation } from "@/lib/jobLocation";
import type { Plan } from "@/lib/plans";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ref?: string }>;
};

function formatBudget(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!amount) return "A combinar";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

function formatTime(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 5);
}

function encodeNext(path: string) {
  return encodeURIComponent(path);
}

async function getJobAvailability(
  supabase: ReturnType<typeof createServerClient>,
  job: { id: string; agency_id: string | null; status: string | null; deleted_at?: string | null; number_of_talents_required?: number | null },
) {
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

  return isJobOpenForApplications({
    status: job.status ?? null,
    deletedAt: job.deleted_at ?? null,
    currentHires: activeHires ?? 0,
    talentsNeeded: job.number_of_talents_required ?? 1,
    maxHiresPerJob: liveSetting.max_hires_per_job,
  });
}

function UnavailableJobState({
  title = "Vaga nÃ£o disponÃ­vel.",
  description = "Esta vaga pode ter sido encerrada, removida ou nÃ£o estÃ¡ disponÃ­vel para compartilhamento pÃºblico.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#1F2D2E]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-8 sm:px-8">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-[15px] font-bold tracking-tight">
            BrisaHub
          </Link>
        </header>

        <section className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xl rounded-[2rem] border border-[#DDE6E6] bg-white p-8 text-center shadow-sm sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mt-5 text-[1.65rem] font-semibold tracking-tight text-[#1F2D2E]">
              Vaga não disponível.
            </h1>
            <p className="mt-3 text-[15px] leading-7 text-[#5E7374]">
              Esta vaga pode ter sido encerrada, removida ou não está disponível para compartilhamento público.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center rounded-xl border border-[#DDE6E6] bg-white px-5 py-3 text-[14px] font-bold text-[#1F2D2E] transition-colors hover:border-[#B8D4D4]"
            >
              Voltar para a BrisaHub
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function ClosedForApplicationsState() {
  return <UnavailableJobState title={JOB_UNAVAILABLE_MESSAGE} description={JOB_UNAVAILABLE_MESSAGE} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).maybeSingle();

  return {
    title: data?.title ? `${data.title} — BrisaHub` : "Vaga não disponível — BrisaHub",
  };
}

export default async function PublicJobPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const referralToken = typeof query.ref === "string" ? query.ref.trim() : "";
  const supabase = createServerClient({ useServiceRole: true });
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (referralToken) {
    const { data: job } = await supabase
      .from("jobs")
      .select("id, title, description, category, budget, deadline, agency_id, location, visibility, status, deleted_at, number_of_talents_required, workspace_id")
      .eq("id", id)
      .maybeSingle();

    if (!job || job.status === "inactive") notFound();
    if ((job as { workspace_id?: string | null }).workspace_id) {
      return <UnavailableJobState />;
    }
    const canApply = await getJobAvailability(supabase, {
      id: job.id,
      agency_id: job.agency_id ?? null,
      status: job.status ?? null,
      deleted_at: (job as { deleted_at?: string | null }).deleted_at ?? null,
      number_of_talents_required: (job as { number_of_talents_required?: number | null }).number_of_talents_required ?? 1,
    });

    if (!canApply) {
      return <ClosedForApplicationsState />;
    }

    const { data: invite } = await supabase
      .from("referral_invites")
      .select("id, token, job_id, referrer_id, referred_user_id, status")
      .eq("token", referralToken)
      .eq("job_id", id)
      .neq("status", "fraud_reported")
      .maybeSingle();

    if ((job.visibility === "private" || job.visibility === "private_invite") && !invite) notFound();

    const [{ data: agency }, { data: referrer }] = await Promise.all([
      job.agency_id
        ? supabase.from("agencies").select("company_name").eq("id", job.agency_id).maybeSingle()
        : Promise.resolve({ data: null }),
      invite?.referrer_id
        ? supabase.from("talent_profiles").select("full_name").eq("id", invite.referrer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const nextPath = `/talent/jobs/${id}`;
    const signupHref = `/signup?role=talent&ref=${encodeURIComponent(referralToken)}&job=${encodeURIComponent(id)}&next=${encodeNext(nextPath)}`;
    const loginHref = `/login?ref=${encodeURIComponent(referralToken)}&job=${encodeURIComponent(id)}&next=${encodeNext(nextPath)}`;
    const dashboardHref = user ? nextPath : loginHref;
    const deadline = formatDate(job.deadline);

    return (
      <main className="min-h-screen bg-[#F8FAFC] text-[#1F2D2E]">
        <ReferralClaimOnView token={referralToken} />

        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-8 sm:px-8">
          <header className="mb-8 flex items-center justify-between">
            <Link href="/" className="text-[15px] font-bold tracking-tight">
              BrisaHub
            </Link>
            {user ? (
              <Link href={dashboardHref} className="text-[13px] font-semibold text-[#0E7C86]">
                Acessar vaga
              </Link>
            ) : (
              <Link href={loginHref} className="text-[13px] font-semibold text-[#0E7C86]">
                Entrar
              </Link>
            )}
          </header>

          <section className="flex flex-1 flex-col justify-center">
            {referrer?.full_name && (
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#0E7C86]">
                Indicação de {referrer.full_name}
              </p>
            )}

            <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[#1F2D2E] sm:text-[2.75rem]">
              {job.title}
            </h1>

            <div className="mt-5 flex flex-wrap gap-2 text-[13px] font-semibold text-[#647B7B]">
              {agency?.company_name && (
                <span className="rounded-full border border-[#DDE6E6] bg-white px-3 py-1">
                  {agency.company_name}
                </span>
              )}
              {formatJobLocation(job.location) && (
                <span className="rounded-full border border-[#DDE6E6] bg-white px-3 py-1">
                  {formatJobLocation(job.location)}
                </span>
              )}
              {job.category && (
                <span className="rounded-full border border-[#DDE6E6] bg-white px-3 py-1">
                  {job.category}
                </span>
              )}
              <span className="rounded-full border border-[#DDE6E6] bg-white px-3 py-1">
                {formatBudget(job.budget)}
              </span>
              {deadline && (
                <span className="rounded-full border border-[#DDE6E6] bg-white px-3 py-1">
                  Prazo: {deadline}
                </span>
              )}
            </div>

            {job.description && (
              <p className="mt-6 max-w-2xl whitespace-pre-line text-[15px] leading-7 text-[#475D5E]">
                {job.description}
              </p>
            )}

            <div className="mt-7 rounded-2xl border border-[#DDE6E6] bg-white px-5 py-4">
              <p className="text-[14px] leading-6 text-[#475D5E]">
                Para participar, crie sua conta ou faça login usando este link. Se esta indicação resultar em contratação/conclusão paga do job, quem indicou você poderá receber 2% de comissão conforme as regras da plataforma.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {user ? (
                <Link
                  href={dashboardHref}
                  className="inline-flex items-center justify-center rounded-xl bg-[#1F2D2E] px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#2D4142]"
                >
                  Ver oportunidade
                </Link>
              ) : (
                <>
                  <Link
                    href={signupHref}
                    className="inline-flex items-center justify-center rounded-xl bg-[#1F2D2E] px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#2D4142]"
                  >
                    Criar conta para participar
                  </Link>
                  <Link
                    href={loginHref}
                    className="inline-flex items-center justify-center rounded-xl border border-[#DDE6E6] bg-white px-5 py-3 text-[14px] font-bold text-[#1F2D2E] transition-colors hover:border-[#B8D4D4]"
                  >
                    Já tenho conta
                  </Link>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description, category, budget, job_date, job_time, agency_id, location, visibility, status, deleted_at, number_of_talents_required, workspace_id")
    .eq("id", id)
    .maybeSingle();

  if (!job || job.visibility !== "public" || (job as { workspace_id?: string | null }).workspace_id) {
    return <UnavailableJobState />;
  }

  const canApply = await getJobAvailability(supabase, {
    id: job.id,
    agency_id: job.agency_id ?? null,
    status: job.status ?? null,
    deleted_at: job.deleted_at ?? null,
    number_of_talents_required: (job as { number_of_talents_required?: number | null }).number_of_talents_required ?? 1,
  });

  if (!canApply) {
    return <ClosedForApplicationsState />;
  }

  const [{ data: agency }, { data: profile }] = await Promise.all([
    job.agency_id
      ? supabase.from("agencies").select("company_name").eq("id", job.agency_id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const nextPath = `/talent/jobs/${id}`;
  const signupHref = `/signup?role=talent&next=${encodeNext(nextPath)}`;
  const loginHref = `/login?next=${encodeNext(nextPath)}`;
  const role = profile?.role ?? null;
  const isTalent = role === "talent";
  const isAgencyOrAdmin = role === "agency" || role === "admin";
  const jobDate = formatDate(job.job_date);
  const jobTime = formatTime(job.job_time);

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#1F2D2E]">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-8 sm:px-8">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-[15px] font-bold tracking-tight">
            BrisaHub
          </Link>
          {user ? (
            <Link href={nextPath} className="text-[13px] font-semibold text-[#0E7C86]">
              Abrir fluxo da vaga
            </Link>
          ) : (
            <Link href={loginHref} className="text-[13px] font-semibold text-[#0E7C86]">
              Entrar
            </Link>
          )}
        </header>

        <section className="flex flex-1 items-center">
          <div className="w-full rounded-[2rem] border border-[#DDE6E6] bg-white p-7 shadow-sm sm:p-10">
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#647B7B]">
              {agency?.company_name && (
                <span className="rounded-full border border-[#DDE6E6] bg-[#F8FAFC] px-3 py-1">
                  {agency.company_name}
                </span>
              )}
              {job.category && (
                <span className="rounded-full border border-[#DDE6E6] bg-[#F8FAFC] px-3 py-1">
                  {job.category}
                </span>
              )}
              {formatJobLocation(job.location) && (
                <span className="rounded-full border border-[#DDE6E6] bg-[#F8FAFC] px-3 py-1">
                  {formatJobLocation(job.location)}
                </span>
              )}
              <span className="rounded-full border border-[#DDE6E6] bg-[#F8FAFC] px-3 py-1">
                {formatBudget(job.budget)}
              </span>
            </div>

            <h1 className="mt-5 text-[2rem] font-semibold leading-tight tracking-tight text-[#1F2D2E] sm:text-[2.75rem]">
              {job.title}
            </h1>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {jobDate && (
                <div className="rounded-2xl border border-[#DDE6E6] bg-[#F8FAFC] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6A8081]">
                    Data
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-[#1F2D2E]">{jobDate}</p>
                </div>
              )}
              {jobTime && (
                <div className="rounded-2xl border border-[#DDE6E6] bg-[#F8FAFC] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6A8081]">
                    Horário
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-[#1F2D2E]">{jobTime}</p>
                </div>
              )}
            </div>

            {job.description && (
              <div className="mt-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6A8081]">
                  Descrição
                </p>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-[#475D5E]">
                  {job.description}
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3">
              {!user && (
                <>
                  <Link
                    href={signupHref}
                    className="inline-flex items-center justify-center rounded-xl bg-[#1F2D2E] px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#2D4142]"
                  >
                    Candidatar-se
                  </Link>
                  <Link
                    href={loginHref}
                    className="inline-flex items-center justify-center rounded-xl border border-[#DDE6E6] bg-white px-5 py-3 text-[14px] font-bold text-[#1F2D2E] transition-colors hover:border-[#B8D4D4]"
                  >
                    Já tenho conta
                  </Link>
                </>
              )}

              {user && isTalent && (
                <Link
                  href={nextPath}
                  className="inline-flex items-center justify-center rounded-xl bg-[#1F2D2E] px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#2D4142]"
                >
                  Candidatar-se
                </Link>
              )}

              {user && isAgencyOrAdmin && (
                <>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center rounded-xl bg-zinc-200 px-5 py-3 text-[14px] font-bold text-zinc-500 cursor-not-allowed"
                  >
                    Candidatar-se
                  </button>
                  <p className="text-[14px] text-[#5E7374]">
                    Entre como talento para se candidatar.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
