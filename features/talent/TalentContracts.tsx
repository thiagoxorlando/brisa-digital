"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TalentContract = {
  id:                 string;
  agencyName:         string;
  jobDate:            string | null;
  jobTime:            string | null;
  location:           string | null;
  jobDescription:     string | null;
  paymentAmount:      number;
  paymentMethod:      string | null;
  additionalNotes:    string | null;
  status:             string;
  createdAt:          string;
  contractFileUrl:    string | null;   // original — uploaded by agency
  signedContractUrl:  string | null;   // signed version — uploaded by talent
};

export type ApprovedSubmission = {
  submissionId: string;
  jobId:        string;
  jobTitle:     string;
  agencyId:     string;
  agencyName:   string;
};

// ── Status map ────────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; cls: string }> = {
  sent:      { label: "Aguardando Assinatura", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  signed:    { label: "Assinado",              cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  accepted:  { label: "Assinado",              cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  confirmed: { label: "Confirmado",            cls: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" },
  paid:      { label: "Pago",                  cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  rejected:  { label: "Rejeitado",             cls: "bg-rose-50 text-rose-600 ring-1 ring-rose-100" },
  cancelled: { label: "Cancelado",             cls: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200" },
};
const STATUS_FALLBACK = { label: "Em andamento", cls: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}
function fmtJobDate(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

type PeriodFilter = "today" | "month" | "all";

const LIST_PREVIEW_LIMIT = 5;

function periodMatches(date: string | null | undefined, period: PeriodFilter) {
  if (period === "all") return true;
  if (!date) return false;
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return false;
  const now = new Date();
  if (period === "today") return value.toDateString() === now.toDateString();
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
}

function FilterTabs({ value, onChange }: { value: PeriodFilter; onChange: (value: PeriodFilter) => void }) {
  const options: Array<{ value: PeriodFilter; label: string }> = [
    { value: "today", label: "Hoje" },
    { value: "month", label: "Este mês" },
    { value: "all", label: "Total" },
  ];

  return (
    <div className="inline-flex rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={[
            "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer",
            value === option.value
              ? "bg-[#1F2D2E] text-white"
              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800",
          ].join(" ")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function visibleItems<T>(items: T[], expanded: boolean) {
  return expanded ? items : items.slice(0, LIST_PREVIEW_LIMIT);
}

function ShowMoreButton({
  total,
  expanded,
  onClick,
}: {
  total: number;
  expanded: boolean;
  onClick: () => void;
}) {
  if (total <= LIST_PREVIEW_LIMIT) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-zinc-100 bg-white px-5 py-3 text-[12px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 cursor-pointer"
    >
      {expanded ? "Ver menos" : `Ver mais ${total - LIST_PREVIEW_LIMIT}`}
    </button>
  );
}

// Returns the best URL to download: signed > original > null
function latestFileUrl(c: TalentContract): string | null {
  return c.signedContractUrl ?? c.contractFileUrl ?? null;
}

function downloadFallback(c: TalentContract) {
  const lines = [
    "DETALHES DO CONTRATO",
    "====================",
    `Agência:            ${c.agencyName}`,
    `Status:             ${c.status}`,
    `Valor do Pagamento: ${brl(c.paymentAmount)}`,
    `Forma de Pagamento: ${c.paymentMethod ?? "—"}`,
    `Data do Trabalho:   ${c.jobDate ? fmtJobDate(c.jobDate) : "A definir"}`,
    `Horário:            ${c.jobTime ?? "—"}`,
    `Local:              ${c.location ?? "—"}`,
    `Recebido em:        ${fmtDate(c.createdAt)}`,
    "",
    "DESCRIÇÃO DA VAGA",
    "-----------------",
    c.jobDescription ?? "Sem descrição fornecida.",
    "",
    "NOTAS ADICIONAIS",
    "----------------",
    c.additionalNotes ?? "Nenhuma.",
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `contrato-${c.agencyName.replace(/\s+/g, "-").toLowerCase()}-${c.id.slice(0, 8)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function openOrDownload(c: TalentContract) {
  const url = latestFileUrl(c);
  if (url) {
    const a    = document.createElement("a");
    a.href     = url;
    a.target   = "_blank";
    a.rel      = "noopener noreferrer";
    a.click();
  } else {
    downloadFallback(c);
  }
}

// ── Contract row ──────────────────────────────────────────────────────────────

function ContractRow({
  contract: c,
  onAction,
  acting,
}: {
  contract: TalentContract;
  onAction: (id: string, action: "sign" | "reject", extra?: string) => void;
  acting: string | null;
}) {
  const [open, setOpen]           = useState(c.status === "sent");
  const [showReject, setShowReject] = useState(false);
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const [uploading, setUploading]   = useState(false);

  const st          = STATUS[c.status] ?? STATUS_FALLBACK;
  const isPending   = c.status === "sent";
  const isCompleted = ["signed", "confirmed", "paid"].includes(c.status);
  const fileUrl     = latestFileUrl(c);

  // Whether the job date has passed (completed job)
  const jobPast = c.jobDate
    ? new Date(c.jobDate + "T23:59:59") < new Date()
    : false;

  const hasSigned   = !!c.signedContractUrl;
  const hasOriginal = !!c.contractFileUrl;
  // Show DocuSign upload when: pending + agency uploaded a file + talent hasn't signed yet
  const needsUpload = isPending && hasOriginal && !hasSigned;

  async function handleSignAndUpload() {
    if (!signedFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", signedFile);
      fd.append("path", `contracts/signed/${c.id}_${Date.now()}_${signedFile.name}`);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (!uploadRes.ok) {
        const j = await uploadRes.json().catch(() => ({}));
        console.error("[sign upload]", j.error);
        setUploading(false);
        return;
      }
      const { url } = await uploadRes.json();
      onAction(c.id, "sign", url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={[
      "bg-white rounded-2xl border overflow-hidden transition-all",
      isPending
        ? "border-amber-200 shadow-[0_0_0_3px_rgba(251,191,36,0.08),0_4px_16px_rgba(0,0,0,0.04)]"
        : "border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)]",
    ].join(" ")}>

      {/* ── Collapsed header ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-zinc-50/60 transition-colors text-left cursor-pointer"
      >
        <svg
          className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 truncate">{c.agencyName}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">Recebido em {fmtDate(c.createdAt)}</p>
        </div>

        <p className="text-[14px] font-semibold text-zinc-900 tabular-nums flex-shrink-0 hidden sm:block">
          {brl(c.paymentAmount)}
        </p>

        {/* Status badge — show "Assinado" if talent uploaded signed version */}
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${
          hasSigned && isPending
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
            : st.cls
        }`}>
          {hasSigned && isPending ? "Assinado" : st.label}
        </span>

        {/* Download latest file */}
        {fileUrl && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); openOrDownload(c); }}
            className="flex-shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
            aria-label="Download"
            title={hasSigned ? "Baixar versão assinada" : "Baixar contrato"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </span>
        )}
      </button>

      {/* ── Expanded details ── */}
      {open && (
        <div className="border-t border-zinc-50 px-6 py-5 space-y-5">

          {/* Details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Data da Vaga</p>
              <p className="text-[13px] font-medium text-zinc-800">{fmtJobDate(c.jobDate)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Horário</p>
              <p className="text-[13px] font-medium text-zinc-800">{c.jobTime ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Localização</p>
              <p className="text-[13px] font-medium text-zinc-800">{c.location ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Pagamento</p>
              <p className="text-[13px] font-medium text-zinc-800">
                {brl(c.paymentAmount)}{c.paymentMethod ? ` · ${c.paymentMethod}` : ""}
              </p>
            </div>
          </div>

          {c.jobDescription && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Descrição da Vaga</p>
              <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{c.jobDescription}</p>
            </div>
          )}

          {c.additionalNotes && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Observações Adicionais</p>
              <p className="text-[13px] text-zinc-500 leading-relaxed whitespace-pre-line">{c.additionalNotes}</p>
            </div>
          )}

          {/* ── File version indicator ── */}
          {(hasOriginal || hasSigned) && (
            <div className="flex items-center gap-3 flex-wrap">
              {hasOriginal && (
                <a
                  href={c.contractFileUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 bg-zinc-50 border border-zinc-200 hover:border-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Original
                </a>
              )}
              {hasSigned && (
                <a
                  href={c.signedContractUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 hover:border-emerald-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Versão assinada
                </a>
              )}
            </div>
          )}

          {/* ── Actions ── */}
          <div className="space-y-3 pt-1">

            {/* CASE 1a: Agency uploaded file, talent hasn't signed yet → DocuSign flow */}
            {needsUpload && !showReject && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-indigo-900">Aguardando Assinatura</p>
                    <p className="text-[12px] text-indigo-600 leading-relaxed mt-0.5">
                      Baixe o contrato, assine via DocuSign ou outra ferramenta, e envie a versão assinada abaixo.
                    </p>
                  </div>
                  <a
                    href={c.contractFileUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Baixar
                  </a>
                </div>

                {/* Upload signed version */}
                <label className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] bg-white border border-indigo-200 rounded-xl hover:border-indigo-300 cursor-pointer transition-colors">
                  <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className={signedFile ? "text-zinc-800 truncate flex-1" : "text-zinc-400 flex-1"}>
                    {signedFile ? signedFile.name : "Selecionar contrato assinado…"}
                  </span>
                  {signedFile && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setSignedFile(null); }}
                      className="text-zinc-400 hover:text-rose-500 transition-colors flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <input
                    type="file" accept=".pdf,.doc,.docx" className="sr-only"
                    onChange={(e) => setSignedFile(e.target.files?.[0] ?? null)}
                  />
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowReject(true)}
                    className="px-4 py-2 text-[13px] font-medium border border-zinc-200 bg-white rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer flex-1"
                  >
                    Rejeitar
                  </button>
                  <button
                    onClick={handleSignAndUpload}
                    disabled={!signedFile || uploading || acting === c.id}
                    className="flex-1 px-5 py-2 text-[13px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading || acting === c.id ? "Enviando…" : "Enviar Contrato Assinado"}
                  </button>
                </div>
              </div>
            )}

            {/* CASE 1b: Talent already uploaded signed version, pending platform confirmation */}
            {isPending && hasSigned && !showReject && (
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-emerald-800">Contrato assinado enviado</p>
                  <p className="text-[12px] text-emerald-600 mt-0.5">Aguardando a agência confirmar o recebimento.</p>
                </div>
              </div>
            )}

            {/* CASE 2: No contract file — accept directly without signing */}
            {isPending && !hasOriginal && !hasSigned && !showReject && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3.5">
                  <svg className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[13px] text-violet-800">
                    Este trabalho não possui contrato. Você pode aceitar a vaga sem assinatura.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowReject(true)}
                    className="px-4 py-2 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer"
                  >
                    Rejeitar
                  </button>
                  <button
                    onClick={() => onAction(c.id, "sign")}
                    disabled={acting === c.id}
                    className="flex-1 px-5 py-2 text-[13px] font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {acting === c.id ? "Aceitando…" : "Aceitar Vaga"}
                  </button>
                </div>
              </div>
            )}

            {/* CASE 3: Completed job (date passed) with no file at all */}
            {!isPending && jobPast && !hasOriginal && !hasSigned && (
              <div className="flex items-start gap-3 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-[13px] text-zinc-500">
                  Este trabalho foi concluído sem contrato anexado.
                </p>
              </div>
            )}

            {/* Reject confirmation */}
            {isPending && showReject && (
              <div className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 w-full">
                <p className="text-[13px] font-medium text-rose-800 flex-1">Confirmar rejeição?</p>
                <button
                  onClick={() => setShowReject(false)}
                  className="px-3 py-1.5 text-[12px] font-medium border border-zinc-200 rounded-lg bg-white hover:bg-zinc-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => onAction(c.id, "reject")}
                  disabled={acting === c.id}
                  className="px-3 py-1.5 text-[12px] font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {acting === c.id ? "Rejeitando…" : "Confirmar"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TalentContracts({
  contracts: initial,
  approvedSubmissions: initialSubs = [],
}: {
  contracts:            TalentContract[];
  approvedSubmissions?: ApprovedSubmission[];
}) {
  const router = useRouter();
  const [contracts, setContracts]     = useState<TalentContract[]>(initial);
  const [pendingSubs, setPendingSubs] = useState<ApprovedSubmission[]>(initialSubs);
  const [acting, setActing]           = useState<string | null>(null);
  const [acceptingJob, setAcceptingJob] = useState<string | null>(null);
  const [toast, setToast]             = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [period, setPeriod]           = useState<PeriodFilter>("all");
  const [showAllPendingSubs, setShowAllPendingSubs] = useState(false);
  const [showAllPending, setShowAllPending] = useState(false);
  const [showAllActive, setShowAllActive] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleAction(
    id: string,
    action: "sign" | "reject",
    extra?: string
  ) {
    setActing(id);

    if (action === "sign") {
      const body: Record<string, string> = {};
      if (extra) body.signed_contract_url = extra;
      const res = await fetch(`/api/contracts/${id}/sign`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (res.ok) {
        setContracts((prev) =>
          prev.map((c) => c.id === id
            ? { ...c, status: "signed", ...(extra ? { signedContractUrl: extra } : {}) }
            : c
          )
        );
        showToast(
          extra
            ? "Contrato assinado enviado com sucesso."
            : "Contrato assinado — reserva aguardando confirmação da agência."
        );
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error ?? "Erro ao assinar contrato.", "error");
      }
      setActing(null);
      return;
    }

    // reject
    const res = await fetch(`/api/contracts/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "reject" }),
    });

    if (res.ok) {
      setContracts((prev) => prev.map((c) => c.id === id ? { ...c, status: "rejected" } : c));
      showToast("Contrato rejeitado.", "error");
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error ?? "Algo deu errado.", "error");
    }
    setActing(null);
  }

  async function handleAcceptWithoutContract(sub: ApprovedSubmission) {
    setAcceptingJob(sub.jobId);
    const { supabase } = await import("@/lib/supabase");
    const { data: { user } } = await supabase.auth.getUser();
    const res = await fetch("/api/bookings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        job_id:    sub.jobId,
        agency_id: sub.agencyId,
        talent_id: user?.id,
        job_title: sub.jobTitle,
        status:    "pending",
      }),
    });
    if (res.ok) {
      setPendingSubs((prev) => prev.filter((s) => s.jobId !== sub.jobId));
      showToast("Aceito! Reserva criada com sucesso.");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error ?? "Algo deu errado.", "error");
    }
    setAcceptingJob(null);
  }

  const now = new Date();
  const filteredContracts = contracts.filter((c) => periodMatches(c.createdAt, period));

  const pending = filteredContracts.filter((c) => c.status === "sent");
  const active  = filteredContracts.filter((c) =>
    c.status !== "sent" &&
    c.status !== "rejected" &&
    c.status !== "cancelled" &&
    !(c.jobDate && new Date(c.jobDate + "T23:59:59") < now)
  );
  const done = filteredContracts.filter((c) =>
    c.status !== "sent" &&
    c.status !== "rejected" &&
    c.status !== "cancelled" &&
    c.jobDate != null &&
    new Date(c.jobDate + "T23:59:59") < now
  );
  const history = filteredContracts.filter((c) => c.status === "rejected" || c.status === "cancelled");

  return (
    <div className="max-w-3xl space-y-8">

      {/* Toast */}
      {toast && (
        <div className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-[13px] font-medium text-white",
          toast.type === "success" ? "bg-emerald-600" : "bg-rose-600",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Talento</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Contratos</h1>
        <p className="text-[13px] text-zinc-400 mt-1">
          {contracts.length} contrato{contracts.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-zinc-400">Filtrar contratos por período</p>
        <FilterTabs value={period} onChange={setPeriod} />
      </div>

      {/* Approved submissions without a contract */}
      {pendingSubs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-zinc-700">Vagas para Aceitar</h2>
            <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
              {pendingSubs.length}
            </span>
          </div>
          <div className="space-y-2">
            {visibleItems(pendingSubs, showAllPendingSubs).map((sub) => (
              <div
                key={sub.jobId}
                className="bg-white rounded-2xl border border-violet-200 shadow-[0_0_0_3px_rgba(139,92,246,0.06)] overflow-hidden"
              >
                <div className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-zinc-900 truncate">{sub.jobTitle}</p>
                    <p className="text-[12px] text-zinc-400 mt-0.5">{sub.agencyName} · Candidatura aprovada</p>
                    <p className="text-[12px] text-zinc-500 mt-2 leading-relaxed">
                      Este trabalho não possui contrato. Você pode aceitar a vaga sem assinatura.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                      Aprovado
                    </span>
                    <button
                      onClick={() => handleAcceptWithoutContract(sub)}
                      disabled={acceptingJob === sub.jobId}
                      className="px-4 py-2 text-[13px] font-semibold bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:bg-zinc-300 text-white rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      {acceptingJob === sub.jobId ? "Aceitando…" : "Aceitar Vaga"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <ShowMoreButton
              total={pendingSubs.length}
              expanded={showAllPendingSubs}
              onClick={() => setShowAllPendingSubs((value) => !value)}
            />
          </div>
        </section>
      )}

      {/* Pending signature */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-zinc-700">Aguardando Sua Ação</h2>
          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {pending.length}
          </span>
        </div>
        {pending.length > 0 ? (
          <div className="space-y-2">
            {visibleItems(pending, showAllPending).map((c) => (
              <ContractRow key={c.id} contract={c} onAction={handleAction} acting={acting} />
            ))}
            <ShowMoreButton
              total={pending.length}
              expanded={showAllPending}
              onClick={() => setShowAllPending((value) => !value)}
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 py-8 text-center">
            <p className="text-[13px] text-zinc-400">Nenhum contrato pendente de revisão</p>
          </div>
        )}
      </section>

      {/* Active / confirmed */}
      {active.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-zinc-700">Contratos Ativos</h2>
            <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              {active.length}
            </span>
          </div>
          <div className="space-y-2">
            {visibleItems(active, showAllActive).map((c) => (
              <ContractRow key={c.id} contract={c} onAction={handleAction} acting={acting} />
            ))}
            <ShowMoreButton
              total={active.length}
              expanded={showAllActive}
              onClick={() => setShowAllActive((value) => !value)}
            />
          </div>
        </section>
      )}

      {/* Completed jobs (date passed) */}
      {done.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-zinc-700">Vagas Realizadas</h2>
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              {done.length}
            </span>
          </div>
          <div className="space-y-2">
            {visibleItems(done, showAllDone).map((c) => (
              <ContractRow key={c.id} contract={c} onAction={handleAction} acting={acting} />
            ))}
            <ShowMoreButton
              total={done.length}
              expanded={showAllDone}
              onClick={() => setShowAllDone((value) => !value)}
            />
          </div>
        </section>
      )}

      {/* Rejected / cancelled */}
      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-semibold text-zinc-500">Cancelados / Rejeitados</h2>
          <div className="space-y-2">
            {visibleItems(history, showAllHistory).map((c) => (
              <ContractRow key={c.id} contract={c} onAction={handleAction} acting={acting} />
            ))}
            <ShowMoreButton
              total={history.length}
              expanded={showAllHistory}
              onClick={() => setShowAllHistory((value) => !value)}
            />
          </div>
        </section>
      )}

      {contracts.length > 0 && filteredContracts.length === 0 && pendingSubs.length === 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 py-12 text-center">
          <p className="text-[14px] font-medium text-zinc-500">Nenhum contrato neste período</p>
          <p className="text-[13px] text-zinc-400 mt-1">Ajuste o filtro para ver outros registros.</p>
        </div>
      )}

      {contracts.length === 0 && pendingSubs.length === 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center">
          <p className="text-[14px] font-medium text-zinc-500">Nenhum contrato ainda</p>
          <p className="text-[13px] text-zinc-400 mt-1">Contratos enviados por agências aparecerão aqui.</p>
        </div>
      )}
    </div>
  );
}


