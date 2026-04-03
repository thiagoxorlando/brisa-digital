"use client";

import { useState } from "react";

export type AdminBooking = {
  id: string;
  jobTitle: string;
  talentName: string;
  agencyName: string;
  status: string;
  price: number;
  created_at: string;
  // contract info
  contractStatus: string | null;
  contractSentAt: string | null;
  contractAcceptedAt: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  pending:   "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  cancelled: "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
  disputed:  "bg-rose-50    text-rose-600    ring-1 ring-rose-100",
};

const CONTRACT_STYLES: Record<string, string> = {
  sent:     "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-600",
};

const STATUS_FALLBACK = "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";

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

export default function AdminBookings({ bookings }: { bookings: AdminBooking[] }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error] = useState("");

  const filtered = bookings
    .filter((b) => statusFilter === "all" || b.status === statusFilter)
    .filter((b) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        b.jobTitle.toLowerCase().includes(q) ||
        b.talentName.toLowerCase().includes(q) ||
        b.agencyName.toLowerCase().includes(q)
      );
    });

  const totalValue     = filtered.reduce((s, b) => s + b.price, 0);
  const confirmed      = filtered.filter((b) => b.status === "confirmed");
  const confirmedValue = confirmed.reduce((s, b) => s + b.price, 0);

  return (
    <div className="max-w-7xl space-y-6">

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Platform Admin</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Bookings</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{bookings.length} total bookings</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total",     value: usd(totalValue),     stripe: "from-zinc-400 to-zinc-600"    },
          { label: "Confirmed", value: usd(confirmedValue), stripe: "from-emerald-400 to-teal-500" },
          { label: "Pending",   value: String(filtered.filter((b) => b.status === "pending").length),   stripe: "from-amber-400 to-orange-500" },
          { label: "Cancelled", value: String(filtered.filter((b) => b.status === "cancelled").length), stripe: "from-zinc-300 to-zinc-400"    },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className={`h-[3px] bg-gradient-to-r ${s.stripe}`} />
            <div className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{s.label}</p>
              <p className="text-[1.5rem] font-semibold tracking-tighter text-zinc-900 leading-none">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search bookings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start">
          {(["all", "confirmed", "pending", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-150 capitalize cursor-pointer",
                statusFilter === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Job</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Talent</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Agency</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Contract</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Value</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Date</th>
                <th className="px-6 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((b) => {
                const stCls    = STATUS_STYLES[b.status] ?? STATUS_FALLBACK;
                const ctCls    = b.contractStatus ? (CONTRACT_STYLES[b.contractStatus] ?? "bg-zinc-100 text-zinc-500") : null;
                const isExp    = expanded === b.id;

                // Payment status: confirmed = paid, else pending
                const paymentStatus   = b.status === "confirmed" ? "paid" : "pending";
                const paymentCls      = paymentStatus === "paid"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700";

                return (
                  <>
                    <tr
                      key={b.id}
                      onClick={() => setExpanded(isExp ? null : b.id)}
                      className="hover:bg-zinc-50/60 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <p className="text-[13px] font-semibold text-zinc-900 truncate max-w-[180px]">
                          {b.jobTitle || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <span className="text-[13px] text-zinc-600">{b.talentName}</span>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <span className="text-[13px] text-zinc-500">{b.agencyName}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${stCls}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        {ctCls ? (
                          <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${ctCls}`}>
                            {b.contractStatus}
                          </span>
                        ) : (
                          <span className="text-[12px] text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right hidden sm:table-cell">
                        <span className="text-[13px] font-semibold text-zinc-900 tabular-nums">
                          {b.price > 0 ? usd(b.price) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <span className="text-[12px] text-zinc-400">{formatDate(b.created_at)}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <svg className={`w-4 h-4 text-zinc-400 inline-block transition-transform ${isExp ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${b.id}-detail`} className="bg-zinc-50/80">
                        <td colSpan={8} className="px-6 py-5">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 text-[12px]">
                            {/* Job info */}
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Job</p>
                              <p className="text-zinc-700 font-medium">{b.jobTitle || "—"}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Booking ID</p>
                              <p className="font-mono text-zinc-700 truncate">{b.id}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Talent</p>
                              <p className="text-zinc-700">{b.talentName}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Agency</p>
                              <p className="text-zinc-700">{b.agencyName}</p>
                            </div>

                            {/* Contract status */}
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-1">Contract Sent</p>
                              <p className="text-zinc-700">{formatDate(b.contractSentAt)}</p>
                              {b.contractStatus && (
                                <span className={`inline-flex mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${CONTRACT_STYLES[b.contractStatus] ?? "bg-zinc-100 text-zinc-500"}`}>
                                  {b.contractStatus}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-1">Contract Signed</p>
                              <p className="text-zinc-700">{b.contractStatus === "accepted" ? formatDate(b.contractAcceptedAt) : "—"}</p>
                              {b.contractStatus === "accepted" && (
                                <span className="inline-flex mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                  signed
                                </span>
                              )}
                            </div>

                            {/* Payment status */}
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-1">Payment</p>
                              <p className="text-zinc-700 font-semibold">{b.price > 0 ? usd(b.price) : "—"}</p>
                              <span className={`inline-flex mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${paymentCls}`}>
                                {paymentStatus}
                              </span>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Booked</p>
                              <p className="text-zinc-700">{formatDate(b.created_at)}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">No bookings found</p>
                    <p className="text-[13px] text-zinc-400 mt-1">Try adjusting your search or filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={5} className="px-6 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                      {filtered.length} bookings
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                    <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(totalValue)}</p>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
