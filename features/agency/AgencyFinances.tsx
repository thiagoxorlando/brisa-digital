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
};

export type AgencyFinanceSummary = {
  totalSpent: number;
  pendingPayments: number;
  completedPayments: number;
};

const STATUS_CLS: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  pending:   "bg-amber-50  text-amber-700  ring-1 ring-amber-100",
  cancelled: "bg-zinc-100  text-zinc-500   ring-1 ring-zinc-200",
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
}: {
  summary: AgencyFinanceSummary;
  transactions: AgencyTransaction[];
}) {
  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Overview</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Finances</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{transactions.length} bookings total</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Spent"        value={usd(summary.totalSpent)}        sub="All bookings"         stripe="from-indigo-500 to-violet-500" />
        <StatCard label="Pending Payments"   value={usd(summary.pendingPayments)}   sub="Awaiting confirmation" stripe="from-amber-400 to-orange-500"  />
        <StatCard label="Payments Made"      value={usd(summary.completedPayments)} sub="Confirmed bookings"   stripe="from-emerald-400 to-teal-500"  />
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
                    <th className="text-right px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden sm:table-cell">Talent Payout</th>
                    <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Status</th>
                    <th className="text-right px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden sm:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-[13px] font-semibold text-zinc-900">{t.talent}</p>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <p className="text-[12px] text-zinc-500 truncate max-w-[200px]">{t.job || "—"}</p>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <p className="text-[14px] font-semibold text-zinc-900 tabular-nums">{usd(t.amount)}</p>
                      </td>
                      <td className="px-4 py-4 text-right hidden sm:table-cell">
                        <p className="text-[13px] text-zinc-500 tabular-nums">{usd(Math.round(t.amount * 0.85))}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_CLS[t.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                          {t.status}
                        </span>
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
