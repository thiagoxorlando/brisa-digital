"use client";

import { useState } from "react";

export type AdminJob = {
  id: string;
  title: string;
  category: string | null;
  budget: number | null;
  deadline: string | null;
  created_at: string;
  status: string;
  agencyName: string;
  submissionCount: number;
  description: string | null;
  location: string | null;
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
  jobDate: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  open:     "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
  closed:   "bg-zinc-100   text-zinc-500   ring-1 ring-zinc-200",
  draft:    "bg-amber-50   text-amber-600  ring-1 ring-amber-100",
  inactive: "bg-zinc-100   text-zinc-400   ring-1 ring-zinc-200",
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatJobDate(s: string | null) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function DetailGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-[12px]">
      {items.map(({ label, value }) => (
        <div key={label}>
          <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">{label}</p>
          <p className="text-zinc-700 font-medium">{value}</p>
        </div>
      ))}
    </div>
  );
}

function JobRow({ job }: { job: AdminJob }) {
  const [expanded, setExpanded] = useState(false);
  const stCls = STATUS_STYLES[job.status] ?? STATUS_STYLES["closed"];

  const detailItems = [
    { label: "Agency",      value: job.agencyName },
    { label: "Status",      value: job.status },
    { label: "Budget",      value: job.budget ? usd(job.budget) : "—" },
    { label: "Applications",value: String(job.submissionCount) },
    { label: "Category",    value: job.category ?? "—" },
    { label: "Location",    value: job.location ?? "—" },
    { label: "Gender",      value: job.gender ?? "—" },
    { label: "Age Range",   value: job.ageMin || job.ageMax ? `${job.ageMin ?? "Any"} – ${job.ageMax ?? "Any"}` : "—" },
    { label: "Job Date",    value: formatJobDate(job.jobDate) ?? "—" },
    { label: "Deadline",    value: formatDate(job.deadline) },
    { label: "Posted",      value: formatDate(job.created_at) },
  ];

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        className="hover:bg-zinc-50/60 transition-colors cursor-pointer"
      >
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <svg className={`w-3.5 h-3.5 text-zinc-300 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[180px]">{job.title}</p>
          </div>
        </td>
        <td className="px-4 py-4">
          <span className="text-[13px] text-zinc-500 truncate max-w-[160px] block">{job.agencyName}</span>
        </td>
        <td className="px-4 py-4 hidden sm:table-cell">
          <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${stCls}`}>
            {job.status}
          </span>
        </td>
        <td className="px-4 py-4 hidden sm:table-cell">
          {job.category
            ? <span className="text-[11px] font-medium bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-full">{job.category}</span>
            : <span className="text-[13px] text-zinc-300">—</span>
          }
        </td>
        <td className="px-4 py-4 text-right hidden md:table-cell">
          <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">
            {job.budget ? usd(job.budget) : "—"}
          </span>
        </td>
        <td className="px-4 py-4 text-right hidden md:table-cell">
          <span className="text-[13px] text-zinc-500 tabular-nums">{job.submissionCount}</span>
        </td>
        <td className="px-4 py-4 hidden lg:table-cell">
          <span className="text-[13px] text-zinc-500">{job.deadline ? formatDate(job.deadline) : "—"}</span>
        </td>
        <td className="px-4 py-4 hidden lg:table-cell">
          <span className="text-[12px] text-zinc-400">{formatDate(job.created_at)}</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="px-0 py-0">
            <div className="border-t border-zinc-50 bg-zinc-50/60 px-6 py-5 space-y-4">
              <DetailGrid items={detailItems} />
              {job.description && (
                <div>
                  <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-1">Description</p>
                  <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line max-w-2xl">{job.description}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminJobs({ jobs }: { jobs: AdminJob[] }) {
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = jobs.filter((j) => {
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    if (!matchStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      (j.category ?? "").toLowerCase().includes(q) ||
      j.agencyName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl space-y-6">

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Platform Admin</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Jobs</h1>
          <p className="text-[13px] text-zinc-400 mt-1">{jobs.length} total jobs</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 bg-zinc-100 px-3 py-1.5 rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Read-only
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search jobs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start flex-shrink-0">
          {(["all", "open", "draft", "closed", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all capitalize cursor-pointer whitespace-nowrap",
                statusFilter === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap">Title</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap">Agency</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap hidden sm:table-cell">Category</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap hidden md:table-cell">Budget</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap hidden md:table-cell">Apps</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap hidden lg:table-cell">Deadline</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap hidden lg:table-cell">Posted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">No jobs found</p>
                    <p className="text-[13px] text-zinc-400 mt-1">Try adjusting your search or filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3.5 border-t border-zinc-100 bg-zinc-50/50">
          <p className="text-[12px] text-zinc-400 font-medium">{filtered.length} of {jobs.length} jobs</p>
        </div>
      </div>
    </div>
  );
}
