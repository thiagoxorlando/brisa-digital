"use client";

import { useState } from "react";

export default function TalentViewToggle({
  gridView,
  listView,
  totalCount,
}: {
  gridView: React.ReactNode;
  listView: React.ReactNode;
  totalCount: number;
}) {
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Roster</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Talent</h1>
          <p className="text-[13px] text-zinc-400 mt-1">{totalCount} profiles</p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1 flex-shrink-0">
          <button
            onClick={() => setView("grid")}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer",
              view === "grid"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Grid
          </button>
          <button
            onClick={() => setView("list")}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer",
              view === "list"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            List
          </button>
        </div>
      </div>

      {view === "grid" ? gridView : listView}
    </div>
  );
}
