"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtMoney } from "@/lib/brl";
import { formatJobLocation } from "@/lib/jobLocation";
import { submissionStatusLabel, submissionStatusTone } from "@/lib/submissionStatus";
import { useT } from "@/lib/LanguageContext";

export type TalentJob = {
  id:               string;
  title:            string;
  category:         string;
  budget:           number;
  deadline:         string;
  jobDate:          string | null;
  description:      string;
  location:         string | null;
  applied?:         boolean;
  submissionStatus?: string | null;
};

type FilterTab = "open" | "applied" | "all";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(s: string | null, lang: string) {
  if (!s) return null;
  const locale = String(lang) === "en" ? "en-US" : "pt-BR";
  return new Date(s + "T00:00:00").toLocaleDateString(locale, {
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

// ── Segmented filter ──────────────────────────────────────────────────────────

function SegmentedFilter({
  value, onChange, counts, lang,
}: {
  value:    FilterTab;
  onChange: (v: FilterTab) => void;
  counts:   { open: number; applied: number; all: number };
  lang:     "pt-BR" | "en";
}) {
  const tabs: Array<{ key: FilterTab; label: string }> = [
    { key: "open",    label: lang === "en" ? "Open to apply"   : "Para candidatar" },
    { key: "applied", label: lang === "en" ? "Already applied" : "Já candidatei" },
    { key: "all",     label: lang === "en" ? "All"             : "Todas" },
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1 w-fit">
      {tabs.map((tab) => {
        const isActive = value === tab.key;
        const count = counts[tab.key];
        const countCls = isActive
          ? (tab.key === "applied" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-600")
          : "bg-zinc-200/50 text-zinc-400";
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all whitespace-nowrap",
              isActive
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700 hover:bg-white/60",
            ].join(" ")}
          >
            {tab.label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${countCls}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({ job, lang }: { job: TalentJob; lang: "pt-BR" | "en" }) {
  const [expanded, setExpanded] = useState(false);
  const deadline = formatDate(job.deadline, lang);
  const jobDate  = formatDate(job.jobDate, lang);
  const statusLabel = job.submissionStatus
    ? submissionStatusLabel(job.submissionStatus, lang)
    : null;
  const statusTone = job.submissionStatus ? submissionStatusTone(job.submissionStatus) : "";

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
              {lang === "en" ? "Apply by" : "Candidatar até"} {deadline}
            </span>
          )}
          {jobDate && (
            <span className="flex items-center gap-1 text-violet-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {lang === "en" ? "Job date:" : "Data da vaga:"} {jobDate}
            </span>
          )}
          {formatJobLocation(job.location) && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {formatJobLocation(job.location)}
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
            <span className="text-[13px] font-semibold text-emerald-600">{fmtMoney(job.budget, lang)}</span>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[12px] text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              {expanded ? (lang === "en" ? "Less" : "Menos") : (lang === "en" ? "Details" : "Detalhes")}
            </button>
          </div>

          {job.applied && statusLabel ? (
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-xl ${statusTone}`}>
              {job.submissionStatus !== "rejected" && job.submissionStatus !== "cancelled" && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {statusLabel}
            </span>
          ) : (
            <Link
              href={`/talent/jobs/${job.id}`}
              className="text-[12px] font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white transition-all duration-150 active:scale-[0.97]"
            >
              {lang === "en" ? "Apply" : "Candidatar-se"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filter, lang }: { filter: FilterTab; lang: "pt-BR" | "en" }) {
  const msgs = {
    open:    lang === "en"
      ? { title: "No open jobs", sub: "Check back soon for new opportunities." }
      : { title: "Você se candidatou a todas as vagas", sub: "Volte em breve para novas oportunidades." },
    applied: lang === "en"
      ? { title: "No applications yet", sub: "Browse open jobs and apply." }
      : { title: "Você ainda não se candidatou a nenhuma vaga", sub: "Explore as vagas disponíveis e candidate-se." },
    all:     lang === "en"
      ? { title: "No jobs available", sub: "Check back soon for new opportunities." }
      : { title: "Nenhuma vaga disponível", sub: "Volte em breve para novas oportunidades." },
  };
  const { title, sub } = msgs[filter];

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-16 text-center">
      <div className="w-11 h-11 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4 border border-zinc-100">
        <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-[14px] font-medium text-zinc-600">{title}</p>
      <p className="text-[13px] text-zinc-400 mt-1">{sub}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TalentJobList({ jobs }: { jobs: TalentJob[] }) {
  const { lang } = useT();
  const [filter, setFilter] = useState<FilterTab>("open");

  const openJobs    = jobs.filter((j) => !j.applied);
  const appliedJobs = jobs.filter((j) => !!j.applied);

  const visibleJobs =
    filter === "open"    ? openJobs :
    filter === "applied" ? appliedJobs :
    jobs;

  return (
    <div className="max-w-4xl space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
            {lang === "en" ? "Opportunities" : "Oportunidades"}
          </p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">
            {lang === "en" ? "Jobs" : "Vagas"}
          </h1>
          <p className="text-[13px] text-zinc-400 mt-1">
            {visibleJobs.length}
            {lang === "en"
              ? ` job${visibleJobs.length !== 1 ? "s" : ""}`
              : ` vaga${visibleJobs.length !== 1 ? "s" : ""}`
            }
          </p>
        </div>

        <SegmentedFilter
          value={filter}
          onChange={setFilter}
          counts={{ open: openJobs.length, applied: appliedJobs.length, all: jobs.length }}
          lang={lang}
        />
      </div>

      {/* Job grid */}
      {visibleJobs.length === 0 ? (
        <EmptyState filter={filter} lang={lang} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {visibleJobs.map((job) => (
            <JobCard key={job.id} job={job} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}
