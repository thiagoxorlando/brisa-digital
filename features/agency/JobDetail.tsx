"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/LanguageContext";
import { useRole } from "@/lib/RoleProvider";
import { useSubscription } from "@/lib/SubscriptionContext";
import { supabase } from "@/lib/supabase";
import { CONTRACTS_BUCKET } from "@/lib/contractFiles";
import { brl } from "@/lib/brl";
import { formatJobScopeLabel, formatJobVisibilityLabel } from "@/lib/jobVisibility";
import { jobStatusTone } from "@/lib/jobStatus";
import { statusInfo, normaliseStatus } from "@/lib/bookingStatus";
import { submissionStatusTone } from "@/lib/submissionStatus";
import { avatarGradient, initials } from "@/lib/talentDisplay";
import { useAgencyConfig } from "@/lib/AgencyConfigContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Job = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  deadline: string;
  jobDate?: string | null;
  jobTime?: string | null;
  location?: string | null;
  status: "open" | "closed" | "draft" | "inactive" | "paused";
  visibility?: "public" | "private" | "private_invite";
  inviteOnly?: boolean;
  workspaceId?: string | null;
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
  isReferral?: boolean;
  submittedAt: string;
  photoFrontUrl:   string | null;
  photoLeftUrl:    string | null;
  photoRightUrl:   string | null;
  videoUrl:        string | null;
  curriculumUrl:   string | null;
  portfolioUrl:    string | null;
};

