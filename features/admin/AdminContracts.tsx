"use client";

import { useState } from "react";

export type AdminContractRow = {
  id: string;
  talentName: string;
  agencyName: string;
  jobDate: string | null;
  location: string | null;
  jobDescription: string | null;
  paymentAmount: number;
  paymentMethod: string | null;
  additionalNotes: string | null;
  status: string;
  createdAt: string;
};

const STATUS_STYLES: Record<string, string> = {
  sent:     "bg-amber-50   text-amber-700   ring-1 ring-amber-100",
  accepted: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  rejected: "bg-rose-50    text-rose-600    ring-1 ring-rose-100",
};

const STATUS_LABELS: Record<string, string> = {
  sent:     "Awaiting Talent",
  accepted: "Accepted",
  rejected: "Rejected",
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtJobDate(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function downloadContract(c: AdminContractRow) {
  const lines = [
    `CONTRACT`,
    ``,
    `ID:           ${c.id}`,
    `Sent:         ${fmtDate(c.createdAt)}`,
    `Status:       ${STATUS_LABELS[c.status] ?? c.status}`,
    ``,
    `PARTIES`,
    `Agency:       ${c.agencyName}`,
    `Talent:       ${c.talentName}`,
    ``,
    `JOB DETAILS`,
    `Date:         ${fmtJobDate(c.jobDate)}`,
    `Location:     ${c.location ?? "—"}`,
    `Description:  ${c.jobDescription ?? "—"}`,
    ``,
    `PAYMENT`,
    `Amount:       ${usd(c.paymentAmount)}`,
    `Method:       ${c.paymentMethod ?? "—"}`,
    ``,
    c.additionalNotes ? `NOTES\n${c.additionalNotes}` : "",
  ].filter(Boolean).join("\n");

  const blob = new Blob([lines], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `contract-${c.id.slice(0, 8)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminContracts({ contracts }: { contracts: AdminContractRow[] }) {
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("all");
  const [expanded, setExpanded]   = useState<string | null>(null);

  const filtered = contracts
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.talentName.toLowerCase().includes(q) ||
        c.agencyName.toLowerCase().includes(q) ||
        (c.jobDescription ?? "").toLowerCase().includes(q)
      );
    });

  const totalAccepted = filtered.filter((c) => c.status === "accepted").reduce((s, c) => s + c.paymentAmount, 0);

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Platform Admin</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Contracts</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{contracts.length} total contracts</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total",    value: String(contracts.length),                                                stripe: "from-zinc-400 to-zinc-600" },
          { label: "Pending",  value: String(contracts.filter((c) => c.status === "sent").length),            stripe: "from-amber-400 to-orange-500" },
          { label: "Accepted", value: String(contracts.filter((c) => c.status === "accepted").length),        stripe: "from-emerald-400 to-teal-500" },
          { label: "Rejected", value: String(contracts.filter((c) => c.status === "rejected").length),        stripe: "from-rose-400 to-red-500" },
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search contracts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start">
          {(["all", "sent", "accepted", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={[
                "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all capitalize cursor-pointer whitespace-nowrap",
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
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Talent</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Agency</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden md:table-cell">Job Date</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Location</th>
                <th className="text-right px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden sm:table-cell">Payment</th>
                <th className="text-left px-4 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 hidden lg:table-cell">Sent</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((c) => {
                const stCls   = STATUS_STYLES[c.status] ?? "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200";
                const stLabel = STATUS_LABELS[c.status] ?? c.status;
                const isExp   = expanded === c.id;
                return (
                  <>
                    <tr
                      key={c.id}
                      onClick={() => setExpanded(isExp ? null : c.id)}
                      className="hover:bg-zinc-50/60 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <p className="text-[13px] font-semibold text-zinc-900">{c.talentName}</p>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <p className="text-[13px] text-zinc-500">{c.agencyName}</p>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <p className="text-[13px] text-zinc-500">{fmtJobDate(c.jobDate)}</p>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <p className="text-[13px] text-zinc-500 truncate max-w-[140px]">{c.location ?? "—"}</p>
                      </td>
                      <td className="px-4 py-4 text-right hidden sm:table-cell">
                        <p className="text-[13px] font-semibold text-zinc-900 tabular-nums">{usd(c.paymentAmount)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ${stCls}`}>
                          {stLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        <p className="text-[12px] text-zinc-400">{fmtDate(c.createdAt)}</p>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <svg className={`w-4 h-4 text-zinc-400 inline-block transition-transform ${isExp ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${c.id}-detail`} className="bg-zinc-50/80">
                        <td colSpan={8} className="px-6 py-5">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px] mb-4">
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Contract ID</p>
                              <p className="font-mono text-zinc-700 truncate">{c.id}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Sent</p>
                              <p className="text-zinc-700">{fmtDate(c.createdAt)}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Job Date</p>
                              <p className="text-zinc-700">{fmtJobDate(c.jobDate)}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Location</p>
                              <p className="text-zinc-700">{c.location ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Payment</p>
                              <p className="text-zinc-700 font-semibold">{usd(c.paymentAmount)}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Method</p>
                              <p className="text-zinc-700">{c.paymentMethod ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Talent</p>
                              <p className="text-zinc-700">{c.talentName}</p>
                            </div>
                            <div>
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Agency</p>
                              <p className="text-zinc-700">{c.agencyName}</p>
                            </div>
                          </div>
                          {c.jobDescription && (
                            <div className="mb-3">
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Description</p>
                              <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{c.jobDescription}</p>
                            </div>
                          )}
                          {c.additionalNotes && (
                            <div className="mb-3">
                              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Notes</p>
                              <p className="text-[13px] text-zinc-500 leading-relaxed whitespace-pre-line">{c.additionalNotes}</p>
                            </div>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadContract(c); }}
                            className="inline-flex items-center gap-2 text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 transition-colors cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download Contract
                          </button>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <p className="text-[14px] font-medium text-zinc-500">No contracts found</p>
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-100 bg-zinc-50/80">
                  <td colSpan={4} className="px-6 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                      {filtered.length} contracts
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                    <p className="text-[13px] font-semibold text-emerald-700 tabular-nums">{usd(totalAccepted)}</p>
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
