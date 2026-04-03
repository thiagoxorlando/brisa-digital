"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TalentContract = {
  id: string;
  agencyName: string;
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
  sent:     { label: "Awaiting Your Signature", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" },
  signed:   { label: "Signed",                  cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  accepted: { label: "Signed",                  cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  rejected: { label: "Rejected",                cls: "bg-rose-50 text-rose-600 ring-1 ring-rose-100" },
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
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function downloadContract(c: TalentContract) {
  const lines = [
    `CONTRACT`,
    ``,
    `ID:          ${c.id}`,
    `Received:    ${fmtDate(c.createdAt)}`,
    `Status:      ${c.status}`,
    ``,
    `Agency:      ${c.agencyName}`,
    ``,
    `JOB DETAILS`,
    `Date:        ${fmtJobDate(c.jobDate)}`,
    `Time:        ${c.jobTime ?? "—"}`,
    `Location:    ${c.location ?? "—"}`,
    `Description: ${c.jobDescription ?? "—"}`,
    ``,
    `PAYMENT`,
    `Amount:      ${usd(c.paymentAmount)}`,
    `Method:      ${c.paymentMethod ?? "—"}`,
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

function InfoRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center flex-shrink-0 text-zinc-400 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 leading-none mb-0.5">{label}</p>
        <p className="text-[13px] font-medium text-zinc-800 leading-snug">{value}</p>
      </div>
    </div>
  );
}

function ContractCard({
  contract: c,
  onAction,
  acting,
}: {
  contract: TalentContract;
  onAction: (id: string, action: "accept" | "reject") => void;
  acting: string | null;
}) {
  const [showReject, setShowReject] = useState(false);
  const st = STATUS[c.status] ?? STATUS_FALLBACK;
  const isPending = c.status === "sent";

  return (
    <div className={[
      "bg-white rounded-2xl border overflow-hidden",
      isPending
        ? "border-amber-200 shadow-[0_0_0_3px_rgba(251,191,36,0.08),0_4px_16px_rgba(0,0,0,0.04)]"
        : "border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]",
    ].join(" ")}>

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-50 flex-wrap">
        <div>
          <p className="text-[14px] font-semibold text-zinc-900">{c.agencyName}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">Received {fmtDate(c.createdAt)}</p>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${st.cls}`}>
          {st.label}
        </span>
      </div>

      {/* Details */}
      <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoRow
          label="Date"
          value={fmtJobDate(c.jobDate)}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <InfoRow
          label="Time"
          value={c.jobTime ?? "—"}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <InfoRow
          label="Location"
          value={c.location ?? "—"}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <InfoRow
          label="Payment"
          value={`${usd(c.paymentAmount)}${c.paymentMethod ? ` · ${c.paymentMethod}` : ""}`}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {c.jobDescription && (
        <div className="px-6 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5">Job Description</p>
          <p className="text-[13px] text-zinc-600 leading-relaxed whitespace-pre-line">{c.jobDescription}</p>
        </div>
      )}

      {c.additionalNotes && (
        <div className="px-6 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5">Additional Notes</p>
          <p className="text-[13px] text-zinc-500 leading-relaxed whitespace-pre-line">{c.additionalNotes}</p>
        </div>
      )}

      {/* Download */}
      <div className="px-6 pb-4 pt-0">
        <button
          onClick={() => downloadContract(c)}
          className="inline-flex items-center gap-2 text-[12px] font-semibold px-3.5 py-2 rounded-lg bg-zinc-50 border border-zinc-100 hover:border-zinc-200 text-zinc-600 hover:text-zinc-800 transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Contract
        </button>
      </div>

      {/* Actions — only for pending contracts */}
      {isPending && (
        <div className="px-6 pb-5 pt-2">
          {showReject ? (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 space-y-3">
              <p className="text-[13px] font-medium text-rose-800">
                Are you sure you want to reject this contract?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReject(false)}
                  className="flex-1 py-2 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onAction(c.id, "reject")}
                  disabled={acting === c.id}
                  className="flex-1 py-2 text-[13px] font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  {acting === c.id ? "Rejecting…" : "Confirm Reject"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setShowReject(true)}
                className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer"
              >
                Reject
              </button>
              <button
                onClick={() => onAction(c.id, "accept")}
                disabled={acting === c.id}
                className="flex-1 py-2.5 text-[13px] font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {acting === c.id ? "Signing…" : "Sign Contract"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TalentContracts({ contracts: initial }: { contracts: TalentContract[] }) {
  const router = useRouter();
  const [contracts, setContracts] = useState<TalentContract[]>(initial);
  const [acting, setActing]       = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const pending   = contracts.filter((c) => c.status === "sent");
  const past      = contracts.filter((c) => c.status !== "sent");

  async function handleAction(id: string, action: "accept" | "reject") {
    setActing(id);
    const res = await fetch(`/api/contracts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (res.ok) {
      const newStatus = action === "accept" ? "signed" : "rejected";
      setContracts((prev) => prev.map((c) => c.id === id ? { ...c, status: newStatus } : c));
      setToast({
        msg: action === "accept"
          ? "Contract signed — a booking is now pending payment."
          : "Contract rejected.",
        type: action === "accept" ? "success" : "error",
      });
      setTimeout(() => setToast(null), 4000);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setToast({ msg: d.error ?? "Something went wrong.", type: "error" });
      setTimeout(() => setToast(null), 4000);
    }
    setActing(null);
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Toast */}
      {toast && (
        <div className={[
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-[13px] font-medium text-white",
          toast.type === "success" ? "bg-emerald-600" : "bg-rose-600",
        ].join(" ")}>
          {toast.msg}
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Talent</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Contracts</h1>
        <p className="text-[13px] text-zinc-400 mt-1">{contracts.length} contract{contracts.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Pending contracts */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-zinc-900">Awaiting Your Response</h2>
          <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {pending.length}
          </span>
        </div>

        {pending.length > 0 ? (
          <div className="space-y-4">
            {pending.map((c) => (
              <ContractCard key={c.id} contract={c} onAction={handleAction} acting={acting} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 py-8 text-center">
            <p className="text-[13px] text-zinc-400">No contracts pending your review</p>
          </div>
        )}
      </section>

      {/* Past contracts */}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-zinc-900">History</h2>
          <div className="space-y-3">
            {past.map((c) => (
              <ContractCard key={c.id} contract={c} onAction={handleAction} acting={acting} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
