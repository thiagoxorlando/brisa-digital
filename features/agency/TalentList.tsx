"use client";

import Link from "next/link";
import { useState } from "react";
import { talentCategoryLabel } from "@/lib/talentCategories";

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
      (t.categories ?? []).some((c: string) =>
        c.toLowerCase().includes(q) || talentCategoryLabel(c).toLowerCase().includes(q)
      )
    );
  });

  return (
    <div className="space-y-5">
      {/* ── Search ── */}
      <div className="relative max-w-md">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#647B7B] pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar talento…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 text-[13px] bg-white border border-[#DDE6E6] rounded-2xl placeholder:text-[#647B7B] hover:border-[#B8D4D4] focus:border-[#1ABC9C] focus:ring-2 focus:ring-[#1ABC9C]/20 focus:outline-none transition-colors shadow-sm"
        />
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-[1.5rem] border border-[#DDE6E6] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#DDE6E6]">
              <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-[#647B7B] uppercase tracking-widest">Talento</th>
              <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-[#647B7B] uppercase tracking-widest hidden sm:table-cell">Localização</th>
              <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-[#647B7B] uppercase tracking-widest hidden md:table-cell">Categorias</th>
              <th className="text-left px-4 py-3.5 text-[11px] font-semibold text-[#647B7B] uppercase tracking-widest hidden sm:table-cell">Instagram</th>
              <th className="px-6 py-3.5 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFF5F5]">
            {filtered.map((t) => {
              const name = t.full_name ?? "Sem nome";
              return (
                <tr key={t.id} className="hover:bg-[#F8FAFC] transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      {t.avatar_url ? (
                        <img src={t.avatar_url} alt={name} className="w-12 h-12 rounded-2xl object-cover flex-shrink-0 shadow-sm ring-1 ring-[#DDE6E6]" />
                      ) : (
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-[13px] font-black text-white flex-shrink-0 shadow-sm`}>
                          {initials(name)}
                        </div>
                      )}
                      <p className="text-[14px] font-black text-[#1F2D2E] truncate leading-none">
                        {name}
                        {t.age && <span className="ml-1.5 text-[11px] font-semibold text-[#647B7B]">{t.age} anos</span>}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden sm:table-cell">
                    <span className="text-[13px] text-[#647B7B]">
                      {[t.city, t.country].filter(Boolean).join(", ") || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(t.categories ?? []).slice(0, 2).map((c: string) => (
                        <span key={c} className="text-[10px] font-bold bg-[#D1F4EB] text-[#0A7A5A] px-2 py-0.5 rounded-full">{talentCategoryLabel(c)}</span>
                      ))}
                      {!t.categories?.length && <span className="text-[13px] text-[#647B7B]">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden sm:table-cell">
                    <span className="text-[12px] text-[#647B7B]">
                      {t.instagram ? `@${t.instagram}` : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/agency/talent/${t.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#1F2D2E] px-3 py-1.5 text-[12px] font-bold text-white transition-all opacity-0 group-hover:opacity-100 hover:bg-[#2D4142]"
                    >
                      Ver
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
                  <p className="text-[14px] font-medium text-[#647B7B]">Nenhum talento encontrado</p>
                  <p className="text-[13px] text-[#B8D4D4] mt-1">Tente ajustar sua busca.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="px-6 py-3.5 border-t border-[#DDE6E6] bg-[#F8FAFC]">
          <p className="text-[12px] text-[#647B7B] font-medium">
            {filtered.length} de {talent.length} talento{talent.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
