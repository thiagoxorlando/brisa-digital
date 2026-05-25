"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/LanguageContext";
import { useSubscription } from "@/lib/SubscriptionContext";
import { brl } from "@/lib/brl";
import { getContractComputedState, isCustodyActive } from "@/lib/contractState";
import AbrirDisputaButton from "@/features/disputes/AbrirDisputaButton";
import { formatJobLocation } from "@/lib/jobLocation";
import type { AgencyConfig } from "@/lib/agencyConfig";

export type AgencyContract = {
  id: string;
  jobId: string | null;
  jobTitle: string;
  talentId: string | null;
  talentName: string;
  jobDate: string | null;
  jobTime: string | null;
  location: string | null;
  jobDescription: string | null;
  paymentAmount: number;
  paymentMethod: string | null;
  additionalNotes: string | null;
  status: string;
  paymentStatus: string;
  createdAt: string;
  signedAt: string | null;
  agencySignedAt: string | null;
  depositPaidAt: string | null;
  paidAt: string | null;
  contractFileUrl: string | null;
  signedContractUrl: string | null;
  /** Server-computed eligibility for payment release. */
  isPaymentEligible?: boolean;
  /** Reason payment is blocked (already translated). null when eligible. */
  paymentBlockReason?: string | null;
  /** Whether the current caller can manually override the date gate. */
  canManualOverride?: boolean;
  /** True when a completed job_commitment transaction exists for this contract's job. */
  isAgentJobBacked?: boolean;
  /** Display name of the user who released payment. NULL for legacy rows. */
  paidByName?: string | null;
  /** Active open/under_review dispute ID for this contract, or null. */
  activeDisputeId?: string | null;
  /** Set when agency has marked external payment as sent (internal payment mode). */
  agencyPaymentSentAt?: string | null;
};

const STATUS_LABEL_KEY: Record<string, string> = {
  sent:      "contract_status_sent",
  signed:    "contract_status_signed",
  confirmed: "contract_status_confirmed",
  paid:      "contract_status_paid",
  rejected:  "contract_status_rejected",
  cancelled: "contract_status_cancelled",
};

const ALL_STATUSES = ["all", "sent", "signed", "confirmed", "paid", "rejected", "cancelled"] as const;
type FilterStatus = typeof ALL_STATUSES[number];

