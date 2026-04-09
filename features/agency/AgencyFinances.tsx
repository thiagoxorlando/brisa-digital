"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

export type AgencyTransaction = {
  id: string;
  talent: string;
  job: string;
  amount: number;
  status: string;
  date: string;
  type?: "booking" | "subscription";
};

export type AgencyFinanceSummary = {
  totalSpent: number;
  pendingPayments: number;
  completedPayments: number;
};

const STATUS_CLS: Record<string, string> = {
  paid:            "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  confirmed:       "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  pending_payment: "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  pending:         "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  cancelled:       "bg-zinc-100   text-zinc-500    ring-1 ring-zinc-200",
};

const STATUS_LABEL: Record<string, string> = {
  paid:            "Paid",
  confirmed:       "Paid",
  pending_payment: "Pending Payment",
  pending:         "Pending",
  cancelled:       "Cancelled",
};

function StatCard({ label, value, sub, stripe }: { label: string; value: string; sub?: string; stripe: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">{label}</p>
        <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900 leading-none">{value}</p>
        {sub && <p className="text-[12px] text-zinc-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AgencyFinances({
  summary,
  transactions,
  subscriptionStatus: initialStatus,
  lastPaymentDate,
}: {
  summary: AgencyFinanceSummary;
  transactions: AgencyTransaction[];
  subscriptionStatus: "active" | "inactive";
  lastPaymentDate: string | null;
}) {
  const router = useRouter();
  const [subStatus, setSubStatus] = useState(initialStatus);
  const [subLoading, setSubLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function handleSubscriptionChange(next: "active" | "inactive") {
    setSubLoading(true);
    const res = await fetch("/api/agencies/subscription", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setSubStatus(next);
      setConfirm(false);
      router.refresh();
    }
    setSubLoading(false);
  }

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Overview</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Finances</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{transactions.length} bookings total</p>
      </div>

      {/* Subscription */}
      <div className={[
        "rounded-2xl border overflow-hidden",
        subStatus === "active"
          ? "border-zinc-100 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]"
          : "border-rose-100 bg-rose-50",
      ].join(" ")}>
        <div className={`h-[3px] bg-gradient-to-r ${subStatus === "active" ? "from-indigo-500 to-violet-500" : "from-rose-400 to-pink-500"}`} />
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[13px] font-semibold text-zinc-900">Pro Plan</p>
              <span className={[
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                subStatus === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700",
              ].join(" ")}>
                {subStatus === "active" ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900 leading-none">$2,500<span className="text-[14px] font-medium text-zinc-400">/mo</span></p>
            {lastPaymentDate && (
              <p className="text-[12px] text-zinc-400 mt-1.5">Last payment: {fmtDate(lastPaymentDate)}</p>
            )}
          </div>

          <div className="flex-shrink-0">
            {subStatus === "active" ? (
              confirm ? (
                <div className="flex flex-col gap-2 items-end">
                  <p className="text-[12px] text-zinc-500">Cancel your subscription?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirm(false)}
                      className="px-4 py-2 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer"
                    >
                      Keep
                    </button>
                    <button
                      onClick={() => handleSubscriptionChange("inactive")}
                      disabled={subLoading}
                      className="px-4 py-2 text-[13px] font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {subLoading ? "Cancelling…" : "Yes, Cancel"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirm(true)}
                  className="px-4 py-2 text-[13px] font-medium text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  Cancel Subscription
                </button>
              )
            ) : (
              <button
                onClick={() => handleSubscriptionChange("active")}
                disabled={subLoading}
                className="px-5 py-2.5 text-[13px] font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {subLoading ? "Reactivating…" : "Reactivate Subscription"}
              </button>
            )}
          </div>
        </div>

        {subStatus === "inactive" && (
          <div className="px-6 pb-4">
            <p className="text-[12px] text-rose-700 bg-rose-100 border border-rose-200 rounded-xl px-4 py-2.5">
              Your subscription is inactive. Job creation is disabled until you reactivate.
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Spent"        value={usd(summary.totalSpent)}        sub="All bookings"           stripe="from-indigo-500 to-violet-500" />
        <StatCard label="Pending Payments"   value={usd(summary.pendingPayments)}   sub="Awaiting confirmation"  stripe="from-amber-400 to-orange-500"  />
        <StatCard label="Payments Made"      value={usd(summary.completedPayments)} sub="Confirmed bookings"     stripe="from-emerald-400 to-teal-500"  />
      </div>

      {/* Transactions table */}
      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Transactions</p>

        {transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center">
            <p className="text-[14px] font-medium text-zinc-500">No bookings yet</p>
            <p className="text-[13px] text-zinc-400 mt-1">Confirmed bookings will appear here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Talent</th>
                    <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden md:table-cell">Job</th>
                    <th className="text-right px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Amount</th>
                    <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Status</th>
                    <th className="text-right px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden sm:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="px-6 py-4">
                        {t.type === "subscription" ? (
                          <div>
                            <p className="text-[13px] font-semibold text-zinc-900">Pro Plan</p>
                            <p className="text-[10px] text-indigo-500 font-semibold">Subscription</p>
                          </div>
                        ) : (
                          <p className="text-[13px] font-semibold text-zinc-900">{t.talent}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <p className="text-[12px] text-zinc-500 truncate max-w-[200px]">
                          {t.type === "subscription" ? "$2,500/mo · Platform subscription" : (t.job || "—")}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <p className={`text-[14px] font-semibold tabular-nums ${
                          t.type === "subscription" && t.status === "upcoming"
                            ? "text-amber-600"
                            : t.type === "subscription"
                            ? "text-indigo-700"
                            : "text-zinc-900"
                        }`}>
                          {usd(t.amount)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {t.type === "subscription" ? (
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                            t.status === "upcoming"
                              ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                              : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                          }`}>
                            {t.status === "upcoming" ? "Upcoming" : "Charged"}
                          </span>
                        ) : (
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_CLS[t.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right hidden sm:table-cell">
                        <p className="text-[12px] text-zinc-400">
                          {new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
