"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getUnifiedBookingStatus, unifiedStatusInfo, type UnifiedBookingStatus } from "@/lib/bookingStatus";
import { useRealtimeRefresh } from "@/lib/hooks/useRealtimeRefresh";
import { brl } from "@/lib/brl";
import { useT } from "@/lib/LanguageContext";
import { formatJobLocation } from "@/lib/jobLocation";

type Booking = {
  id: string;
  job_title: string;
  job_id: string | null;
  agency_id: string | null;
  agency_name: string | null;
  status: string;
  contract_status: string | null;
  derived_status: string;
  price: number;
  net_amount: number | null;
  created_at: string;
  location: string | null;
  job_date: string | null;
  job_time: string | null;
  contract_id: string | null;
  /** Set when agency confirmed external payment was sent (internal mode). */
  agency_payment_sent_at: string | null;
};

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}
function formatJobDate(s: string | null) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function BookingCard({ booking: b, onCancel, cancelling }: {
  booking: Booking;
  onCancel: (id: string, contractId: string | null) => void;
  cancelling: string | null;
}) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const unified   = b.derived_status as UnifiedBookingStatus;
  const st        = unifiedStatusInfo(unified, lang === "en" ? "en" : "pt-BR");
  // No cancel once agency has confirmed payment was sent (internal mode) or once
  // the booking has moved past the deposit stage.
  const canCancel =
    ["aguardando_assinatura", "aguardando_deposito"].includes(unified) &&
    !b.agency_payment_sent_at;
  const jobDate   = formatJobDate(b.job_date);

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] overflow-hidden">
      <div
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/60 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 truncate">{b.job_title}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">
            {jobDate ?? formatDate(b.created_at)}
          </p>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${st.badge}`}>
          {st.label}
        </span>
        <p className="text-[14px] font-semibold text-zinc-900 tabular-nums flex-shrink-0 min-w-[60px] text-right">
          {b.price > 0 ? brl(b.price) : "—"}
        </p>
        <svg className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {open && (
        <div className="bg-zinc-50/80 px-6 py-4 border-t border-zinc-100 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
            {b.agency_name && (
              <div className="col-span-2 sm:col-span-4">
                <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">{t("contracts_agency")}</p>
                <p className="text-zinc-700 font-semibold">{b.agency_name}</p>
              </div>
            )}
            <div>
              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">{t("bookings_agreed_value")}</p>
              <p className="text-zinc-700 font-semibold">{b.price > 0 ? brl(b.price) : "—"}</p>
              {b.net_amount != null && <p className="text-zinc-400 mt-0.5">{t("bookings_you_receive")} {brl(b.net_amount)}</p>}
            </div>
            <div>
              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">{t("contracts_job_date")}</p>
              <p className="text-zinc-700">{jobDate ?? "—"}</p>
              {b.job_time && <p className="text-zinc-400 mt-0.5">{b.job_time}</p>}
            </div>
            <div>
              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">{t("contracts_location")}</p>
              <p className="text-zinc-700">{formatJobLocation(b.location) ?? "—"}</p>
            </div>
            <div>
              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">{t("bookings_booked_at")}</p>
              <p className="text-zinc-700">{formatDate(b.created_at)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap pt-1">
            {unified === "aguardando_assinatura" && b.contract_id && (
              <Link
                href="/talent/contracts"
                className="inline-flex items-center gap-2 text-[12px] font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t("bookings_sign_contract")}
              </Link>
            )}
            {canCancel && (
              <button
                onClick={(e) => { e.stopPropagation(); onCancel(b.id, b.contract_id); }}
                disabled={cancelling === b.id}
                className="inline-flex items-center gap-2 text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-white border border-zinc-200 hover:border-rose-200 hover:bg-rose-50 text-zinc-600 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {cancelling === b.id ? t("bookings_cancelling") : t("bookings_cancel_booking")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionBlock({ title, bookings, badge, onCancel, cancelling }: {
  title: string; bookings: Booking[]; badge?: string;
  onCancel: (id: string, contractId: string | null) => void; cancelling: string | null;
}) {
  if (bookings.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-zinc-700">{title}</h2>
        {badge && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge}`}>
            {bookings.length}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {bookings.map((b) => (
          <BookingCard key={b.id} booking={b} onCancel={onCancel} cancelling={cancelling} />
        ))}
      </div>
    </section>
  );
}

