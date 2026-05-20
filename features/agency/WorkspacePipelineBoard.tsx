"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brl } from "@/lib/brl";
import { supabase } from "@/lib/supabase";
import { CONTRACTS_BUCKET } from "@/lib/contractFiles";
import { initials } from "@/lib/talentDisplay";
import CreatePresentationModal from "@/features/agency/CreatePresentationModal";
import WorkspacePrivateInviteButton from "@/features/agency/WorkspacePrivateInviteButton";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineNote = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type PipelineCandidate = {
  id: string;                   // submission id
  talentId: string | null;
  talentName: string;
  avatarUrl: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  gender: string | null;
  bio: string;
  pipelineStatus: string;       // pre-contract casting stage
  submittedAt: string;
  isReferral: boolean;
  // uploads
  photoFrontUrl:  string | null;
  photoLeftUrl:   string | null;
  photoRightUrl:  string | null;
  videoUrl:       string | null;
  curriculumUrl:  string | null;
  portfolioUrl:   string | null;
  // contract state (derived from bookings)
  bookingId:      string | null;
  bookingStatus:  string | null;
  contractId:     string | null;
  // notes
  notes: PipelineNote[];
  // aggregated client feedback across all presentations this candidate appears in
  clientFeedback: { approved: number; rejected: number; favorite: number } | null;
};

export type PipelineJob = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  budget: number;
  deadline: string | null;
  jobDate: string | null;
  jobTime: string | null;
  location: string | null;
  description: string;
  category: string;
  numberOfTalentsRequired: number;
  workspaceId: string;
  agencyId: string;
  // extended fields for overview section
  createdAt: string | null;
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
  applicationRequirements: string[] | null;
  inviteOnly: boolean;
};

export type FeedbackEntry = {
  viewerName: string;
  viewerCompany: string | null;
  vote: "approved" | "favorite" | "rejected";
};

export type PresentationSummary = {
  id: string;
  title: string;
  token: string;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
  hasPassword: boolean;
  candidateCount: number;
  feedbackSummary: { approved: number; rejected: number; favorite: number };
  feedbackEntries: FeedbackEntry[];
  submissionIds: string[];
};

type JobStatusValue = "open" | "paused" | "closed" | "draft" | "inactive";

type ContractSentPayload = {
  bookingId: string | null;
  bookingStatus: string;
  contractId: string | null;
};

type BoardToast = {
  msg: string;
  ok: boolean;
};

// ─── Pipeline stage config ────────────────────────────────────────────────────

type StageId =
  | "novo" | "em_analise" | "shortlist" | "aguardando_cliente"
  | "aprovado" | "contrato_enviado" | "confirmado" | "finalizado" | "rejeitado";

type StageConfig = { id: StageId; label: string; pill: string; movable: boolean };

