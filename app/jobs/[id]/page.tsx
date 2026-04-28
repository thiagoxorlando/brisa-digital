import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReferralClaimOnView from "@/components/referrals/ReferralClaimOnView";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";

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
    maximumFractionDigits: 0,
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

function encodeNext(path: string) {
  return encodeURIComponent(path);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = createServerClient({ useServiceRole: true });
  const { data } = await supabase.from("jobs").select("title").eq("id", id).maybeSingle();

  return {
    title: data?.title ? `${data.title} — BrisaHub` : "Oportunidade — BrisaHub",
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

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description, category, budget, deadline, agency_id, location, visibility, status")
    .eq("id", id)
    .maybeSingle();

  if (!job || job.status === "inactive") notFound();

  const { data: invite } = referralToken
    ? await supabase
        .from("referral_invites")
        .select("id, token, job_id, referrer_id, referred_user_id, status")
        .eq("token", referralToken)
        .eq("job_id", id)
        .neq("status", "fraud_reported")
        .maybeSingle()
    : { data: null };

  if (job.visibility === "private" && !invite) notFound();

  const [{ data: agency }, { data: referrer }] = await Promise.all([
    job.agency_id
      ? supabase.from("agencies").select("company_name").eq("id", job.agency_id).maybeSingle()
      : Promise.resolve({ data: null }),
    invite?.referrer_id
      ? supabase.from("talent_profiles").select("full_name").eq("id", invite.referrer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const nextPath = `/talent/jobs/${id}`;
  const signupHref = referralToken
    ? `/signup?role=talent&ref=${encodeURIComponent(referralToken)}&job=${encodeURIComponent(id)}&next=${encodeNext(nextPath)}`
    : `/signup?role=talent&next=${encodeNext(nextPath)}`;
  const loginHref = referralToken
    ? `/login?ref=${encodeURIComponent(referralToken)}&job=${encodeURIComponent(id)}&next=${encodeNext(nextPath)}`
    : `/login?next=${encodeNext(nextPath)}`;
  const dashboardHref = user ? nextPath : loginHref;
  const deadline = formatDate(job.deadline);

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#1F2D2E]">
      {referralToken && <ReferralClaimOnView token={referralToken} />}

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
            {job.location && (
              <span className="rounded-full border border-[#DDE6E6] bg-white px-3 py-1">
                {job.location}
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

          {referralToken && (
            <div className="mt-7 rounded-2xl border border-[#DDE6E6] bg-white px-5 py-4">
              <p className="text-[14px] leading-6 text-[#475D5E]">
                Para participar, crie sua conta ou faça login usando este link. Se esta indicação resultar em contratação/conclusão paga do job, quem indicou você poderá receber 2% de comissão conforme as regras da plataforma.
              </p>
            </div>
          )}

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
