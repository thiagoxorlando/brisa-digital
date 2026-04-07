"use client";

export type AgencyReferral = {
  id: string;
  jobTitle: string;
  talentName: string | null;
  referrerName: string | null;
  submittedAt: string;
  submissionStatus: string;
  booked: boolean;
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getStatus(r: AgencyReferral): { label: string; cls: string } {
  if (r.booked)                       return { label: "Booked",    cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" };
  if (r.submissionStatus === "pending" || r.submissionStatus === "reviewing")
                                      return { label: "Applied",   cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-100" };
  if (r.submissionStatus === "rejected")
                                      return { label: "Rejected",  cls: "bg-rose-50 text-rose-600 ring-1 ring-rose-100" };
  return                                     { label: "Pending",   cls: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200" };
}

export default function AgencyReferrals({ referrals }: { referrals: AgencyReferral[] }) {
  const bookedCount = referrals.filter((r) => r.booked).length;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agency</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Referrals</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{referrals.length} referred applications · {bookedCount} booked</p>
      </div>

      <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Talent who applied through referrals. <strong className="text-violet-600 ml-1">2% referral fee</strong> is paid to the referrer on booking.
      </div>

      {referrals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <p className="text-[14px] font-medium text-zinc-500">No referred applications yet</p>
          <p className="text-[13px] text-zinc-400 mt-1">Referrals will appear here when talent applies via a referral link.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talent</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Job</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Referred By</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Date</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {referrals.map((r) => {
                const st = getStatus(r);
                return (
                  <tr key={r.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-[13px] font-semibold text-zinc-900">{r.talentName ?? "Unknown"}</p>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <p className="text-[13px] text-zinc-500 truncate max-w-[200px]">{r.jobTitle}</p>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-[13px] text-zinc-500">{r.referrerName ?? "—"}</p>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <p className="text-[12px] text-zinc-400">{formatDate(r.submittedAt)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
