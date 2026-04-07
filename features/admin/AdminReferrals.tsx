"use client";

export type AdminReferral = {
  id: string;
  jobTitle: string;
  agencyName: string;
  talentName: string | null;
  referrerName: string | null;
  submittedAt: string;
  submissionStatus: string;
  booked: boolean;
  bookingValue: number;
  referralPayout: number;
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getStatus(r: AdminReferral): { label: string; cls: string } {
  if (r.booked)                       return { label: "Booked",    cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" };
  if (r.submissionStatus === "pending" || r.submissionStatus === "reviewing")
                                      return { label: "Applied",   cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-100" };
  if (r.submissionStatus === "rejected")
                                      return { label: "Rejected",  cls: "bg-rose-50 text-rose-600 ring-1 ring-rose-100" };
  return                                     { label: "Pending",   cls: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200" };
}

export default function AdminReferrals({ referrals }: { referrals: AdminReferral[] }) {
  const bookedCount     = referrals.filter((r) => r.booked).length;
  const totalPayout     = referrals.reduce((s, r) => s + r.referralPayout, 0);
  const totalBookingVal = referrals.filter((r) => r.booked).reduce((s, r) => s + r.bookingValue, 0);

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Platform Admin</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Referrals</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{referrals.length} total · {bookedCount} booked</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Total Referrals</p>
          <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900">{referrals.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Booked Value</p>
          <p className="text-[2rem] font-semibold tracking-tighter text-zinc-900">{usd(totalBookingVal)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Total Referral Payouts</p>
          <p className="text-[2rem] font-semibold tracking-tighter text-violet-700">{usd(totalPayout)}</p>
          <p className="text-[11px] text-zinc-400 mt-1">2% of booked value</p>
        </div>
      </div>

      {referrals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <p className="text-[14px] font-medium text-zinc-500">No referrals yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talent</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Job</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Referred By</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Agency</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                  <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Booking</th>
                  <th className="text-right px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Referral Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {referrals.map((r) => {
                  const st = getStatus(r);
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-[13px] font-semibold text-zinc-900">{r.talentName ?? "Unknown"}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{formatDate(r.submittedAt)}</p>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <p className="text-[13px] text-zinc-500 truncate max-w-[180px]">{r.jobTitle}</p>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <p className="text-[13px] text-zinc-500">{r.referrerName ?? "—"}</p>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <p className="text-[13px] text-zinc-500 truncate max-w-[140px]">{r.agencyName}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right hidden md:table-cell">
                        {r.bookingValue > 0
                          ? <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(r.bookingValue)}</p>
                          : <p className="text-[13px] text-zinc-300">—</p>
                        }
                      </td>
                      <td className="px-6 py-4 text-right hidden md:table-cell">
                        {r.referralPayout > 0
                          ? <p className="text-[13px] font-semibold text-violet-700 tabular-nums">{usd(r.referralPayout)}</p>
                          : <p className="text-[13px] text-zinc-300">—</p>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
