"use client";

import Link from "next/link";
import { useState } from "react";
import Badge from "@/components/ui/Badge";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stats = { activeJobs: number; submissions: number; bookings: number };

type TalentRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  categories: string[] | null;
  city: string | null;
  country: string | null;
};

type ActivityType = "booking" | "submission" | "job" | "profile";

type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  sub: string;
  time: string;
  link?: string;
  avatarUrl?: string | null;
  jobDate?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtJobDate(s: string | null) {
  if (!s) return null;
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const GRADIENTS = [
  "from-violet-400 to-indigo-600", "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
];

function avatarGradient(name: string) {
  return GRADIENTS[(name.charCodeAt(0) ?? 0) % GRADIENTS.length];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const STAT_LINKS: Record<string, string> = {
  "Active Jobs": "/agency/jobs",
  "Submissions": "/agency/submissions",
  "Bookings":    "/agency/bookings",
};

const STAT_ICONS: Record<string, React.ReactNode> = {
  "Active Jobs": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  "Submissions": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  "Bookings": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const STAT_STRIPES: Record<string, string> = {
  "Active Jobs": "from-indigo-500 to-violet-500",
  "Submissions": "from-sky-400 to-blue-500",
  "Bookings":    "from-emerald-400 to-teal-500",
};

const activityMeta: Record<ActivityType, { dot: string; badge: React.ReactNode }> = {
  booking:    { dot: "bg-emerald-400", badge: <Badge variant="success">Booking</Badge>    },
  submission: { dot: "bg-sky-400",     badge: <Badge variant="info">Submission</Badge>    },
  job:        { dot: "bg-indigo-400",  badge: <Badge variant="info">Job</Badge>           },
  profile:    { dot: "bg-amber-400",   badge: <Badge variant="warning">Profile</Badge>    },
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  const href   = STAT_LINKS[label];
  const stripe = STAT_STRIPES[label];
  const icon   = STAT_ICONS[label];

  const inner = (
    <>
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />
      <div className="p-6">
        <div className="flex items-start justify-between mb-5">
          <span className="text-zinc-400">{icon}</span>
        </div>
        <p className="text-[2.25rem] font-semibold tracking-tighter text-zinc-900 leading-none">
          {value}
        </p>
        <p className="text-[13px] font-semibold text-zinc-700 mt-2">{label}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden hover:shadow-[0_4px_12px_rgba(0,0,0,0.07)] transition-shadow duration-150">
        {inner}
      </Link>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {inner}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, meta, href, hrefLabel }: {
  title: string; meta?: string; href?: string; hrefLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{title}</h2>
        {meta && <span className="text-[11px] text-zinc-300 font-medium">{meta}</span>}
      </div>
      {href && hrefLabel && (
        <Link href={href} className="text-[12px] font-medium text-zinc-400 hover:text-zinc-900 transition-colors flex items-center gap-1">
          {hrefLabel}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}
    </div>
  );
}

// ─── Activity item ────────────────────────────────────────────────────────────

function ActivityItemRow({ item, index, total }: { item: ActivityItem; index: number; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = activityMeta[item.type];
  const jobDate = fmtJobDate(item.jobDate ?? null);

  const inner = (
    <li className={[
      "relative flex items-start gap-4 px-5 py-4",
      index < total - 1 ? "border-b border-zinc-50" : "",
    ].join(" ")}>
      <div className="flex-shrink-0 w-[1.875rem] flex justify-center pt-[5px]">
        {item.avatarUrl ? (
          <img src={item.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-white" />
        ) : (
          <span className={`w-2 h-2 rounded-full ring-4 ring-white ${cfg.dot} mt-1.5`} />
        )}
      </div>
      <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-[13px] font-semibold text-zinc-800 leading-snug">{item.title}</p>
            {cfg.badge}
          </div>
          <p className="text-[12px] text-zinc-400 leading-relaxed">{item.sub}</p>
          {jobDate && (
            <p className="text-[11px] text-violet-500 font-medium mt-0.5">Job: {jobDate}</p>
          )}

          {/* Expandable detail for submissions */}
          {item.type === "submission" && expanded && item.avatarUrl && (
            <div className="mt-3 flex items-center gap-3 bg-zinc-50 rounded-xl px-3 py-2.5">
              <img src={item.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-zinc-800 truncate">{item.sub.split(" applied")[0]}</p>
                {item.link && (
                  <Link href={item.link} className="text-[11px] text-indigo-500 hover:text-indigo-700 font-medium">
                    View submission →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <p className="text-[11px] text-zinc-400 tabular-nums whitespace-nowrap mt-0.5">
            {timeAgo(item.time)}
          </p>
          {item.type === "submission" && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded((v) => !v); }}
              className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
      </div>
    </li>
  );

  if (item.link && item.type !== "submission") {
    return (
      <Link href={item.link} className="block hover:bg-zinc-50/60 transition-colors">
        {inner}
      </Link>
    );
  }

  return <>{inner}</>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgencyDashboardOverview({
  stats,
  recentTalent,
  recentActivity,
}: {
  stats: Stats;
  recentTalent: TalentRow[];
  recentActivity: ActivityItem[];
}) {
  const statEntries = [
    { label: "Active Jobs",  value: stats.activeJobs  },
    { label: "Submissions",  value: stats.submissions  },
    { label: "Bookings",     value: stats.bookings     },
  ];

  return (
    <div className="max-w-5xl space-y-10">

      {/* ── Page header ── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
          Agency Portal
        </p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">
          Dashboard
        </h1>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statEntries.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* ── Bottom grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Activity feed — 3 cols */}
        <div className="xl:col-span-3">
          <SectionHeader title="Recent Activity" meta={`${recentActivity.length} events`} />

          {recentActivity.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-100 py-14 text-center">
              <p className="text-[14px] font-medium text-zinc-500">No activity yet</p>
              <p className="text-[13px] text-zinc-400 mt-1">Bookings and applications will appear here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
              <ul className="relative">
                <div className="absolute left-[2.375rem] top-6 bottom-6 w-px bg-zinc-100" />
                {recentActivity.map((item, i) => (
                  <ActivityItemRow key={item.id} item={item} index={i} total={recentActivity.length} />
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Recent talent — 2 cols */}
        <div className="xl:col-span-2">
          <SectionHeader title="Recent Talent Used" href="/agency/talent" hrefLabel="View all" />

          {recentTalent.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-100 py-14 text-center">
              <p className="text-[14px] font-medium text-zinc-500">No talent yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentTalent.map((talent) => {
                const name = talent.full_name ?? "Unknown";
                return (
                  <Link
                    key={talent.id}
                    href={`/agency/talent/${talent.id}`}
                    className="group block bg-white rounded-2xl border border-zinc-100 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] hover:border-zinc-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition-all duration-150"
                  >
                    <div className="flex items-center gap-3">
                      {talent.avatar_url ? (
                        <img src={talent.avatar_url} alt={name}
                          className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}>
                          {initials(name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-zinc-900 truncate leading-none">{name}</p>
                        <p className="text-[12px] text-zinc-400 truncate mt-0.5">
                          {[talent.city, talent.country].filter(Boolean).join(", ") || "Location unknown"}
                        </p>
                      </div>
                      {talent.categories?.[0] && (
                        <span className="text-[10px] font-medium bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full flex-shrink-0">
                          {talent.categories[0]}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
