"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import RehireModal from "@/components/agency/RehireModal";
import ReliabilityBadge from "@/components/agency/ReliabilityBadge";
import { reliabilitySortScore } from "@/lib/reliability";
import { talentCategoryLabel } from "@/lib/talentCategories";

type TalentProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  main_role: string | null;
  categories: string[] | null;
};

type HistoryEntry = {
  id: string;
  agency_id: string;
  talent_id: string;
  jobs_count: number;
  jobs_completed: number;
  jobs_cancelled: number;
  last_worked_at: string;
  is_favorite: boolean;
  created_at: string;
  talent: TalentProfile | null;
};

type AvailEntry = { is_available: boolean; start_time: string | null; end_time: string | null } | null;

interface Props {
  agencyId: string;
  initialHistory: HistoryEntry[];
  defaultJobId?: string;
  initialAvailability?: Record<string, AvailEntry>;
  initialFilterDate?: string;
}

function Avatar({ talent }: { talent: TalentProfile | null }) {
  const name    = talent?.full_name ?? "Talento";
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const colors  = ["bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
  const color   = colors[name.charCodeAt(0) % colors.length];

  if (talent?.avatar_url) {
    return (
      <img
        src={talent.avatar_url}
        alt={name}
        className="w-full h-full object-cover"
      />
    );
  }
  return (
    <div className={`w-full h-full ${color} flex items-center justify-center text-white font-semibold text-[15px]`}>
      {initials}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TalentHistory({
  agencyId, initialHistory, defaultJobId,
  initialAvailability = {}, initialFilterDate,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [history, setHistory]           = useState<HistoryEntry[]>(initialHistory);
  const [search, setSearch]             = useState("");
  const [rehireTarget, setRehireTarget] = useState<TalentProfile | null>(null);
  const [favoriteLoading, setFavLoading] = useState<string | null>(null);
  const [filterDate, setFilterDate]     = useState(initialFilterDate ?? today);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [availMap, setAvailMap]         = useState<Record<string, AvailEntry>>(initialAvailability);
  const [availLoading, setAvailLoading] = useState(false);

  // Re-fetch availability whenever filterDate or history changes
  const fetchAvailability = useCallback(async (date: string, entries: HistoryEntry[]) => {
    const ids = entries.map((h) => h.talent_id).filter(Boolean);
    if (!ids.length || !date) return;
    setAvailLoading(true);
    const res  = await fetch(`/api/availability/check?date=${date}&talent_ids=${ids.join(",")}`);
    const json = await res.json();
    if (json.availability) setAvailMap(json.availability);
    setAvailLoading(false);
  }, []);

  useEffect(() => {
    fetchAvailability(filterDate, history);
  }, [filterDate, history, fetchAvailability]);

  // Availability score for sorting (0 = available, 1 = unknown, 2 = unavailable)
  function availScore(talentId: string) {
    const a = availMap[talentId];
    if (a === undefined || a === null) return 1;
    return a.is_available ? 0 : 2;
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return history
      .filter((h) => {
        if (showOnlyAvailable && availMap[h.talent_id]?.is_available !== true) return false;
        if (!q) return true;
        const t = h.talent;
        return (
          t?.full_name?.toLowerCase().includes(q) ||
          t?.main_role?.toLowerCase().includes(q) ||
          t?.city?.toLowerCase().includes(q) ||
          t?.country?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const sa = availScore(a.talent_id);
        const sb = availScore(b.talent_id);
        if (sa !== sb) return sa - sb;
        // Within same availability tier, reliable talents come first
        const ra = reliabilitySortScore(a.jobs_completed ?? 0, a.jobs_cancelled ?? 0);
        const rb = reliabilitySortScore(b.jobs_completed ?? 0, b.jobs_cancelled ?? 0);
        if (ra !== rb) return ra - rb;
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return new Date(b.last_worked_at).getTime() - new Date(a.last_worked_at).getTime();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, search, showOnlyAvailable, availMap]);

  const favorites = filtered.filter((h) => h.is_favorite && availScore(h.talent_id) !== 0);
  const others    = filtered.filter((h) => !h.is_favorite && availScore(h.talent_id) !== 0);
  const available = filtered.filter((h) => availScore(h.talent_id) === 0);

  async function toggleFavorite(entry: HistoryEntry) {
    setFavLoading(entry.id);
    const next = !entry.is_favorite;

    setHistory((prev) =>
      prev.map((h) => (h.id === entry.id ? { ...h, is_favorite: next } : h))
    );

    try {
      await fetch("/api/agency/talent-history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, is_favorite: next }),
      });
    } catch {
      // revert on failure
      setHistory((prev) =>
        prev.map((h) => (h.id === entry.id ? { ...h, is_favorite: !next } : h))
      );
    } finally {
      setFavLoading(null);
    }
  }

  async function refreshHistory() {
    const res  = await fetch(`/api/agency/talent-history?agency_id=${agencyId}`);
    const json = await res.json();
    if (json.history) setHistory(json.history);
  }

  function AvailBadge({ talentId }: { talentId: string }) {
    const a = availMap[talentId];
    if (a === undefined || a === null) return null;
    if (a.is_available) {
      const time = a.start_time ? ` · ${a.start_time.slice(0, 5)}${a.end_time ? `–${a.end_time.slice(0, 5)}` : ""}` : "";
      const label = filterDate === today ? `Disponível hoje${time}` : `Disponível nesta data${time}`;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
          {label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[11px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 flex-shrink-0" />
        Indisponível
      </span>
    );
  }

  function TalentCard({ entry }: { entry: HistoryEntry }) {
    const t        = entry.talent;
    const name     = t?.full_name ?? "Talento sem perfil completo";
    const location = [t?.city, t?.country].filter(Boolean).join(", ");
    const roleLine = [t?.main_role, location].filter(Boolean).join(" · ");

    return (
      <div className="bg-white rounded-[1.5rem] border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(7,17,13,0.06)] p-5 flex flex-col gap-5 transition-all hover:-translate-y-0.5 hover:border-zinc-200 hover:shadow-[0_18px_46px_rgba(7,17,13,0.10)] lg:flex-row lg:items-center">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 ring-1 ring-zinc-100">
          <Avatar talent={t} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[16px] font-black text-zinc-950 truncate">
                {name}
              </p>
              {roleLine ? (
                <p className="text-[12px] text-zinc-500 truncate">
                  {roleLine}
                </p>
              ) : (
                <p className="text-[12px] text-zinc-400 truncate">
                  Perfil incompleto, mas o histórico de contratação existe.
                </p>
              )}
            </div>
            <button
              onClick={() => toggleFavorite(entry)}
              disabled={favoriteLoading === entry.id}
              title={entry.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              className="flex-shrink-0 p-1 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-40"
            >
              <svg
                className={`w-4 h-4 transition-colors ${entry.is_favorite ? "text-amber-400 fill-current" : "text-[#647B7B]"}`}
                fill={entry.is_favorite ? "currentColor" : "none"}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          </div>

          {/* Availability badge */}
          <AvailBadge talentId={entry.talent_id} />

          {/* Reliability badge */}
          <ReliabilityBadge
            completed={entry.jobs_completed ?? 0}
            cancelled={entry.jobs_cancelled ?? 0}
            showStats
          />

          {/* Stats */}
          <div className="flex items-center gap-3 pt-0.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {entry.jobs_count} {entry.jobs_count === 1 ? "contratação" : "contratações"}
            </span>
            <span className="text-[#647B7B]">·</span>
            <span className="text-[11px] text-zinc-400">
              Último: {formatDate(entry.last_worked_at)}
            </span>
            {entry.is_favorite && (
              <>
                <span className="text-[#647B7B]">·</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500">
                  <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Favorito
                </span>
              </>
            )}
          </div>

          {/* Categories */}
          {t?.categories && t.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {t.categories.slice(0, 3).map((cat) => (
                <span key={cat} className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-medium">
                  {talentCategoryLabel(cat)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="flex-shrink-0 flex flex-col gap-2 items-stretch justify-center sm:flex-row lg:flex-col">
          {/* Full modal — select job / amount */}
          <button
            onClick={() => setRehireTarget(t ? { ...t, id: entry.talent_id } : null)}
            disabled={!t}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] active:scale-[0.97] text-white text-[13px] font-bold transition-all whitespace-nowrap disabled:cursor-not-allowed disabled:bg-[#E6F0F0] disabled:text-[#B8D4D4] shadow-[0_6px_16px_rgba(26,188,156,0.24)]"
          >
            Escolher vaga e valor
          </button>

          <Link
            href={`/agency/talent/${entry.talent_id}`}
            className="px-4 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 active:scale-[0.97] text-zinc-600 text-[13px] font-semibold transition-all whitespace-nowrap text-center"
          >
            Ver perfil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Search + filters row */}
      <div className="space-y-3">
        <div className="flex gap-2.5">
          {/* Search */}
          <div className="relative flex-1">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, função ou localização…"
              className="w-full pl-10 pr-4 py-3 text-[14px] bg-white border border-zinc-200 rounded-2xl focus:border-zinc-400 focus:outline-none transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Date filter */}
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            title="Filtrar disponibilidade por data"
            className="px-3 py-3 text-[13px] bg-white border border-zinc-200 rounded-2xl focus:border-zinc-400 focus:outline-none transition-colors text-zinc-600 w-36"
          />
        </div>

        {/* Available only toggle + summary */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setShowOnlyAvailable((v) => !v)}
            className={[
              "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-all",
              showOnlyAvailable
                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                : "bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-300",
            ].join(" ")}
          >
            <span className={`w-2 h-2 rounded-full ${showOnlyAvailable ? "bg-emerald-500" : "bg-zinc-300"}`} />
            Disponíveis em {filterDate === today ? "hoje" : new Date(filterDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
          </button>

          {availLoading && (
            <span className="text-[11px] text-zinc-400 flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
              </svg>
              Verificando disponibilidade…
            </span>
          )}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5M12 12a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
          </div>
          {history.length === 0 ? (
            <>
              <p className="text-[15px] font-semibold text-zinc-700">Nenhum talento na equipe ainda</p>
              <p className="text-[13px] text-zinc-400 max-w-xs mx-auto">
                Talentos aparecem aqui automaticamente após uma contratação paga.
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-zinc-700">Nenhum resultado</p>
              <p className="text-[13px] text-zinc-400">Tente outro nome ou função.</p>
            </>
          )}
        </div>
      )}

      {/* Available now */}
      {available.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              Disponíveis {filterDate === today ? "hoje" : new Date(filterDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </h2>
          </div>
          <div className="space-y-2.5">
            {available.map((entry) => <TalentCard key={entry.id} entry={entry} />)}
          </div>
        </section>
      )}

      {/* Favorites (non-available) */}
      {favorites.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400 fill-current" viewBox="0 0 24 24">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Favoritos</h2>
          </div>
          <div className="space-y-2.5">
            {favorites.map((entry) => <TalentCard key={entry.id} entry={entry} />)}
          </div>
        </section>
      )}

      {/* Rest */}
      {others.length > 0 && (
        <section className="space-y-3">
          {(available.length > 0 || favorites.length > 0) && (
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Outros</h2>
          )}
          <div className="space-y-2.5">
            {others.map((entry) => <TalentCard key={entry.id} entry={entry} />)}
          </div>
        </section>
      )}

      {/* Rehire modal */}
      {rehireTarget && (
        <RehireModal
          talent={rehireTarget}
          agencyId={agencyId}
          defaultJobId={defaultJobId}
          onClose={() => setRehireTarget(null)}
          onSuccess={refreshHistory}
        />
      )}
    </div>
  );
}

