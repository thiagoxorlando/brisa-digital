"use client";

import Link from "next/link";
import { useState } from "react";
import { brl } from "@/lib/brl";
import { formatJobLocation } from "@/lib/jobLocation";

export type WorkspaceJob = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number | null;
  deadline: string | null;
  jobDate: string | null;
  location: string | null;
  createdAt: string;
  applied: boolean;
  submissionId: string | null;
  submissionStatus: string | null;
  canCancelApplication: boolean;
  cancelReason: string | null;
};

type Props = {
  jobs: WorkspaceJob[];
  workspaceSlug: string;
};

const STRIPES: Record<string, string> = {
  "Lifestyle & Fashion": "from-rose-400 to-pink-500",
  Technology: "from-sky-400 to-blue-500",
  "Food & Cooking": "from-amber-400 to-orange-500",
  "Health & Fitness": "from-emerald-400 to-teal-500",
  Travel: "from-indigo-400 to-violet-500",
  Beauty: "from-fuchsia-400 to-pink-500",
};

function getStripe(cat: string) {
  return STRIPES[cat] ?? "from-zinc-300 to-zinc-400";
}

function fmtDate(s: string | null) {
  if (!s) return null;
  try {
    return new Date(`${s}T00:00:00`).toLocaleDateString("pt-BR", { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

function JobCard({
  job,
  slug,
  onCancel,
  busy,
  feedback,
}: {
  job: WorkspaceJob;
  slug: string;
  onCancel: (job: WorkspaceJob) => void;
  busy: boolean;
  feedback: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const jobDate = fmtDate(job.jobDate);
  const deadline = fmtDate(job.deadline);
  const disableReason = job.canCancelApplication
    ? null
    : (job.cancelReason ?? "Esta candidatura não pode mais ser cancelada.");

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.07)]">
      <div className={`h-[3px] bg-gradient-to-r ${getStripe(job.category)}`} />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex-1">
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <h2 className="text-[15px] font-semibold leading-snug text-zinc-900">{job.title}</h2>
            <div className="flex flex-shrink-0 flex-col items-end gap-1">
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                Privada
              </span>
              {job.applied && (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                  Candidatado
                </span>
              )}
            </div>
          </div>
          {job.description && (
            <p className="line-clamp-2 text-[12px] leading-relaxed text-zinc-500">{job.description}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-[12px] text-zinc-400">
          {jobDate && (
            <span className="flex items-center gap-1 text-violet-600">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Data: {jobDate}
            </span>
          )}
          {deadline && (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Até {deadline}
            </span>
          )}
          {formatJobLocation(job.location) && (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {formatJobLocation(job.location)}
            </span>
          )}
        </div>

        {expanded && job.description && (
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
            <p className="whitespace-pre-line text-[12px] leading-relaxed text-zinc-600">{job.description}</p>
          </div>
        )}

        {job.applied && (
          <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-sky-700">
              Sua candidatura aparece nesta vaga. Você pode cancelá-la enquanto estiver em análise e sem contrato ativo.
            </p>
          </div>
        )}

        {feedback && (
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-rose-700">{feedback}</p>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-zinc-50 pt-3">
          <div className="flex items-center gap-3">
            {job.budget != null && (
              <span className="text-[13px] font-semibold text-emerald-600">{brl(job.budget)}</span>
            )}
            {job.description && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="text-[12px] text-zinc-400 transition-colors hover:text-zinc-600"
              >
                {expanded ? "Menos" : "Detalhes"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {job.applied ? (
              <button
                type="button"
                onClick={() => onCancel(job)}
                disabled={!job.canCancelApplication || busy}
                title={disableReason ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 disabled:hover:bg-white"
              >
                {busy ? "Cancelando..." : "Cancelar candidatura"}
              </button>
            ) : null}
            <Link
              href={`/talent/workspaces/${slug}/jobs/${job.id}`}
              className={`rounded-xl px-4 py-2 text-[12px] font-semibold transition-all duration-150 ${
                job.applied
                  ? "border border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100"
                  : "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white hover:from-[#17A58A] hover:to-[#22B5C2] active:scale-[0.97]"
              }`}
            >
              Ver vaga
            </Link>
          </div>
        </div>

        {job.applied && !job.canCancelApplication && disableReason && (
          <p className="text-right text-[11px] text-zinc-400">{disableReason}</p>
        )}
      </div>
    </div>
  );
}

export default function WorkspaceJobListClient({ jobs: initialJobs, workspaceSlug }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "available" | "applied">("all");
  const [jobs, setJobs] = useState(initialJobs);
  const [busySubmissionId, setBusySubmissionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string | null>>({});

  async function handleCancel(job: WorkspaceJob) {
    if (!job.submissionId || !job.applied || busySubmissionId) return;

    setBusySubmissionId(job.submissionId);
    setFeedback((current) => ({ ...current, [job.id]: null }));

    try {
      const res = await fetch(`/api/submissions/${job.submissionId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({})) as { error?: string };

      if (!res.ok) {
        setFeedback((current) => ({
          ...current,
          [job.id]: data.error ?? "Não foi possível cancelar esta candidatura.",
        }));
        return;
      }

      setJobs((current) =>
        current.map((entry) =>
          entry.id === job.id
            ? {
                ...entry,
                applied: false,
                submissionId: null,
                submissionStatus: null,
                canCancelApplication: false,
                cancelReason: null,
              }
            : entry,
        ),
      );
    } catch {
      setFeedback((current) => ({
        ...current,
        [job.id]: "Não foi possível cancelar esta candidatura.",
      }));
    } finally {
      setBusySubmissionId(null);
    }
  }

  const filtered = jobs.filter((job) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      job.title.toLowerCase().includes(q) ||
      (job.description ?? "").toLowerCase().includes(q) ||
      (job.location ?? "").toLowerCase().includes(q);
    const matchFilter =
      filter === "all" ||
      (filter === "applied" && job.applied) ||
      (filter === "available" && !job.applied);
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar vagas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
          />
        </div>
        <div className="flex gap-1 rounded-2xl border border-zinc-200 bg-white p-1">
          {(["all", "available", "applied"] as const).map((nextFilter) => (
            <button
              key={nextFilter}
              type="button"
              onClick={() => setFilter(nextFilter)}
              className={`rounded-xl px-3 py-1.5 text-[12px] font-medium transition-colors ${
                filter === nextFilter ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {nextFilter === "all" ? "Todas" : nextFilter === "available" ? "Disponíveis" : "Candidatadas"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-zinc-400">
        {filtered.length} vaga{filtered.length !== 1 ? "s" : ""}
        {search ? ` para "${search}"` : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-[22px] border border-zinc-200 bg-white px-6 py-12 text-center">
          <p className="text-[14px] font-semibold text-zinc-600">Nenhuma vaga encontrada.</p>
          <p className="mt-1 text-[13px] text-zinc-400">
            {search ? "Tente outros termos de busca." : "Novas vagas aparecerão aqui quando publicadas pela agência."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              slug={workspaceSlug}
              onCancel={handleCancel}
              busy={busySubmissionId === job.submissionId}
              feedback={feedback[job.id] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
