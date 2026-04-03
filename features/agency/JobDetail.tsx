"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRole } from "@/lib/RoleProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type Job = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  deadline: string;
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

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function formatBudget(n: number) { return usd(n); }

function formatDate(raw: string) {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("en-US", {
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

function PhotoStrip({ submission }: { submission: Submission }) {
  const slots = [submission.photoFrontUrl, submission.photoLeftUrl, submission.photoRightUrl];
  if (!slots.some(Boolean)) return null;
  return (
    <div className="grid grid-cols-3 gap-px bg-zinc-100">
      {slots.map((url, i) => (
        <div key={i} className="relative aspect-[3/4] bg-zinc-100 overflow-hidden">
          {url ? (
            <img src={url} alt={PHOTO_LABELS[i]} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          )}
          <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-semibold uppercase tracking-wider text-white/90 bg-gradient-to-t from-black/50 to-transparent py-1.5">
            {PHOTO_LABELS[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

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
          <p className="text-[11px] font-medium text-white/50 uppercase tracking-widest">Intro Video</p>
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
              Send {targets.length > 1 ? `${targets.length} contracts` : "contract"}?
            </h3>
            <p className="text-[13px] text-zinc-400 mt-1.5 leading-relaxed">
              {names}
            </p>
            <p className="text-[12px] text-zinc-400 mt-1">
              Each talent will receive the same contract terms and can accept or reject.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              No, go back
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition-colors cursor-pointer"
            >
              Yes, send
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
    job_date:        "",
    job_time:        "",
    location:        "",
    job_description: job.description,
    payment_amount:  String(job.budget),
    payment_method:  "",
    additional_notes: "",
  });
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

    const results = await Promise.all(
      targets.map((t) =>
        fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, talent_id: t.talentId }),
        })
      )
    );

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      setError(`${failed.length} contract(s) failed to send. Please retry.`);
      setSubmitting(false);
      return;
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
                    {targets.length > 1 ? `${targets.length} Contracts Sent` : "Contract Sent"}
                  </h3>
                  <p className="text-[13px] text-zinc-400 mt-1">
                    {targets.length > 1
                      ? `${targets.map((t) => t.talentName).join(", ")} will be notified. Pending bookings created.`
                      : `${targets[0]?.talentName} will be notified and can accept or reject. A pending booking has been created.`
                    }
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    Back to Job
                  </button>
                  <Link
                    href="/agency/contracts"
                    className="flex-1 py-2.5 text-[13px] font-semibold bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-colors text-center"
                  >
                    View Contracts
                  </Link>
                </div>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleFormSubmit} className="p-7 space-y-5">
                {/* Title + talent */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">New Contract</p>
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
                    <label className={labelCls}>Job Date *</label>
                    <input
                      type="date"
                      required
                      value={form.job_date}
                      onChange={(e) => set("job_date", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Job Time *</label>
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
                  <label className={labelCls}>Location *</label>
                  <input
                    type="text"
                    required
                    placeholder="City, address or 'Remote'"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Job description */}
                <div>
                  <label className={labelCls}>Job Description *</label>
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
                    <label className={labelCls}>Payment Amount (USD) *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      step={1}
                      value={form.payment_amount}
                      onChange={(e) => set("payment_amount", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Payment Method</label>
                    <input
                      type="text"
                      placeholder="Bank transfer, check…"
                      value={form.payment_method}
                      onChange={(e) => set("payment_method", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className={labelCls}>Additional Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Wardrobe requirements, contact person, etc."
                    value={form.additional_notes}
                    onChange={(e) => set("additional_notes", e.target.value)}
                    className={`${inputCls} resize-none`}
                  />
                </div>

                {/* Fee info */}
                <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Platform fee: <strong className="text-zinc-600 mx-1">15%</strong> · Talent receives: <strong className="text-zinc-600 mx-1">85%</strong> of deal value
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 text-[13px] font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Sending…" : "Review & Send"}
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

// ─── Submission card ──────────────────────────────────────────────────────────

function SubmissionCard({
  submission,
  jobCategory,
  hasSentContract,
  isAgency,
  isSelected,
  onSelect,
  onToggleSelect,
}: {
  submission: Submission;
  jobCategory: string;
  hasSentContract: boolean;
  isAgency: boolean;
  isSelected?: boolean;
  onSelect: () => void;
  onToggleSelect?: () => void;
}) {
  const statusCls = SUBMISSION_STATUS[submission.status] ?? SUBMISSION_STATUS["pending"];
  const hasMedia = !!(submission.photoFrontUrl || submission.photoLeftUrl || submission.photoRightUrl || submission.videoUrl);

  return (
    <div className={[
      "bg-white rounded-2xl border overflow-hidden flex flex-col transition-shadow duration-200",
      hasSentContract
        ? "border-emerald-200 shadow-[0_0_0_3px_rgba(16,185,129,0.12),0_4px_16px_rgba(0,0,0,0.04)]"
        : "border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.07),0_12px_32px_rgba(0,0,0,0.05)]",
    ].join(" ")}>

      <div className={`h-[3px] bg-gradient-to-r ${stripe(jobCategory)}`} />
      <PhotoStrip submission={submission} />
      {submission.videoUrl && <VideoPlayer url={submission.videoUrl} />}

      {!hasMedia && (
        <div className="bg-zinc-50 py-6 flex flex-col items-center gap-1.5">
          <svg className="w-6 h-6 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-[11px] text-zinc-400">No media submitted</p>
        </div>
      )}

      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-3">
          {submission.avatarUrl ? (
            <img src={submission.avatarUrl} alt={submission.talentName}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(submission.talentName)} flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white`}>
              {initials(submission.talentName)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-zinc-900 leading-snug truncate">
              {submission.talentName}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {submission.mode === "self" ? "Self-submitted" : "Referred"}
            </p>
          </div>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0 ${statusCls}`}>
            {submission.status}
          </span>
        </div>

        {submission.bio && (
          <p className="text-[13px] text-zinc-500 leading-relaxed line-clamp-2">{submission.bio}</p>
        )}

        <div className="flex items-center justify-between pt-2 mt-auto border-t border-zinc-50">
          <p className="text-[11px] text-zinc-400">{formatDate(submission.submittedAt)}</p>
          {isAgency && (
            hasSentContract ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Contract Sent
              </span>
            ) : submission.talentId ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
                  className={[
                    "w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer",
                    isSelected
                      ? "bg-zinc-900 border-zinc-900"
                      : "border-zinc-300 hover:border-zinc-500",
                  ].join(" ")}
                  title={isSelected ? "Deselect" : "Select for bulk contract"}
                >
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={onSelect}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white transition-all active:scale-[0.97] cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Send Contract
                </button>
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Booking row ──────────────────────────────────────────────────────────────

function BookingRow({ booking, onCancel, onMarkPaid }: {
  booking: JobBooking;
  onCancel: (id: string) => void;
  onMarkPaid: (id: string) => void;
}) {
  const [busy, setBusy] = useState<"cancel" | "paid" | null>(null);
  const stCls = BOOKING_STATUS[booking.status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
  const canCancel   = booking.status !== "cancelled" && booking.status !== "paid" && booking.status !== "confirmed";
  const canMarkPaid = booking.status === "pending_payment";

  async function handleCancel() {
    if (!confirm(`Cancel booking for ${booking.talentName}?`)) return;
    setBusy("cancel");
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (res.ok) onCancel(booking.id);
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
    <div className="flex items-center gap-4 px-6 py-4 flex-wrap sm:flex-nowrap">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-zinc-900 truncate">{booking.talentName}</p>
        <p className="text-[12px] text-zinc-400 mt-0.5">{formatDate(booking.createdAt)}</p>
      </div>
      <p className="text-[14px] font-semibold text-zinc-900 tabular-nums flex-shrink-0">
        {booking.price > 0 ? usd(booking.price) : "—"}
      </p>
      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0 ${stCls}`}>
        {booking.status}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {canMarkPaid && (
          <button
            onClick={handleMarkPaid}
            disabled={busy === "paid"}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy === "paid" ? "…" : "Mark as Paid"}
          </button>
        )}
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={busy === "cancel"}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-zinc-500 hover:text-rose-600 border border-zinc-200 hover:border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy === "cancel" ? "…" : "Cancel"}
          </button>
        )}
      </div>
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
      <p className="text-[15px] font-medium text-zinc-700">Job not found</p>
      <p className="text-[13px] text-zinc-400 mt-1 mb-6">This listing may have been removed.</p>
      <Link
        href="/agency/jobs"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Jobs
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
  const [contractModal, setContractModal] = useState<ContractTarget[] | null>(null);
  const [sentContracts, setSentContracts] = useState<Set<string>>(new Set());
  const [bookings, setBookings]           = useState<JobBooking[]>(initialBookings ?? []);
  const [selected, setSelected]           = useState<Set<string>>(new Set());

  if (!job) return <NotFound />;

  const safeSubmissions      = submissions ?? [];
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
    if (totalSent >= numberOfTalentsRequired && job.status === "open" && agencyId) {
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

  function handleMarkPaid(id: string) {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "paid" } : b));
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
          All Jobs
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{job.title}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[job.status]}`}>
                {job.status}
              </span>
              <span className="text-[12px] font-medium bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-full">
                {job.category}
              </span>
              <span className="text-[12px] text-zinc-400">Posted {formatDate(job.postedAt)}</span>
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
                Edit Job
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
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-5">Job Description</p>
            <p className="text-[15px] text-zinc-600 leading-relaxed">{job.description}</p>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">Job Details</p>
          <DetailRow label="Category" value={job.category}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          />
          <DetailRow label="Budget" value={formatBudget(job.budget)}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <DetailRow
            label="Deadline"
            value={urgent ? `${formatDate(job.deadline)} — ${days}d left` : formatDate(job.deadline)}
            highlight={urgent}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
          />
          <DetailRow label="Submissions" value={`${safeSubmissions.length} received`}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" /></svg>}
          />
          <DetailRow label="Status" value={job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>
      </div>

      {/* ── Bookings ── */}
      {bookings.length > 0 && (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Bookings</p>
            <p className="text-lg font-semibold tracking-tight text-zinc-900">
              {bookings.length} booking{bookings.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
            {bookings.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                onCancel={handleCancelBooking}
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
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Submissions</p>
            <p className="text-lg font-semibold tracking-tight text-zinc-900">
              {safeSubmissions.length > 0 ? `${safeSubmissions.length} talent applied` : "No submissions yet"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {sentContracts.size > 0 && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[13px] font-medium text-emerald-700">{sentContracts.size}/{numberOfTalentsRequired} contract{sentContracts.size !== 1 ? "s" : ""} sent</span>
              </div>
            )}
            {role === "agency" && selected.size > 0 && (
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
                Send Contracts ({selected.size}/{numberOfTalentsRequired})
              </button>
            )}
          </div>
        </div>

        {safeSubmissions.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {safeSubmissions.map((s) => (
              <SubmissionCard
                key={s.id}
                submission={s}
                jobCategory={job.category}
                hasSentContract={sentContracts.has(s.id)}
                isAgency={role === "agency"}
                isSelected={selected.has(s.id)}
                onSelect={() => openContractModal(s)}
                onToggleSelect={() => toggleSelect(s.id)}
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
            <p className="text-[14px] font-medium text-zinc-500">No submissions yet</p>
            <p className="text-[13px] text-zinc-400 mt-1">Talent will appear here once they apply.</p>
          </div>
        )}
      </div>

    </div>
  );
}
