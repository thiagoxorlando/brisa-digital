"use client";

import { useState } from "react";
import Link from "next/link";

export type AgencyContract = {
  id: string;
  jobId: string | null;
  talentName: string;
  jobDate: string | null;
  jobTime: string | null;
  location: string | null;
  jobDescription: string | null;
  paymentAmount: number;
  paymentMethod: string | null;
  additionalNotes: string | null;
  status: string;
  createdAt: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  sent:     { label: "Awaiting Talent",  cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  accepted: { label: "Accepted",         cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  rejected: { label: "Rejected",         cls: "bg-rose-50 text-rose-600 ring-1 ring-rose-100" },
};
const STATUS_FALLBACK = { label: "Unknown", cls: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200" };

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtJobDate(s: string | null) {
  if (!s) return "—";
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function downloadContract(c: AgencyContract) {
  const lines = [
    "CONTRACT DETAILS",
    "================",
    `Talent:           ${c.talentName}`,
    `Status:           ${c.status}`,
    `Payment Amount:   ${usd(c.paymentAmount)}`,
    `Payment Method:   ${c.paymentMethod ?? "—"}`,
    `Job Date:         ${c.jobDate ? fmtJobDate(c.jobDate) : "TBD"}`,
    `Job Time:         ${c.jobTime ?? "—"}`,
    `Location:         ${c.location ?? "—"}`,
    `Sent:             ${fmtDate(c.createdAt)}`,
    "",
    "JOB DESCRIPTION",
    "---------------",
    c.jobDescription ?? "No description provided.",
    "",
    "ADDITIONAL NOTES",
    "----------------",
    c.additionalNotes ?? "None.",
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `contract-${c.talentName.replace(/\s+/g, "-").toLowerCase()}-${c.id.slice(0, 8)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function ContractCard({ contract: c }: { contract: AgencyContract }) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS[c.status] ?? STATUS_FALLBACK;

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-4 px-6 py-4 flex-wrap sm:flex-nowrap">
        {/* Talent + job */}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 truncate">{c.talentName}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">
            {c.jobDate ? fmtJobDate(c.jobDate) : "Date TBD"}
            {c.jobTime ? ` · ${c.jobTime}` : ""}
            {c.location ? ` · ${c.location}` : ""}
          </p>
        </div>

        {/* Amount */}
        <p className="text-[15px] font-semibold text-zinc-900 tabular-nums flex-shrink-0">{usd(c.paymentAmount)}</p>

        {/* Status */}
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${st.cls}`}>
          {st.label}
        </span>

        {/* Download */}
        <button
          onClick={() => downloadContract(c)}
          className="flex-shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
          aria-label="Download contract"
          title="Download contract"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-zinc-50 px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Job Date" value={fmtJobDate(c.jobDate)} />
            <Field label="Job Time" value={c.jobTime ?? "—"} />
            <Field label="Location" value={c.location ?? "—"} />
            <Field label="Payment Method" value={c.paymentMethod ?? "—"} />
          </div>
          {c.jobDescription && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Job Description</p>
              <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{c.jobDescription}</p>
            </div>
          )}
          {c.additionalNotes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Additional Notes</p>
              <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{c.additionalNotes}</p>
            </div>
          )}
          <p className="text-[11px] text-zinc-400">Sent {fmtDate(c.createdAt)}</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">{label}</p>
      <p className="text-[13px] font-medium text-zinc-700">{value}</p>
    </div>
  );
}

export default function AgencyContracts({ contracts }: { contracts: AgencyContract[] }) {
  const [filter, setFilter] = useState<"all" | "sent" | "accepted" | "rejected">("all");

  const filtered = filter === "all" ? contracts : contracts.filter((c) => c.status === filter);
  const pending  = contracts.filter((c) => c.status === "sent").length;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agency</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Contracts</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{contracts.length} contract{contracts.length !== 1 ? "s" : ""}</p>
      </div>

      {pending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <p className="text-[13px] font-medium text-amber-800">
            {pending} contract{pending !== 1 ? "s" : ""} awaiting talent response.
          </p>
        </div>
      )}

      {contracts.length > 0 && (
        <div className="flex items-center gap-2 text-[12px] text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Platform fee: <strong className="text-zinc-600 ml-1">15%</strong>
          <span className="mx-1">·</span>
          Talent receives: <strong className="text-zinc-600 ml-1">85% of deal value</strong>
          <span className="mx-1">·</span>
          <strong className="text-violet-600">+2% referral fee (if applicable)</strong>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 self-start w-fit">
        {(["all", "sent", "accepted", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={[
              "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all capitalize cursor-pointer whitespace-nowrap",
              filter === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
          >
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center">
          <div className="w-11 h-11 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-zinc-500">No contracts yet</p>
          <p className="text-[13px] text-zinc-400 mt-1">
            Select a talent from a job submission to send a contract.
          </p>
          <Link
            href="/agency/jobs"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors mt-4"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Go to Jobs
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => <ContractCard key={c.id} contract={c} />)}
        </div>
      )}
    </div>
  );
}
