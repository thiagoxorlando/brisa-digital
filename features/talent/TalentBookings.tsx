"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Booking = {
  id: string;
  job_title: string;
  job_id: string | null;
  status: string;
  price: number;
  created_at: string;
  location: string | null;
  job_date: string | null;
  contract_id: string | null;
  contract_status: string | null; // sent | signed | rejected | null
};

// Derive the display state from booking + contract
type DisplayState =
  | "pending_signature"  // contract sent, not signed yet
  | "pending_payment"    // contract signed, waiting agency to pay
  | "paid"               // agency paid
  | "confirmed"          // legacy confirmed
  | "cancelled"
  | "other";

function getDisplayState(b: Booking): DisplayState {
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "paid")     return "paid";
  if (b.status === "pending_payment") return "pending_payment";
  if (b.status === "confirmed") return "confirmed";
  // pending booking + contract sent but not signed → pending_signature
  if (b.status === "pending" && b.contract_status === "sent") return "pending_signature";
  return "other";
}

const STATUS_LABEL: Record<DisplayState, string> = {
  pending_signature: "Pending Signature",
  pending_payment:   "Pending Payment",
  paid:              "Paid",
  confirmed:         "Confirmed",
  cancelled:         "Cancelled",
  other:             "Pending",
};

const STATUS_CLS: Record<DisplayState, string> = {
  pending_signature: "bg-violet-50  text-violet-700  ring-1 ring-violet-100",
  pending_payment:   "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  paid:              "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  confirmed:         "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  cancelled:         "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
  other:             "bg-zinc-100   text-zinc-400    ring-1 ring-zinc-200",
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function formatJobDate(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

export default function TalentBookings() {
  const router = useRouter();
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: bookingsData }, { data: contractsData }] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, job_title, job_id, status, price, created_at")
          .eq("talent_user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("contracts")
          .select("id, talent_id, job_id, status, location, job_date")
          .eq("talent_id", user.id),
      ]);

      // Map job_id → latest contract for this talent
      const contractMap = new Map<string, {
        id: string;
        status: string;
        location: string | null;
        job_date: string | null;
      }>();
      for (const c of contractsData ?? []) {
        if (c.job_id) {
          contractMap.set(c.job_id, {
            id:       c.id,
            status:   c.status,
            location: c.location,
            job_date: c.job_date,
          });
        }
      }

      setBookings(
        (bookingsData ?? []).map((b) => {
          const contract = b.job_id ? contractMap.get(b.job_id) : null;
          return {
            id:              b.id,
            job_title:       b.job_title  ?? "Booking",
            job_id:          b.job_id     ?? null,
            status:          b.status     ?? "pending",
            price:           b.price      ?? 0,
            created_at:      b.created_at ?? "",
            location:        contract?.location ?? null,
            job_date:        contract?.job_date ?? null,
            contract_id:     contract?.id       ?? null,
            contract_status: contract?.status   ?? null,
          };
        })
      );
      setLoading(false);
    }
    load();
  }, []);

  async function handleCancel(id: string) {
    if (!confirm("Cancel this booking?")) return;
    setCancelling(id);
    const res = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", notify_admin: true }),
    });
    if (res.ok) {
      setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "cancelled" } : b));
      setToast({ msg: "Booking cancelled.", ok: false });
      router.refresh();
    } else {
      setToast({ msg: "Failed to cancel.", ok: false });
    }
    setCancelling(null);
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <div className="max-w-3xl space-y-6">

      {toast && (
        <div className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-[13px] font-medium text-white",
          toast.ok ? "bg-emerald-600" : "bg-zinc-800",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Activity</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">My Bookings</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-16 text-center">
          <p className="text-[14px] font-medium text-zinc-500">No bookings yet</p>
          <p className="text-[13px] text-zinc-400 mt-1">Apply for jobs to get booked.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
          {bookings.map((b) => {
            const state     = getDisplayState(b);
            const label     = STATUS_LABEL[state];
            const stCls     = STATUS_CLS[state];
            const isExp     = expanded === b.id;
            const canCancel = b.status !== "cancelled" && b.status !== "paid";

            return (
              <div key={b.id}>
                {/* Row */}
                <div
                  onClick={() => setExpanded(isExp ? null : b.id)}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/60 transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-zinc-900 truncate">{b.job_title}</p>
                    <p className="text-[12px] text-zinc-400 mt-0.5">
                      {b.job_date ? formatJobDate(b.job_date) : formatDate(b.created_at)}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0 ${stCls}`}>
                    {label}
                  </span>
                  <p className="text-[14px] font-semibold text-zinc-900 tabular-nums flex-shrink-0 min-w-[64px] text-right">
                    {b.price > 0 ? usd(b.price) : "—"}
                  </p>
                  <svg className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform ${isExp ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div className="bg-zinc-50/80 px-6 py-4 border-t border-zinc-100 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
                      <div>
                        <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Payment</p>
                        <p className="text-zinc-700 font-semibold">{b.price > 0 ? usd(b.price) : "—"}</p>
                        <p className="text-zinc-400 mt-0.5">You receive {b.price > 0 ? usd(Math.round(b.price * 0.85)) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Job Date</p>
                        <p className="text-zinc-700">{formatJobDate(b.job_date)}</p>
                      </div>
                      <div>
                        <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Location</p>
                        <p className="text-zinc-700">{b.location ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Booked</p>
                        <p className="text-zinc-700">{formatDate(b.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Status</p>
                        <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${stCls}`}>
                          {label}
                        </span>
                      </div>
                      {b.contract_status && (
                        <div>
                          <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Contract</p>
                          <p className="text-zinc-700 capitalize">{b.contract_status}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-1">
                      {/* Sign Contract button when pending signature */}
                      {state === "pending_signature" && b.contract_id && (
                        <Link
                          href="/talent/contracts"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-2 text-[12px] font-semibold px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Sign Contract
                        </Link>
                      )}

                      {canCancel && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancel(b.id); }}
                          disabled={cancelling === b.id}
                          className="inline-flex items-center gap-2 text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-white border border-zinc-200 hover:border-rose-200 hover:bg-rose-50 text-zinc-600 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {cancelling === b.id ? "Cancelling…" : "Cancel Booking"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
