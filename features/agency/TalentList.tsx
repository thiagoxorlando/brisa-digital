"use client";

import Link from "next/link";
import { useState } from "react";

export type TalentListItem = {
  id: string;
  full_name: string | null;
  city: string | null;
  country: string | null;
  categories: string[] | null;
  avatar_url: string | null;
  instagram: string | null;
  age: number | null;
  gender: string | null;
};

const GRADIENTS = [
  "from-violet-500 to-indigo-600", "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
];

function avatarGradient(name: string) {
  return GRADIENTS[(name.charCodeAt(0) ?? 0) % GRADIENTS.length];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function TalentList({ talent }: { talent: TalentListItem[] }) {
  const [search, setSearch] = useState("");

  const filtered = talent.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (t.full_name ?? "").toLowerCase().includes(q) ||
      (t.instagram  ?? "").toLowerCase().includes(q) ||
      (t.city       ?? "").toLowerCase().includes(q) ||
      (t.categories ?? []).some((c: string) => c.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5">
      {/* ── Search ── */}
      <div className="relative max-w-xs">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search talent…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
        />
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Talent</th>
              <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden sm:table-cell">Location</th>
              <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden md:table-cell">Categories</th>
              <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest hidden sm:table-cell">Instagram</th>
              <th className="px-6 py-3.5 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {filtered.map((t) => {
              const name = t.full_name ?? "Unknown";
              return (
                <tr key={t.id} className="hover:bg-zinc-50/60 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {t.avatar_url ? (
                        <img src={t.avatar_url} alt={name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0`}>
                          {initials(name)}
                        </div>
                      )}
                      <p className="text-[13px] font-semibold text-zinc-900 truncate leading-none">
                        {name}
                        {t.age && <span className="ml-1.5 text-[11px] font-normal text-zinc-400">{t.age}y</span>}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden sm:table-cell">
                    <span className="text-[13px] text-zinc-500">
                      {[t.city, t.country].filter(Boolean).join(", ") || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(t.categories ?? []).slice(0, 2).map((c: string) => (
                        <span key={c} className="text-[10px] font-medium bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">{c}</span>
                      ))}
                      {!t.categories?.length && <span className="text-[13px] text-zinc-400">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden sm:table-cell">
                    <span className="text-[12px] text-zinc-400">
                      {t.instagram ? `@${t.instagram}` : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/agency/talent/${t.id}`}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-400 hover:text-zinc-900 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      View
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <p className="text-[14px] font-medium text-zinc-500">No talent found</p>
                  <p className="text-[13px] text-zinc-400 mt-1">Try adjusting your search.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="px-6 py-3.5 border-t border-zinc-100 bg-zinc-50/50">
          <p className="text-[12px] text-zinc-400 font-medium">
            {filtered.length} of {talent.length} talent
          </p>
        </div>
      </div>
    </div>
  );
}
