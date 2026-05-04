"use client";

import Link from "next/link";
import { useState } from "react";

export type TalentJob = {
  id: string;
  title: string;
  category: string;
  budget: number;
  deadline: string;
  jobDate: string | null;
  description: string;
  location: string | null;
  applied?: boolean;
};

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(s: string | null) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const CATEGORY_STRIPES: Record<string, string> = {
  "Lifestyle & Fashion": "from-rose-400 to-pink-500",
  "Technology":          "from-sky-400 to-blue-500",
  "Food & Cooking":      "from-amber-400 to-orange-500",
  "Health & Fitness":    "from-emerald-400 to-teal-500",
  "Travel":              "from-indigo-400 to-violet-500",
  "Beauty":              "from-fuchsia-400 to-pink-500",
};

function stripe(cat: string) {
  return CATEGORY_STRIPES[cat] ?? "from-zinc-300 to-zinc-400";
}

function JobCard({ job }: { job: TalentJob }) {
  const [expanded, setExpanded] = useState(job.applied === true);
  const deadline = formatDate(job.deadline);
  const jobDate  = formatDate(job.jobDate);

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col hover:shadow-[0_4px_12px_rgba(0,0,0,0.07)] transition-shadow duration-200">
      <div className={`h-[3px] bg-gradient-to-r ${stripe(job.category)}`} />
      <div className="p-6 flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="text-[15px] font-semibold text-zinc-900 leading-snug">{job.title}</h2>
            <span className="text-[12px] font-medium bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-full flex-shrink-0">
              {job.category}
            </span>
          </div>
          <p className="text-[13px] text-zinc-500 leading-relaxed line-clamp-2">{job.description}</p>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-[12px] text-zinc-400">
          {deadline && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Candidatar até {deadline}
            </span>
          )}
          {jobDate && (
            <span className="flex items-center gap-1 text-violet-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Data da vaga: {jobDate}
            </span>
          )}
          {job.location && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {job.location}
            </span>
          )}
        </div>

        {/* Expanded description */}
        {expanded && (
          <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
            <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{job.description}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-50">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold text-emerald-600">{brl(job.budget)}</span>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[12px] text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              {expanded ? "Menos" : "Detalhes"}
            </button>
          </div>

          {job.applied ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Candidatado
            </span>
          ) : (
            <Link
              href={`/talent/jobs/${job.id}`}
              className="text-[12px] font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white transition-all duration-150 active:scale-[0.97]"
            >
              Candidatar-se
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function AppliedJobsList({ jobs }: { jobs: TalentJob[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-zinc-700">Vagas Candidatadas</h2>
        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{jobs.length}</span>
      </div>
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] divide-y divide-zinc-50 overflow-hidden">
        {jobs.map((job) => {
          const isOpen = openId === job.id;
          const deadline = formatDate(job.deadline);
          const jobDate  = formatDate(job.jobDate);
          return (
            <div key={job.id}>
              <button
                onClick={() => setOpenId(isOpen ? null : job.id)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-50/60 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-1 h-8 rounded-full bg-gradient-to-b flex-shrink-0 ${stripe(job.category)}`} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-800 truncate">{job.title}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{job.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[12px] font-semibold text-emerald-600">{brl(job.budget)}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Candidatado
                  </span>
                  <svg
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-1 bg-zinc-50/50 space-y-3">
                  <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{job.description}</p>
                  <div className="flex flex-wrap gap-3 text-[12px] text-zinc-400">
                    {deadline && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Candidatar até {deadline}
                      </span>
                    )}
                    {jobDate && (
                      <span className="flex items-center gap-1 text-violet-600">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Data da vaga: {jobDate}
                      </span>
                    )}
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {job.location}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function TalentJobList({ jobs }: { jobs: TalentJob[] }) {
  const toApply  = jobs.filter((j) => !j.applied);
  const applied  = jobs.filter((j) => j.applied);

  return (
    <div className="max-w-4xl space-y-8">

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Oportunidades</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Vagas</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{jobs.length} vaga{jobs.length !== 1 ? "s" : ""} disponíve{jobs.length !== 1 ? "is" : "l"}</p>
      </div>

      {/* Jobs to Apply */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-zinc-700">Vagas para se Candidatar</h2>
          <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">{toApply.length}</span>
        </div>
        {toApply.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {toApply.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 py-12 text-center">
            <p className="text-[14px] font-medium text-zinc-500">Você se candidatou a todas as vagas disponíveis</p>
            <p className="text-[13px] text-zinc-400 mt-1">Volte em breve para novas oportunidades.</p>
          </div>
        )}
      </section>

      {/* Applied Jobs — expandable list */}
      {applied.length > 0 && (
        <AppliedJobsList jobs={applied} />
      )}

      {jobs.length === 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-20 text-center">
          <div className="w-11 h-11 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-[#647B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-zinc-500">Nenhuma vaga disponível</p>
          <p className="text-[13px] text-zinc-400 mt-1">Volte em breve para novas oportunidades.</p>
        </div>
      )}
    </div>
  );
}


