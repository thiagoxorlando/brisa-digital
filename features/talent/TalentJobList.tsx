"use client";

import Link from "next/link";

export type TalentJob = {
  id: string;
  title: string;
  category: string;
  budget: number;
  deadline: string;
  description: string;
  applied?: boolean;
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
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

export default function TalentJobList({ jobs }: { jobs: TalentJob[] }) {
  return (
    <div className="max-w-4xl space-y-6">

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
          Opportunities
        </p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">
          Available Jobs
        </h1>
      </div>

      {jobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col hover:shadow-[0_4px_12px_rgba(0,0,0,0.07),0_12px_32px_rgba(0,0,0,0.05)] transition-shadow duration-200"
            >
              <div className={`h-[3px] bg-gradient-to-r ${stripe(job.category)}`} />
              <div className="p-6 flex flex-col gap-4 flex-1">
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h2 className="text-[15px] font-semibold text-zinc-900 leading-snug">{job.title}</h2>
                    <span className="text-[12px] font-medium bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-full flex-shrink-0">
                      {job.category}
                    </span>
                  </div>
                  <p className="text-[13px] text-zinc-500 leading-relaxed line-clamp-2">{job.description}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-zinc-50">
                  <div className="flex items-center gap-4">
                    <span className="text-[13px] font-semibold text-emerald-600">{usd(job.budget)}</span>
                    <span className="text-[12px] text-zinc-400">Due {formatDate(job.deadline)}</span>
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
                    View Job
                  </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] py-20 text-center">
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
