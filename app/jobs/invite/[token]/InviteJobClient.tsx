"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatJobLocation } from "@/lib/jobLocation";

type JobData = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: string;
  deadline: string | null;
  jobDate: string | null;
  jobTime: string | null;
  location: string | null;
};

type Props = {
  token: string;
  job: JobData;
  workspaceSlug: string | null;
  workspaceName: string | null;
  workspaceWelcome: string | null;
  workspaceLogoUrl: string | null;
  workspacePrimaryColor: string | null;
  workspaceAccentColor: string | null;
  agencyName: string | null;
  isLoggedIn: boolean;
  userRole: string | null;
};

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-2 text-[14px] font-semibold text-zinc-800">{value}</p>
    </div>
  );
}

export default function InviteJobClient({
  token,
  job,
  workspaceSlug,
  workspaceName,
  workspaceWelcome,
  workspaceLogoUrl,
  workspacePrimaryColor,
  workspaceAccentColor,
  agencyName,
  isLoggedIn,
  userRole,
}: Props) {
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = workspaceName ?? agencyName ?? "Espaço Premium";
  const next = encodeURIComponent(`/jobs/invite/${token}`);
  const primary = workspacePrimaryColor ?? "#1ABC9C";
  const accent = workspaceAccentColor ?? workspacePrimaryColor ?? "#27C1D6";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  async function handleApply() {
    setError(null);
    setApplying(true);
    const invite = encodeURIComponent(token);
    const href = workspaceSlug
      ? `/talent/workspaces/${workspaceSlug}/jobs/${job.id}?invite=${invite}`
      : `/talent/jobs/${job.id}?invite=${invite}`;
    router.push(href);
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#F3F7F8_0%,#FFFFFF_100%)] text-[#1F2D2E]">
      <div className="h-1" style={{ background: `linear-gradient(to right, ${primary}, ${accent})` }} />

      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-[15px] font-bold tracking-tight text-[#1F2D2E]">
            BrisaHub
          </Link>
          {!isLoggedIn ? (
            <Link href={`/login?next=${next}`} className="text-[13px] font-semibold text-[#0E7C86] hover:underline">
              Entrar
            </Link>
          ) : null}
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-[0_18px_46px_rgba(15,23,42,0.07)]">
            <div
              className="px-6 py-8 text-white sm:px-8"
              style={{
                background: `radial-gradient(circle at top left, ${primary}55, transparent 28%), linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
              }}
            >
              <div className="flex items-start gap-4">
                {workspaceLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={workspaceLogoUrl} alt={displayName} className="h-16 w-16 rounded-2xl border border-white/20 object-cover shadow-lg" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/12 text-[18px] font-bold text-white shadow-lg">
                    {initials || "EP"}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="inline-flex items-center rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                    Convite privado
                  </span>
                  <h1 className="mt-3 text-[2rem] font-bold tracking-tight sm:text-[2.4rem]">
                    {job.title}
                  </h1>
                  <p className="mt-2 text-[14px] leading-6 text-white/80">
                    {displayName}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6 sm:px-8">
              {workspaceWelcome ? (
                <div className="rounded-2xl border px-4 py-4" style={{ borderColor: `${primary}25`, background: `${primary}08` }}>
                  <p className="text-[14px] leading-7 text-[#415556]">{workspaceWelcome}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4">
                  <p className="text-[13px] text-zinc-500">
                    Convite privado enviado para uma seleção exclusiva dentro do Espaço Premium.
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {job.category ? <InfoCard label="Categoria" value={job.category} /> : null}
                <InfoCard label="Cachê" value={job.budget} />
                {formatJobLocation(job.location) ? <InfoCard label="Local" value={formatJobLocation(job.location)!} /> : null}
                {job.deadline ? <InfoCard label="Prazo" value={job.deadline} /> : null}
                {job.jobDate ? <InfoCard label="Data" value={`${job.jobDate}${job.jobTime ? ` às ${job.jobTime}` : ""}`} /> : null}
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Sobre a vaga</p>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-[#475D5E]">
                  {job.description || "Mais detalhes serão compartilhados durante o processo com a agência responsável."}
                </p>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Candidatura</p>
              <p className="mt-2 text-[16px] font-semibold text-zinc-900">
                Candidate-se à vaga privada
              </p>
              <p className="mt-2 text-[13px] leading-6 text-zinc-500">
                Sua candidatura será enviada diretamente para a equipe responsável dentro do Espaço Premium.
              </p>

              <div className="mt-5 space-y-3">
                {isLoggedIn && userRole === "talent" ? (
                  <>
                    {error ? (
                      <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] text-rose-600">
                        {error}
                      </p>
                    ) : null}
                    <button
                      onClick={handleApply}
                      disabled={applying}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_30px_rgba(26,188,156,0.20)] transition-all hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: `linear-gradient(to right, ${primary}, ${accent})` }}
                    >
                      {applying ? "Redirecionando..." : "Candidatar-se"}
                    </button>
                  </>
                ) : isLoggedIn && userRole !== "talent" ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
                    <p className="text-[13px] font-medium text-amber-800">
                      Entre com uma conta de talento para se candidatar.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] leading-6 text-zinc-500">
                      Entre ou crie uma conta para se candidatar.
                    </p>
                    <div className="space-y-2">
                      <Link
                        href={`/login?next=${next}`}
                        className="inline-flex w-full items-center justify-center rounded-2xl bg-[#1F2D2E] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-zinc-700"
                      >
                        Entrar
                      </Link>
                      <Link
                        href={`/signup?role=talent&next=${next}`}
                        className="inline-flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-[14px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
                      >
                        Criar conta
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Convite privado</p>
              <div className="mt-3 space-y-2 text-[13px] text-zinc-600">
                <p>Seleção exclusiva dentro do Espaço Premium.</p>
                <p>Vaga privada visível apenas por este convite.</p>
                <p>Fluxo direto com a equipe da agência.</p>
              </div>
            </div>

            <p className="text-center text-[12px] text-zinc-400">
              Powered by{" "}
              <Link href="/" className="font-semibold text-zinc-500 transition-colors hover:text-zinc-700">
                BrisaHub
              </Link>
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
