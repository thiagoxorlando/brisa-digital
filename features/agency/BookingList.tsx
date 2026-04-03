"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Booking = {
  id: string;
  talentId: string;
  talentName: string;
  jobTitle: string;
  status: string;
  totalValue: number;
  createdAt: string;
};

const COMMISSION_RATE = 0.15;
const TALENT_RATE     = 1 - COMMISSION_RATE;

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
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

// ── Booking row ───────────────────────────────────────────────────────────────

function BookingRow({
  booking,
  onStatusChange,
}: {
  booking: Booking;
  onStatusChange: (id: string, status: string) => void;
}) {
  const router = useRouter();
  const [acting, setActing]         = useState<"pay" | "cancel" | null>(null);
  const [confirming, setConfirming] = useState(false);

  const talentEarnings = Math.round(booking.totalValue * TALENT_RATE);

  async function handlePay() {
    setActing("pay");
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_paid: true }),
    });
    if (res.ok) {
      onStatusChange(booking.id, "paid");
      router.refresh();
    }
    setActing(null);
  }

  async function handleCancel() {
    setActing("cancel");
    setConfirming(false);
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", notify_admin: true }),
    });
    if (res.ok) {
      onStatusChange(booking.id, "cancelled");
      router.refresh();
    }
    setActing(null);
  }

  return (
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50/60 transition-colors group flex-wrap sm:flex-nowrap">
      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(booking.talentName)} flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-white`}>
        {initials(booking.talentName)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-zinc-900 leading-snug truncate">{booking.talentName}</p>
        <p className="text-[12px] text-zinc-400 mt-0.5 truncate">{booking.jobTitle || formatDate(booking.createdAt)}</p>
      </div>

      {booking.totalValue > 0 && (
        <div className="text-right flex-shrink-0">
          <p className="text-[14px] font-semibold text-zinc-900 tabular-nums">{usd(booking.totalValue)}</p>
          <p className="text-[11px] text-zinc-400 tabular-nums">
            Talent receives {usd(talentEarnings)}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Pending signature — awaiting talent to sign, no agency action */}
        {booking.status === "pending" && (
          <span className="text-[12px] font-medium text-violet-600 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-xl">
            Awaiting Signature
          </span>
        )}

        {/* Pending payment — talent signed, agency can pay or cancel cast */}
        {booking.status === "pending_payment" && (
          <>
            <button
              onClick={handlePay}
              disabled={acting !== null}
              className="text-[12px] font-semibold px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition-colors active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {acting === "pay" ? "…" : "Pay"}
            </button>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                disabled={acting !== null}
                className="text-[12px] font-semibold px-4 py-2 rounded-xl border border-zinc-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 text-zinc-500 transition-all cursor-pointer"
              >
                Cancel Cast
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-zinc-500">Sure?</span>
                <button
                  onClick={handleCancel}
                  disabled={acting !== null}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors cursor-pointer disabled:opacity-60"
                >
                  {acting === "cancel" ? "…" : "Yes"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors cursor-pointer"
                >
                  No
                </button>
              </div>
            )}
          </>
        )}

        {(booking.status === "paid" || booking.status === "confirmed") && (
          <span className="text-[12px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
            Paid
          </span>
        )}

        {booking.status === "cancelled" && (
          <span className="text-[12px] font-medium text-zinc-400">Cancelled</span>
        )}
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title, count, total, children, empty,
}: {
  title: string; count: number; total?: number;
  children: React.ReactNode; empty: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
          <span className="text-[11px] font-semibold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        {total !== undefined && total > 0 && (
          <p className="text-[13px] font-semibold text-zinc-700 tabular-nums">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(total)}
          </p>
        )}
      </div>

      {count > 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
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

export default function BookingList({ bookings: initial }: { bookings: Booking[] }) {
  const [bookings, setBookings] = useState(initial);

  function handleStatusChange(id: string, status: string) {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status } : b));
  }

  const awaitingSignature = bookings.filter((b) => b.status === "pending");
  const pendingPayment    = bookings.filter((b) => b.status === "pending_payment");
  const paid              = bookings.filter((b) => b.status === "paid" || b.status === "confirmed");
  const cancelled         = bookings.filter((b) => b.status === "cancelled");

  const paidTotal = paid.reduce((s, b) => s + b.totalValue, 0);

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agency</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Bookings</h1>
        </div>
        <p className="text-[13px] text-zinc-400 font-medium pb-1">
          {bookings.length} total
        </p>
      </div>

      {/* Commission info */}
      {bookings.length > 0 && (
        <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Platform fee: <strong className="text-zinc-600 ml-1">15%</strong>
          <span className="mx-1">·</span>
          Talent receives: <strong className="text-zinc-600 ml-1">85% of deal value</strong>
        </div>
      )}

      <Section
        title="Awaiting Signature"
        count={awaitingSignature.length}
        empty="No bookings awaiting signature"
      >
        {awaitingSignature.map((b) => (
          <BookingRow key={b.id} booking={b} onStatusChange={handleStatusChange} />
        ))}
      </Section>

      <Section
        title="Pending Payment"
        count={pendingPayment.length}
        total={pendingPayment.reduce((s, b) => s + b.totalValue, 0)}
        empty="No bookings pending payment"
      >
        {pendingPayment.map((b) => (
          <BookingRow key={b.id} booking={b} onStatusChange={handleStatusChange} />
        ))}
      </Section>

      <Section
        title="Paid"
        count={paid.length}
        total={paidTotal}
        empty="No paid bookings"
      >
        {paid.map((b) => (
          <BookingRow key={b.id} booking={b} onStatusChange={handleStatusChange} />
        ))}
      </Section>

      <Section
        title="Cancelled"
        count={cancelled.length}
        empty="No cancelled bookings"
      >
        {cancelled.map((b) => (
          <BookingRow key={b.id} booking={b} onStatusChange={handleStatusChange} />
        ))}
      </Section>
    </div>
  );
}
