"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/LanguageContext";

export type Job = {
  id: string;
  title: string;
  category: string;
  budget: number;
  deadline: string;
  jobDate: string | null;
  description: string;
  status: "open" | "closed" | "draft" | "inactive";
  visibility: "public" | "private";
  applicants: number;
  talentsNeeded: number;
  talentsSelected: number;
  postedAt: string;
};


// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBudget(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDeadline(raw: string) {
  return new Date(raw + "T00:00:00").toLocaleDateString("pt-BR", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(raw: string) {
  const diff = new Date(raw + "T00:00:00").getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const STATUS_STYLES: Record<Job["status"], string> = {
  open:     "bg-[#D1F4EB] text-[#0A7A5A] ring-1 ring-[#A7E8D6]/60",
  closed:   "bg-[#E6F0F0] text-[#647B7B] ring-1 ring-[#DDE6E6]",
  draft:    "bg-[#F8FAFC] text-[#647B7B] ring-1 ring-[#DDE6E6]",
  inactive: "bg-[#E6F0F0] text-[#B8D4D4] ring-1 ring-[#DDE6E6]",
};

// ─── Job Card ─────────────────────────────────────────────────────────────────

const JOB_STATUS_LABEL: Record<Job["status"], string> = {
  open:     "Aberta",
  closed:   "Fechada",
  draft:    "Rascunho",
  inactive: "Inativa",
};

function JobCard({ job, onUpdate, onRemove }: {
  job: Job;
  onUpdate: (id: string, patch: Partial<Job>) => void;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();
  const { t, lang } = useT();
  const [menuOpen, setMenuOpen]     = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const days = daysUntil(job.deadline);
  const urgent = days <= 7 && days > 0 && job.status === "open";

  async function handleStatusChange(newStatus: Job["status"]) {
    setMenuOpen(false);
    setStatusBusy(true);
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setStatusBusy(false);
    if (res.ok) {
      onUpdate(job.id, { status: newStatus });
      router.refresh();
    }
  }

  async function handleDelete() {
    if (!confirm(t("jobs_confirm_delete"))) return;
    setDeleting(true);
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hard: true }),
    });
    setDeleting(false);
    if (res.ok) {
      onRemove(job.id);
      router.refresh();
    }
  }

  return (
    <div className="group bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(7,17,13,0.06)] flex flex-col hover:-translate-y-0.5 hover:border-zinc-200 hover:shadow-[0_18px_46px_rgba(7,17,13,0.10)] transition-all duration-200">
      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            {job.visibility === "private" && (
              <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
            <h3 className="text-[16px] font-black text-zinc-950 leading-snug group-hover:text-zinc-700 transition-colors truncate">
              {job.title}
            </h3>
          </div>
          <span className={`flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_STYLES[job.status]}`}>
            {lang === "en" ? job.status : (JOB_STATUS_LABEL[job.status] ?? job.status)}
          </span>
        </div>

        {/* Category */}
        <span className="self-start text-[11px] font-semibold bg-zinc-50 text-zinc-500 ring-1 ring-zinc-100 px-2.5 py-1 rounded-full">
          {job.category}
        </span>

        {/* Description excerpt */}
        <p className="text-[13px] text-zinc-500 leading-relaxed line-clamp-2 flex-1">
          {job.description}
        </p>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-zinc-50 text-[12px]">
          {/* Budget */}
          <div className="flex items-center gap-1.5 text-[#0A7A5A] font-black bg-[#D1F4EB] px-2.5 py-1 rounded-full">
            <svg className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatBudget(job.budget)}
          </div>

          {/* Deadline */}
          <div className={`flex items-center gap-1.5 ${urgent ? "text-rose-500 font-medium" : "text-zinc-400"}`}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[#647B7B] text-[11px] mr-0.5">{t("jobs_apply_by")}</span>
            {urgent ? `${days}d left` : formatDeadline(job.deadline)}
          </div>

          {/* Job date */}
          {job.jobDate && (
            <div className="flex items-center gap-1.5 text-zinc-500 font-medium">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {formatDeadline(job.jobDate)}
            </div>
          )}

          {/* Applicants count */}
          {job.applicants > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded-full bg-zinc-50 text-zinc-500">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {job.applicants} {t("jobs_applicants")}
            </div>
          )}

          {/* Talent slots */}
          <div className={[
            "flex items-center gap-1.5 ml-auto text-[12px] font-medium px-2 py-0.5 rounded-full",
            job.talentsSelected >= job.talentsNeeded
              ? "bg-emerald-50 text-emerald-600"
            : job.talentsSelected > 0
              ? "bg-zinc-50 text-zinc-500"
              : "bg-zinc-100 text-zinc-400",
          ].join(" ")}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
            {job.talentsSelected}/{job.talentsNeeded} {t("jobs_selected")}
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 mt-1">
          <Link
            href={`/agency/jobs/${job.id}`}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] active:scale-[0.98] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl transition-all duration-150 shadow-[0_6px_16px_rgba(26,188,156,0.28)]"
          >
            {t("action_view")}
          </Link>

          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              disabled={statusBusy}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-200 hover:border-zinc-300 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
              title={t("jobs_change_status")}
            >
              {statusBusy ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
            {menuOpen && (
              <div className="absolute bottom-full right-0 mb-1.5 w-36 bg-white rounded-xl border border-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.1)] z-10 overflow-hidden">
                {(["open", "inactive", "closed", "draft"] as Job["status"][]).map((s) => {
                  const label = lang === "en" ? s : (JOB_STATUS_LABEL[s] ?? s);
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className={[
                        "w-full text-left px-3.5 py-2.5 text-[12px] font-medium hover:bg-zinc-50 transition-colors cursor-pointer capitalize",
                        job.status === s ? "text-zinc-900 bg-zinc-50" : "text-zinc-600",
                      ].join(" ")}
                    >
                      {s === job.status ? `✓ ${label}` : label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-zinc-200 hover:border-rose-200 hover:bg-rose-50 text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer disabled:opacity-40"
            title="Delete job"
          >
            {deleting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["All", "Open", "Draft", "Closed", "Inactive"] as const;
const STATUS_LABELS: Record<typeof STATUS_OPTIONS[number], string> = {
  All: "Todas", Open: "Aberta", Draft: "Rascunho", Closed: "Fechada", Inactive: "Inativa",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function JobList({ jobs: initial }: { jobs: Job[] }) {
  const [jobs, setJobs]     = useState(initial);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<typeof STATUS_OPTIONS[number]>("All");
  const [showSecondary, setShowSecondary] = useState(false);
  const { t } = useT();

  function handleUpdate(id: string, patch: Partial<Job>) {
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, ...patch } : j));
  }

  function handleRemove(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  const matchesSearch = (j: Job) =>
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    j.category.toLowerCase().includes(search.toLowerCase());

  const searchedJobs = jobs.filter(matchesSearch);
  const openJobs = searchedJobs.filter((j) => j.status === "open");
  const secondaryJobs = searchedJobs.filter((j) => j.status !== "open");

  const filtered = jobs.filter((j) => {
    const matchSearch =
      matchesSearch(j);
    const matchStatus =
      status === "All" || j.status === status.toLowerCase();
    return matchSearch && matchStatus;
  });

  return (
    <div className="max-w-5xl space-y-8">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-[-0.04em] text-zinc-950">{t("page_jobs")}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {jobs.filter((j) => j.status === "open").length} {t("jobs_open_positions")}
          </p>
        </div>
        <Link
          href="/agency/post-job"
          className="flex-shrink-0 inline-flex items-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] active:scale-[0.98] text-white text-[13px] font-bold px-4 py-2.5 rounded-xl transition-all duration-150 shadow-[0_6px_16px_rgba(26,188,156,0.28)]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("jobs_post_a_job")}
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar vagas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#DDE6E6] bg-white text-[14px] text-[#1F2D2E] placeholder:text-[#647B7B] hover:border-[#B8D4D4] focus:border-[#1ABC9C] focus:ring-2 focus:ring-[#1ABC9C]/20 focus:outline-none transition-colors duration-150"
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 bg-[#E6F0F0] p-1 rounded-xl flex-shrink-0">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={[
                "px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                status === s
                  ? "bg-[#1F2D2E] text-white shadow-sm"
                  : "text-[#647B7B] hover:text-[#1F2D2E]",
              ].join(" ")}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {status === "All" ? (
        searchedJobs.length > 0 ? (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[13px] font-black uppercase tracking-[0.18em] text-zinc-400">Vagas abertas</h2>
                  <p className="mt-1 text-[13px] text-zinc-500">Prioridade para acompanhar candidaturas e ações ativas.</p>
                </div>
                <span className="rounded-full bg-[#D1F4EB] px-3 py-1 text-[12px] font-bold text-[#0A7A5A]">
                  {openJobs.length}
                </span>
              </div>
              {openJobs.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {openJobs.map((job) => (
                    <JobCard key={job.id} job={job} onUpdate={handleUpdate} onRemove={handleRemove} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-100 bg-white py-12 text-center">
                  <p className="text-[14px] font-medium text-zinc-500">Nenhuma vaga aberta no momento</p>
                </div>
              )}
            </section>

            {secondaryJobs.length > 0 && (
              <section className="rounded-[1.5rem] border border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <button
                  type="button"
                  onClick={() => setShowSecondary((v) => !v)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <div>
                    <h2 className="text-[13px] font-black uppercase tracking-[0.18em] text-zinc-400">Outras vagas</h2>
                    <p className="mt-1 text-[13px] text-zinc-500">Rascunhos, vagas fechadas e inativas ficam separadas para reduzir ruído.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-[12px] font-bold text-zinc-600">
                      {secondaryJobs.length}
                    </span>
                    <svg className={`h-4 w-4 text-zinc-400 transition-transform ${showSecondary ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {showSecondary && (
                  <div className="grid grid-cols-1 gap-4 border-t border-zinc-50 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {secondaryJobs.map((job) => (
                      <JobCard key={job.id} job={job} onUpdate={handleUpdate} onRemove={handleRemove} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-zinc-500">Nenhuma vaga encontrada</p>
            <p className="text-[13px] text-zinc-400 mt-1">Tente uma busca diferente.</p>
          </div>
        )
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} onUpdate={handleUpdate} onRemove={handleRemove} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-zinc-500">Nenhuma vaga encontrada</p>
          <p className="text-[13px] text-zinc-400 mt-1">Tente uma busca ou filtro diferente.</p>
        </div>
      )}
    </div>
  );
}

