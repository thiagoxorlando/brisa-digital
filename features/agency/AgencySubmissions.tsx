"use client";

import Link from "next/link";
import { useState } from "react";

export type SubmissionEntry = {
  id: string;
  jobId: string;
  jobTitle: string;
  talentId: string | null;
  talentName: string;
  avatarUrl: string | null;
  bio: string;
  mode: string;
  status: string;
  submittedAt: string;
  photoFrontUrl:  string | null;
  photoLeftUrl:   string | null;
  photoRightUrl:  string | null;
  videoUrl:       string | null;
  contractStatus: string | null;
  bookingStatus:  string | null;
};

const SUB_STATUS_CLS: Record<string, string> = {
  pending:  "bg-amber-50  text-amber-700  ring-1 ring-amber-100",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  rejected: "bg-rose-50   text-rose-600   ring-1 ring-rose-100",
};

const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-600", "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",      "from-fuchsia-400 to-purple-600",
];

function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function formatDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Derive a single readable pipeline status
function pipelineStatus(s: SubmissionEntry): { label: string; cls: string } {
  if (s.bookingStatus === "paid" || s.bookingStatus === "confirmed") {
    return { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" };
  }
  if (s.bookingStatus === "pending_payment") {
    return { label: "Pending Payment", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" };
  }
  if (s.bookingStatus === "cancelled") {
    return { label: "Cancelled", cls: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200" };
  }
  if (s.contractStatus === "signed") {
    return { label: "Contract Signed", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" };
  }
  if (s.contractStatus === "sent") {
    return { label: "Contract Sent", cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-100" };
  }
  if (s.contractStatus === "rejected") {
    return { label: "Contract Rejected", cls: "bg-rose-50 text-rose-600 ring-1 ring-rose-100" };
  }
  return {
    label: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    cls: SUB_STATUS_CLS[s.status] ?? "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200",
  };
}

const PHOTO_LABELS = ["Front", "Left", "Right"] as const;

function SubmissionRow({ submission }: { submission: SubmissionEntry }) {
  const [expanded, setExpanded] = useState(false);
  const pipeline = pipelineStatus(submission);
  const hasPhotos = !!(submission.photoFrontUrl || submission.photoLeftUrl || submission.photoRightUrl);

  return (
    <div>
      {/* Row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50/60 transition-colors cursor-pointer"
      >
        {submission.avatarUrl ? (
          <img src={submission.avatarUrl} alt={submission.talentName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(submission.talentName)} flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white`}>
            {initials(submission.talentName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-zinc-900 truncate">{submission.talentName}</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">
            {submission.mode === "self" ? "Self-submitted" : "Referred"} · {formatDate(submission.submittedAt)}
          </p>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${pipeline.cls}`}>
          {pipeline.label}
        </span>
        <svg
          className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-zinc-50 bg-zinc-50/70 px-5 py-5 space-y-4">
          {/* Photos */}
          {hasPhotos && (
            <div className="grid grid-cols-3 gap-1.5 rounded-xl overflow-hidden">
              {[submission.photoFrontUrl, submission.photoLeftUrl, submission.photoRightUrl].map((url, i) => (
                <div key={i} className="relative aspect-[3/4] bg-zinc-100 overflow-hidden rounded-lg">
                  {url ? (
                    <img src={url} alt={PHOTO_LABELS[i]} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-semibold uppercase tracking-wider text-white/90 bg-gradient-to-t from-black/50 to-transparent py-1">
                    {PHOTO_LABELS[i]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Bio */}
          {submission.bio && (
            <p className="text-[13px] text-zinc-600 leading-relaxed">{submission.bio}</p>
          )}

          {/* Status breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
            <div>
              <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Submission</p>
              <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${SUB_STATUS_CLS[submission.status] ?? "bg-zinc-100 text-zinc-400"}`}>
                {submission.status}
              </span>
            </div>
            {submission.contractStatus && (
              <div>
                <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Contract</p>
                <p className="text-zinc-700 capitalize">{submission.contractStatus}</p>
              </div>
            )}
            {submission.bookingStatus && (
              <div>
                <p className="text-zinc-400 font-semibold uppercase tracking-widest text-[10px] mb-0.5">Booking</p>
                <p className="text-zinc-700 capitalize">{submission.bookingStatus.replace("_", " ")}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            {submission.talentId && (
              <Link
                href={`/agency/talent/${submission.talentId}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white transition-colors"
              >
                View Full Profile
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
            <Link
              href={`/agency/jobs/${submission.jobId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3.5 py-2 rounded-xl border border-zinc-200 hover:border-zinc-300 text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              Job Detail
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgencySubmissions({ submissions }: { submissions: SubmissionEntry[] }) {
  // Group by job
  const byJob = new Map<string, { jobId: string; jobTitle: string; items: SubmissionEntry[] }>();
  for (const s of submissions) {
    if (!byJob.has(s.jobId)) {
      byJob.set(s.jobId, { jobId: s.jobId, jobTitle: s.jobTitle, items: [] });
    }
    byJob.get(s.jobId)!.items.push(s);
  }

  const groups = [...byJob.values()];

  return (
    <div className="max-w-3xl space-y-8">

      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agency</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Submissions</h1>
        <p className="text-[13px] text-zinc-400 mt-1">
          {submissions.length} submission{submissions.length !== 1 ? "s" : ""} across {groups.length} job{groups.length !== 1 ? "s" : ""}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 py-16 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="w-11 h-11 rounded-2xl bg-zinc-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-zinc-500">No submissions yet</p>
          <p className="text-[13px] text-zinc-400 mt-1">Talent submissions will appear here once they apply.</p>
          <Link
            href="/agency/jobs"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors mt-4"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View Jobs
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.jobId}>
              {/* Job group header */}
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                    {group.items.length} submission{group.items.length !== 1 ? "s" : ""}
                  </p>
                  <Link
                    href={`/agency/jobs/${group.jobId}`}
                    className="text-[15px] font-semibold text-zinc-900 hover:text-zinc-600 transition-colors"
                  >
                    {group.jobTitle}
                  </Link>
                </div>
                <Link
                  href={`/agency/jobs/${group.jobId}`}
                  className="text-[12px] font-medium text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1"
                >
                  View job
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {/* Submissions list */}
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] divide-y divide-zinc-50 overflow-hidden">
                {group.items.map((s) => (
                  <SubmissionRow key={s.id} submission={s} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