function fmtDate(s: string | null, lang = "pt-BR") {
  if (!s) return "—";
  const locale = lang === "pt-BR" ? "pt-BR" : "en-US";
  return new Date(s).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

function fmtJobDate(s: string | null, lang = "pt-BR") {
  if (!s) return "—";
  const locale = lang === "pt-BR" ? "pt-BR" : "en-US";
  return new Date(s + "T00:00:00").toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(s: string | null, lang = "pt-BR") {
  if (!s) return null;
  const locale = lang === "pt-BR" ? "pt-BR" : "en-US";
  return new Date(s).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function jobDatePassed(s: string | null) {
  if (!s) return false;
  return new Date(s + "T23:59:59") < new Date();
}

function openUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
}

function ContractFileButton({
  label,
  missingLabel,
  url,
  tone,
}: {
  label: string;
  missingLabel: string;
  url: string | null;
  tone: "neutral" | "success";
}) {
  const isAvailable = Boolean(url);
  const activeCls = tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";

  return (
    <button
      type="button"
      onClick={() => { if (url) openUrl(url); }}
      disabled={!isAvailable}
      className={[
        "flex-shrink-0 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-colors",
        isAvailable
          ? `${activeCls} cursor-pointer`
          : "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed",
      ].join(" ")}
      aria-label={isAvailable ? label : missingLabel}
      title={isAvailable ? label : missingLabel}
    >
      {isAvailable ? label : missingLabel}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-zinc-700">{value}</p>
    </div>
  );
}

function ContractCard({
  contract: c,
  onUpdate,
  showPaymentActions = true,
  disputesHref = "/agency/disputes",
  agencyConfig,
}: {
  contract: AgencyContract;
  onUpdate: (id: string, updates: Partial<AgencyContract>) => void;
  showPaymentActions?: boolean;
  disputesHref?: string;
  agencyConfig?: AgencyConfig;
}) {
  const showEscrow   = !agencyConfig || agencyConfig.showEscrow;
  const showInternal = agencyConfig?.showInternalConfirmation ?? false;

  const [expanded,         setExpanded]         = useState(false);
  const [acting,           setActing]           = useState<string | null>(null);
  const [balanceError,     setBalanceError]     = useState<string | null>(null);
  const [overrideOpen,     setOverrideOpen]     = useState(false);
  const [overrideReason,   setOverrideReason]   = useState("");
  const { t, lang } = useT();

  const state = getContractComputedState(
    { status: c.status, paid_at: c.paidAt, deposit_paid_at: c.depositPaidAt, workspace_id: c.isAgentJobBacked ? "ws" : null },
    { isAgentJobBacked: c.isAgentJobBacked ?? false, viewerRole: "agency" },
  );
  const stCls   = state.displayTone;
  // Premium agent-reserved: use Portuguese displayBadge; open-space: use i18n translation
  const stLabel = state.isAgentReserved
    ? state.displayBadge
    : t((STATUS_LABEL_KEY[c.status] ?? "general_unknown") as Parameters<typeof t>[0]);
  const isPaid  = c.status === "paid";

  const isJobPast = jobDatePassed(c.jobDate);

  async function callAction(
    action: string,
    nextStatus: string,
    updates: Partial<AgencyContract>,
    extraBody?: Record<string, unknown>,
  ) {
    setActing(action);
    const res = await fetch(`/api/contracts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(extraBody ?? {}) }),
    });
    if (res.ok) {
      onUpdate(c.id, { status: nextStatus, ...updates });
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setBalanceError(data.error ?? "Erro ao processar ação.");
    }
    setActing(null);
  }

  async function confirmManualOverride() {
    if (overrideReason.trim().length < 10) return;
    await callAction(
      "pay",
      "paid",
      { paidAt: new Date().toISOString() },
      { manual_override: true, override_reason: overrideReason.trim() },
    );
    setOverrideOpen(false);
    setOverrideReason("");
  }

  async function handleConfirmEscrow() {
    setBalanceError(null);
    setActing("confirm_escrow");
    const res = await fetch(`/api/contracts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "agency_sign" }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string; required?: number; available?: number };
    if (res.ok) {
      onUpdate(c.id, { status: "confirmed" });
    } else if (res.status === 402) {
      setBalanceError("Saldo insuficiente. Deposite saldo na carteira para confirmar a reserva.");
    } else {
      setBalanceError(data.error ?? "Erro ao confirmar reserva. Tente novamente.");
    }
    setActing(null);
  }

  async function handleMarkPaymentSent() {
    setActing("payment_sent");
    const res = await fetch(`/api/contracts/${c.id}/confirm-payment-sent`, { method: "POST" });
    if (res.ok) {
      onUpdate(c.id, { agencyPaymentSentAt: new Date().toISOString() });
    } else {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setBalanceError(data.error ?? "Erro ao registrar envio do pagamento.");
    }
    setActing(null);
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-4 px-6 py-4 flex-wrap sm:flex-nowrap">
        {/* Talent name */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 truncate">{c.talentName}</p>
          {c.jobTime && (
            <p className="text-[12px] text-zinc-400 mt-0.5">{c.jobTime}</p>
          )}
        </div>

        {/* Amount */}
        <p className="text-[15px] font-semibold text-zinc-900 tabular-nums flex-shrink-0">{brl(c.paymentAmount)}</p>

        {/* Status */}
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${stCls}`}>
          {stLabel}
        </span>

        {showPaymentActions && showEscrow && c.status === "signed" && (
          <button
            onClick={handleConfirmEscrow}
            disabled={acting !== null}
            className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {acting === "confirm_escrow" ? t("agency_contracts_confirming_booking") : t("agency_contracts_confirm_booking")}
          </button>
        )}

        {showInternal && c.status === "signed" && !c.agencyPaymentSentAt && (
          <button
            onClick={handleMarkPaymentSent}
            disabled={acting !== null}
            className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {acting === "payment_sent" ? "Registrando…" : "Marcar pagamento enviado"}
          </button>
        )}

        {showInternal && c.status === "signed" && c.agencyPaymentSentAt && (
          <span className="flex-shrink-0 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
            Pagamento enviado · aguardando talento
          </span>
        )}

        {/* Pay talent + Cancel for confirmed contracts (escrow mode only) */}
        {showPaymentActions && showEscrow && !isPaid && c.status === "confirmed" && (
          <>
            {(() => {
              const eligible = c.isPaymentEligible !== false;
              const blockReason = c.paymentBlockReason ?? t("agency_contracts_payment_blocked_default");
              return (
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => callAction("pay", "paid", { paidAt: new Date().toISOString() })}
                      disabled={acting !== null || !eligible}
                      title={!eligible ? blockReason : undefined}
                      className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {acting === "pay" ? t("agency_contracts_paying") : t("action_pay")}
                    </button>
                    {!eligible && c.canManualOverride && (
                      <button
                        onClick={() => setOverrideOpen(true)}
                        disabled={acting !== null}
                        className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {t("agency_contracts_release_now")}
                      </button>
                    )}
                  </div>
                  {!eligible && (
                    <p className="text-[11px] text-amber-700 font-medium text-right max-w-[260px]">
                      {blockReason}
                    </p>
                  )}
                </div>
              );
            })()}
            <button
              onClick={() => callAction("cancel_job", "cancelled", {})}
              disabled={acting !== null}
              className="flex-shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              {acting === "cancel_job" ? "…" : "Cancelar"}
            </button>
          </>
        )}

        {/* Manual override confirmation modal */}
        {overrideOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !acting && setOverrideOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-[16px] font-semibold text-zinc-900">{t("agency_contracts_override_title")}</h3>
              <p className="text-[13px] text-zinc-600 leading-relaxed">
                {t("agency_contracts_override_body")}
              </p>
              <div>
                <label className="text-[12px] font-semibold text-zinc-700 block mb-1.5">{t("agency_contracts_override_reason_label")}</label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={3}
                  minLength={10}
                  placeholder={t("agency_contracts_override_reason_placeholder")}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  {t("agency_contracts_override_reason_counter").replace("{count}", String(overrideReason.trim().length))}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setOverrideOpen(false); setOverrideReason(""); }}
                  disabled={acting !== null}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-xl text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {t("action_cancel")}
                </button>
                <button
                  onClick={confirmManualOverride}
                  disabled={acting !== null || overrideReason.trim().length < 10}
                  className="text-[12px] font-semibold px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {acting === "pay" ? t("agency_contracts_releasing") : t("agency_contracts_confirm_release")}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <ContractFileButton
            label="Original"
            missingLabel="Original indisponível"
            url={c.contractFileUrl}
            tone="neutral"
          />
          <ContractFileButton
            label="Assinado"
            missingLabel={
              !c.signedContractUrl && (c.signedAt || ["signed", "confirmed", "paid"].includes(c.status))
                ? "Aceito digitalmente"
                : "Aguardando assinatura"
            }
            url={c.signedContractUrl}
            tone="success"
          />
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
          aria-label={expanded ? "Recolher" : "Expandir"}
        >
          <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Insufficient balance / confirm error */}
      {balanceError && (
        <div className="mx-6 mb-3 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-[12px] font-semibold text-amber-800 flex-1">{balanceError}</p>
          <button onClick={() => setBalanceError(null)} className="text-amber-400 hover:text-amber-600 transition-colors cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-zinc-50 px-6 py-5 space-y-4">
          {isPaid && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
              <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-[12px] font-semibold text-emerald-700">
                {t("contracts_paid")} — {t("general_required")}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("contracts_job_date")} value={fmtJobDate(c.jobDate, lang)} />
            <Field label={t("contracts_job_time")} value={c.jobTime ?? "—"} />
            <Field label={t("contracts_location")} value={formatJobLocation(c.location) ?? "—"} />
            <Field label={t("contracts_payment_method")} value={c.paymentMethod ?? "—"} />
          </div>

          {/* Signing timeline */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">{t("contracts_signed")}</p>
            <div className="flex flex-col gap-2">
              {[
                { label: t("contracts_sent"),         date: fmtDate(c.createdAt, lang),              done: true,         sublabel: null },
                { label: t("contracts_signed"),       date: fmtDateTime(c.signedAt, lang),           done: !!c.signedAt, sublabel: null },
                { label: t("contracts_deposit_paid"), date: fmtDateTime(c.depositPaidAt, lang),      done: isCustodyActive(c.status, c.isAgentJobBacked ?? false), sublabel: null },
                { label: t("jobs_job_date"),           date: c.jobDate ? fmtJobDate(c.jobDate, lang) : t("general_tbd"), done: isJobPast, sublabel: null },
                { label: t("contracts_pay_talent"),   date: fmtDateTime(c.paidAt, lang),             done: !!c.paidAt,   sublabel: c.paidByName ? `Pago por ${c.paidByName}` : null },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={[
                    "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold",
                    step.done ? "bg-emerald-500 text-white" : "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200",
                  ].join(" ")}>
                    {step.done ? (
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : i + 1}
                  </div>
                  <div>
                    <p className={`text-[12px] font-medium ${step.done ? "text-zinc-800" : "text-zinc-400"}`}>{step.label}</p>
                    {step.sublabel && step.done && <p className="text-[11px] font-semibold text-zinc-600">{step.sublabel}</p>}
                    {step.date && step.done && <p className="text-[10px] text-zinc-400">{step.date}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {c.jobDescription && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("jobs_description")}</p>
              <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{c.jobDescription}</p>
            </div>
          )}
          {c.additionalNotes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("contracts_notes")}</p>
              <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{c.additionalNotes}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <AbrirDisputaButton
              contractId={c.id}
              contractStatus={c.status}
              activeDisputeId={c.activeDisputeId ?? null}
              activeDisputeHref={null}
              disputeListHref={disputesHref}
            />
          </div>
          <p className="text-[11px] text-zinc-400">{t("contracts_sent")} {fmtDate(c.createdAt, lang)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Job group ────────────────────────────────────────────────────────────────

function JobGroup({
  jobTitle,
  jobId,
  contracts,
  onUpdate,
  bookingsHref,
  disputesHref = "/agency/disputes",
  showPaymentActions = true,
  agencyConfig,
}: {
  jobTitle: string;
  jobId: string | null;
  contracts: AgencyContract[];
  onUpdate: (id: string, updates: Partial<AgencyContract>) => void;
  bookingsHref: string;
  disputesHref?: string;
  showPaymentActions?: boolean;
  agencyConfig?: AgencyConfig;
}) {
  const pendingDeposit = contracts.filter((c) => c.status === "signed").length;
  const confirmed      = contracts.filter((c) => c.status === "confirmed" || c.status === "paid").length;
  const jobDate        = contracts[0]?.jobDate ?? null;
  const location       = contracts[0]?.location ?? null;

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Job header */}
      <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={jobId ? `/agency/jobs/${jobId}` : "#"}
              className="text-[15px] font-semibold text-zinc-900 hover:text-zinc-600 transition-colors truncate"
            >
              {jobTitle}
            </Link>
            {pendingDeposit > 0 && (
              <Link
                href={bookingsHref}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
              >
                {pendingDeposit} depósito{pendingDeposit !== 1 ? "s" : ""} pendente{pendingDeposit !== 1 ? "s" : ""}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[12px] text-zinc-400 flex-wrap">
            {jobDate && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {fmtJobDate(jobDate)}
              </span>
            )}
            {location && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                {location}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 text-[12px] text-zinc-400">
          <span>{contracts.length} talento{contracts.length !== 1 ? "s" : ""}</span>
          {confirmed > 0 && (
            <span className="text-emerald-600 font-medium">· {confirmed} confirmado{confirmed !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Contract rows */}
      <div className="divide-y divide-zinc-50">
        {contracts.map((c) => (
          <ContractCard key={c.id} contract={c} onUpdate={onUpdate} showPaymentActions={showPaymentActions} disputesHref={disputesHref} agencyConfig={agencyConfig} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgencyContracts({
  contracts: initialContracts,
  agencyConfig,
  bookingsHref = "/agency/bookings",
  disputesHref = "/agency/disputes",
  showPaymentActions = true,
}: {
  contracts: AgencyContract[];
  agencyConfig?: AgencyConfig;
  bookingsHref?: string;
  disputesHref?: string;
  showPaymentActions?: boolean;
}) {
  const [contracts,    setContracts]    = useState<AgencyContract[]>(initialContracts);
  const [filter,       setFilter]       = useState<FilterStatus>("all");
  const [stripeBanner, setStripeBanner] = useState<"success" | "cancel" | null>(null);
  const { t } = useT();
  const { commissionLabel, talentShareLabel } = useSubscription();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe_success") === "1") setStripeBanner("success");
    else if (params.get("stripe_cancel") === "1") setStripeBanner("cancel");
  }, []);

  function handleUpdate(id: string, updates: Partial<AgencyContract>) {
    setContracts((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }

  const filtered       = filter === "all" ? contracts : contracts.filter((c) => c.status === filter);
  const pendingDeposit = contracts.filter((c) => c.status === "signed").length;
  const awaitingTalent = contracts.filter((c) => c.status === "sent").length;

  // Group filtered contracts by jobId
  const jobOrder: string[] = [];
  const byJob = new Map<string, AgencyContract[]>();
  for (const c of filtered) {
    const key = c.jobId ?? "no-job";
    if (!byJob.has(key)) { byJob.set(key, []); jobOrder.push(key); }
    byJob.get(key)!.push(c);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("portal_agency")}</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">{t("contracts_title")}</h1>
        <p className="text-[13px] text-zinc-400 mt-1">
          {contracts.length} {t("general_contracts")}
        </p>
      </div>

      {stripeBanner === "success" && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[13px] font-medium text-emerald-800">
              {t("agency_contracts_payment_confirmed_banner")}
            </p>
          </div>
          <button onClick={() => setStripeBanner(null)} className="text-emerald-500 hover:text-emerald-700 transition-colors cursor-pointer flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {stripeBanner === "cancel" && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[13px] font-medium text-amber-800">
              {t("agency_contracts_payment_cancelled_banner")}
            </p>
          </div>
          <button onClick={() => setStripeBanner(null)} className="text-amber-500 hover:text-amber-700 transition-colors cursor-pointer flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {awaitingTalent > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <p className="text-[13px] font-medium text-amber-800">
            {awaitingTalent} {t("contract_status_sent").toLowerCase()}.
          </p>
        </div>
      )}

      {pendingDeposit > 0 && (
        <Link
          href={bookingsHref}
          className="flex items-center gap-3 bg-violet-50 border border-violet-100 hover:border-violet-200 hover:bg-violet-100 rounded-xl px-4 py-3 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0" />
          <p className="text-[13px] font-medium text-violet-800">
            {pendingDeposit} {t("contract_status_signed").toLowerCase()}.
          </p>
        </Link>
      )}

      {contracts.length > 0 && (!agencyConfig || agencyConfig.showCommission) && (
        <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t("finances_platform_commission")}: <strong className="text-zinc-600 ml-1">{commissionLabel}</strong>
          <span className="mx-1">·</span>
          {t("nav_talent")}: <strong className="text-zinc-600 ml-1">{talentShareLabel}</strong>
          <span className="mx-1">·</span>
          <strong className="text-violet-600">+2% {t("finances_referral_payouts")}</strong>
          <span className="text-[#647B7B] ml-1">{t("agency_contracts_if_applicable")}</span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-1 bg-zinc-100 rounded-xl p-1 w-fit">
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={[
              "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all capitalize cursor-pointer whitespace-nowrap",
              filter === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
          >
            {s === "all" ? t("status_all") : t((STATUS_LABEL_KEY[s] ?? s) as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center">
          <div className="w-11 h-11 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-[#647B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-zinc-500">{t("contracts_no_contracts")}</p>
          <p className="text-[13px] text-zinc-400 mt-1">{t("contracts_no_contracts_hint")}</p>
          <Link
            href="/agency/jobs"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors mt-4"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {t("nav_jobs")}
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {jobOrder.map((key) => {
            const group = byJob.get(key)!;
            return (
              <JobGroup
                key={key}
                jobTitle={group[0].jobTitle}
                jobId={group[0].jobId}
                contracts={group}
                onUpdate={handleUpdate}
                bookingsHref={bookingsHref}
                disputesHref={disputesHref}
                showPaymentActions={showPaymentActions}
                agencyConfig={agencyConfig}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