export default function TalentBookings() {
  const { t, lang } = useT();
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loading, setLoading]       = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  async function load(initial = false) {
    if (initial) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { if (initial) setLoading(false); return; }

    // Single joined query — contracts embedded via booking_id FK (atomic, no stale join maps)
    const { data: bookingsData } = await supabase
      .from("bookings")
      .select(`
        id, job_title, job_id, agency_id, status, price, created_at,
        contracts!contracts_booking_id_fkey (
          id, status, location, job_date, job_time, net_amount, commission_amount,
          agency_payment_sent_at
        )
      `)
      .eq("talent_user_id", user.id)
      .order("created_at", { ascending: false });

    const jobIds = [...new Set((bookingsData ?? []).map((booking: any) => booking.job_id).filter(Boolean))] as string[];
    const { data: jobsData } = jobIds.length
      ? await supabase.from("jobs").select("id, workspace_id").in("id", jobIds)
      : { data: [] };
    const openJobIds = new Set(
      (jobsData ?? [])
        .filter((job: any) => !job.workspace_id)
        .map((job: any) => job.id),
    );
    const visibleBookings = (bookingsData ?? []).filter((booking: any) => !booking.job_id || openJobIds.has(booking.job_id));

    const agencyIds = [...new Set(visibleBookings.map((b: any) => b.agency_id).filter(Boolean))] as string[];
    const { data: agenciesData } = agencyIds.length
      ? await supabase.from("agencies").select("id, company_name").in("id", agencyIds)
      : { data: [] };

    const agencyMap = new Map<string, string>((agenciesData ?? []).map((a: any) => [a.id, a.company_name ?? ""]));

    setBookings(
      visibleBookings.map((b: any) => {
        const contractArr = Array.isArray(b.contracts) ? b.contracts : [];
        const contract = contractArr[0] ?? null;

        return {
          id:              b.id,
          job_title:       b.job_title  ?? "Booking",
          job_id:          b.job_id     ?? null,
          agency_id:       b.agency_id  ?? null,
          agency_name:     b.agency_id ? (agencyMap.get(b.agency_id) ?? null) : null,
          status:          b.status     ?? "pending",
          contract_status: contract?.status ?? null,
          derived_status:  getUnifiedBookingStatus(b.status ?? "pending", contract?.status ?? null),
          price:           b.price      ?? 0,
          net_amount:      contract?.net_amount != null ? Number(contract.net_amount) : null,
          created_at:      b.created_at ?? "",
          location:        contract?.location ?? null,
          job_date:        contract?.job_date ?? null,
          job_time:        contract?.job_time ?? null,
          contract_id:     contract?.id ?? null,
          agency_payment_sent_at: contract?.agency_payment_sent_at ?? null,
        };
      })
    );
    if (initial) setLoading(false);
  }

  useEffect(() => { load(true); }, []);

  const { refreshing } = useRealtimeRefresh(
    [{ table: "bookings" }, { table: "contracts" }],
    () => load(false),
  );

  async function handleCancel(bookingId: string, contractId: string | null) {
    if (!confirm(t("bookings_cancel_confirm"))) return;
    setCancelling(bookingId);
    let ok = false;

    if (contractId) {
      // Cancel via contract (single update point)
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "talent_cancel" }),
      });
      ok = res.ok;
    }

    if (ok) {
      setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status: "cancelled", contract_status: "cancelled", derived_status: "cancelado" } : b));
      setToast({ msg: t("bookings_cancelled_toast"), ok: false });
    } else {
      setToast({ msg: t("bookings_cancel_failed"), ok: false });
    }
    setCancelling(null);
    setTimeout(() => setToast(null), 3500);
  }

  const by = (s: string) => bookings.filter((b) => b.derived_status === s);

  return (
    <div className="max-w-3xl space-y-8">
      {toast && (
        <div className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-[13px] font-medium text-white",
          toast.ok ? "bg-emerald-600" : "bg-[#1F2D2E]",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t("bookings_activity")}</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">{t("bookings_my_bookings")}</h1>
        <div className="flex items-center gap-3 mt-1">
          {!loading && <p className="text-[13px] text-zinc-400">{bookings.length} total</p>}
          {refreshing && (
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t("common_updating")}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-16 text-center">
          <p className="text-[14px] font-medium text-zinc-500">{t("bookings_no_bookings")}</p>
          <p className="text-[13px] text-zinc-400 mt-1">{t("bookings_empty_hint")}</p>
        </div>
      ) : (
        <>
          <SectionBlock title={t("booking_status_awaiting_signature")} bookings={by("aguardando_assinatura")} badge="bg-violet-100 text-violet-700"   onCancel={handleCancel} cancelling={cancelling} />
          <SectionBlock title={t("booking_status_awaiting_deposit")}   bookings={by("aguardando_deposito")}   badge="bg-sky-100 text-sky-700"         onCancel={handleCancel} cancelling={cancelling} />
          <SectionBlock title={t("booking_status_awaiting_payment")}   bookings={by("aguardando_pagamento")}  badge="bg-amber-100 text-amber-700"     onCancel={handleCancel} cancelling={cancelling} />
          <SectionBlock title={t("booking_status_paid")}               bookings={by("pago")}                  badge="bg-emerald-100 text-emerald-700" onCancel={handleCancel} cancelling={cancelling} />
          <SectionBlock title={t("booking_status_cancelled")}          bookings={by("cancelado")}             onCancel={handleCancel} cancelling={cancelling} />
        </>
      )}
    </div>
  );
}
