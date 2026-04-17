"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRole } from "@/lib/RoleProvider";
import { useSubscription } from "@/lib/SubscriptionContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Job = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  deadline: string;
  jobDate?: string | null;
  status: "open" | "closed" | "draft" | "inactive";
  postedAt: string;
  agencyId?: string;
  numberOfTalentsRequired?: number;
};

type Submission = {
  id: string;
  talentId: string | null;
  talentName: string;
  avatarUrl: string | null;
  bio: string;
  status: string;
  mode: string;
  submittedAt: string;
  photoFrontUrl: string | null;
  photoLeftUrl:  string | null;
  photoRightUrl: string | null;
  videoUrl:      string | null;
};

export type JobBooking = {
  id: string;
  talentId: string | null;
  talentName: string;
  jobTitle: string;
  price: number;
  status: string;
  createdAt: string;
};

type ContractTarget = {
  submissionId: string;
  talentId: string;
  talentName: string;
};

type ContractForm = {
  job_date: string;
  job_time: string;
  location: string;
  job_description: string;
  payment_amount: string;
  payment_method: string;
  additional_notes: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  }).format(n);
}

function formatBudget(n: number) { return brl(n); }

function formatDate(raw: string) {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("pt-BR", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function daysUntil(raw: string) {
  const diff = new Date(raw + "T00:00:00").getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Job["status"], string> = {
  open:     "bg-emerald-50 text-emerald-600 border border-emerald-100",
  closed:   "bg-zinc-100  text-zinc-500   border border-zinc-200",
  draft:    "bg-amber-50  text-amber-600  border border-amber-100",
  inactive: "bg-zinc-100  text-zinc-400   border border-zinc-200",
};

const BOOKING_STATUS: Record<string, string> = {
  pending:         "bg-violet-50  text-violet-700  ring-1 ring-violet-100",
  pending_payment: "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  confirmed:       "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  paid:            "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  cancelled:       "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
};

const SUBMISSION_STATUS: Record<string, string> = {
  pending:  "bg-amber-50  text-amber-700  ring-1 ring-amber-100",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  rejected: "bg-rose-50   text-rose-600   ring-1 ring-rose-100",
};

const CATEGORY_STRIPES: Record<string, string> = {
  "Lifestyle & Fashion": "from-rose-400 via-pink-400 to-fuchsia-400",
  "Technology":          "from-sky-500 via-blue-500 to-indigo-500",
  "Food & Cooking":      "from-amber-400 via-orange-400 to-red-400",
  "Health & Fitness":    "from-emerald-400 via-teal-400 to-cyan-400",
  "Travel":              "from-indigo-400 via-violet-400 to-purple-400",
  "Beauty":              "from-pink-400 via-rose-400 to-red-300",
  "Other":               "from-zinc-300 via-zinc-400 to-zinc-500",
};

const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-400 to-purple-600",
];

function stripe(category: string) {
  return CATEGORY_STRIPES[category] ?? CATEGORY_STRIPES["Other"];
}

function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
}

// ─── Detail row ───────────────────────────────────────────────────────────────

function DetailRow({
  icon, label, value, highlight,
}: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-zinc-50 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-zinc-50 flex items-center justify-center flex-shrink-0 text-zinc-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 leading-none mb-1">
          {label}
        </p>
        <p className={`text-[14px] font-medium leading-snug ${highlight ? "text-rose-500" : "text-zinc-800"}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Media ────────────────────────────────────────────────────────────────────

const PHOTO_LABELS = ["Front", "Left", "Right"] as const;


function VideoPlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video bg-zinc-950 overflow-hidden">
      {playing ? (
        <video src={url} controls autoPlay className="w-full h-full object-contain" />
      ) : (
        <button onClick={() => setPlaying(true)} className="w-full h-full flex flex-col items-center justify-center gap-3 group cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-white/15 group-hover:bg-white/25 transition-colors flex items-center justify-center ring-1 ring-white/20">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <p className="text-[11px] font-medium text-white/50 uppercase tracking-widest">Vídeo de Apresentação</p>
        </button>
      )}
    </div>
  );
}

// ─── Contract confirmation modal ──────────────────────────────────────────────

function ContractConfirmModal({
  targets,
  onConfirm,
  onCancel,
}: {
  targets: ContractTarget[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const names = targets.map((t) => t.talentName).join(", ");
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 space-y-5">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-[16px] font-semibold text-zinc-900">
              Enviar {targets.length > 1 ? `${targets.length} contratos` : "contrato"}?
            </h3>
            <p className="text-[13px] text-zinc-400 mt-1.5 leading-relaxed">
              {names}
            </p>
            <p className="text-[12px] text-zinc-400 mt-1">
              Cada talento receberá os mesmos termos do contrato e poderá aceitar ou rejeitar.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              Não, voltar
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition-colors cursor-pointer"
            >
              Sim, enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Contract form modal ───────────────────────────────────────────────────────

function ContractModal({
  targets,
  job,
  agencyId,
  onClose,
  onSent,
}: {
  targets: ContractTarget[];
  job: Job;
  agencyId: string;
  onClose: () => void;
  onSent: (submissionIds: string[]) => void;
}) {
  const [form, setForm] = useState<ContractForm>({
    job_date:        job.jobDate ?? "",
    job_time:        "",
    location:        "",
    job_description: job.description,
    payment_amount:  String(job.budget),
    payment_method:  "PIX",
    additional_notes: "",
  });
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent]             = useState(false);
  const [error, setError]           = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  function set(key: keyof ContractForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowConfirm(true);
  }

  async function handleConfirmSend() {
    setShowConfirm(false);
    setSubmitting(true);
    setError("");

    const payload = {
      job_id:           job.id,
      agency_id:        agencyId,
      job_date:         form.job_date        || null,
      job_time:         form.job_time        || null,
      location:         form.location        || null,
      job_description:  form.job_description || null,
      payment_amount:   Number(form.payment_amount),
      payment_method:   form.payment_method  || null,
      additional_notes: form.additional_notes || null,
    };

    const responses = await Promise.all(
      targets.map((t) =>
        fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, talent_id: t.talentId }),
        })
      )
    );

    const failed = responses.filter((r) => !r.ok);
    if (failed.length > 0) {
      setError(`${failed.length} contrato(s) não puderam ser enviados. Tente novamente.`);
      setSubmitting(false);
      return;
    }

    // Capture contract IDs for file upload
    const contractIds: string[] = [];
    for (const r of responses) {
      try {
        const data = await r.clone().json();
        if (data?.contract?.id) contractIds.push(data.contract.id);
      } catch {}
    }

    // Upload contract file and attach to all created contracts
    if (contractFile && contractIds.length > 0) {
      const fd = new FormData();
      fd.append("file", contractFile);
      fd.append("path", `contracts/${Date.now()}_${contractFile.name}`);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (uploadRes.ok) {
        const { url } = await uploadRes.json();
        await Promise.all(
          contractIds.map((cId) =>
            fetch(`/api/contracts/${cId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "set_file_url", contract_file_url: url }),
            })
          )
        );
      }
    }

    setSent(true);
    onSent(targets.map((t) => t.submissionId));
    setSubmitting(false);
  }

  const inputCls = "w-full px-3.5 py-2.5 text-[13px] bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:bg-white focus:outline-none transition-colors";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5";

  return (
    <>
      {showConfirm && (
        <ContractConfirmModal
          targets={targets}
          onConfirm={handleConfirmSend}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
          onClick={sent ? onClose : undefined}
        />
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">

            {/* Header stripe */}
            <div className={`h-1 bg-gradient-to-r ${stripe(job.category)}`} />

            {sent ? (
              /* ── Success state ── */
              <div className="p-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold text-zinc-900">
                    {targets.length > 1 ? `${targets.length} Contratos Enviados` : "Contrato Enviado"}
                  </h3>
                  <p className="text-[13px] text-zinc-400 mt-1">
                    {targets.length > 1
                      ? `${targets.map((t) => t.talentName).join(", ")} serão notificados. Reservas pendentes criadas.`
                      : `${targets[0]?.talentName} será notificado e poderá aceitar ou rejeitar. Uma reserva pendente foi criada.`
                    }
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    Voltar para Vaga
                  </button>
                  <Link
                    href="/agency/contracts"
                    className="flex-1 py-2.5 text-[13px] font-semibold bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors text-center"
                  >
                    Ver Contratos
                  </Link>
                </div>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleFormSubmit} className="p-7 space-y-5">
                {/* Title + talent */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">Novo Contrato</p>
                    <h3 className="text-[16px] font-semibold text-zinc-900 truncate">{job.title}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2">
                    {targets.slice(0, 3).map((t) => (
                      <div key={t.talentId} className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGradient(t.talentName)} flex items-center justify-center text-[10px] font-bold text-white`}>
                        {initials(t.talentName)}
                      </div>
                    ))}
                    {targets.length > 3 && (
                      <span className="text-[11px] font-semibold text-zinc-500">+{targets.length - 3}</span>
                    )}
                  </div>
                </div>

                {error && (
                  <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}

                {/* Schedule */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Data da Vaga *</label>
                    <input
                      type="date"
                      required
                      value={form.job_date}
                      onChange={(e) => set("job_date", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Horário da Vaga *</label>
                    <input
                      type="time"
                      required
                      value={form.job_time}
                      onChange={(e) => set("job_time", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className={labelCls}>Localização *</label>
                  <input
                    type="text"
                    required
                    placeholder="Cidade, endereço ou 'Remoto'"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Job description */}
                <div>
                  <label className={labelCls}>Descrição da Vaga *</label>
                  <textarea
                    required
                    rows={3}
                    value={form.job_description}
                    onChange={(e) => set("job_description", e.target.value)}
                    className={`${inputCls} resize-none`}
                  />
                </div>

                {/* Payment */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Valor do Pagamento (BRL) *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      step={1}
                      value={form.payment_amount}
                      onChange={(e) => set("payment_amount", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Método de Pagamento</label>
                    <input
                      type="text"
                      placeholder="Transferência bancária, cheque…"
                      value={form.payment_method}
                      onChange={(e) => set("payment_method", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className={labelCls}>Observações Adicionais</label>
                  <textarea
                    rows={2}
                    placeholder="Requisitos de vestuário, pessoa de contato, etc."
                    value={form.additional_notes}
                    onChange={(e) => set("additional_notes", e.target.value)}
                    className={`${inputCls} resize-none`}
                  />
                </div>

                {/* Contract file upload */}
                <div>
                  <label className={labelCls}>Contrato (PDF) — opcional</label>
                  <label className="flex items-center gap-3 w-full px-3.5 py-2.5 text-[13px] bg-zinc-50 border border-zinc-200 rounded-xl hover:border-zinc-300 cursor-pointer transition-colors">
                    <svg className="w-4 h-4 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className={contractFile ? "text-zinc-800 truncate" : "text-zinc-400"}>
                      {contractFile ? contractFile.name : "Anexar contrato para o talento assinar…"}
                    </span>
                    {contractFile && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setContractFile(null); }}
                        className="ml-auto text-zinc-400 hover:text-rose-500 transition-colors flex-shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="sr-only"
                      onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <p className="text-[11px] text-zinc-400 mt-1.5">
                    Se anexar, o talento precisará assinar e reenviar o documento.
                  </p>
                </div>

                {/* Fee info */}
                <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Taxa da plataforma: <strong className="text-zinc-600 mx-1">15%</strong> · Talento recebe: <strong className="text-zinc-600 mx-1">85%</strong> do valor combinado
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 text-[13px] font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Enviando…" : "Revisar e Enviar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Submission row (collapsible list item) ───────────────────────────────────

function SubmissionCard({
  submission,
  jobCategory,
  hasSentContract,
  isAgency,
  isSelected,
  onSelect,
  onToggleSelect,
  onDelete,
}: {
  submission: Submission;
  jobCategory: string;
  hasSentContract: boolean;
  isAgency: boolean;
  isSelected?: boolean;
  onSelect: () => void;
  onToggleSelect?: () => void;
  onDelete?: () => void;
}) {
  const { isActive } = useSubscription();
  const [expanded, setExpanded] = useState(false);
  const statusCls = SUBMISSION_STATUS[submission.status] ?? SUBMISSION_STATUS["pending"];
  const hasMedia = !!(submission.photoFrontUrl || submission.photoLeftUrl || submission.photoRightUrl || submission.videoUrl);
  const photos = [submission.photoFrontUrl, submission.photoLeftUrl, submission.photoRightUrl].filter(Boolean) as string[];

  return (
    <div className={hasSentContract ? "border-l-2 border-emerald-400" : ""}>
      {/* Collapsed row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50/70 transition-colors cursor-pointer"
      >
        {/* Avatar */}
        {submission.avatarUrl ? (
          <img src={submission.avatarUrl} alt={submission.talentName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(submission.talentName)} flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white`}>
            {initials(submission.talentName)}
          </div>
        )}

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-zinc-900 leading-snug truncate">{submission.talentName}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {submission.mode === "self" ? "Candidatura própria" : "Indicado"}
            {" · "}
            {formatDate(submission.submittedAt)}
            {hasMedia && (
              <span className="ml-2 text-violet-500 font-medium">
                {photos.length > 0 && `${photos.length} foto${photos.length !== 1 ? "s" : ""}`}
                {photos.length > 0 && submission.videoUrl && " · "}
                {submission.videoUrl && "vídeo"}
              </span>
            )}
          </p>
        </div>

        {/* Status + contract badge */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusCls}`}>
            {submission.status}
          </span>

          {isAgency && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Deletar candidatura"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}

          {isAgency && (
            hasSentContract ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Enviado
              </span>
            ) : submission.talentId ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
                  className={[
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer",
                    isSelected ? "bg-zinc-900 border-zinc-900" : "border-zinc-300 hover:border-zinc-500",
                  ].join(" ")}
                  title={isSelected ? "Desmarcar" : "Selecionar para contrato em lote"}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                {isActive ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelect(); }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white transition-all cursor-pointer"
                  >
                    Enviar Contrato
                  </button>
                ) : (
                  <Link
                    href="/agency/finances"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                  >
                    Reativar
                  </Link>
                )}
              </div>
            ) : null
          )}
        </div>

        {/* Chevron */}
        <svg className={`w-4 h-4 text-zinc-300 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded: photos + video + bio */}
      {expanded && (
        <div className="border-t border-zinc-50 bg-zinc-50/50 px-5 py-4 space-y-4">
          {hasMedia ? (
            <>
              {photos.length > 0 && (
                <div className={`grid gap-3 ${photos.length === 1 ? "grid-cols-1 max-w-xs" : photos.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="aspect-[3/4] rounded-xl overflow-hidden bg-zinc-100 block group relative">
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <svg className="w-5 h-5 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    </a>
                  ))}
                </div>
              )}
              {submission.videoUrl && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Vídeo</p>
                  <VideoPlayer url={submission.videoUrl} />
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-zinc-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-[12px]">Nenhuma mídia enviada</p>
            </div>
          )}
          {submission.bio && (
            <p className="text-[13px] text-zinc-500 leading-relaxed">{submission.bio}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Booking row ──────────────────────────────────────────────────────────────

function BookingRow({ booking, onCancel, onConfirm, onMarkPaid }: {
  booking: JobBooking;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
  onMarkPaid: (id: string) => void;
}) {
  const [busy, setBusy] = useState<"cancel" | "confirm" | "paid" | null>(null);
  const [balanceError, setBalanceError] = useState<{ required: number; available: number } | null>(null);
  const stCls = BOOKING_STATUS[booking.status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
  const canCancel   = booking.status !== "cancelled" && booking.status !== "paid" && booking.status !== "confirmed";
  const canConfirm  = booking.status === "pending_payment";
  const canMarkPaid = booking.status === "confirmed";

  const STATUS_LABELS: Record<string, string> = {
    pending:         "Pendente",
    pending_payment: "Pendente Depósito",
    confirmed:       "Confirmado",
    paid:            "Pago",
    cancelled:       "Cancelado",
  };

  async function handleCancel() {
    if (!confirm(`Cancelar reserva de ${booking.talentName}?`)) return;
    setBusy("cancel");
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (res.ok) onCancel(booking.id);
    setBusy(null);
  }

  async function handleConfirm() {
    setBalanceError(null);
    setBusy("confirm");
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "confirmed" }),
    });
    if (res.status === 402) {
      const d = await res.json();
      setBalanceError({ required: d.required, available: d.available });
    } else if (res.ok) {
      onConfirm(booking.id);
    }
    setBusy(null);
  }

  async function handleMarkPaid() {
    setBusy("paid");
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_paid: true }),
    });
    if (res.ok) onMarkPaid(booking.id);
    setBusy(null);
  }

  return (
    <div className="px-6 py-4 space-y-3">
      <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 truncate">{booking.talentName}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">{formatDate(booking.createdAt)}</p>
        </div>
        <p className="text-[14px] font-semibold text-zinc-900 tabular-nums flex-shrink-0">
          {booking.price > 0 ? brl(booking.price) : "—"}
        </p>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${stCls}`}>
          {STATUS_LABELS[booking.status] ?? booking.status}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canConfirm && (
            <button
              onClick={handleConfirm}
              disabled={busy === "confirm"}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy === "confirm" ? "Verificando…" : "Confirmar Reserva"}
            </button>
          )}
          {canMarkPaid && (
            <button
              onClick={handleMarkPaid}
              disabled={busy === "paid"}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy === "paid" ? "…" : "Marcar como Pago"}
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={busy === "cancel"}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-zinc-500 hover:text-rose-600 border border-zinc-200 hover:border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy === "cancel" ? "…" : "Cancelar"}
            </button>
          )}
        </div>
      </div>

      {/* Insufficient balance banner */}
      {balanceError && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-amber-800">Saldo insuficiente</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Necessário: <strong>{brl(balanceError.required)}</strong> · Disponível: <strong>{brl(balanceError.available)}</strong>
            </p>
          </div>
          <Link
            href="/agency/finances"
            className="flex-shrink-0 text-[12px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Depositar fundos
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Not found ────────────────────────────────────────────────────────────────

function NotFound() {
  return (
    <div className="max-w-sm mx-auto pt-20 text-center">
      <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-[15px] font-medium text-zinc-700">Vaga não encontrada</p>
      <p className="text-[13px] text-zinc-400 mt-1 mb-6">Esta vaga pode ter sido removida.</p>
      <Link
        href="/agency/jobs"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar para Vagas
      </Link>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function JobDetail({
  job,
  submissions,
  bookings: initialBookings,
  agencyId,
}: {
  job: Job | null;
  submissions?: Submission[];
  bookings?: JobBooking[];
  agencyId?: string;
}) {
  const router = useRouter();
  const { role } = useRole();
  const { isActive } = useSubscription(); // used for bulk-send button
  const [contractModal, setContractModal] = useState<ContractTarget[] | null>(null);
  const [sentContracts, setSentContracts] = useState<Set<string>>(new Set());
  const [bookings, setBookings]           = useState<JobBooking[]>(initialBookings ?? []);
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [submissionList, setSubmissionList] = useState<Submission[]>(submissions ?? []);

  if (!job) return <NotFound />;

  const safeSubmissions      = submissionList;
  const numberOfTalentsRequired = job.numberOfTalentsRequired ?? 1;
  const days   = daysUntil(job.deadline);
  const urgent = days <= 7 && days > 0 && job.status === "open";

  function openContractModal(s: Submission) {
    if (!s.talentId) return;
    setContractModal([{ submissionId: s.id, talentId: s.talentId, talentName: s.talentName }]);
  }

  function openBulkContractModal() {
    const targets = safeSubmissions
      .filter((s) => s.talentId && selected.has(s.id) && !sentContracts.has(s.id))
      .map((s) => ({ submissionId: s.id, talentId: s.talentId!, talentName: s.talentName }));
    if (targets.length > 0) setContractModal(targets);
  }

  function toggleSelect(submissionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  }

  async function handleContractSent(submissionIds: string[]) {
    setSentContracts((prev) => {
      const next = new Set(prev);
      submissionIds.forEach((id) => next.add(id));
      return next;
    });
    setSelected(new Set());
    setContractModal(null);

    // Auto-close job if enough contracts were sent
    const totalSent = sentContracts.size + submissionIds.length;
    if (job && totalSent >= numberOfTalentsRequired && job.status === "open" && agencyId) {
      await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
    }
    router.refresh();
  }

  function handleCancelBooking(id: string) {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "cancelled" } : b));
  }

  function handleConfirmBooking(id: string) {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "confirmed" } : b));
  }

  function handleMarkPaid(id: string) {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "paid" } : b));
  }

  async function handleDeleteSubmission(submissionId: string) {
    if (!confirm("Deletar esta candidatura?")) return;
    const res = await fetch(`/api/submissions/${submissionId}`, { method: "DELETE" });
    if (res.ok) {
      setSubmissionList((prev) => prev.filter((s) => s.id !== submissionId));
      setSelected((prev) => { const next = new Set(prev); next.delete(submissionId); return next; });
    }
  }

  return (
    <div className="max-w-5xl space-y-8">

      {/* ── Contract modal ── */}
      {contractModal && agencyId && (
        <ContractModal
          targets={contractModal}
          job={job}
          agencyId={agencyId}
          onClose={() => setContractModal(null)}
          onSent={handleContractSent}
        />
      )}

      {/* ── Header ── */}
      <div>
        <Link
          href="/agency/jobs"
          className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors mb-4"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Todas as Vagas
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{job.title}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[job.status]}`}>
                {{ open: "Aberta", closed: "Fechada", draft: "Rascunho", inactive: "Inativa" }[job.status] ?? job.status}
              </span>
              <span className="text-[12px] font-medium bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-full">
                {job.category}
              </span>
              <span className="text-[12px] text-zinc-400">Publicado em {formatDate(job.postedAt)}</span>
            </div>
          </div>

          {role === "agency" && job.status !== "closed" && (
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href={`/agency/jobs/${job.id}/edit`}
                className="inline-flex items-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 text-[13px] font-medium px-5 py-2.5 rounded-xl transition-all duration-150"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar Vaga
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Job details ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className={`h-[3px] bg-gradient-to-r ${stripe(job.category)}`} />
          <div className="p-7">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-5">Descrição da Vaga</p>
            <p className="text-[15px] text-zinc-600 leading-relaxed">{job.description}</p>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">Detalhes da Vaga</p>
          <DetailRow label="Categoria" value={job.category}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          />
          <DetailRow label="Orçamento" value={formatBudget(job.budget)}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <DetailRow
            label="Candidatar até"
            value={urgent ? `${formatDate(job.deadline)} — ${days}d restantes` : formatDate(job.deadline)}
            highlight={urgent}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
          />
          <DetailRow
            label="Data da Vaga"
            value={job.jobDate ? formatDate(job.jobDate) : "—"}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
          />
          <DetailRow label="Candidaturas" value={`${safeSubmissions.length} recebida${safeSubmissions.length !== 1 ? "s" : ""}`}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" /></svg>}
          />
          <DetailRow label="Status" value={{ open: "Aberta", closed: "Fechada", draft: "Rascunho", inactive: "Inativa" }[job.status] ?? job.status}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>
      </div>

      {/* ── Bookings ── */}
      {bookings.length > 0 && (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Reservas</p>
            <p className="text-lg font-semibold tracking-tight text-zinc-900">
              {bookings.length} reserva{bookings.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
            {bookings.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                onCancel={handleCancelBooking}
                onConfirm={handleConfirmBooking}
                onMarkPaid={handleMarkPaid}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Submissions ── */}
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Candidaturas</p>
            <p className="text-lg font-semibold tracking-tight text-zinc-900">
              {safeSubmissions.length > 0 ? `${safeSubmissions.length} talento${safeSubmissions.length !== 1 ? "s" : ""} candidatado${safeSubmissions.length !== 1 ? "s" : ""}` : "Nenhuma candidatura ainda"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {sentContracts.size > 0 && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[13px] font-medium text-emerald-700">{sentContracts.size}/{numberOfTalentsRequired} contrato{sentContracts.size !== 1 ? "s" : ""} enviado{sentContracts.size !== 1 ? "s" : ""}</span>
              </div>
            )}
            {role === "agency" && selected.size > 0 && (
              isActive ? (
                <button
                  onClick={openBulkContractModal}
                  disabled={selected.size < 1}
                  className={[
                    "inline-flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer",
                    selected.size >= numberOfTalentsRequired
                      ? "bg-zinc-900 hover:bg-zinc-800 text-white"
                      : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700",
                  ].join(" ")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Enviar Contratos ({selected.size}/{numberOfTalentsRequired})
                </button>
              ) : (
                <Link
                  href="/agency/finances"
                  className="inline-flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                >
                  Reativar Assinatura
                </Link>
              )
            )}
          </div>
        </div>

        {safeSubmissions.length > 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
            {safeSubmissions.map((s) => (
              <SubmissionCard
                key={s.id}
                submission={s}
                jobCategory={job.category}
                hasSentContract={sentContracts.has(s.id)}
                isAgency={!!agencyId || role === "agency"}
                isSelected={selected.has(s.id)}
                onSelect={() => openContractModal(s)}
                onToggleSelect={() => toggleSelect(s.id)}
                onDelete={(!!agencyId || role === "agency") ? () => handleDeleteSubmission(s.id) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] py-16 text-center">
            <div className="w-11 h-11 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-zinc-500">Nenhuma candidatura ainda</p>
            <p className="text-[13px] text-zinc-400 mt-1">Talentos aparecerão aqui quando se candidatarem.</p>
          </div>
        )}
      </div>

    </div>
  );
}
