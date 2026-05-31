"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/LanguageContext";
import { unifiedStatusInfo, type UnifiedBookingStatus } from "@/lib/bookingStatus";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import Avatar from "@/components/ui/Avatar";
import { brl, usd } from "@/lib/brl";
import type { AgencyConfig } from "@/lib/agencyConfig";

export type Booking = {
  id:              string;
  contractId:      string | null;
  talentId:        string;
  talentName:      string;
  talentAvatarUrl: string | null;
  jobTitle:        string;
  status:          string;
  contractStatus:  string | null;
  derivedStatus:   string;
  totalValue:      number;
  createdAt:       string;
  contractSigned:    string | null;
  jobDate:           string | null;
  paidAt:            string | null;
  hasContractFile:   boolean;
  hasSignedContract: boolean;
  isAgentJobBacked:  boolean;
  paidByName?: string | null;
};

function formatDate(s: string | null, lang: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { month: "short", day: "numeric", year: "numeric" });
}
function formatJobDate(s: string | null, lang: string) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(amount: number, lang: string): string {
  return lang === "en" ? usd(amount) : brl(amount);
}

// ── Timeline ──────────────────────────────────────────────────────────────────

type TimelineStep = { label: string; done: boolean; date?: string | null };

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="flex flex-col gap-0">
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className={[
              "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold mt-0.5",
              s.done ? "bg-emerald-500 text-white" : "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200",
            ].join(" ")}>
              {s.done ? (
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-px flex-1 min-h-[16px] my-0.5 ${s.done ? "bg-emerald-200" : "bg-zinc-100"}`} />
            )}
          </div>
          <div className="pb-3 min-w-0">
            <p className={`text-[12px] font-medium leading-none ${s.done ? "text-zinc-800" : "text-zinc-400"}`}>
              {s.label}
            </p>
            {s.date && <p className="text-[10px] text-zinc-400 mt-0.5">{s.date}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Booking row ───────────────────────────────────────────────────────────────

function BookingRow({
  booking,
  onStatusChange,
  focusBookingId,
  financesHref,
  agencyConfig,
}: {
  booking: Booking;
  onStatusChange: (id: string, derivedStatus: string) => void;
  focusBookingId?: string;
  financesHref: string;
  agencyConfig?: AgencyConfig;
}) {
  const { t, lang } = useT();
  const [acting, setActing]             = useState<"confirm" | "pay" | "agent_pay" | "cancel" | null>(null);
  const [expanded, setExpanded]         = useState(booking.id === focusBookingId);
  const [balanceError, setBalanceError] = useState<{ required: number; available: number } | null>(null);
  const [earlyPayWarning, setEarlyPayWarning] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);

  const isEscrow = !agencyConfig || agencyConfig.showEscrow;
  const paymentMode = isEscrow ? "escrow" : "internal";
  const unified = booking.derivedStatus as UnifiedBookingStatus;
  const st      = unifiedStatusInfo(unified, "pt-BR", paymentMode);
  const jobDate        = formatJobDate(booking.jobDate, lang);
  const canCancelBooking =
    Boolean(booking.contractId) &&
    ["aguardando_assinatura", "aguardando_deposito", "aguardando_pagamento"].includes(unified);
  const cancelButtonClass =
    "rounded-xl border border-rose-200 bg-white px-4 py-2 text-[12px] font-semibold text-rose-600 transition-all hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50";

  const timelineSteps: TimelineStep[] = [
    { label: t("contracts_sent"),   done: true,                                                                                   date: formatDate(booking.createdAt, lang) },
    { label: t("contracts_signed"), done: ["aguardando_deposito","aguardando_pagamento","pago"].includes(unified),                date: booking.contractSigned ? formatDate(booking.contractSigned, lang) : null },
    { label: t("jobs_job_date"),    done: !!booking.jobDate && new Date(booking.jobDate + "T23:59:59") < new Date(),              date: jobDate ?? t("general_tbd") },
    { label: t("status_paid"),      done: unified === "pago",                                                                    date: booking.paidAt ? formatDate(booking.paidAt, lang) : null },
  ];
  if (unified === "cancelado") {
    timelineSteps.push({ label: st.label, done: true });
  }

  async function callContract(action: string) {
    if (!booking.contractId) return null;
    return fetch(`/api/contracts/${booking.contractId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  }

  async function handleConfirm() {
    setBalanceError(null);
    setApiError(null);
    setActing("confirm");
    if (!booking.contractId) { setActing(null); return; }
    const res = await fetch(`/api/contracts/${booking.contractId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "agency_sign" }),
    });
    const d = await res.json().catch(() => ({})) as { error?: string; required?: number; available?: number; derived_status?: string };
    if (res.ok) {
      onStatusChange(booking.id, d.derived_status ?? "aguardando_pagamento");
    } else if (res.status === 402) {
      setBalanceError({ required: d.required ?? 0, available: d.available ?? 0 });
    } else if (res.status === 409) {
      onStatusChange(booking.id, "aguardando_pagamento");
    } else {
      setApiError(d.error ?? t("general_error"));
    }
    setActing(null);
  }

  function handlePay() {
    const jobPast = booking.jobDate
      ? new Date(booking.jobDate + "T23:59:59") < new Date()
      : true;
    if (!jobPast) { setEarlyPayWarning(true); return; }
    executePay();
  }

  async function executePay() {
    setEarlyPayWarning(false);
    setApiError(null);
    setActing("pay");
    const res = await callContract("pay");
    const d = await res?.json().catch(() => ({})) ?? {};
    if (res?.ok) {
      onStatusChange(booking.id, d.derived_status ?? "pago");
    } else if (res) {
      setApiError(d.error ?? t("general_error"));
    }
    setActing(null);
  }

  function handleAgentPay() {
    const jobPast = booking.jobDate
      ? new Date(booking.jobDate + "T23:59:59") < new Date()
      : true;
    if (!jobPast) { setEarlyPayWarning(true); return; }
    executeAgentPay();
  }

  async function executeAgentPay() {
    setEarlyPayWarning(false);
    setApiError(null);
    setActing("agent_pay");
    const res = await callContract("agent_pay");
    const d = await res?.json().catch(() => ({})) ?? {};
    if (res?.ok) {
      onStatusChange(booking.id, d.derived_status ?? "pago");
    } else if (res) {
      setApiError(d.error ?? t("general_error"));
    }
    setActing(null);
  }

  async function handleCancel() {
    if (!booking.contractId) return;
    const baseMsg = `${t("bookings_cancel_confirm_base")} ${booking.talentName}?`;
    const escrowSuffix = unified === "aguardando_pagamento" && isEscrow ? ` ${t("bookings_cancel_confirm_escrow_suffix")}` : "";
    const confirmed = window.confirm(baseMsg + escrowSuffix);
    if (!confirmed) return;

    setActing("cancel");
    setApiError(null);
    const res = await callContract("cancel_job");
    const d = await res?.json().catch(() => ({})) ?? {};
    if (res?.ok) {
      onStatusChange(booking.id, d.derived_status ?? "cancelado");
    } else if (res) {
      setApiError(d.error ?? t("general_error"));
    }
    setActing(null);
  }

  return (
    <div>
      {/* Summary row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className={[
          "flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50/60 transition-colors cursor-pointer flex-wrap sm:flex-nowrap",
          booking.id === focusBookingId ? "bg-[#D1F4EB]/70" : "",
        ].join(" ")}
      >
        <Avatar name={booking.talentName} imageUrl={booking.talentAvatarUrl} size="sm" />

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 leading-snug truncate">{booking.talentName}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5 truncate">
            {booking.jobTitle || formatDate(booking.createdAt, lang)}
            {jobDate ? ` · ${jobDate}` : ""}
          </p>
        </div>

        {booking.totalValue > 0 && (
          <div className="text-right flex-shrink-0">
            <p className="text-[14px] font-bold text-zinc-900 tabular-nums">{fmtMoney(booking.totalValue, lang)}</p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {unified === "aguardando_assinatura" && (
            <>
              <span className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-1.5 text-[12px] font-medium text-violet-600">
                {t("bookings_awaiting_talent")}
              </span>
              {canCancelBooking && (
                <button onClick={handleCancel} disabled={acting !== null} className={cancelButtonClass}>
                  {acting === "cancel" ? t("bookings_cancelling_action") : t("bookings_cancel_booking_btn")}
                </button>
              )}
            </>
          )}

          {unified === "aguardando_deposito" && isEscrow && (
            <>
              {booking.isAgentJobBacked ? (
                earlyPayWarning ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] text-amber-700 font-medium">{t("bookings_work_not_done")}</span>
                    <button onClick={executeAgentPay} disabled={acting !== null}
                      className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-60">
                      {acting === "agent_pay" ? "…" : t("bookings_yes_pay")}
                    </button>
                    <button onClick={() => setEarlyPayWarning(false)}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors cursor-pointer">
                      {t("action_cancel")}
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-semibold text-teal-700">
                      {t("bookings_agent_reserved")} {fmtMoney(booking.totalValue, lang)}
                    </span>
                    <button
                      onClick={handleAgentPay}
                      disabled={acting !== null || !booking.contractId}
                      className="text-[12px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      {acting === "agent_pay" ? t("bookings_paying") : t("bookings_pay_talent")}
                    </button>
                    {canCancelBooking && (
                      <button onClick={handleCancel} disabled={acting !== null} className={cancelButtonClass}>
                        {acting === "cancel" ? t("bookings_cancelling_action") : t("bookings_cancel_booking_btn")}
                      </button>
                    )}
                  </>
                )
              ) : (
                <>
                  <button
                    onClick={handleConfirm}
                    disabled={acting !== null || !booking.contractId || (booking.hasContractFile && !booking.hasSignedContract)}
                    title={booking.hasContractFile && !booking.hasSignedContract ? t("bookings_signed_pending_warning") : undefined}
                    className="text-[12px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    {acting === "confirm" ? t("bookings_confirming") : t("bookings_confirm_booking")}
                  </button>
                  {canCancelBooking && (
                    <button onClick={handleCancel} disabled={acting !== null} className={cancelButtonClass}>
                      {acting === "cancel" ? t("bookings_cancelling_action") : t("bookings_cancel_booking_btn")}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {unified === "aguardando_deposito" && !isEscrow && (
            <>
              <span className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-1.5 text-[12px] font-semibold text-teal-700">
                {t("bookings_signed_contract")}
              </span>
              {booking.contractId && (
                <a
                  href={`/agency/contracts?focus=${booking.contractId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[12px] font-semibold px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition-colors"
                >
                  {t("bookings_view_contract")}
                </a>
              )}
              {canCancelBooking && (
                <button onClick={handleCancel} disabled={acting !== null} className={cancelButtonClass}>
                  {acting === "cancel" ? t("bookings_cancelling_action") : t("bookings_cancel_booking_btn")}
                </button>
              )}
            </>
          )}

          {unified === "aguardando_pagamento" && (
            earlyPayWarning ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] text-amber-700 font-medium">{t("bookings_work_not_done")}</span>
                <button onClick={executePay} disabled={acting !== null}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-60">
                  {acting === "pay" ? "…" : t("bookings_yes_pay")}
                </button>
                <button onClick={() => setEarlyPayWarning(false)}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors cursor-pointer">
                  {t("action_cancel")}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handlePay}
                  disabled={acting !== null || !booking.contractId}
                  className="text-[12px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50 bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {acting === "pay" ? "…" : t("bookings_pay_talent")}
                </button>
                {canCancelBooking && (
                  <button onClick={handleCancel} disabled={acting !== null} className={cancelButtonClass}>
                    {acting === "cancel" ? t("bookings_cancelling_action") : t("bookings_cancel_booking_btn")}
                  </button>
                )}
              </>
            )
          )}

          {unified === "pago" && (
            <span className="text-[12px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
              {booking.paidByName ? `${t("bookings_paid_by")} ${booking.paidByName}` : t("bookings_paid_label")}
            </span>
          )}
          {unified === "cancelado" && (
            <span className="text-[12px] font-medium text-zinc-400">{st.label}</span>
          )}
        </div>

        <svg className={`w-4 h-4 text-[#647B7B] flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Insufficient balance banner — escrow mode only */}
      {balanceError && isEscrow && (
        <div className="mx-6 mb-3 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-amber-800">{t("bookings_insufficient_balance")}</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              {t("bookings_insufficient_required")} <strong>{fmtMoney(balanceError.required, lang)}</strong> · {t("bookings_insufficient_available")} <strong>{fmtMoney(balanceError.available, lang)}</strong>
            </p>
          </div>
          <Link
            href={financesHref}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 text-[12px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            {t("bookings_deposit_btn")}
          </Link>
        </div>
      )}

      {/* API error banner */}
      {apiError && (
        <div className="mx-6 mb-3 flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-[12px] font-semibold text-rose-800 flex-1">{apiError}</p>
          <button onClick={() => setApiError(null)} className="text-rose-400 hover:text-rose-600 transition-colors cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Timeline expansion */}
      {expanded && (
        <div className="border-t border-zinc-50 bg-zinc-50/60 px-5 py-3.5 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{t("page_bookings")}</p>
          <Timeline steps={timelineSteps} />

          {/* Contract file links */}
          <div className="flex flex-wrap gap-2 pt-1">
            {booking.contractId && booking.hasSignedContract && (
              <a
                href={`/api/contracts/${booking.contractId}/file?type=signed`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t("bookings_view_signed_contract")}
              </a>
            )}
            {booking.contractId && booking.hasContractFile && (
              <a
                href={`/api/contracts/${booking.contractId}/file?type=original`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 bg-zinc-100 border border-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t("bookings_view_original_contract")}
              </a>
            )}
          </div>

          {/* Block confirm warning — escrow mode only */}
          {unified === "aguardando_deposito" && isEscrow && booking.hasContractFile && !booking.hasSignedContract && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-[11px] text-amber-800 font-medium">
                {t("bookings_signed_pending_warning")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, count, total, children, empty, lang }: {
  title: string; count: number; total?: number; children: React.ReactNode; empty: string; lang: string;
}) {
  function fmtTotal(v: number) {
    return lang === "en" ? usd(v) : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
          <span className="text-[11px] font-semibold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">{count}</span>
        </div>
        {total !== undefined && total > 0 && (
          <p className="text-[13px] font-semibold text-zinc-700 tabular-nums">
            {fmtTotal(total)}
          </p>
        )}
      </div>
      {count > 0 ? (
        <div className="bg-white rounded-[1.35rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
          {children}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 py-10 text-center">
          <p className="text-[13px] text-zinc-400 font-medium">{empty}</p>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function BookingList({
  bookings: initial,
  focusBookingId,
  financesHref = "/agency/finances",
  agencyConfig,
}: {
  bookings: Booking[];
  focusBookingId?: string;
  financesHref?: string;
  agencyConfig?: AgencyConfig;
}) {
  const [bookings, setBookings] = useState(initial);
  const { t, lang } = useT();
  const router = useRouter();
  const isEscrow = !agencyConfig || agencyConfig.showEscrow;

  useEffect(() => { setBookings(initial); }, [initial]);

  const { refreshing } = useRealtimeRefresh(
    [{ table: "bookings" }, { table: "contracts" }],
    () => router.refresh(),
  );

  function handleStatusChange(id: string, newDerivedStatus: string) {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, derivedStatus: newDerivedStatus } : b));
  }

  const by = (s: string) => bookings.filter((b) => b.derivedStatus === s);

  const signature = by("aguardando_assinatura");
  const deposit   = by("aguardando_deposito");
  const payment   = by("aguardando_pagamento");
  const paid      = by("pago");
  const cancelled = by("cancelado");

  const paidTotal = paid.reduce((s, b) => s + b.totalValue, 0);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="rounded-[1.75rem] bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-6 py-5 text-white shadow-[0_8px_28px_rgba(26,188,156,0.28)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/80 mb-2">{t("portal_agency")}</p>
          <h1 className="text-[2rem] font-black tracking-[-0.04em] leading-tight">{t("page_bookings")}</h1>
          <p className="text-[13px] text-white/70 mt-2">
          {isEscrow ? t("bookings_page_desc_escrow") : t("bookings_page_desc_internal")}
        </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshing && (
            <span className="flex items-center gap-1.5 text-[11px] text-white/70">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {t("bookings_updating_label")}
            </span>
          )}
          <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{t("bookings_total_label")}</p>
            <p className="mt-1 text-2xl font-black text-white">{bookings.length}</p>
          </div>
        </div>
        </div>
      </div>

      <Section title={t("bookings_section_awaiting_signature")} count={signature.length} empty={t("bookings_no_bookings")} lang={lang}>
        {signature.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} financesHref={financesHref} agencyConfig={agencyConfig} />)}
      </Section>

      <Section
        title={isEscrow ? t("bookings_section_awaiting_deposit") : t("bookings_section_signed_contracts")}
        count={deposit.length}
        total={deposit.reduce((s, b) => s + b.totalValue, 0)}
        empty={t("bookings_no_bookings")}
        lang={lang}
      >
        {deposit.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} financesHref={financesHref} agencyConfig={agencyConfig} />)}
      </Section>

      <Section
        title={isEscrow ? t("bookings_section_awaiting_payment") : t("bookings_section_payment_in_progress")}
        count={payment.length}
        total={payment.reduce((s, b) => s + b.totalValue, 0)}
        empty={t("bookings_no_bookings")}
        lang={lang}
      >
        {payment.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} financesHref={financesHref} agencyConfig={agencyConfig} />)}
      </Section>

      <Section title={t("status_paid")} count={paid.length} total={paidTotal} empty={t("bookings_no_bookings")} lang={lang}>
        {paid.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} financesHref={financesHref} agencyConfig={agencyConfig} />)}
      </Section>

      <Section title={t("status_cancelled")} count={cancelled.length} empty={t("bookings_no_bookings")} lang={lang}>
        {cancelled.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} financesHref={financesHref} agencyConfig={agencyConfig} />)}
      </Section>
    </div>
  );
}