const STAGES: StageConfig[] = [
  { id: "novo",               label: "Novo",               pill: "bg-zinc-100 text-zinc-600",                   movable: true  },
  { id: "em_analise",         label: "Em análise",         pill: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",movable: true  },
  { id: "shortlist",          label: "Shortlist",          pill: "bg-violet-50 text-violet-700 ring-1 ring-violet-100", movable: true },
  { id: "aguardando_cliente", label: "Aguard. cliente",    pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",   movable: true },
  { id: "aprovado",           label: "Aprovado",           pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100", movable: true },
  { id: "contrato_enviado",   label: "Contrato enviado",   pill: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100", movable: false },
  { id: "confirmado",         label: "Confirmado",         pill: "bg-teal-50 text-teal-700 ring-1 ring-teal-100",      movable: false },
  { id: "finalizado",         label: "Finalizado",         pill: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200", movable: false },
  { id: "rejeitado",          label: "Rejeitado",          pill: "bg-zinc-100 text-zinc-400",                   movable: true  },
];

const STAGE_MAP = new Map(STAGES.map((s) => [s.id, s]));

// ─── Client feedback helpers ──────────────────────────────────────────────────

type ClientFeedbackStatus = "approved" | "favorite" | "rejected" | "mixed" | "pending";
type FeedbackFilter       = "all" | "approved" | "favorite" | "rejected";

function clientFeedbackStatus(fb: PipelineCandidate["clientFeedback"]): ClientFeedbackStatus {
  if (!fb) return "pending";
  const { approved, rejected, favorite } = fb;
  if (approved + rejected + favorite === 0) return "pending";
  if (approved > 0 && rejected > 0) return "mixed";
  if (approved > 0) return "approved";
  if (favorite > 0) return "favorite";
  if (rejected > 0) return "rejected";
  return "pending";
}

function feedbackSortKey(s: ClientFeedbackStatus): number {
  if (s === "approved") return 0;
  if (s === "mixed")    return 1;
  if (s === "favorite") return 2;
  if (s === "pending")  return 3;
  return 4; // rejected
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effectiveStage(c: PipelineCandidate): StageId {
  const bs = c.bookingStatus;
  if (bs === "paid")      return "finalizado";
  if (bs === "confirmed") return "confirmado";
  if (bs && !["cancelled", "rejected"].includes(bs)) return "contrato_enviado";
  return (c.pipelineStatus as StageId) || "novo";
}

function avatarGrad(str: string): string {
  const palette = [
    "from-[#1ABC9C] to-[#27C1D6]", "from-violet-500 to-purple-600",
    "from-amber-400 to-orange-500", "from-pink-500 to-rose-500",
    "from-sky-500 to-blue-600",     "from-teal-500 to-cyan-600",
  ];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ─── Job status badge ─────────────────────────────────────────────────────────

function normalizeJobStatus(value: string): JobStatusValue | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "open" || normalized === "aberta") return "open";
  if (normalized === "paused" || normalized === "pausada") return "paused";
  if (normalized === "closed" || normalized === "fechada") return "closed";
  if (normalized === "draft" || normalized === "rascunho") return "draft";
  if (normalized === "inactive" || normalized === "inativa") return "inactive";
  return null;
}

function StBadge({ status }: { status: string }) {
  const cfg =
    status === "open"   ? { label: "Aberta",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" } :
    status === "paused" ? { label: "Pausada",   cls: "bg-blue-50 text-blue-700 border-blue-200" } :
    status === "closed" ? { label: "Fechada",   cls: "bg-zinc-100 text-zinc-500 border-zinc-200" } :
    status === "draft"  ? { label: "Rascunho",  cls: "bg-zinc-50 text-zinc-400 border-zinc-200" } :
                          { label: status,       cls: "bg-zinc-100 text-zinc-500 border-zinc-200" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Job overview section ─────────────────────────────────────────────────────

function JobOverviewSection({
  job,
  jobStatus,
  savingStatus,
  statusFeedback,
  candidates,
  canManage,
  manageReason,
  onStatusChange,
}: {
  job: PipelineJob;
  jobStatus: string;
  savingStatus: boolean;
  statusFeedback: { ok: boolean; msg: string } | null;
  candidates: PipelineCandidate[];
  canManage: boolean;
  manageReason: string | null;
  onStatusChange: (s: string) => void;
}) {
  // Stats
  const totalCandidates = candidates.length;
  const clientApproved  = candidates.filter((c) => c.clientFeedback && c.clientFeedback.approved > 0).length;
  const clientRejected  = candidates.filter((c) => c.clientFeedback && c.clientFeedback.rejected > 0).length;
  const contractsSent   = candidates.filter((c) => c.bookingId && c.bookingStatus && !["cancelled","rejected"].includes(c.bookingStatus)).length;
  const confirmed       = candidates.filter((c) => c.bookingStatus === "confirmed" || c.bookingStatus === "paid").length;
  const finalized       = candidates.filter((c) => c.bookingStatus === "paid").length;

  const GENDER_LABEL: Record<string, string> = {
    male: "Masculino", female: "Feminino", any: "Qualquer", other: "Outro",
  };
  const REQ_LABEL: Record<string, string> = {
    photo_front: "Foto frontal", photo_left: "Foto lateral esq.", photo_right: "Foto lateral dir.",
    video: "Vídeo", curriculum: "Currículo", portfolio: "Portfólio",
  };

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/agency/workspace/jobs"
        className="inline-flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Vagas do workspace
      </Link>

      {/* Header card */}
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: title + badges */}
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[1.35rem] font-bold tracking-tight text-zinc-950 leading-snug">
                {job.title}
              </h1>
              <StBadge status={jobStatus} />
              {job.visibility === "private_invite" && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
                  Privada
                </span>
              )}
              {job.inviteOnly && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  Invite-only
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
              {job.category && <span className="font-medium text-zinc-700">{job.category}</span>}
              {job.createdAt && (
                <span>
                  Criada em{" "}
                  {new Date(job.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            {/* Status dropdown */}
            <div className="flex items-center gap-1.5">
              <select
                value={jobStatus}
                onChange={(e) => {
                  void onStatusChange(e.target.value);
                }}
                disabled={!canManage || savingStatus}
                className={[
                  "h-8 rounded-xl border px-2.5 text-[12px] font-semibold focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
                  jobStatus === "open"   ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                  jobStatus === "paused" ? "border-blue-200 bg-blue-50 text-blue-700" :
                  jobStatus === "closed" ? "border-zinc-200 bg-zinc-100 text-zinc-500" :
                                          "border-zinc-200 bg-white text-zinc-700",
                ].join(" ")}
              >
                <option value="open">Aberta</option>
                <option value="paused">Pausada</option>
                <option value="closed">Fechada</option>
                <option value="draft">Rascunho</option>
              </select>
              {savingStatus && <span className="text-[11px] text-zinc-400">…</span>}
            </div>

            {/* Edit */}
            {canManage ? (
              <Link
                href={`/agency/workspace/jobs/${job.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar vaga
              </Link>
            ) : (
              <span
                title={manageReason ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-[12px] font-semibold text-zinc-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar vaga
              </span>
            )}

            {/* Copy invite */}
            {canManage ? (
              <WorkspacePrivateInviteButton jobId={job.id} />
            ) : (
              <span
                title={manageReason ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-[12px] font-semibold text-zinc-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copiar convite
              </span>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-3 flex flex-wrap gap-x-6 gap-y-2">
          {[
            { label: "Candidatos",      value: totalCandidates, color: "text-zinc-700" },
            { label: "Aprov. cliente",  value: clientApproved,  color: "text-emerald-600" },
            { label: "Rejeit. cliente", value: clientRejected,  color: "text-zinc-400" },
            { label: "Contratos",       value: contractsSent,   color: "text-indigo-600" },
            { label: "Confirmados",     value: confirmed,       color: "text-teal-600" },
            { label: "Finalizados",     value: finalized,       color: "text-emerald-700" },
          ].map((s) => (
            <div key={s.label} className="flex items-baseline gap-1.5">
              <span className={`text-[18px] font-bold leading-none ${s.color}`}>{s.value}</span>
              <span className="text-[11px] text-zinc-400">{s.label}</span>
            </div>
          ))}
        </div>
        {statusFeedback && (
          <div className="border-t border-zinc-100 px-5 py-3">
            <p className={`text-[12px] font-medium ${statusFeedback.ok ? "text-emerald-600" : "text-rose-600"}`}>
              {statusFeedback.msg}
            </p>
          </div>
        )}
        {!canManage && manageReason && (
          <div className="border-t border-zinc-100 px-5 py-3">
            <p className="text-[12px] font-medium text-zinc-400">{manageReason}</p>
          </div>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {[
          job.budget > 0 && { label: "Orçamento", value: `${brl(job.budget)}/talento` },
          { label: "Talentos", value: `${job.numberOfTalentsRequired} vaga${job.numberOfTalentsRequired !== 1 ? "s" : ""}` },
          job.jobDate && { label: "Data do trabalho", value: new Date(`${job.jobDate}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) },
          job.jobTime && { label: "Horário", value: job.jobTime },
          job.location && { label: "Localização", value: job.location },
          job.gender && job.gender !== "any" && { label: "Gênero", value: GENDER_LABEL[job.gender] ?? job.gender },
          (job.ageMin || job.ageMax) && { label: "Faixa etária", value: job.ageMin && job.ageMax ? `${job.ageMin}–${job.ageMax} anos` : job.ageMin ? `${job.ageMin}+ anos` : `até ${job.ageMax} anos` },
          job.deadline && { label: "Prazo candidaturas", value: new Date(`${job.deadline}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) },
          { label: "Visibilidade", value: job.visibility === "private_invite" ? "Privada (convite)" : "Pública" },
        ].filter(Boolean).map((item) => {
          const it = item as { label: string; value: string };
          return (
            <div key={it.label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-0.5">{it.label}</div>
              <div className="text-[13px] font-semibold text-zinc-800 leading-snug">{it.value}</div>
            </div>
          );
        })}
      </div>

      {/* Description */}
      {job.description && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Descrição da vaga</h2>
          <p className="text-[13px] text-zinc-700 leading-relaxed whitespace-pre-wrap">{job.description}</p>
        </div>
      )}

      {/* Upload requirements */}
      {job.applicationRequirements && job.applicationRequirements.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-zinc-400 mb-3">O que o talento deve enviar</h2>
          <div className="flex flex-wrap gap-2">
            {job.applicationRequirements.map((req) => (
              <span key={req} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[12px] font-medium text-zinc-700">
                <svg className="w-3.5 h-3.5 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {REQ_LABEL[req] ?? req}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkspacePipelineBoard({
  job,
  candidates: initial,
  presentations: initialPresentations,
  userId,
  isOwner,
  readOnly,
  brandPrimary = "#1ABC9C",
  brandAccent  = "#27C1D6",
}: {
  job: PipelineJob;
  candidates: PipelineCandidate[];
  presentations: PresentationSummary[];
  userId: string;
  isOwner: boolean;
  readOnly: boolean;
  brandPrimary?: string;
  brandAccent?: string;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<PipelineCandidate[]>(initial);
  const [presentations, setPresentations] = useState<PresentationSummary[]>(initialPresentations);
  const [jobStatus, setJobStatus] = useState(job.status);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [activeStage, setActiveStage] = useState<string>("all");
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contractTarget, setContractTarget] = useState<PipelineCandidate | null>(null);
  const [showCreatePresentation, setShowCreatePresentation] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [deletingPres, setDeletingPres] = useState<string | null>(null);
  const [noSelectionHint, setNoSelectionHint] = useState(false);
  const [highlightCheckboxes, setHighlightCheckboxes] = useState(false);
  const [toast, setToast] = useState<BoardToast | null>(null);

  const canManage = isOwner || !readOnly;
  const manageReason = canManage
    ? null
    : "Somente o owner ou o agente criador pode gerenciar esta vaga.";
  const liveJob = useMemo(() => ({ ...job, status: jobStatus }), [job, jobStatus]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    setJobStatus(job.status);
  }, [job.status]);

  async function handleJobStatusChange(nextStatus: string) {
    const normalizedStatus = normalizeJobStatus(nextStatus);
    if (!normalizedStatus || normalizedStatus === jobStatus) return;

    setSavingStatus(true);
    setStatusFeedback(null);

    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: normalizedStatus }),
      });

      if (res.ok) {
        setJobStatus(normalizedStatus);
        setStatusFeedback({ ok: true, msg: "Status da vaga atualizado." });
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setStatusFeedback({ ok: false, msg: data.error ?? "Não foi possível atualizar o status da vaga." });
      }
    } catch {
      setStatusFeedback({ ok: false, msg: "Não foi possível atualizar o status da vaga." });
    } finally {
      setSavingStatus(false);
    }
  }

  function handleCreatePresentationClick() {
    if (selectedCandidates.length > 0) {
      setShowCreatePresentation(true);
    } else {
      setNoSelectionHint(true);
      setHighlightCheckboxes(true);
      setTimeout(() => setNoSelectionHint(false), 3500);
      setTimeout(() => setHighlightCheckboxes(false), 3000);
    }
  }

  // Stage counts from effective stage
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) {
      const s = effectiveStage(c);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [candidates]);

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return candidates.filter((c) => {
      if (q && !c.talentName.toLowerCase().includes(q)) return false;
      if (activeStage !== "all" && effectiveStage(c) !== activeStage) return false;
      if (feedbackFilter !== "all") {
        const fb = c.clientFeedback;
        if (!fb) return false;
        if (feedbackFilter === "approved" && fb.approved === 0) return false;
        if (feedbackFilter === "favorite" && fb.favorite === 0) return false;
        if (feedbackFilter === "rejected" && fb.rejected === 0) return false;
      }
      return true;
    });
  }, [candidates, activeStage, search, feedbackFilter]);

  // Group by effective stage for "all" view; within each stage sort by client feedback priority
  const sections = useMemo(() => {
    if (activeStage !== "all") return null;
    const groups = new Map<string, PipelineCandidate[]>();
    for (const c of visible) {
      const s = effectiveStage(c);
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s)!.push(c);
    }
    return STAGES.filter((s) => groups.has(s.id)).map((s) => ({
      stage: s,
      candidates: groups.get(s.id)!.sort(
        (a, b) => feedbackSortKey(clientFeedbackStatus(a.clientFeedback)) -
                  feedbackSortKey(clientFeedbackStatus(b.clientFeedback))
      ),
    }));
  }, [visible, activeStage]);

  // Count candidates with each feedback type (for filter badges)
  const feedbackCounts = useMemo(() => {
    let approved = 0, favorite = 0, rejected = 0;
    for (const c of candidates) {
      const fb = c.clientFeedback;
      if (!fb) continue;
      if (fb.approved > 0) approved++;
      if (fb.favorite > 0) favorite++;
      if (fb.rejected > 0) rejected++;
    }
    return { approved, favorite, rejected };
  }, [candidates]);

  // Optimistic status update
  function patchCandidateStatus(submissionId: string, nextStatus: string) {
    setCandidates((prev) =>
      prev.map((c) => c.id === submissionId ? { ...c, pipelineStatus: nextStatus } : c)
    );
  }

  function patchCandidateNote(submissionId: string, note: PipelineNote) {
    setCandidates((prev) =>
      prev.map((c) => c.id === submissionId ? { ...c, notes: [...c.notes, note] } : c)
    );
  }

  function patchCandidateBooking(
    submissionId: string,
    bookingId: string | null,
    bookingStatus: string,
    contractId: string | null,
  ) {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === submissionId
          ? { ...c, bookingId, bookingStatus, contractId, pipelineStatus: "contrato_enviado" }
          : c
      )
    );
  }

  // Bulk selection
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(visible.map((c) => c.id))); }
  function clearSelect() { setSelected(new Set()); }

  // Candidates to pre-fill in "create presentation" modal
  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(c.id) && effectiveStage(c) !== "rejeitado"),
    [candidates, selected]
  );

  async function handleDeletePresentation(id: string) {
    setDeletingPres(id);
    const res = await fetch(`/api/workspace/presentations/${id}`, { method: "DELETE" });
    setDeletingPres(null);
    if (res.ok) setPresentations((prev) => prev.filter((p) => p.id !== id));
  }

  async function bulkMove(nextStatus: string) {
    const ids = [...selected];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/workspace/submissions/${id}/pipeline`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipeline_status: nextStatus }),
        })
      )
    );
    ids.forEach((id) => patchCandidateStatus(id, nextStatus));
    clearSelect();
  }

  const tabAll = candidates.length;

  return (
    <div className="space-y-5">

      {/* Job overview */}
      <JobOverviewSection
        job={job}
        jobStatus={jobStatus}
        savingStatus={savingStatus}
        statusFeedback={statusFeedback}
        candidates={candidates}
        canManage={canManage}
        manageReason={manageReason}
        onStatusChange={handleJobStatusChange}
      />

      {/* Stage tabs */}
      <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
        <div className="flex border-b border-zinc-100 min-w-max">
          {/* All tab */}
          {[{ id: "all", label: "Todos", count: tabAll }, ...STAGES.map((s) => ({
            id: s.id, label: s.label, count: stageCounts.get(s.id) ?? 0,
          }))].filter((t) => t.id === "all" || t.count > 0).map((tab) => {
            const active = activeStage === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveStage(tab.id)}
                style={active ? { borderBottomColor: brandPrimary } : undefined}
                className={[
                  "inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[12px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap cursor-pointer",
                  active
                    ? "text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-200",
                ].join(" ")}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={[
                    "rounded-full px-1.5 py-px text-[10px] font-bold leading-none",
                    active ? "bg-zinc-100 text-zinc-700" : "bg-zinc-100 text-zinc-500",
                  ].join(" ")}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + primary action row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar candidato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-xl border border-zinc-200 bg-white pl-8 pr-3 text-[12px] text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none transition-colors"
          />
        </div>
        {visible.length > 0 && canManage && (
          <button
            onClick={() => selected.size === visible.length ? clearSelect() : selectAll()}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors whitespace-nowrap cursor-pointer"
          >
            {selected.size === visible.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        )}
      </div>

      {/* No-selection hint — shown briefly when user clicks "Criar apresentação" without selecting */}
      {noSelectionHint && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
          <svg className="h-4 w-4 flex-shrink-0 mt-px text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <strong>Selecione um ou mais candidatos primeiro.</strong>{" "}
            Clique na caixa de seleção ao lado de cada candidato que deseja incluir na apresentação.
          </span>
        </div>
      )}

      {/* Client feedback filter — only shown when there is feedback to filter on */}
      {(feedbackCounts.approved + feedbackCounts.favorite + feedbackCounts.rejected) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">Feedback do cliente:</span>
          {([
            { key: "approved" as const, label: "Aprovados",  count: feedbackCounts.approved,  icon: "✓", on: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", off: "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200 hover:ring-emerald-200 hover:text-emerald-700" },
            { key: "favorite" as const, label: "Favoritos",  count: feedbackCounts.favorite,  icon: "★", on: "bg-amber-50  text-amber-700  ring-1 ring-amber-200",   off: "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200 hover:ring-amber-200  hover:text-amber-700"  },
            { key: "rejected" as const, label: "Rejeitados", count: feedbackCounts.rejected,  icon: "✕", on: "bg-zinc-200  text-zinc-600  ring-1 ring-zinc-300",     off: "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200 hover:ring-zinc-300" },
          ] as const).filter((f) => f.count > 0).map((f) => (
            <button
              key={f.key}
              onClick={() => setFeedbackFilter(feedbackFilter === f.key ? "all" : f.key)}
              className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer",
                feedbackFilter === f.key ? f.on : f.off,
              ].join(" ")}
            >
              {f.icon} {f.label}
              <span className="rounded-full bg-white/70 px-1.5 py-px text-[9px] font-bold leading-none">{f.count}</span>
            </button>
          ))}
          {feedbackFilter !== "all" && (
            <button
              onClick={() => setFeedbackFilter("all")}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 cursor-pointer transition-colors"
            >
              Limpar filtro
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar — sticky floating */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-30 rounded-2xl border border-[#1ABC9C]/30 bg-white px-4 py-3 shadow-[0_8px_32px_rgba(26,188,156,0.18)]">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[12px] font-semibold text-zinc-900 mr-1">
              {selected.size} candidato{selected.size !== 1 ? "s" : ""} selecionado{selected.size !== 1 ? "s" : ""}
            </span>

            {/* Primary: Criar apresentação */}
            {canManage && (
              <button
                onClick={handleCreatePresentationClick}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1ABC9C] px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-[#17A58A] transition-colors cursor-pointer shadow-sm"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Criar apresentação
              </button>
            )}

            {/* Move stage dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-400 whitespace-nowrap">Mover para:</span>
              <select
                defaultValue=""
                onChange={(e) => { if (e.target.value) { void bulkMove(e.target.value); e.currentTarget.value = ""; } }}
                className="h-7 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold text-zinc-700 focus:outline-none cursor-pointer"
              >
                <option value="" disabled>Etapa...</option>
                {STAGES.filter((s) => s.movable).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            <BulkBtn label="Rejeitar" danger onClick={() => bulkMove("rejeitado")} />

            <button
              onClick={clearSelect}
              className="ml-auto text-[11px] text-zinc-400 hover:text-zinc-600 cursor-pointer transition-colors whitespace-nowrap"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {visible.length === 0 && (
        <div className="rounded-[1.5rem] border border-zinc-100 bg-white px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-zinc-800">
            {candidates.length === 0 ? "Nenhuma candidatura recebida" : "Nenhum candidato nesta etapa"}
          </p>
          <p className="mt-1 text-[13px] text-zinc-400">
            {search
              ? "Nenhum resultado para esta busca."
              : candidates.length === 0
              ? "Quando talentos se candidatarem à vaga eles aparecerão aqui."
              : "Mude a aba ou limpe a busca para ver outros candidatos."}
          </p>
        </div>
      )}

      {/* Grouped sections (all tab) */}
      {sections && sections.length > 0 && (
        <div className="space-y-6">
          {sections.map(({ stage, candidates: cs }) => (
            <div key={stage.id}>
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stage.pill}`}>
                  {stage.label}
                </span>
                <span className="text-[11px] text-zinc-400">{cs.length} candidato{cs.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {cs.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    job={liveJob}
                    presentations={presentations}
                    canManage={canManage}
                    isSelected={selected.has(c.id)}
                    highlightCheckbox={highlightCheckboxes}
                    onToggleSelect={() => toggleSelect(c.id)}
                    onStatusChange={patchCandidateStatus}
                    onNoteAdded={patchCandidateNote}
                    onContractOpen={() => setContractTarget(c)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flat list (specific stage tab) — sorted by client feedback priority */}
      {!sections && visible.length > 0 && (
        <div className="space-y-2">
          {[...visible].sort((a, b) =>
            feedbackSortKey(clientFeedbackStatus(a.clientFeedback)) -
            feedbackSortKey(clientFeedbackStatus(b.clientFeedback))
          ).map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              job={liveJob}
              presentations={presentations}
              canManage={canManage}
              isSelected={selected.has(c.id)}
              highlightCheckbox={highlightCheckboxes}
              onToggleSelect={() => toggleSelect(c.id)}
              onStatusChange={patchCandidateStatus}
              onNoteAdded={patchCandidateNote}
              onContractOpen={() => setContractTarget(c)}
            />
          ))}
        </div>
      )}

      {/* Presentations panel */}
      <PresentationsPanel
        presentations={presentations}
        workspaceId={job.workspaceId}
        canManage={canManage}
        hasSelection={selectedCandidates.length > 0}
        deletingId={deletingPres}
        onDelete={handleDeletePresentation}
        onCreateClick={handleCreatePresentationClick}
      />

      {/* Contract modal */}
      {contractTarget && (
        <ContractModal
          job={liveJob}
          candidate={contractTarget}
          agencyId={job.agencyId}
          onClose={() => setContractTarget(null)}
          onSent={({ bookingId, bookingStatus, contractId }) => {
            patchCandidateBooking(contractTarget.id, bookingId, bookingStatus, contractId);
            setContractTarget(null);
            showToast("Contrato enviado com sucesso.", true);
            router.refresh();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4">
          <div
            className={[
              "rounded-2xl px-4 py-3 text-center text-[13px] font-semibold text-white shadow-lg",
              toast.ok ? "bg-emerald-600" : "bg-rose-600",
            ].join(" ")}
          >
            {toast.msg}
          </div>
        </div>
      )}

      {/* Create presentation modal — only renders when candidates are actually selected */}
      {showCreatePresentation && selectedCandidates.length > 0 && (
        <CreatePresentationModal
          workspaceId={job.workspaceId}
          jobId={job.id}
          preselected={selectedCandidates.map((c) => ({ id: c.id, name: c.talentName }))}
          onClose={() => setShowCreatePresentation(false)}
          onCreated={async (token) => {
            setShowCreatePresentation(false);
            clearSelect();
            setCreatedToken(token);
            // Refresh presentations list to show the new card immediately
            try {
              const res = await fetch(`/api/workspace/presentations?workspaceId=${job.workspaceId}&jobId=${job.id}`);
              if (res.ok) {
                const data = await res.json() as { presentations?: PresentationSummary[] };
                if (data.presentations) setPresentations(data.presentations);
              }
            } catch {}
          }}
        />
      )}

      {/* Created success banner */}
      {createdToken && (
        <CreatedBanner
          token={createdToken}
          onClose={() => setCreatedToken(null)}
        />
      )}
    </div>
  );
}

// ─── Bulk action button ───────────────────────────────────────────────────────

function BulkBtn({ label, onClick, danger, highlight }: { label: string; onClick: () => void; danger?: boolean; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer",
        danger     ? "border-red-200 text-red-600 hover:bg-red-50" :
        highlight  ? "border-[#1ABC9C]/50 bg-[#1ABC9C]/10 text-[#1ABC9C] hover:bg-[#1ABC9C]/20" :
                     "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ─── Copy link button ─────────────────────────────────────────────────────────

function CopyLinkBtn({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
      </svg>
      {copied ? "Copiado!" : "Copiar link"}
    </button>
  );
}

// ─── Presentations panel ──────────────────────────────────────────────────────

function PresentationsPanel({
  presentations,
  workspaceId: _workspaceId,
  canManage,
  hasSelection,
  deletingId,
  onDelete,
  onCreateClick,
}: {
  presentations: PresentationSummary[];
  workspaceId: string;
  canManage: boolean;
  hasSelection: boolean;
  deletingId: string | null;
  onDelete: (id: string) => void;
  onCreateClick: () => void;
}) {
  const [open, setOpen] = useState(true);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function isExpired(expiresAt: string | null) {
    return !!expiresAt && new Date(expiresAt) < new Date();
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header row — collapse toggle + always-visible create button */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
        >
          <span className="text-[13px] font-semibold text-zinc-800">Apresentações para clientes</span>
          {presentations.length > 0 && (
            <span className="rounded-full bg-zinc-100 px-2 py-px text-[10px] font-bold text-zinc-500">
              {presentations.length}
            </span>
          )}
          <svg
            className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {canManage && (
          <button
            onClick={onCreateClick}
            className={[
              "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-all cursor-pointer",
              hasSelection
                ? "bg-[#1ABC9C] text-white hover:bg-[#17A58A] shadow-sm"
                : "bg-[#1ABC9C]/10 text-[#1ABC9C] hover:bg-[#1ABC9C]/20",
            ].join(" ")}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            + Criar apresentação
          </button>
        )}
      </div>

      {open && (
        <div className="px-5 pb-5 pt-4 space-y-3">
          {presentations.length === 0 && (
            <div className="space-y-4 py-1">
              {/* 3-step guide */}
              <div className="flex items-start gap-3">
                {[
                  { n: "1", text: "Selecione candidatos usando a caixa ao lado de cada card" },
                  { n: "2", text: "Clique em \"Criar apresentação\" e dê um título" },
                  { n: "3", text: "Copie o link e envie direto para o cliente" },
                ].map(({ n, text }) => (
                  <div key={n} className="flex-1 text-center">
                    <div className="w-7 h-7 rounded-full bg-[#1ABC9C]/10 text-[#1ABC9C] text-[12px] font-bold flex items-center justify-center mx-auto mb-1.5">
                      {n}
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">{text}</p>
                  </div>
                ))}
              </div>

              {canManage && (
                <button
                  onClick={onCreateClick}
                  className={[
                    "w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all cursor-pointer",
                    hasSelection
                      ? "bg-[#1ABC9C] text-white hover:bg-[#17A58A] shadow-sm"
                      : "border-2 border-dashed border-[#1ABC9C]/40 text-[#1ABC9C]/70 hover:border-[#1ABC9C]/70 hover:text-[#1ABC9C]",
                  ].join(" ")}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {hasSelection ? "Criar apresentação para cliente" : "Selecione candidatos para criar apresentação"}
                </button>
              )}

              <p className="text-[10px] text-zinc-400 text-center leading-relaxed">
                Os clientes veem apenas materiais públicos — sem notas internas, pagamentos ou dados operacionais.
              </p>
            </div>
          )}

          {presentations.map((p) => {
            const expired = isExpired(p.expiresAt);
            const url = `/presentation/${p.token}`;
            const fb  = p.feedbackSummary;
            const hasFb = fb.approved + fb.rejected + fb.favorite > 0;
            return (
              <div key={p.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 px-5 py-4">
                {/* Title row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[14px] font-bold text-zinc-900 truncate">{p.title}</span>
                      {expired && (
                        <span className="rounded-full bg-zinc-200 px-2 py-px text-[10px] font-semibold text-zinc-500">Expirada</span>
                      )}
                      {p.hasPassword && (
                        <span className="rounded-full bg-amber-50 border border-amber-100 px-2 py-px text-[10px] font-semibold text-amber-700">
                          🔒 Com senha
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                      <span>{p.candidateCount} candidato{p.candidateCount !== 1 ? "s" : ""}</span>
                      <span>{p.viewCount} visualização{p.viewCount !== 1 ? "ões" : ""}</span>
                      {p.expiresAt && <span>Expira {fmtDate(p.expiresAt)}</span>}
                      <span>Criada {fmtDate(p.createdAt)}</span>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => { if (confirm("Excluir esta apresentação?")) onDelete(p.id); }}
                      disabled={deletingId === p.id}
                      title="Excluir"
                      className="flex-shrink-0 rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-400 hover:border-red-200 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Feedback — aggregate counts + named entries */}
                <div className="mb-3">
                  {hasFb ? (
                    <>
                      {/* Summary chips */}
                      <div className="mb-2.5 flex flex-wrap gap-1.5">
                        {fb.approved > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                            ✓ {fb.approved} aprovado{fb.approved !== 1 ? "s" : ""}
                          </span>
                        )}
                        {fb.favorite > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-100">
                            ★ {fb.favorite} favorito{fb.favorite !== 1 ? "s" : ""}
                          </span>
                        )}
                        {fb.rejected > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200">
                            ✕ {fb.rejected} rejeitado{fb.rejected !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {/* Named entries */}
                      <div className="space-y-1">
                        {p.feedbackEntries.map((entry, ei) => {
                          const icon  = entry.vote === "approved" ? "✓" : entry.vote === "favorite" ? "★" : "✕";
                          const color = entry.vote === "approved" ? "text-emerald-600" : entry.vote === "favorite" ? "text-amber-600" : "text-zinc-400";
                          const verb  = entry.vote === "approved" ? "aprovou" : entry.vote === "favorite" ? "favoritou" : "rejeitou";
                          return (
                            <div key={ei} className="flex items-center gap-1.5 text-[11px]">
                              <span className={`font-bold ${color}`}>{icon}</span>
                              <span className="font-semibold text-zinc-800">{entry.viewerName}</span>
                              {entry.viewerCompany && <span className="text-zinc-400">— {entry.viewerCompany}</span>}
                              <span className="text-zinc-400">{verb}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-zinc-400 italic">Aguardando feedback do cliente</span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Abrir apresentação
                  </a>
                  <CopyLinkBtn url={typeof window !== "undefined" ? window.location.origin + url : url} />
                </div>
              </div>
            );
          })}

          {canManage && presentations.length > 0 && (
            <button
              onClick={onCreateClick}
              className={[
                "inline-flex items-center gap-1.5 rounded-xl border border-dashed px-4 py-2.5 text-[12px] font-semibold transition-all w-full justify-center cursor-pointer",
                hasSelection
                  ? "border-[#1ABC9C] text-[#1ABC9C] hover:bg-[#1ABC9C]/5"
                  : "border-zinc-200 text-zinc-400 hover:border-[#1ABC9C]/50 hover:text-[#1ABC9C]/70",
              ].join(" ")}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {hasSelection ? "Nova apresentação" : "Selecione candidatos para nova apresentação"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Created banner ───────────────────────────────────────────────────────────

function CreatedBanner({ token, onClose }: { token: string; onClose: () => void }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/presentation/${token}` : `/presentation/${token}`;
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-emerald-800">Apresentação criada!</p>
            <p className="mt-0.5 truncate text-[11px] text-emerald-600">{url}</p>
          </div>
          <button onClick={onClose} className="text-emerald-400 hover:text-emerald-700 cursor-pointer flex-shrink-0">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={copy}
            className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            {copied ? "Copiado!" : "Copiar link"}
          </button>
          <a
            href={`/presentation/${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-center text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            Abrir
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({
  candidate: c,
  job,
  presentations,
  canManage,
  isSelected,
  highlightCheckbox,
  onToggleSelect,
  onStatusChange,
  onNoteAdded,
  onContractOpen,
}: {
  candidate: PipelineCandidate;
  job: PipelineJob;
  presentations: PresentationSummary[];
  canManage: boolean;
  isSelected: boolean;
  highlightCheckbox?: boolean;
  onToggleSelect: () => void;
  onStatusChange: (id: string, status: string) => void;
  onNoteAdded: (id: string, note: PipelineNote) => void;
  onContractOpen: () => void;
}) {
  const [moving, setMoving]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const stage         = effectiveStage(c);
  const stageCfg      = STAGE_MAP.get(stage);
  const hasPhotos     = !!(c.photoFrontUrl || c.photoLeftUrl || c.photoRightUrl);
  const photos        = [c.photoFrontUrl, c.photoLeftUrl, c.photoRightUrl].filter(Boolean) as string[];
  const uploadBits    = [hasPhotos, !!c.videoUrl, !!c.curriculumUrl, !!c.portfolioUrl];
  const uploadDone    = uploadBits.filter(Boolean).length;
  const hasActiveBooking = !!c.bookingId && !["cancelled", "rejected"].includes(c.bookingStatus ?? "");
  const canOpenContractModal = canManage && !hasActiveBooking && !!c.talentId;
  const showContractButton = canManage;
  const canMove       = canManage && !!stageCfg?.movable;
  const fbStatus      = clientFeedbackStatus(c.clientFeedback);
  const clientApproved = fbStatus === "approved" || fbStatus === "mixed";
  const clientRejected = fbStatus === "rejected";

  async function handleMove(nextStatus: string) {
    if (nextStatus === c.pipelineStatus) return;
    setMoving(true);
    const res = await fetch(`/api/workspace/submissions/${c.id}/pipeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_status: nextStatus }),
    });
    setMoving(false);
    if (res.ok) onStatusChange(c.id, nextStatus);
  }

  async function handleAddNote() {
    const body = noteText.trim();
    if (!body) return;
    setSavingNote(true);
    const res = await fetch(`/api/workspace/submissions/${c.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSavingNote(false);
    if (res.ok) {
      const data = await res.json() as { note?: PipelineNote };
      if (data.note) {
        onNoteAdded(c.id, data.note);
        setNoteText("");
      }
    }
  }

  // Upload completeness display
  const uploadLabels = ["Fotos", "Vídeo", "Currículo", "Portfólio"];
  const uploadFlags  = [hasPhotos, !!c.videoUrl, !!c.curriculumUrl, !!c.portfolioUrl];

  return (
    <div className={[
      "rounded-2xl border bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all",
      isSelected
        ? "border-[#1ABC9C] ring-1 ring-[#1ABC9C]/30"
        : clientApproved
        ? "border-emerald-200 ring-1 ring-emerald-100"
        : clientRejected
        ? "border-zinc-200 opacity-70"
        : "border-zinc-200 hover:border-zinc-300",
    ].join(" ")}>

      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">

        {/* Checkbox with label */}
        {canManage && (
          <button
            onClick={onToggleSelect}
            aria-label={isSelected ? "Desmarcar candidato" : "Selecionar candidato"}
            className="flex-shrink-0 flex flex-col items-center gap-1 cursor-pointer group self-center"
          >
            <span className={[
              "w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all",
              isSelected
                ? "bg-[#1ABC9C] border-[#1ABC9C] shadow-md"
                : highlightCheckbox
                  ? "border-[#1ABC9C] bg-[#1ABC9C]/10 animate-pulse"
                  : "border-zinc-300 group-hover:border-[#1ABC9C] group-hover:bg-[#1ABC9C]/10",
            ].join(" ")}>
              {isSelected && (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span className={[
              "text-[10px] font-semibold leading-none whitespace-nowrap transition-colors",
              isSelected ? "text-[#1ABC9C]" : highlightCheckbox ? "text-[#1ABC9C]" : "text-zinc-400 group-hover:text-[#1ABC9C]",
            ].join(" ")}>
              {isSelected ? "Selecionado" : "Selecionar"}
            </span>
          </button>
        )}

        {/* Avatar */}
        {c.avatarUrl ? (
          <img
            src={c.avatarUrl}
            alt={c.talentName || "Talento"}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-0.5"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGrad(c.talentName || "T")} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5`}>
            {initials(c.talentName || "T")}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* Name + stage + contract badge */}
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[14px] font-semibold text-zinc-900 hover:text-[#1ABC9C] transition-colors text-left cursor-pointer"
            >
              {c.talentName || "Talento sem nome"}
            </button>
            {stageCfg && (
              <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${stageCfg.pill}`}>
                {stageCfg.label}
              </span>
            )}
            {c.isReferral && (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-px text-[10px] font-semibold text-violet-700">
                Indicado
              </span>
            )}
            {c.bookingStatus === "confirmed" && (
              <span className="rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-100 px-2 py-px text-[10px] font-semibold">
                Em custódia
              </span>
            )}
            {c.bookingStatus === "paid" && (
              <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-px text-[10px] font-semibold">
                Pago
              </span>
            )}
            {/* Client feedback badge — highest priority signal */}
            {c.clientFeedback && (() => {
              const { approved, favorite, rejected } = c.clientFeedback;
              if (approved > 0) return (
                <span className="rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2 py-px text-[10px] font-semibold">
                  ✓ Aprovado pelo cliente
                </span>
              );
              if (favorite > 0) return (
                <span className="rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-2 py-px text-[10px] font-semibold">
                  ★ Favorito do cliente
                </span>
              );
              if (rejected > 0) return (
                <span className="rounded-full bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200 px-2 py-px text-[10px] font-semibold">
                  ✕ Rejeitado pelo cliente
                </span>
              );
              return null;
            })()}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 mb-2">
            {c.age && <span>{c.age} anos</span>}
            {c.gender && (
              <span>{c.gender === "female" || c.gender === "feminino" ? "Feminino" : c.gender === "male" || c.gender === "masculino" ? "Masculino" : c.gender}</span>
            )}
            {(c.city || c.country) && (
              <span>{[c.city, c.country].filter(Boolean).join(", ")}</span>
            )}
            {c.submittedAt && (
              <span className="text-zinc-400">{new Date(c.submittedAt).toLocaleDateString("pt-BR")}</span>
            )}
          </div>

          {/* Upload completeness */}
          <div className="flex items-center gap-1.5 mb-2.5">
            {uploadLabels.map((label, i) => (
              <span
                key={label}
                className={[
                  "rounded-full px-2 py-px text-[10px] font-medium",
                  uploadFlags[i]
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-zinc-100 text-zinc-400",
                ].join(" ")}
              >
                {label}
              </span>
            ))}
            <span className="text-[10px] text-zinc-400 ml-1">{uploadDone}/4</span>
          </div>

          {/* Notes preview */}
          {c.notes.length > 0 && (
            <div className="text-[11px] text-zinc-400 mb-2">
              {c.notes.length} nota{c.notes.length !== 1 ? "s" : ""} internas
            </div>
          )}

          {/* ── Inline client feedback ── */}
          {c.clientFeedback && (c.clientFeedback.approved + c.clientFeedback.favorite + c.clientFeedback.rejected) > 0 && (
            <div className={[
              "mb-2.5 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[11px]",
              clientApproved ? "bg-emerald-50 border border-emerald-100" : "bg-zinc-50 border border-zinc-100",
            ].join(" ")}>
              <span className="font-bold text-zinc-500 whitespace-nowrap">Feedback do cliente</span>
              {c.clientFeedback.approved > 0 && (
                <span className="font-bold text-emerald-600">✓ {c.clientFeedback.approved} aprovou</span>
              )}
              {c.clientFeedback.favorite > 0 && (
                <span className="font-bold text-amber-500">★ {c.clientFeedback.favorite} favoritou</span>
              )}
              {c.clientFeedback.rejected > 0 && (
                <span className="font-bold text-zinc-400">✕ {c.clientFeedback.rejected} rejeitou</span>
              )}
              {/* Auto-suggest hire when client approved */}
              {clientApproved && canOpenContractModal && (
                <button
                  onClick={onContractOpen}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer shadow-sm transition-colors whitespace-nowrap"
                >
                  Contratar agora →
                </button>
              )}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex flex-wrap items-center gap-1.5">

            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              {expanded ? "Fechar ↑" : "Ver perfil ↓"}
            </button>

            <button
              onClick={() => setNotesOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              + Nota
              {c.notes.length > 0 && (
                <span className="rounded-full bg-zinc-200 px-1.5 py-px text-[9px] font-bold leading-none text-zinc-600">
                  {c.notes.length}
                </span>
              )}
            </button>

            {/* Status dropdown */}
            {canMove && (
              <div className="flex items-center gap-1">
                <select
                  value={c.pipelineStatus || "novo"}
                  onChange={(e) => handleMove(e.target.value)}
                  disabled={moving}
                  className="h-7 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold text-zinc-700 focus:outline-none cursor-pointer disabled:opacity-50"
                >
                  {STAGES.filter((s) => s.movable).map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                {moving && <span className="text-[10px] text-zinc-400">…</span>}
              </div>
            )}

            {/* Client-rejected shortcut */}
            {canManage && clientRejected && !clientApproved && effectiveStage(c) !== "rejeitado" && (
              <button
                onClick={() => handleMove("rejeitado")}
                disabled={moving}
                className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Arquivar
              </button>
            )}

            {/* Primary hire CTA — always visible when eligible */}
            {showContractButton && (
              <button
                onClick={onContractOpen}
                disabled={!canOpenContractModal}
                className={[
                  "ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-all shadow-sm",
                  canOpenContractModal && clientApproved
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : canOpenContractModal
                      ? "cursor-pointer bg-zinc-900 text-white hover:bg-zinc-700"
                      : "cursor-not-allowed bg-zinc-100 text-zinc-400 shadow-none",
                ].join(" ")}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Contratar talento
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded: media + bio — always shows all sections */}
      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-4 space-y-4">

          {/* ── Quick action bar ── */}
          {canManage && (
            <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-zinc-100">
              {c.talentId && (
                <Link
                  href={`/agency/talent/${c.talentId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Ver perfil
                </Link>
              )}
              <button
                onClick={() => setNotesOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Adicionar nota
              </button>
              {canMove && (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-zinc-400">Etapa:</span>
                  <select
                    value={c.pipelineStatus || "novo"}
                    onChange={(e) => handleMove(e.target.value)}
                    disabled={moving}
                    className="h-7 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold text-zinc-700 focus:outline-none cursor-pointer disabled:opacity-50"
                  >
                    {STAGES.filter((s) => s.movable).map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {showContractButton && (
                <button
                  onClick={onContractOpen}
                  disabled={!canOpenContractModal}
                  className={[
                    "ml-auto inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-bold transition-all shadow-sm",
                    canOpenContractModal && clientApproved
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : canOpenContractModal
                        ? "cursor-pointer bg-zinc-900 text-white hover:bg-zinc-700"
                        : "cursor-not-allowed bg-zinc-100 text-zinc-400 shadow-none",
                  ].join(" ")}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Contratar talento
                </button>
              )}
            </div>
          )}

          {/* Photos */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Fotos</p>
            {photos.length > 0 ? (
              <div className={`grid gap-2 ${photos.length === 1 ? "grid-cols-1 max-w-[120px]" : photos.length === 2 ? "grid-cols-2 max-w-[260px]" : "grid-cols-3 max-w-[380px]"}`}>
                {photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="aspect-[3/4] rounded-xl overflow-hidden bg-zinc-100 block group relative">
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-zinc-400 italic">Nenhuma foto enviada</p>
            )}
          </div>

          {/* Video */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Vídeo</p>
            {c.videoUrl ? (
              <a href={c.videoUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                Abrir vídeo
              </a>
            ) : (
              <p className="text-[12px] text-zinc-400 italic">Nenhum vídeo enviado</p>
            )}
          </div>

          {/* Docs */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Documentos</p>
            {(c.curriculumUrl || c.portfolioUrl) ? (
              <div className="flex gap-2 flex-wrap">
                {c.curriculumUrl && (
                  <a href={c.curriculumUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                    Currículo
                  </a>
                )}
                {c.portfolioUrl && (
                  <a href={c.portfolioUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                    Portfólio
                  </a>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-zinc-400 italic">Nenhum documento enviado</p>
            )}
          </div>

          {/* Bio */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Bio / Perfil do talento</p>
            {c.bio ? (
              <p className="text-[12px] text-zinc-600 leading-relaxed">{c.bio}</p>
            ) : (
              <p className="text-[12px] text-zinc-400 italic">Nenhuma bio cadastrada pelo talento</p>
            )}
          </div>

          {/* Client feedback summary */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Feedback do cliente</p>
            {c.clientFeedback && (c.clientFeedback.approved + c.clientFeedback.favorite + c.clientFeedback.rejected) > 0 ? (
              <div className="space-y-2">
                {/* Aggregate counts */}
                <div className="flex flex-wrap gap-2">
                  {c.clientFeedback.approved > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                      ✓ {c.clientFeedback.approved} aprovação{c.clientFeedback.approved !== 1 ? "ões" : ""}
                    </span>
                  )}
                  {c.clientFeedback.favorite > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 ring-1 ring-amber-100">
                      ★ {c.clientFeedback.favorite} favorito{c.clientFeedback.favorite !== 1 ? "s" : ""}
                    </span>
                  )}
                  {c.clientFeedback.rejected > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-500 ring-1 ring-zinc-200">
                      ✕ {c.clientFeedback.rejected} rejeição{c.clientFeedback.rejected !== 1 ? "ões" : ""}
                    </span>
                  )}
                </div>
                {/* Named attribution — from presentations that include this candidate */}
                {(() => {
                  const entries = presentations
                    .filter((p) => p.submissionIds.includes(c.id))
                    .flatMap((p) => p.feedbackEntries);
                  if (!entries.length) return null;
                  return (
                    <div className="space-y-1 pt-1">
                      {entries.map((entry, i) => {
                        const icon  = entry.vote === "approved" ? "✓" : entry.vote === "favorite" ? "★" : "✕";
                        const color = entry.vote === "approved" ? "text-emerald-600" : entry.vote === "favorite" ? "text-amber-500" : "text-zinc-400";
                        const verb  = entry.vote === "approved" ? "aprovou" : entry.vote === "favorite" ? "favoritou" : "rejeitou";
                        return (
                          <div key={i} className="flex items-center gap-1.5 text-[11px]">
                            <span className={`font-bold ${color}`}>{icon}</span>
                            <span className="font-semibold text-zinc-800">{entry.viewerName}</span>
                            {entry.viewerCompany && <span className="text-zinc-400">({entry.viewerCompany})</span>}
                            <span className="text-zinc-400">{verb}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {/* Hire prompt if client approved and contract not sent */}
                {clientApproved && canOpenContractModal && (
                  <button
                    onClick={onContractOpen}
                    className="mt-1 w-full rounded-xl bg-emerald-600 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 transition-colors cursor-pointer shadow-sm"
                  >
                    ✓ Cliente aprovou — Contratar talento agora
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-zinc-400 italic">Nenhum feedback do cliente ainda.</p>
            )}
          </div>

          {/* Apresentações para clientes */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Apresentações para clientes</p>
            {(() => {
              const inPres = presentations.filter((p) => p.submissionIds.includes(c.id));
              if (!inPres.length) {
                return (
                  <p className="text-[12px] text-zinc-400 italic">
                    Este talento ainda não foi incluído em nenhuma apresentação enviada para clientes.
                  </p>
                );
              }
              return (
                <div className="space-y-1.5">
                  {inPres.map((p) => {
                    const fb = p.feedbackSummary;
                    const hasFb = fb.approved + fb.rejected + fb.favorite > 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-white border border-zinc-100 px-3 py-2">
                        <div className="min-w-0">
                          <span className="text-[12px] font-medium text-zinc-800 block truncate">{p.title}</span>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                            <span>{new Date(p.createdAt).toLocaleDateString("pt-BR")}</span>
                            <span>{p.viewCount} viz.</span>
                            {hasFb && (
                              <span className="text-zinc-500">
                                {fb.approved > 0 && `✓${fb.approved} `}
                                {fb.favorite > 0 && `★${fb.favorite} `}
                                {fb.rejected > 0 && `✕${fb.rejected}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <a
                          href={`/presentation/${p.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir apresentação"
                          className="flex-shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

        </div>
      )}

      {/* Notes panel */}
      {notesOpen && (
        <div className="border-t border-zinc-100 bg-zinc-50/40 px-4 py-3 space-y-3">
          {c.notes.length === 0 && (
            <p className="text-[11px] text-zinc-400 italic">Nenhuma nota ainda.</p>
          )}
          {c.notes.map((note) => (
            <div key={note.id} className="rounded-xl bg-white border border-zinc-100 px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-zinc-700">{note.authorName}</span>
                <span className="text-[10px] text-zinc-400">{relTime(note.createdAt)}</span>
              </div>
              <p className="text-[12px] text-zinc-600 leading-relaxed">{note.body}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <textarea
              rows={2}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Adicionar nota interna (visível para toda a equipe)..."
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none resize-none transition-colors"
            />
            <button
              onClick={handleAddNote}
              disabled={!noteText.trim() || savingNote}
              className="self-end rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-zinc-700 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {savingNote ? "…" : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contract modal ───────────────────────────────────────────────────────────

function ContractModal({
  job,
  candidate,
  agencyId,
  onClose,
  onSent,
}: {
  job: PipelineJob;
  candidate: PipelineCandidate;
  agencyId: string;
  onClose: () => void;
  onSent: (payload: ContractSentPayload) => void;
}) {
  const [form, setForm] = useState({
    job_date:        job.jobDate        ?? "",
    job_time:        job.jobTime        ?? "",
    location:        job.location       ?? "",
    job_description: job.description    ?? "",
    payment_amount:  String(job.budget  ?? ""),
    payment_method:  "PIX",
    additional_notes: "",
  });
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState("");

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSend() {
    setSending(true);
    setError("");

    let uploadedPath: string | null = null;
    if (contractFile) {
      // Get a signed upload URL from the server (uses service role, bypasses RLS)
      const urlRes = await fetch("/api/contracts/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id, filename: contractFile.name, filesize: contractFile.size }),
      });
      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({})) as { error?: string };
        setError("Falha ao enviar arquivo: " + (errData.error ?? "Tente novamente."));
        setSending(false);
        return;
      }
      const { signedUrl, token, path } = await urlRes.json() as { signedUrl: string; token: string; path: string };
      const { error: upErr } = await supabase.storage
        .from(CONTRACTS_BUCKET)
        .uploadToSignedUrl(path, token, contractFile, { contentType: "application/pdf" });
      if (upErr) { setError("Falha ao enviar arquivo: " + upErr.message); setSending(false); return; }
      void signedUrl; // used by supabase internally via token
      uploadedPath = path;
    }

    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        talent_id:          candidate.talentId,
        talent_user_id:     candidate.talentId,
        job_id:             job.id,
        agency_id:          agencyId,
        contract_file_url:  uploadedPath,
        job_date:           form.job_date         || null,
        job_time:           form.job_time         || null,
        location:           form.location         || null,
        job_description:    form.job_description  || null,
        payment_amount:     Number(String(form.payment_amount).replace(",", ".")),
        payment_method:     form.payment_method   || null,
        additional_notes:   form.additional_notes || null,
      }),
    });

    setSending(false);
    if (res.ok) {
      const data = await res.json() as { contract?: { id?: string; booking_id?: string | null; status?: string | null; talent_user_id?: string | null } };
      console.log("[contract sent]", {
        talentName:       candidate.talentName,
        talentId:         candidate.talentId,
        contractTalentUserId: data.contract?.talent_user_id ?? null,
      });
      onSent({
        bookingId: data.contract?.booking_id ?? null,
        bookingStatus: "pending",
        contractId: data.contract?.id ?? null,
      });
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string; message?: string };
      setError(d.error ?? d.message ?? "Falha ao enviar contrato.");
    }
  }

  const inputCls = "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-[1.5rem] shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-[16px] font-bold text-zinc-900">Enviar contrato</h2>
              <p className="text-[12px] text-zinc-500 mt-0.5">{candidate.talentName}</p>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Data do trabalho *</label>
                <input type="date" required value={form.job_date} onChange={(e) => set("job_date", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Horário *</label>
                <input type="time" required value={form.job_time} onChange={(e) => set("job_time", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Localização</label>
              <input type="text" value={form.location} onChange={(e) => set("location", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Descrição do trabalho</label>
              <textarea rows={3} value={form.job_description} onChange={(e) => set("job_description", e.target.value)} className={`${inputCls} resize-none`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Valor (BRL) *</label>
                <input type="number" min={1} step={0.01} required value={form.payment_amount} onChange={(e) => set("payment_amount", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Método</label>
                <input type="text" value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Notas adicionais</label>
              <textarea rows={2} value={form.additional_notes} onChange={(e) => set("additional_notes", e.target.value)} placeholder="Instruções, detalhes logísticos..." className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>Arquivo do contrato (opcional)</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
                className="w-full text-[12px] text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:text-zinc-700 hover:file:bg-zinc-200 cursor-pointer"
              />
            </div>

            {error && (
              <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5">{error}</p>
            )}
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={onClose} className="flex-1 py-3 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer">
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !form.job_date || !form.job_time || !form.payment_amount}
              className="flex-1 py-3 text-[13px] font-semibold bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            >
              {sending ? "Enviando…" : "Enviar contrato"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
