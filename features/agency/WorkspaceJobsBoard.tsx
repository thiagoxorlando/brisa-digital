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

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function avatarColor(str: string): string {
  const palette = [
    "from-[#1ABC9C] to-[#27C1D6]",
    "from-violet-500 to-purple-600",
    "from-amber-400 to-orange-500",
    "from-pink-500 to-rose-500",
    "from-sky-500 to-blue-600",
    "from-teal-500 to-cyan-600",
  ];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

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
}: {
  jobs: WorkspaceJob[];
  userId: string;
  isOwner: boolean;
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
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_14px_28px_rgba(26,188,156,0.24)] hover:from-[#17A58A] hover:to-[#22B5C2] transition-all flex-shrink-0"
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
                className={[
                  "inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap cursor-pointer",
                  active
                    ? "border-[#1ABC9C] text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-200",
                ].join(" ")}
              >
                {tab.label}
                {count > 0 && (
                  <span className={[
                    "rounded-full px-1.5 py-px text-[10px] font-bold leading-none",
                    active ? "bg-[#1ABC9C]/15 text-[#1ABC9C]" : "bg-zinc-100 text-zinc-500",
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
  statusChanging,
  onStatusChange,
}: {
  job: WorkspaceJob;
  userId: string;
  isOwner: boolean;
  statusChanging: boolean;
  onStatusChange: (next: "open" | "paused" | "closed") => void;
}) {
  const isCreator  = job.createdByUserId === userId;
  const canManage  = isOwner || isCreator;
  const activeContracts = job.contractCounts.sent + job.contractCounts.signed + job.contractCounts.confirmed + job.contractCounts.paid;
  const hasPaidContracts = job.contractCounts.paid > 0;
  const isFilled = activeContracts >= Math.max(1, Number(job.talentsRequired ?? 1) || 1);
  const canEdit = canManage && !["closed", "inactive"].includes(job.status);
  const canPause = canManage && job.status === "open";
  const canClose = canManage && !["closed", "inactive"].includes(job.status);
  const canResume = canManage && ["paused", "closed"].includes(job.status) && !hasPaidContracts && !isFilled;
  const canInvite  = canManage;
  const days    = daysUntil(job.jobDate);
  const urgent  = days !== null && days >= 0 && days <= 7;
  const past    = days !== null && days < 0;
  const manageReason = !canManage
    ? "Somente o owner ou o agente criador pode gerenciar esta vaga."
    : hasPaidContracts
      ? "Esta vaga já possui reserva paga e não pode ser reaberta."
      : isFilled
        ? "A vaga já preencheu o número de talentos necessários."
        : null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-zinc-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all">
      <div className="flex items-start gap-3">

        {/* Creator avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br ${avatarColor(job.createdByName)} flex items-center justify-center text-[10px] font-bold text-white mt-0.5`}>
          {initials(job.createdByName)}
        </div>

        <div className="flex-1 min-w-0">

          {/* Title + status badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Link
              href={`/agency/workspace/jobs/${job.id}`}
              className="text-[14px] font-semibold text-zinc-900 hover:text-[#1ABC9C] transition-colors leading-snug"
            >
              {job.title}
            </Link>
            <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${jobStatusTone(job.status)}`}>
              {jobStatusLabel(job.status)}
            </span>
            {job.visibility === "private_invite" ? (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-px text-[10px] font-semibold text-violet-700">
                Privada
              </span>
            ) : (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-px text-[10px] font-semibold text-sky-700">
                Pública
              </span>
            )}
            {isCreator && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-px text-[10px] font-semibold text-emerald-700">
                Minha
              </span>
            )}
          </div>

          {/* Creator + meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-zinc-500 mb-2">
            <span>
              <span className="font-medium text-zinc-700">{job.createdByName}</span>
              <span className="ml-1 text-zinc-400">
                {job.createdByRole === "owner" ? "· Proprietário" : "· Agente"}
              </span>
            </span>
            {job.budget != null && (
              <span className="font-semibold text-zinc-800">
                {brl(job.budget)}<span className="font-normal text-zinc-400">/talento</span>
              </span>
            )}
            {job.category && <span className="text-zinc-400">{job.category}</span>}
            {job.location && (
              <span className="flex items-center gap-0.5 text-zinc-400">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {job.location}
              </span>
            )}
          </div>

          {/* Operational indicators */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            {/* Candidates */}
            <Chip
              tone={job.submissionCount > 0 ? "zinc" : "muted"}
              icon={<PeopleIcon />}
            >
              {job.submissionCount} candidato{job.submissionCount !== 1 ? "s" : ""}
            </Chip>

            {/* Pending submissions — needs attention */}
            {job.pendingCount > 0 && (
              <Chip tone="amber" icon={<ClockIcon />}>
                {job.pendingCount} pendente{job.pendingCount !== 1 ? "s" : ""}
              </Chip>
            )}

            {/* Contracts awaiting signature */}
            {job.contractCounts.signed > 0 && (
              <Chip tone="amber" icon={<PenIcon />}>
                {job.contractCounts.signed} aguard. assinatura
              </Chip>
            )}

            {/* Contracts sent (talent hasn't acted yet) */}
            {job.contractCounts.sent > 0 && (
              <Chip tone="zinc" icon={<DocIcon />}>
                {job.contractCounts.sent} enviado{job.contractCounts.sent !== 1 ? "s" : ""}
              </Chip>
            )}

            {/* In escrow */}
            {job.contractCounts.confirmed > 0 && (
              <Chip tone="indigo" icon={<LockIcon />}>
                {job.contractCounts.confirmed} em custódia
              </Chip>
            )}

            {/* Paid */}
            {job.contractCounts.paid > 0 && (
              <Chip tone="emerald" icon={<CheckIcon />}>
                {job.contractCounts.paid} pago{job.contractCounts.paid !== 1 ? "s" : ""}
              </Chip>
            )}

            {/* Work date */}
            {job.jobDate && (
              <Chip tone={urgent ? "rose" : past ? "muted" : "zinc"} icon={<CalIcon />}>
                {urgent
                  ? `${days}d restantes`
                  : past
                    ? "Data passou"
                    : shortDate(job.jobDate)}
                {job.jobTime && !past ? ` · ${job.jobTime}` : ""}
              </Chip>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap items-center gap-1.5">
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

            {canEdit ? (
              <Link
                href={`/agency/workspace/jobs/${job.id}/edit`}
                className="inline-flex items-center rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Editar
              </Link>
            ) : (
              <span
                title={manageReason ?? "A vaga fechada não pode ser editada."}
                className="inline-flex items-center rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400"
              >
                Editar
              </span>
            )}

            <button
              type="button"
              onClick={() => onStatusChange("paused")}
              disabled={!canPause || statusChanging}
              title={!canPause ? (manageReason ?? "Apenas vagas abertas podem ser pausadas.") : undefined}
              className="inline-flex items-center rounded-lg border border-blue-200 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 disabled:hover:bg-white"
            >
              {statusChanging && job.status === "open" ? "..." : "Pausar"}
            </button>

            <button
              type="button"
              onClick={() => onStatusChange("open")}
              disabled={!canResume || statusChanging}
              title={!canResume ? (manageReason ?? "A vaga não pode ser reaberta agora.") : undefined}
              className="inline-flex items-center rounded-lg border border-emerald-200 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 disabled:hover:bg-white"
            >
              {statusChanging && ["paused", "closed"].includes(job.status) ? "..." : "Reabrir"}
            </button>

            <button
              type="button"
              onClick={() => onStatusChange("closed")}
              disabled={!canClose || statusChanging}
              title={!canClose ? (manageReason ?? "A vaga já está fechada.") : undefined}
              className="inline-flex items-center rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400 disabled:hover:bg-white"
            >
              {statusChanging && !["closed", "inactive"].includes(job.status) ? "..." : "Fechar vaga"}
            </button>

            {canInvite ? (
              <WorkspacePrivateInviteButton jobId={job.id} />
            ) : (
              <span
                title={job.visibility !== "private_invite" ? "Esta vaga não usa convite privado." : (manageReason ?? undefined)}
                className="inline-flex items-center rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400"
              >
                Copiar convite
              </span>
            )}
          </div>
          {manageReason && (
            <p className="mt-2 text-[11px] text-zinc-400">{manageReason}</p>
          )}
        </div>
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