export type JobBooking = {
  id: string;
  talentId: string | null;
  talentName: string;
  jobTitle: string;
  price: number;
  status: string;
  createdAt: string;
  contractId: string | null;
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

function formatBudget(n: number) { return brl(n); }

function formatDate(raw: string, lang = "pt-BR") {
  if (!raw) return "—";
  const locale = lang === "en" ? "en-US" : "pt-BR";
  return new Date(raw).toLocaleDateString(locale, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function daysUntil(raw: string) {
  const diff = new Date(raw + "T00:00:00").getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function normalizePublicBaseUrl(rawUrl: string) {
  const base = new URL(rawUrl);
  if (base.hostname === "brisahub.com.br") {
    base.hostname = "www.brisahub.com.br";
  }
  return base.toString();
}

function buildPublicJobUrl(jobId: string) {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const fallbackBaseUrl = typeof window !== "undefined" ? window.location.origin : "https://www.brisahub.com.br";
  const rawBaseUrl = configuredBaseUrl || fallbackBaseUrl;

  try {
    const normalizedBaseUrl = normalizePublicBaseUrl(rawBaseUrl);
    return new URL(`/jobs/${jobId}`, normalizedBaseUrl).toString();
  } catch {
    return `${fallbackBaseUrl.replace(/\/$/, "")}/jobs/${jobId}`;
  }
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const CATEGORY_STRIPES: Record<string, string> = {
  "Lifestyle & Fashion": "from-rose-400 via-pink-400 to-fuchsia-400",
  "Technology":          "from-sky-500 via-blue-500 to-indigo-500",
  "Food & Cooking":      "from-amber-400 via-orange-400 to-red-400",
  "Health & Fitness":    "from-emerald-400 via-teal-400 to-cyan-400",
  "Travel":              "from-indigo-400 via-violet-400 to-purple-400",
  "Beauty":              "from-pink-400 via-rose-400 to-red-300",
  "Other":               "from-zinc-300 via-zinc-400 to-zinc-500",
};

function stripe(category: string) {
  return CATEGORY_STRIPES[category] ?? CATEGORY_STRIPES["Other"];
}

// ─── Detail row ───────────────────────────────────────────────────────────────

function DetailRow({
  icon, label, value, highlight,
}: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-50 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-zinc-50 flex items-center justify-center flex-shrink-0 text-zinc-400 ring-1 ring-zinc-100">
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
  const { t } = useT();
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video bg-[#1F2D2E] overflow-hidden">
      {playing ? (
        <video src={url} controls autoPlay className="w-full h-full object-contain" />
      ) : (
        <button onClick={() => setPlaying(true)} className="w-full h-full flex flex-col items-center justify-center gap-3 group cursor-pointer">
          <div className="w-12 h-12 rounded-full bg-white/15 group-hover:bg-white/25 transition-colors flex items-center justify-center ring-1 ring-white/20">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <p className="text-[11px] font-medium text-white/50 uppercase tracking-widest">{t("video_presentation_label")}</p>
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
  const { t } = useT();
  const names = targets.map((tgt) => tgt.talentName).join(", ");
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
              {targets.length > 1
                ? `${t("contract_confirm_send_title").replace("contrato?", "").replace("contract?", "").trim()} ${targets.length} ${t("contract_confirm_contracts_many")}?`
                : t("contract_confirm_send_title")}
            </h3>
            <p className="text-[13px] text-zinc-400 mt-1.5 leading-relaxed">{names}</p>
            <p className="text-[12px] text-zinc-400 mt-1">{t("contract_confirm_desc")}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              {t("contract_confirm_no")}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 text-[13px] font-semibold bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white rounded-xl transition-colors cursor-pointer"
            >
              {t("contract_confirm_yes")}
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
  const { plan, commissionLabel, talentShareLabel } = useSubscription();
  const agencyConfig = useAgencyConfig();
  const { t } = useT();
  const [form, setForm] = useState<ContractForm>({
    job_date:        job.jobDate ?? "",
    job_time:        job.jobTime ?? "",
    location:        job.location ?? "",
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
  const contractsHref = job.workspaceId ? "/agency/workspace/contracts" : "/agency/contracts";

  function resolveApiError(
    payload: { error?: string; message?: string; details?: string } | null | undefined,
    fallback: string,
  ) {
    if (!payload) return fallback;
    return payload.error ?? payload.message ?? payload.details ?? fallback;
  }

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

    let uploadedContractPath: string | null = null;
    if (contractFile) {
      const signRes = await fetch("/api/contracts/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id, filename: contractFile.name, filesize: contractFile.size }),
      });
      if (!signRes.ok) {
        const body = await signRes.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? t("contract_upload_init_error"));
        setSubmitting(false);
        return;
      }
      const { signedUrl, token, path } = await signRes.json() as { signedUrl: string; token: string; path: string };

      const { error: storageError } = await supabase.storage
        .from(CONTRACTS_BUCKET)
        .uploadToSignedUrl(path, token, contractFile, { contentType: "application/pdf" });

      if (storageError) {
        console.error("[contract upload ui] storage", storageError);
        setError(t("contract_upload_storage_error"));
        setSubmitting(false);
        return;
      }

      uploadedContractPath = path;
    }

    const payload = {
      job_id:           job.id,
      agency_id:        agencyId,
      contract_file_url: uploadedContractPath,
      job_date:         form.job_date        || null,
      job_time:         form.job_time        || null,
      location:         form.location        || null,
      job_description:  form.job_description || null,
      payment_amount:   Number(String(form.payment_amount).replace(",", ".")),
      payment_method:   form.payment_method  || null,
      additional_notes: form.additional_notes || null,
    };

    const responses = await Promise.all(
      targets.map((tgt) =>
        fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, talent_id: tgt.talentId, talent_user_id: tgt.talentId }),
        })
      )
    );

    for (const r of responses) {
      if (r.status === 402) {
        const body = await r.clone().json().catch(() => ({})) as { error?: string; message?: string; details?: string };
        if (body.error === "plan_limit") {
          setError(resolveApiError(body, t("contract_send_error_default")));
          setSubmitting(false);
          return;
        }
      }
    }

    const failed = responses.filter((r) => !r.ok);
    if (failed.length > 0) {
      const firstFailure = await failed[0].clone().json().catch(() => ({})) as { error?: string; message?: string; details?: string };
      const firstMessage = resolveApiError(firstFailure, t("contract_send_error_default"));
      setError(
        failed.length === 1
          ? (firstFailure.details ? `${firstMessage}\n${firstFailure.details}` : firstMessage)
          : `${failed.length} ${t("contract_send_error_many_sfx")} ${firstMessage}`,
      );
      setSubmitting(false);
      return;
    }

    setSent(true);
    onSent(targets.map((tgt) => tgt.submissionId));
    setSubmitting(false);
  }

  const inputCls = "w-full px-3.5 py-2.5 text-[13px] bg-zinc-50 border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-[#1F2D2E] focus:bg-white focus:outline-none transition-colors";
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
                    {targets.length > 1 ? `${targets.length} ${t("contract_success_title_many_sfx")}` : t("contract_success_title_one")}
                  </h3>
                  <p className="text-[13px] text-zinc-400 mt-1">
                    {targets.length > 1
                      ? `${targets.map((tgt) => tgt.talentName).join(", ")} ${t("contract_success_notify_many")}`
                      : `${targets[0]?.talentName} ${t("contract_success_notify_one")}`
                    }
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    {t("contract_success_back")}
                  </button>
                  <Link
                    href={contractsHref}
                    className="flex-1 py-2.5 text-[13px] font-semibold bg-[#1F2D2E] text-white rounded-xl hover:bg-[#2D4142] transition-colors text-center"
                  >
                    {t("contract_success_view")}
                  </Link>
                </div>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleFormSubmit} className="p-7 space-y-5">
                {/* Title + talent */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">{t("contract_modal_new")}</p>
                    <h3 className="text-[16px] font-semibold text-zinc-900 truncate">{job.title}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2">
                    {targets.slice(0, 3).map((tgt) => (
                      <div key={tgt.talentId} className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarGradient(tgt.talentName)} flex items-center justify-center text-[10px] font-bold text-white`}>
                        {initials(tgt.talentName)}
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
                    <label className={labelCls}>{t("contract_modal_job_date_label")}</label>
                    <input
                      type="date"
                      required
                      value={form.job_date}
                      onChange={(e) => set("job_date", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{t("contract_modal_job_time_label")}</label>
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
                  <label className={labelCls}>{t("contracts_location")} *</label>
                  <input
                    type="text"
                    required
                    placeholder={t("contract_modal_location_ph")}
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Job description */}
                <div>
                  <label className={labelCls}>{t("job_detail_description_section")} *</label>
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
                    <label className={labelCls}>{t("contracts_payment_amount")} *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      step={0.01}
                      value={form.payment_amount}
                      onChange={(e) => set("payment_amount", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{t("contracts_payment_method")}</label>
                    <input
                      type="text"
                      placeholder={t("contract_modal_location_ph")}
                      value={form.payment_method}
                      onChange={(e) => set("payment_method", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className={labelCls}>{t("contracts_notes")}</label>
                  <textarea
                    rows={2}
                    placeholder={t("contract_modal_location_ph")}
                    value={form.additional_notes}
                    onChange={(e) => set("additional_notes", e.target.value)}
                    className={`${inputCls} resize-none`}
                  />
                </div>

                {/* Contract file upload */}
                <div>
                  <label className={labelCls}>{t("contract_modal_pdf_label")}</label>
                  <label className="flex items-center gap-3 w-full px-3.5 py-2.5 text-[13px] bg-zinc-50 border border-zinc-200 rounded-xl hover:border-zinc-300 cursor-pointer transition-colors">
                    <svg className="w-4 h-4 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className={contractFile ? "text-zinc-800 truncate" : "text-zinc-400"}>
                      {contractFile ? contractFile.name : t("contract_modal_pdf_attach")}
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
                      accept=".pdf,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        if (!file) {
                          setContractFile(null);
                          return;
                        }
                        const validPdf = (file.type === "application/pdf" || !file.type) && /\.pdf$/i.test(file.name);
                        if (!validPdf) {
                          setContractFile(null);
                          setError(t("contract_pdf_format_error"));
                          return;
                        }
                        if (file.size > 20 * 1024 * 1024) {
                          setContractFile(null);
                          setError(t("contract_pdf_size_error"));
                          return;
                        }
                        setError("");
                        setContractFile(file);
                      }}
                    />
                  </label>
                  <p className="text-[11px] text-zinc-400 mt-1.5">{t("contract_modal_pdf_hint")}</p>
                </div>

                {/* Fee info — escrow mode only */}
                {agencyConfig.paymentMode !== "internal" && (
                  <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className={[
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide",
                      plan === "premium" ? "bg-violet-100 text-violet-700" : plan === "pro" ? "bg-indigo-100 text-indigo-700" : "bg-zinc-200 text-zinc-600",
                    ].join(" ")}>
                      {plan.toUpperCase()}
                    </span>
                    {t("contract_modal_platform_fee")}: <strong className="text-zinc-600 mx-1">{commissionLabel}</strong> · {t("contract_modal_talent_gets")}: <strong className="text-zinc-600 mx-1">{talentShareLabel}</strong> {t("contract_modal_of_amount")}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    {t("action_cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 text-[13px] font-semibold bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? t("contract_modal_sending") : t("contract_modal_review_send")}
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
  bookingStatus,
  onSelect,
  onToggleSelect,
  onDelete,
}: {
  submission: Submission;
  jobCategory: string;
  hasSentContract: boolean;
  isAgency: boolean;
  isSelected?: boolean;
  bookingStatus?: string | null;
  onSelect: () => void;
  onToggleSelect?: () => void;
  onDelete?: () => void;
}) {
  const { t, lang } = useT();
  const jobStatusLabel = (s: string) => ({
    open: t("status_open"), closed: t("status_closed"), draft: t("status_draft"),
    inactive: t("status_inactive"), paused: t("status_paused"),
  }[s] ?? s);
  const [expanded, setExpanded] = useState(false);
  const hasMedia = !!(submission.photoFrontUrl || submission.photoLeftUrl || submission.photoRightUrl || submission.videoUrl || submission.curriculumUrl || submission.portfolioUrl);
  const photos = [submission.photoFrontUrl, submission.photoLeftUrl, submission.photoRightUrl].filter(Boolean) as string[];
  const displayName =
    submission.talentName || (submission.isReferral ? t("submission_referral_fallback_name") : t("general_unknown"));

  const { statusLabel, statusCls } = (() => {
    if (bookingStatus && bookingStatus !== "cancelled" && bookingStatus !== "rejected") {
      if (bookingStatus === "paid") {
        return { statusLabel: t("status_paid") ?? "Paid", statusCls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" };
      }
      return { statusLabel: t("status_hired") ?? "Hired", statusCls: "bg-teal-50 text-teal-700 ring-1 ring-teal-100" };
    }
    const cls = submissionStatusTone(submission.status);
    const label =
      submission.isReferral && !submission.talentId && submission.status === "pending"
        ? t("submission_status_signup_pending")
        : submission.status === "pending"
          ? t("status_pending")
          : submission.status === "approved"
            ? t("status_approved")
            : submission.status === "rejected"
              ? t("status_rejected")
              : submission.status;
    return { statusLabel: label, statusCls: cls };
  })();

  return (
    <div className={hasSentContract ? "border-l-2 border-emerald-400" : ""}>
      {/* Collapsed row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50/70 transition-colors cursor-pointer"
      >
        {/* Avatar */}
        {submission.avatarUrl ? (
          <img src={submission.avatarUrl} alt={displayName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(displayName)} flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white`}>
            {initials(displayName)}
          </div>
        )}

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[13px] font-semibold text-zinc-900 leading-snug truncate">{displayName}</p>
            {submission.isReferral && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 ring-1 ring-violet-100 text-[10px] font-semibold tracking-wide flex-shrink-0">
                {t("submission_badge_referral")}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {t(submission.mode === "self" ? "submission_source_self" : "submission_source_referred")}
            {" · "}
            {formatDate(submission.submittedAt, lang)}
            {hasMedia && (
              <span className="ml-2 text-violet-500 font-medium">
                {photos.length > 0 && `${photos.length} ${photos.length !== 1 ? t("job_submission_photo_many") : t("job_submission_photo_one")}`}
                {photos.length > 0 && submission.videoUrl && " · "}
                {submission.videoUrl && t("job_submission_video_media")}
                {(photos.length > 0 || submission.videoUrl) && submission.curriculumUrl && " · "}
                {submission.curriculumUrl && t("job_submission_curriculum")}
                {(photos.length > 0 || submission.videoUrl || submission.curriculumUrl) && submission.portfolioUrl && " · "}
                {submission.portfolioUrl && t("job_submission_portfolio")}
              </span>
            )}
          </p>
        </div>

        {/* Status + contract badge */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusCls}`}>
            {statusLabel}
          </span>

          {isAgency && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-[#647B7B] hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
              title={t("job_submission_delete_hint")}
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
                {t("contracts_sent")}
              </span>
            ) : submission.talentId ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
                  className={[
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer",
                    isSelected ? "bg-[#1ABC9C] border-[#1ABC9C]" : "border-zinc-300 hover:border-zinc-500",
                  ].join(" ")}
                  title={isSelected ? t("job_submission_deselect_hint") : t("job_submission_select_hint")}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white"
                >
                  {t("job_submission_hire_btn")}
                </button>
              </div>
            ) : null
          )}
        </div>

        {/* Chevron */}
        <svg className={`w-4 h-4 text-[#647B7B] flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
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
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">{t("job_submission_video_label")}</p>
                  <VideoPlayer url={submission.videoUrl} />
                </div>
              )}
              {(submission.curriculumUrl || submission.portfolioUrl) && (
                <div className="flex flex-wrap gap-3">
                  {submission.curriculumUrl && (
                    <a
                      href={submission.curriculumUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 transition-colors text-[13px] font-medium text-zinc-700"
                    >
                      <svg className="w-4 h-4 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {t("job_submission_open_curriculum") ?? `Open ${t("job_submission_curriculum")}`}
                    </a>
                  )}
                  {submission.portfolioUrl && (
                    <a
                      href={submission.portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 transition-colors text-[13px] font-medium text-zinc-700"
                    >
                      <svg className="w-4 h-4 text-zinc-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      {t("job_submission_open_portfolio") ?? `Open ${t("job_submission_portfolio")}`}
                    </a>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-zinc-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-[12px]">{t("job_submission_no_media")}</p>
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

function BookingRow({ booking, onCancel, onConfirm, onMarkPaid, financesHref = "/agency/finances" }: {
  booking: JobBooking;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
  onMarkPaid: (id: string) => void;
  financesHref?: string;
}) {
  const { t, lang } = useT();
  const [busy, setBusy] = useState<"cancel" | "confirm" | "paid" | null>(null);
  const [balanceError, setBalanceError] = useState<{ required: number; available: number } | null>(null);
  const agencyConfig = useAgencyConfig();
  const isEscrow = agencyConfig.showEscrow;
  const stInfo = statusInfo(normaliseStatus(booking.status));
  const stCls = stInfo.badge;
  const canCancel   = booking.status !== "cancelled" && booking.status !== "paid" && booking.status !== "confirmed";
  const canConfirm  = booking.status === "pending_payment";
  const canMarkPaid = booking.status === "confirmed";
  function contractFetch(action: string) {
    if (!booking.contractId) return Promise.resolve(null);
    return fetch(`/api/contracts/${booking.contractId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  }

  async function handleCancel() {
    if (!confirm(`Cancel booking for ${booking.talentName}?`)) return;
    setBusy("cancel");
    const res = await contractFetch("cancel_job");
    if (res?.ok) onCancel(booking.id);
    setBusy(null);
  }

  async function handleConfirm() {
    setBalanceError(null);
    setBusy("confirm");
    if (!booking.contractId) { setBusy(null); return; }

    const res = await contractFetch("agency_sign");
    if (!res) { setBusy(null); return; }

    if (res.ok) {
      onConfirm(booking.id);
      setBusy(null);
      return;
    }

    const data = await res.json().catch(() => ({})) as { error?: string; required?: number; available?: number };
    if (res.status === 402 && data.error === "insufficient_balance") {
      setBalanceError({
        required: Number(data.required ?? booking.price ?? 0),
        available: Number(data.available ?? 0),
      });
    }

    setBusy(null);
  }

  async function handleMarkPaid() {
    setBusy("paid");
    const res = await contractFetch("pay");
    if (res?.ok) onMarkPaid(booking.id);
    setBusy(null);
  }

  return (
    <div className="px-6 py-4 space-y-3">
      <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 truncate">{booking.talentName}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">{formatDate(booking.createdAt, lang)}</p>
        </div>
        <p className="text-[14px] font-semibold text-zinc-900 tabular-nums flex-shrink-0">
          {booking.price > 0 ? brl(booking.price) : "—"}
        </p>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${stCls}`}>
          {stInfo.label}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canConfirm && (
            <button
              onClick={handleConfirm}
              disabled={busy === "confirm"}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy === "confirm" ? t("booking_confirming_btn") : t("booking_confirm_booking_btn")}
            </button>
          )}
          {canMarkPaid && (
            <button
              onClick={handleMarkPaid}
              disabled={busy === "paid"}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy === "paid" ? "…" : t("booking_mark_paid_btn")}
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={busy === "cancel"}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-zinc-500 hover:text-rose-600 border border-zinc-200 hover:border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy === "cancel" ? "…" : t("action_cancel")}
            </button>
          )}
        </div>
      </div>

      {/* Insufficient balance banner — escrow mode only */}
      {balanceError && isEscrow && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-amber-800">{t("booking_balance_title")}</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              {t("booking_balance_required")}: <strong>{brl(balanceError.required)}</strong> · {t("booking_balance_available")}: <strong>{brl(balanceError.available)}</strong>
            </p>
          </div>
          <Link
            href={financesHref}
            className="flex-shrink-0 text-[12px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            {t("booking_deposit_funds_btn")}
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Not found ────────────────────────────────────────────────────────────────

function NotFound() {
  const { t } = useT();
  return (
    <div className="max-w-sm mx-auto pt-20 text-center">
      <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-[15px] font-medium text-zinc-700">{t("job_not_found_title")}</p>
      <p className="text-[13px] text-zinc-400 mt-1 mb-6">{t("job_not_found_desc")}</p>
      <Link
        href="/agency/jobs"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t("job_not_found_back")}
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
  readOnly,
}: {
  job: Job | null;
  submissions?: Submission[];
  bookings?: JobBooking[];
  agencyId?: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { role } = useRole();
  const { t, lang } = useT();
  const jobStatusLabel = (s: string) => ({
    open: t("status_open"), closed: t("status_closed"), draft: t("status_draft"),
    inactive: t("status_inactive"), paused: t("status_paused"),
  }[s] ?? s);
  const [contractModal, setContractModal] = useState<ContractTarget[] | null>(null);
  const [sentContracts, setSentContracts] = useState<Set<string>>(() => {
    const bookedTalentIds = new Set(
      (initialBookings ?? [])
        .filter((booking) => booking.contractId)
        .map((booking) => booking.talentId)
        .filter((talentId): talentId is string => !!talentId),
    );

    return new Set(
      (submissions ?? [])
        .filter((submission) => submission.talentId && bookedTalentIds.has(submission.talentId))
        .map((submission) => submission.id),
    );
  });
  const [bookings, setBookings]           = useState<JobBooking[]>(initialBookings ?? []);
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [submissionList, setSubmissionList] = useState<Submission[]>(submissions ?? []);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [manualCopyUrl, setManualCopyUrl] = useState("");
  const [inviteCopyFeedback, setInviteCopyFeedback] = useState("");
  const [inviteLinkUrl, setInviteLinkUrl] = useState<string | null>(null);
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<Job["status"]>(job?.status ?? "open");
  const [pendingStatus, setPendingStatus]  = useState<Job["status"]>(job?.status ?? "open");
  const [statusChanging, setStatusChanging] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!job) return <NotFound />;

  const bookingStatusByTalentId = new Map<string, string>();
  for (const b of bookings) {
    if (b.talentId && b.status !== "cancelled") {
      bookingStatusByTalentId.set(b.talentId, b.status);
    }
  }

  const safeSubmissions      = submissionList;
  const numberOfTalentsRequired = job.numberOfTalentsRequired ?? 1;
  const activeBookingsCount = bookings.filter((booking) => booking.status !== "cancelled").length;
  const isJobFull = activeBookingsCount >= numberOfTalentsRequired;
  const hasPaidBookings = bookings.some((b) => b.status === "paid");
  const isWorkspaceJob = Boolean(job.workspaceId);
  const jobsHref = isWorkspaceJob ? "/agency/workspace/jobs" : "/agency/jobs";
  const editHref = isWorkspaceJob ? `/agency/workspace/jobs/${job.id}/edit` : `/agency/jobs/${job.id}/edit`;
  const financesHref = isWorkspaceJob ? "/agency/workspace/wallet" : "/agency/finances";
  const canReopenJob = !hasPaidBookings && !isJobFull;
  const canShareJob = !isWorkspaceJob && currentStatus === "open" && !isJobFull;
  const canHire = !readOnly && currentStatus === "open" && !isJobFull;
  const days   = daysUntil(job.deadline);
  const urgent = days <= 7 && days > 0 && currentStatus === "open";

  function openContractModal(s: Submission) {
    if (!canHire) return;
    if (!s.talentId) return;
    setContractModal([{ submissionId: s.id, talentId: s.talentId, talentName: s.talentName }]);
  }

  function openBulkContractModal() {
    if (!canHire) return;
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
    router.refresh();
  }

  function handleCancelBooking(id: string) {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "cancelled" } : b));
  }

  function handleMarkPaid(id: string) {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "paid" } : b));
  }

  function handleConfirmBooking(id: string) {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "confirmed" } : b));
  }

  async function handleDeleteSubmission(submissionId: string) {
    if (!confirm("Delete this application?")) return;
    const res = await fetch(`/api/submissions/${submissionId}`, { method: "DELETE" });
    if (res.ok) {
      setSubmissionList((prev) => prev.filter((s) => s.id !== submissionId));
      setSelected((prev) => { const next = new Set(prev); next.delete(submissionId); return next; });
    }
  }

  async function handleChangeStatus(newStatus: Job["status"]) {
    if (!job) return;
    setStatusChanging(true);
    setStatusFeedback(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setCurrentStatus(newStatus);
        setPendingStatus(newStatus);
        setStatusFeedback({ ok: true, msg: t("job_detail_status_updated") });
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setStatusFeedback({ ok: false, msg: d.error ?? t("job_detail_status_error") });
      }
    } catch {
      setStatusFeedback({ ok: false, msg: t("job_detail_status_error") });
    }
    setStatusChanging(false);
  }

  async function handleCopyJobLink() {
    if (!job) return;
    const publicJobUrl = buildPublicJobUrl(job.id);

    try {
      await navigator.clipboard.writeText(publicJobUrl);
      setManualCopyUrl("");
      setCopyFeedback(t("job_detail_link_copied"));
    } catch {
      setManualCopyUrl(publicJobUrl);
      setCopyFeedback(t("job_detail_copy_link_manual"));
    }
  }

  async function handleCopyInviteLink() {
    if (!job) return;
    setInviteLinkLoading(true);
    setInviteCopyFeedback("");
    try {
      const res = await fetch(`/api/agency/jobs/${job.id}/invite-link`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setInviteCopyFeedback(body.error ?? t("job_detail_invite_generate_error"));
        setInviteLinkLoading(false);
        return;
      }
      const { inviteUrl } = await res.json();
      setInviteLinkUrl(inviteUrl);
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteCopyFeedback(t("job_detail_invite_copied"));
      } catch {
        setInviteCopyFeedback(t("job_detail_copy_link_manual"));
      }
    } catch {
      setInviteCopyFeedback(t("job_detail_invite_link_error"));
    }
    setInviteLinkLoading(false);
  }

  return (
    <div className="max-w-5xl space-y-6">

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
      <div className="rounded-[1.75rem] bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-6 py-5 text-white shadow-[0_8px_28px_rgba(26,188,156,0.28)]">
        <Link
          href={jobsHref}
          className="inline-flex items-center gap-1.5 text-[13px] text-white/70 hover:text-white transition-colors mb-4"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("job_detail_all_jobs")}
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2.5">
            <h1 className="text-[1.85rem] font-black tracking-[-0.04em] leading-tight text-white">{job.title}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full ${jobStatusTone(currentStatus)}`}>
                {jobStatusLabel(currentStatus)}
              </span>
              <span className="inline-flex items-center gap-1 text-[12px] font-medium bg-violet-50 text-violet-600 border border-violet-100 px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                {formatJobVisibilityLabel({ visibility: job.visibility, workspaceId: job.workspaceId })}
              </span>
              <span className="text-[12px] font-medium bg-white/20 text-white border border-white/20 px-2.5 py-1 rounded-full">
                {formatJobScopeLabel({ visibility: job.visibility, workspaceId: job.workspaceId })}
              </span>
              <span className="text-[12px] font-medium bg-white/20 text-white border border-white/20 px-2.5 py-1 rounded-full">
                {job.category}
              </span>
              <span className="text-[12px] text-white/70">{t("job_detail_published_on")} {formatDate(job.postedAt, lang)}</span>
            </div>
            <div className="grid gap-3 pt-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{t("jobs_budget")}</p>
                <p className="mt-1 text-xl font-black text-white">{formatBudget(job.budget)}</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{t("jobs_applicants")}</p>
                <p className="mt-1 text-xl font-black text-white">{safeSubmissions.length}</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{t("bookings_title")}</p>
                <p className="mt-1 text-xl font-black text-white">{bookings.length}</p>
              </div>
            </div>
          </div>

          {role === "agency" && (
            <div className="space-y-3 flex-shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                {job.visibility === "private_invite" ? (
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    disabled={inviteLinkLoading}
                    className="inline-flex items-center gap-2 bg-white text-[#1F2D2E] text-[13px] font-bold px-5 py-2.5 rounded-xl transition-all duration-150 hover:bg-white/90 cursor-pointer disabled:opacity-60"
                  >
                    {inviteLinkLoading ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                    {t("job_detail_copy_invite")}
                  </button>
                ) : !isWorkspaceJob ? (
                <button
                  type="button"
                  onClick={handleCopyJobLink}
                  disabled={!canShareJob}
                  className="inline-flex items-center gap-2 bg-white text-[#1F2D2E] text-[13px] font-bold px-5 py-2.5 rounded-xl transition-all duration-150 hover:bg-white/90 cursor-pointer disabled:cursor-not-allowed disabled:bg-white/50 disabled:text-[#6A8081]"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16h8M8 12h8m-8-4h5m-6 12h10a2 2 0 002-2V6a2 2 0 00-2-2h-3.172a2 2 0 01-1.414-.586l-.828-.828A2 2 0 0010.172 2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  {t("job_detail_share_job")}
                </button>
                ) : null}

                {currentStatus !== "closed" && !readOnly && (
                  <Link
                    href={editHref}
                    className="inline-flex items-center gap-2 bg-white/10 border border-white/10 hover:bg-white/15 text-white text-[13px] font-bold px-5 py-2.5 rounded-xl transition-all duration-150"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {t("job_detail_edit_job")}
                  </Link>
                )}
              </div>

              {copyFeedback && (
                <p className="text-[12px] font-medium text-white/80">{copyFeedback}</p>
              )}

              {inviteCopyFeedback && (
                <p className="text-[12px] font-medium text-white/80">{inviteCopyFeedback}</p>
              )}

              {inviteLinkUrl && inviteCopyFeedback === t("job_detail_copy_link_manual") && (
                <input
                  readOnly
                  value={inviteLinkUrl}
                  className="w-full text-[11px] bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white font-mono select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              )}

              {!canShareJob && !isWorkspaceJob && job.visibility !== "private_invite" && (
                <p className="text-[12px] font-medium text-white/80">
                  {t("job_detail_job_not_open")}
                </p>
              )}

              {manualCopyUrl && (
                <div className="rounded-2xl border border-white/20 bg-white/10 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70 mb-2">
                    {t("job_detail_copy_manual_label")}
                  </p>
                  <input
                    readOnly
                    value={manualCopyUrl}
                    onFocus={(event) => event.currentTarget.select()}
                    className="w-full rounded-xl border border-white/15 bg-white px-3 py-2 text-[12px] font-medium text-[#1F2D2E] outline-none"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Job details ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        <div className="lg:col-span-3 bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">{t("job_detail_description_section")}</p>
            <p className="text-[15px] text-zinc-700 leading-relaxed">{job.description}</p>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">{t("job_detail_details_section")}</p>
          <DetailRow label={t("jobs_category")} value={job.category}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          />
          <DetailRow label={t("jobs_budget")} value={formatBudget(job.budget)}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <DetailRow
            label={t("job_detail_apply_by_label")}
            value={urgent ? `${formatDate(job.deadline, lang)} — ${days}${t("job_detail_days_remaining_suffix")}` : formatDate(job.deadline, lang)}
            highlight={urgent}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
          />
          <DetailRow
            label={t("jobs_job_date")}
            value={job.jobDate ? formatDate(job.jobDate, lang) : "—"}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
          />
          {job.jobTime && (
            <DetailRow
              label={t("job_detail_schedule_label")}
              value={job.jobTime}
              icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          )}
          <DetailRow label={t("jobs_applicants")} value={`${safeSubmissions.length} ${t("jobs_applicants").toLowerCase()}`}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" /></svg>}
          />
          <DetailRow label={t("bookings_status")} value={jobStatusLabel(currentStatus)}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>
      </div>

      {/* ── Status management — agency only ── */}
      {(role === "agency" || !!agencyId) && currentStatus !== "inactive" && !readOnly && (
        <div className="bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">
            {t("job_detail_status_section")}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={pendingStatus}
              onChange={(e) => { setPendingStatus(e.target.value as Job["status"]); setStatusFeedback(null); }}
              disabled={statusChanging || (currentStatus !== "open" && currentStatus !== "paused" && !canReopenJob)}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[14px] font-medium text-zinc-800 hover:border-zinc-300 focus:outline-none focus:border-[#1F2D2E] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentStatus === "draft" && <option value="draft">{t("status_draft")}</option>}
              {(currentStatus === "open" || currentStatus === "paused" || canReopenJob) && <option value="open">{t("status_open")}</option>}
              {(currentStatus === "open" || currentStatus === "paused") && <option value="paused">{t("status_paused")}</option>}
              <option value="closed">{t("status_closed")}</option>
            </select>
            <button
              onClick={() => handleChangeStatus(pendingStatus)}
              disabled={pendingStatus === currentStatus || statusChanging || (currentStatus !== "open" && currentStatus !== "paused" && !canReopenJob)}
              className="px-5 py-2.5 rounded-xl bg-[#1F2D2E] text-white text-[13px] font-semibold hover:bg-[#2a3d3e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {statusChanging ? t("job_detail_saving_status") : t("job_detail_save_status_btn")}
            </button>
          </div>
          {currentStatus !== "open" && !canReopenJob && (
            <p className="text-[12px] font-medium mt-3 text-rose-500">
              {hasPaidBookings
                ? t("job_detail_paid_booking_restrict")
                : t("job_detail_full_restrict")}
            </p>
          )}
          {currentStatus === "open" && isJobFull && (
            <p className="text-[12px] font-medium mt-3 text-zinc-500">
              {t("job_detail_full_restrict")}
            </p>
          )}
          {statusFeedback && (
            <p className={`text-[12px] font-medium mt-3 ${statusFeedback.ok ? "text-emerald-600" : "text-rose-600"}`}>
              {statusFeedback.msg}
            </p>
          )}
        </div>
      )}

      {/* ── Bookings ── */}
      {bookings.length > 0 && (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("bookings_title")}</p>
            <p className="text-lg font-semibold tracking-tight text-zinc-900">
              {bookings.length} {bookings.length !== 1 ? t("job_detail_booking_many") : t("job_detail_booking_one")}
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
                financesHref={financesHref}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Read-only notice ── */}
      {readOnly && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-[13px] font-semibold text-amber-800">{t("job_detail_readonly_title")}</p>
          <p className="mt-1 text-[12px] text-amber-700">{t("job_detail_readonly_desc")}</p>
        </div>
      )}

      {/* ── Submissions ── */}
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("jobs_applicants")}</p>
            <p className="text-lg font-semibold tracking-tight text-zinc-900">
              {safeSubmissions.length > 0
                ? `${safeSubmissions.length} ${safeSubmissions.length !== 1 ? t("job_detail_talent_applied_many") : t("job_detail_talent_applied_one")}`
                : t("job_detail_no_applications")}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {sentContracts.size > 0 && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[13px] font-medium text-emerald-700">
                  {sentContracts.size}/{numberOfTalentsRequired} {sentContracts.size !== 1 ? t("job_detail_contracts_sent_many") : t("job_detail_contracts_sent_one")}
                </span>
              </div>
            )}
            {role === "agency" && selected.size > 0 && !readOnly && (
              <button
                onClick={() => openBulkContractModal()}
                disabled={!canHire}
                className={[
                  "inline-flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer",
                  !canHire
                    ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                    : selected.size >= numberOfTalentsRequired
                      ? "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white"
                      : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700",
                ].join(" ")}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t("job_detail_send_contracts_btn")} ({selected.size}/{numberOfTalentsRequired})
              </button>
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
                bookingStatus={s.talentId ? (bookingStatusByTalentId.get(s.talentId) ?? null) : null}
                onSelect={!readOnly ? () => openContractModal(s) : () => {}}
                onToggleSelect={!readOnly ? () => toggleSelect(s.id) : () => {}}
                onDelete={(!readOnly && (!!agencyId || role === "agency")) ? () => handleDeleteSubmission(s.id) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] py-16 text-center">
            <div className="w-11 h-11 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-[#647B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-zinc-500">{t("job_detail_no_applications")}</p>
            <p className="text-[13px] text-zinc-400 mt-1">{t("job_detail_no_apps_hint")}</p>
          </div>
        )}
      </div>

    </div>
  );
}
