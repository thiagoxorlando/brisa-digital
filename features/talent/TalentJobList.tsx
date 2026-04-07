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

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s: string | null) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
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
              Apply by {deadline}
            </span>
          )}
          {jobDate && (
            <span className="flex items-center gap-1 text-violet-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Job date: {jobDate}
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
            <span className="text-[13px] font-semibold text-emerald-600">{usd(job.budget)}</span>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[12px] text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              {expanded ? "Less" : "Details"}
            </button>
          </div>

          {job.applied ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Applied
            </span>
          ) : (
            <Link
              href={`/talent/jobs/${job.id}`}
              className="text-[12px] font-semibold px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white transition-all duration-150 active:scale-[0.97]"
            >
              Apply Now
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TalentJobList({ jobs }: { jobs: TalentJob[] }) {
  const toApply  = jobs.filter((j) => !j.applied);
  const applied  = jobs.filter((j) => j.applied);

  return (
    <div className="max-w-4xl space-y-8">

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Opportunities</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Jobs</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{jobs.length} open position{jobs.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Jobs to Apply */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-zinc-700">Jobs to Apply</h2>
          <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">{toApply.length}</span>
        </div>
        {toApply.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {toApply.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 py-12 text-center">
            <p className="text-[14px] font-medium text-zinc-500">You've applied to all available jobs</p>
            <p className="text-[13px] text-zinc-400 mt-1">Check back soon for new opportunities.</p>
          </div>
        )}
      </section>

      {/* Applied Jobs */}
      {applied.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-zinc-700">Applied Jobs</h2>
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{applied.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {applied.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </section>
      )}

      {jobs.length === 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-20 text-center">
          <div className="w-11 h-11 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-zinc-500">No jobs available</p>
          <p className="text-[13px] text-zinc-400 mt-1">Check back soon for new opportunities.</p>
        </div>
      )}
    </div>
  );
}
