"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { brl } from "@/lib/brl";
import { jobStatusLabel, jobStatusTone } from "@/lib/jobStatus";
import WorkspacePrivateInviteButton from "@/features/agency/WorkspacePrivateInviteButton";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkspaceJob = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  budget: number | null;
  deadline: string | null;
  jobDate: string | null;
  jobTime: string | null;
  location: string | null;
  category: string | null;
  talentsRequired: number;
  createdAt: string;
  createdByUserId: string | null;
  createdByName: string;
  createdByRole: "owner" | "agent";
  submissionCount: number;
  pendingCount: number;
  contractCounts: { sent: number; signed: number; confirmed: number; paid: number };
};

type TabId = "all" | "mine" | "team" | "pending" | "active" | "paused" | "done";

// ─── Tab + filter logic ───────────────────────────────────────────────────────

function filterByTab(jobs: WorkspaceJob[], tab: TabId, userId: string): WorkspaceJob[] {
  switch (tab) {
    case "mine":    return jobs.filter((j) => j.createdByUserId === userId);
    case "team":    return jobs.filter((j) => j.createdByUserId !== userId);
    case "pending": return jobs.filter((j) => j.status === "open" && j.pendingCount > 0);
    case "active":  return jobs.filter((j) =>
      (j.contractCounts.sent + j.contractCounts.signed + j.contractCounts.confirmed) > 0 &&
      !["closed", "inactive"].includes(j.status)
    );
    case "paused": return jobs.filter((j) => j.status === "paused");
    case "done":   return jobs.filter((j) => ["closed", "inactive"].includes(j.status));
    default:       return jobs;
  }
}

function applyFilters(
  jobs: WorkspaceJob[],
  search: string,
  status: string,
  creator: string,
  type: string,
  category: string,
): WorkspaceJob[] {
  const q = search.toLowerCase();
  return jobs.filter((j) => {
    if (q && !j.title.toLowerCase().includes(q)) return false;
    if (status   && j.status      !== status)   return false;
    if (creator  && j.createdByUserId !== creator) return false;
    if (type     && j.visibility   !== type)    return false;
    if (category && j.category     !== category) return false;
    return true;
  });
}

function sortJobs(jobs: WorkspaceJob[], sort: string): WorkspaceJob[] {
  const arr = [...jobs];
  switch (sort) {
    case "oldest":      return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "date_asc":    return arr.sort((a, b) => (a.jobDate ?? "").localeCompare(b.jobDate ?? ""));
    case "date_desc":   return arr.sort((a, b) => (b.jobDate ?? "").localeCompare(a.jobDate ?? ""));
    case "budget_desc": return arr.sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0));
    default:            return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

type Section = { label: string; jobs: WorkspaceJob[]; pill: string };

