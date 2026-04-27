"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/LanguageContext";
import { unifiedStatusInfo, type UnifiedBookingStatus } from "@/lib/bookingStatus";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { useSubscription } from "@/lib/SubscriptionContext";
import PaywallModal from "@/components/agency/PaywallModal";

export type Booking = {
  id:             string;
  contractId:     string | null;
  talentId:       string;
  talentName:     string;
  jobTitle:       string;
  status:         string;
  contractStatus: string | null;
  derivedStatus:  string;
  totalValue:     number;
  createdAt:      string;
  contractSigned: string | null;
  jobDate:        string | null;
  paidAt:         string | null;
};

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}
function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}
function formatJobDate(s: string | null) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-600", "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",      "from-fuchsia-400 to-purple-600",
];
function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
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
}: {
  booking: Booking;
  onStatusChange: (id: string, derivedStatus: string) => void;
  focusBookingId?: string;
}) {
  const { t } = useT();
  const { isPro } = useSubscription();
  const [acting, setActing]             = useState<"confirm" | "pay" | "cancel" | null>(null);
  const [expanded, setExpanded]         = useState(booking.id === focusBookingId);
  const [balanceError, setBalanceError] = useState<{ required: number; available: number } | null>(null);
  const [earlyPayWarning, setEarlyPayWarning] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen]   = useState(false);

  const unified        = booking.derivedStatus as UnifiedBookingStatus;
  const st             = unifiedStatusInfo(unified);
  const jobDate        = formatJobDate(booking.jobDate);
  const canCancelBooking =
    Boolean(booking.contractId) &&
    ["aguardando_assinatura", "aguardando_deposito", "aguardando_pagamento"].includes(unified);
  const cancelButtonClass =
    "rounded-xl border border-rose-200 bg-white px-4 py-2 text-[12px] font-semibold text-rose-600 transition-all hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50";

  const timelineSteps: TimelineStep[] = [
    { label: t("contracts_sent"),   done: true,                                                                                   date: formatDate(booking.createdAt) },
    { label: t("contracts_signed"), done: ["aguardando_deposito","aguardando_pagamento","pago"].includes(unified),                date: booking.contractSigned ? formatDate(booking.contractSigned) : null },
    { label: t("jobs_job_date"),    done: !!booking.jobDate && new Date(booking.jobDate + "T23:59:59") < new Date(),              date: jobDate ?? t("general_tbd") },
    { label: t("status_paid"),      done: unified === "pago",                                                                    date: booking.paidAt ? formatDate(booking.paidAt) : null },
  ];
  if (unified === "cancelado") {
    timelineSteps.push({ label: st.label, done: true });
  }

  // All status-changing actions go through /api/contracts/[contractId]
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
    const res = await callContract("agency_sign");
    if (!res) { setActing(null); return; }
    const d = await res.json().catch(() => ({}));
    if (res.status === 402) {
      setBalanceError({ required: d.required, available: d.available });
    } else if (res.ok) {
      onStatusChange(booking.id, d.derived_status ?? "aguardando_pagamento");
    } else if (res.status === 409) {
      onStatusChange(booking.id, "aguardando_pagamento");
    } else {
      setApiError(d.error ?? "Erro ao confirmar reserva. Tente novamente.");
    }
    setActing(null);
  }

  function handlePay() {
    // Warn if the job date hasn't passed yet
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
      setApiError(d.error ?? "Erro ao liberar pagamento. Tente novamente.");
    }
    setActing(null);
  }

  async function handleCancel() {
    if (!booking.contractId) return;
    const confirmed = window.confirm(
      `Cancelar reserva de ${booking.talentName}?${unified === "aguardando_pagamento" ? " Se já houver valor em custódia, ele será devolvido com segurança." : ""}`,
    );
    if (!confirmed) return;

    setActing("cancel");
    setApiError(null);
    const res = await callContract("cancel_job");
    const d = await res?.json().catch(() => ({})) ?? {};
    if (res?.ok) {
      onStatusChange(booking.id, d.derived_status ?? "cancelado");
    } else if (res) {
      setApiError(d.error ?? "Erro ao cancelar. Tente novamente.");
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
        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(booking.talentName)} flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white`}>
          {initials(booking.talentName)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 leading-snug truncate">{booking.talentName}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5 truncate">
            {booking.jobTitle || formatDate(booking.createdAt)}
            {jobDate ? ` · ${jobDate}` : ""}
          </p>
        </div>

        {booking.totalValue > 0 && (
          <div className="text-right flex-shrink-0">
            <p className="text-[14px] font-bold text-zinc-900 tabular-nums">{brl(booking.totalValue)}</p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {unified === "aguardando_assinatura" && (
            <>
              <span className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-1.5 text-[12px] font-medium text-violet-600">
                Aguardando Talento
              </span>
              {canCancelBooking && (
                <button onClick={handleCancel} disabled={acting !== null} className={cancelButtonClass}>
                  {acting === "cancel" ? "Cancelando..." : "Cancelar reserva"}
                </button>
              )}
            </>
          )}

          {unified === "aguardando_deposito" && (
            <>
              {paywallOpen && <PaywallModal onClose={() => setPaywallOpen(false)} />}
              <button
                onClick={handleConfirm}
                disabled={acting !== null || !booking.contractId}
                className={[
                  "text-[12px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50",
                  isPro
                    ? "bg-violet-600 hover:bg-violet-700 text-white"
                    : "bg-violet-600 hover:bg-violet-700 text-white",
                ].join(" ")}
              >
                {!isPro && (
                  <svg className="inline w-3 h-3 mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                {acting === "confirm" ? "Verificando…" : "Confirmar Reserva"}
              </button>
              {canCancelBooking && (
                <button onClick={handleCancel} disabled={acting !== null} className={cancelButtonClass}>
                  {acting === "cancel" ? "Cancelando..." : "Cancelar reserva"}
                </button>
              )}
            </>
          )}

          {unified === "aguardando_pagamento" && (
            earlyPayWarning ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] text-amber-700 font-medium">Trabalho ainda não realizado. Pagar assim mesmo?</span>
                <button onClick={executePay} disabled={acting !== null}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer disabled:opacity-60">
                  {acting === "pay" ? "…" : "Sim, pagar"}
                </button>
                <button onClick={() => setEarlyPayWarning(false)}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors cursor-pointer">
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                {paywallOpen && <PaywallModal onClose={() => setPaywallOpen(false)} />}
                <button
                  onClick={handlePay}
                  disabled={acting !== null || !booking.contractId}
                  className={[
                    "text-[12px] font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50",
                    isPro
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "bg-violet-600 hover:bg-violet-700 text-white",
                  ].join(" ")}
                >
                  {!isPro && (
                    <svg className="inline w-3 h-3 mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                  {acting === "pay" ? "…" : "Pagar Talento"}
                </button>
                {canCancelBooking && (
                  <button onClick={handleCancel} disabled={acting !== null} className={cancelButtonClass}>
                    {acting === "cancel" ? "Cancelando..." : "Cancelar reserva"}
                  </button>
                )}
              </>
            )
          )}

          {unified === "pago" && (
            <span className="text-[12px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">Pago</span>
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

      {/* Insufficient balance banner */}
      {balanceError && (
        <div className="mx-6 mb-3 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
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
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 text-[12px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Depositar fundos
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
        <div className="border-t border-zinc-50 bg-zinc-50/60 px-5 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">{t("page_bookings")}</p>
          <Timeline steps={timelineSteps} />
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, count, total, children, empty }: {
  title: string; count: number; total?: number; children: React.ReactNode; empty: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
          <span className="text-[11px] font-semibold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">{count}</span>
        </div>
        {total !== undefined && total > 0 && (
          <p className="text-[13px] font-semibold text-zinc-700 tabular-nums">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(total)}
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

export default function BookingList({ bookings: initial, focusBookingId }: { bookings: Booking[]; focusBookingId?: string }) {
  const [bookings, setBookings] = useState(initial);
  const { t } = useT();
  const router = useRouter();

  // Sync when server re-renders with fresh props (after router.refresh())
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
          <p className="text-[13px] text-white/70 mt-2">Acompanhe assinatura, custódia e liberação de pagamento por reserva.</p>
        </div>
        <div className="flex items-center gap-3">
          {refreshing && (
            <span className="flex items-center gap-1.5 text-[11px] text-white/70">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Atualizando…
            </span>
          )}
          <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">Total</p>
            <p className="mt-1 text-2xl font-black text-white">{bookings.length}</p>
          </div>
        </div>
        </div>
      </div>

      <Section title="Aguardando Assinatura" count={signature.length} empty={t("bookings_no_bookings")}>
        {signature.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} />)}
      </Section>

      <Section title="Aguardando Depósito" count={deposit.length}
        total={deposit.reduce((s, b) => s + b.totalValue, 0)} empty={t("bookings_no_bookings")}>
        {deposit.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} />)}
      </Section>

      <Section title="Aguardando Pagamento" count={payment.length}
        total={payment.reduce((s, b) => s + b.totalValue, 0)} empty={t("bookings_no_bookings")}>
        {payment.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} />)}
      </Section>

      <Section title={t("status_paid")} count={paid.length} total={paidTotal} empty={t("bookings_no_bookings")}>
        {paid.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} />)}
      </Section>

      <Section title={t("status_cancelled")} count={cancelled.length} empty={t("bookings_no_bookings")}>
        {cancelled.map((b) => <BookingRow key={b.id} booking={b} focusBookingId={focusBookingId} onStatusChange={handleStatusChange} />)}
      </Section>
    </div>
  );
}