function groupJobs(jobs: WorkspaceJob[], userId: string): Section[] {
  const action: WorkspaceJob[]    = [];
  const escrow: WorkspaceJob[]    = [];
  const mine: WorkspaceJob[]      = [];
  const team: WorkspaceJob[]      = [];
  const finished: WorkspaceJob[]  = [];

  for (const j of jobs) {
    if (["closed", "inactive", "paused"].includes(j.status)) {
      finished.push(j);
    } else if (j.pendingCount > 0 || j.contractCounts.sent > 0 || j.contractCounts.signed > 0) {
      action.push(j);
    } else if (j.contractCounts.confirmed > 0) {
      escrow.push(j);
    } else if (j.createdByUserId === userId) {
      mine.push(j);
    } else {
      team.push(j);
    }
  }

  const sections: Section[] = [];
  if (action.length)   sections.push({ label: "Aguardando ação",   jobs: action,   pill: "bg-amber-100 text-amber-800 ring-1 ring-amber-200" });
  if (escrow.length)   sections.push({ label: "Em andamento",      jobs: escrow,   pill: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200" });
  if (mine.length)     sections.push({ label: "Minhas vagas",       jobs: mine,     pill: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200" });
  if (team.length)     sections.push({ label: "Vagas da equipe",    jobs: team,     pill: "bg-zinc-100 text-zinc-700" });
  if (finished.length) sections.push({ label: "Encerradas",         jobs: finished, pill: "bg-zinc-100 text-zinc-500" });
  return sections;
}

// ─── Status config ────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
}

function shortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ─── Board ────────────────────────────────────────────────────────────────────

export default function WorkspaceJobsBoard({
  jobs: initialJobs,
  userId,
  isOwner,
  brandPrimary = "#1ABC9C",
  brandAccent  = "#27C1D6",
}: {
  jobs: WorkspaceJob[];
  userId: string;
  isOwner: boolean;
  brandPrimary?: string;
  brandAccent?: string;
}) {
  const [jobs, setJobs]           = useState<WorkspaceJob[]>(initialJobs);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [search, setSearch]       = useState("");
  const [statusF, setStatusF]     = useState("");
  const [creatorF, setCreatorF]   = useState("");
  const [typeF, setTypeF]         = useState("");
  const [categoryF, setCategoryF] = useState("");
  const [sort, setSort]           = useState("newest");
  const [statusChanging, setStatusChanging] = useState<string | null>(null);

  const creators = useMemo(() => {
    const map = new Map<string, string>();
    for (const j of jobs) if (j.createdByUserId) map.set(j.createdByUserId, j.createdByName);
    return Array.from(map.entries());
  }, [jobs]);

  const categories = useMemo(
    () => [...new Set(jobs.map((j) => j.category).filter(Boolean))] as string[],
    [jobs],
  );

  const tabCounts = useMemo(() => ({
    all:     jobs.length,
    mine:    jobs.filter((j) => j.createdByUserId === userId).length,
    team:    jobs.filter((j) => j.createdByUserId !== userId).length,
    pending: jobs.filter((j) => j.status === "open" && j.pendingCount > 0).length,
    active:  jobs.filter((j) =>
      (j.contractCounts.sent + j.contractCounts.signed + j.contractCounts.confirmed) > 0 &&
      !["closed", "inactive"].includes(j.status)
    ).length,
    paused:  jobs.filter((j) => j.status === "paused").length,
    done:    jobs.filter((j) => ["closed", "inactive"].includes(j.status)).length,
  }), [jobs, userId]);

  const visible = useMemo(() => {
    const byTab = filterByTab(jobs, activeTab, userId);
    const filt  = applyFilters(byTab, search, statusF, creatorF, typeF, categoryF);
    return sortJobs(filt, sort);
  }, [jobs, activeTab, search, statusF, creatorF, typeF, categoryF, sort, userId]);

  const sections = useMemo(
    () => (activeTab === "all" ? groupJobs(visible, userId) : null),
    [visible, activeTab, userId],
  );

  const hasFilters = !!(search || statusF || creatorF || typeF || categoryF);

  async function handleStatusChange(job: WorkspaceJob, next: "open" | "paused" | "closed") {
    setStatusChanging(job.id);
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setStatusChanging(null);
    if (res.ok) {
      setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: next } : j));
    }
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: "all",     label: "Todas" },
    { id: "mine",    label: "Minhas vagas" },
    { id: "team",    label: "Equipe" },
    { id: "pending", label: "Pendentes" },
    { id: "active",  label: "Em andamento" },
    { id: "paused",  label: "Pausadas" },
    { id: "done",    label: "Finalizadas" },
  ];

  const sel = "h-8 rounded-xl border border-zinc-200 bg-white px-3 text-[12px] text-zinc-700 focus:border-zinc-400 focus:outline-none transition-colors appearance-none cursor-pointer";

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[1.5rem] font-bold tracking-tight text-zinc-950 sm:text-[1.75rem]">
            Vagas privadas
          </h1>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            Gestão centralizada das vagas do workspace
          </p>
        </div>
        <Link
          href="/agency/workspace/jobs/new"
          style={{ background: `linear-gradient(135deg, ${brandPrimary}, ${brandAccent})` }}
          className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[14px] font-semibold text-white shadow-[0_14px_28px_rgba(26,188,156,0.24)] transition-all flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Criar vaga privada
        </Link>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
        <div className="flex border-b border-zinc-100 min-w-max">
          {TABS.map((tab) => {
            const count = tabCounts[tab.id];
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={active ? { borderBottomColor: brandPrimary, color: "inherit" } : undefined}
                className={[
                  "inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap cursor-pointer",
                  active
                    ? "text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-200",
                ].join(" ")}
              >
                {tab.label}
                {count > 0 && (
                  <span className={[
                    "rounded-full px-1.5 py-px text-[10px] font-bold leading-none",
                    active ? "bg-zinc-100 text-zinc-700" : "bg-zinc-100 text-zinc-500",
                  ].join(" ")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar vaga..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-52 rounded-xl border border-zinc-200 bg-white pl-8 pr-3 text-[12px] text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none transition-colors"
          />
        </div>

        {/* Status — hide on single-status tabs */}
        {!["paused", "done", "pending"].includes(activeTab) && (
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={sel}>
            <option value="">Status</option>
            <option value="open">Aberta</option>
            <option value="draft">Rascunho</option>
            <option value="paused">Pausada</option>
            <option value="closed">Fechada</option>
          </select>
        )}

        {/* Creator — owner only, >1 creator */}
        {isOwner && creators.length > 1 && (
          <select value={creatorF} onChange={(e) => setCreatorF(e.target.value)} className={sel}>
            <option value="">Criador</option>
            {creators.map(([uid, name]) => (
              <option key={uid} value={uid}>{name}</option>
            ))}
          </select>
        )}

        {/* Type */}
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className={sel}>
          <option value="">Visibilidade</option>
          <option value="private_invite">Privada</option>
          <option value="public">Pública</option>
        </select>

        {/* Category */}
        {categories.length > 1 && (
          <select value={categoryF} onChange={(e) => setCategoryF(e.target.value)} className={sel}>
            <option value="">Categoria</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* Sort */}
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={sel}>
          <option value="newest">Mais recentes</option>
          <option value="oldest">Mais antigas</option>
          <option value="date_asc">Data trabalho ↑</option>
          <option value="date_desc">Data trabalho ↓</option>
          <option value="budget_desc">Orçamento ↓</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSearch(""); setStatusF(""); setCreatorF(""); setTypeF(""); setCategoryF(""); }}
            className="text-[12px] text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Content */}
      {visible.length === 0 ? (
        <div className="rounded-[1.5rem] border border-zinc-100 bg-white px-6 py-12 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <p className="text-[15px] font-semibold text-zinc-800">Nenhuma vaga encontrada</p>
          <p className="mt-1 text-[13px] text-zinc-400">
            {hasFilters ? "Tente ajustar os filtros." : "Crie a primeira vaga do workspace."}
          </p>
        </div>
      ) : sections ? (
        /* Grouped view — "Todas" tab */
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${section.pill}`}>
                  {section.label}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {section.jobs.length} vaga{section.jobs.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-2">
                {section.jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    userId={userId}
                    isOwner={isOwner}
                    brandPrimary={brandPrimary}
                    statusChanging={statusChanging === job.id}
                    onStatusChange={(next) => handleStatusChange(job, next)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat view — all other tabs */
        <div className="space-y-2">
          {visible.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              userId={userId}
              isOwner={isOwner}
              brandPrimary={brandPrimary}
              statusChanging={statusChanging === job.id}
              onStatusChange={(next) => handleStatusChange(job, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Job card ─────────────────────────────────────────────────────────────────

function JobCard({
  job,
  userId,
  isOwner,
  brandPrimary = "#1ABC9C",
  statusChanging,
  onStatusChange,
}: {
  job: WorkspaceJob;
  userId: string;
  isOwner: boolean;
  brandPrimary?: string;
  statusChanging: boolean;
  onStatusChange: (next: "open" | "paused" | "closed") => void;
}) {
  const isCreator = job.createdByUserId === userId;
  const canManage = isOwner || isCreator;
  const activeContracts = job.contractCounts.sent + job.contractCounts.signed + job.contractCounts.confirmed + job.contractCounts.paid;
  const hasPaidContracts = job.contractCounts.paid > 0;
  const isFilled = activeContracts >= Math.max(1, Number(job.talentsRequired ?? 1) || 1);
  const canPause  = canManage && job.status === "open";
  const canResume = canManage && ["paused", "closed"].includes(job.status) && !hasPaidContracts && !isFilled;
  const days  = daysUntil(job.jobDate);
  const urgent = days !== null && days >= 0 && days <= 7;
  const past  = days !== null && days < 0;

  return (
    <div className={`rounded-2xl border px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all ${isCreator ? "bg-[#F5FCFB] border-[#C8E8E3] hover:border-[#A8D9D2]" : "bg-white border-zinc-200 hover:border-zinc-300"}`}>

      {/* Row 1: title + status + key meta */}
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <Link
          href={`/agency/workspace/jobs/${job.id}`}
          className="text-[14px] font-semibold text-zinc-900 hover:underline leading-snug"
        >
          {job.title}
        </Link>
        <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${jobStatusTone(job.status)}`}>
          {jobStatusLabel(job.status)}
        </span>
        {job.budget != null && (
          <span className="rounded-full bg-zinc-100 px-2 py-px text-[10px] font-semibold text-zinc-600">
            {brl(job.budget)}/talento
          </span>
        )}
        {job.jobDate && !past && (
          <Chip tone={urgent ? "rose" : "zinc"} icon={<CalIcon />}>
            {urgent ? `${days}d restantes` : shortDate(job.jobDate)}
          </Chip>
        )}
      </div>

      {/* Row 2: activity chips — only shown if there is activity */}
      {(job.submissionCount > 0 || activeContracts > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 mb-2.5">
          {job.submissionCount > 0 && (
            <Chip tone={job.pendingCount > 0 ? "amber" : "zinc"} icon={<PeopleIcon />}>
              {job.submissionCount} candidato{job.submissionCount !== 1 ? "s" : ""}
              {job.pendingCount > 0 ? ` · ${job.pendingCount} pendente${job.pendingCount !== 1 ? "s" : ""}` : ""}
            </Chip>
          )}
          {(job.contractCounts.sent + job.contractCounts.signed) > 0 && (
            <Chip tone="amber" icon={<DocIcon />}>
              {job.contractCounts.sent + job.contractCounts.signed} aguardando
            </Chip>
          )}
          {job.contractCounts.confirmed > 0 && (
            <Chip tone="indigo" icon={<LockIcon />}>
              {job.contractCounts.confirmed} em custódia
            </Chip>
          )}
          {job.contractCounts.paid > 0 && (
            <Chip tone="emerald" icon={<CheckIcon />}>
              {job.contractCounts.paid} pago{job.contractCounts.paid !== 1 ? "s" : ""}
            </Chip>
          )}
        </div>
      )}

      {/* Row 3: actions */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <Link
          href={`/agency/workspace/jobs/${job.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Ver candidatos
          {job.pendingCount > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-bold text-white leading-none">
              {job.pendingCount}
            </span>
          )}
        </Link>

        {canManage && <WorkspacePrivateInviteButton jobId={job.id} />}

        {canPause && (
          <button
            type="button"
            onClick={() => onStatusChange("paused")}
            disabled={statusChanging}
            className="inline-flex items-center rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            {statusChanging ? "..." : "Pausar"}
          </button>
        )}

        {canResume && (
          <button
            type="button"
            onClick={() => onStatusChange("open")}
            disabled={statusChanging}
            className="inline-flex items-center rounded-lg border border-emerald-200 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
          >
            {statusChanging ? "..." : "Reabrir"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ tone, icon, children }: {
  tone: "zinc" | "amber" | "indigo" | "emerald" | "rose" | "muted";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls: Record<string, string> = {
    zinc:    "bg-zinc-100 text-zinc-600",
    amber:   "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    indigo:  "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    rose:    "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
    muted:   "bg-zinc-50 text-zinc-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls[tone]}`}>
      <span className="w-3 h-3 flex-shrink-0">{icon}</span>
      {children}
    </span>
  );
}

// ─── Micro icons ──────────────────────────────────────────────────────────────

const PeopleIcon  = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" /></svg>;
const ClockIcon   = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const DocIcon     = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const PenIcon     = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
const LockIcon    = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
const CheckIcon   = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
const CalIcon     = () => <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
