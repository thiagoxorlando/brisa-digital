"use client";

import { useEffect, useState } from "react";
import ReliabilityBadge from "@/components/agency/ReliabilityBadge";

type Suggestion = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  main_role: string | null;
  city: string | null;
  is_favorite: boolean;
  has_history: boolean;
  jobs_count: number;
  jobs_completed: number;
  jobs_cancelled: number;
  is_available: boolean;
  is_unavailable: boolean;
  start_time: string | null;
  already_invited: boolean;
  score: number;
};

function MatchBadges({ s }: { s: Suggestion }) {
  return (
    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
      {s.main_role && (
        <span className="text-[11px] text-zinc-400 mr-0.5">{s.main_role}</span>
      )}
      {s.is_favorite && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          Favorito
        </span>
      )}
      {s.has_history && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
          {s.jobs_count}× trabalhou
        </span>
      )}
      {s.is_available && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
          {s.start_time
            ? `Disponível · ${s.start_time.slice(0, 5)}`
            : "Disponível"}
        </span>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-9 h-9 rounded-full bg-zinc-100 animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-zinc-100 rounded-full w-32 animate-pulse" />
        <div className="h-3 bg-zinc-100 rounded-full w-20 animate-pulse" />
      </div>
      <div className="h-8 w-20 bg-zinc-100 rounded-xl animate-pulse flex-shrink-0" />
    </div>
  );
}

const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-400 to-purple-600",
];

function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function SuggestedTalents({
  jobId,
  agencyId,
}: {
  jobId: string;
  agencyId: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading]         = useState(true);
  const [jobDate, setJobDate]         = useState<string | null>(null);
  const [inviting, setInviting]       = useState<Set<string>>(new Set());
  const [invited, setInvited]         = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/suggestions?agency_id=${agencyId}`)
      .then((r) => r.json())
      .then((data) => {
        const all: Suggestion[] = data.suggestions ?? [];
        // Show talents with at least one matching criterion (score < 8) and not explicitly unavailable
        setSuggestions(all.filter((s) => s.score < 8 && !s.is_unavailable));
        setJobDate(data.job_date ?? null);
        setInvited(new Set(all.filter((s) => s.already_invited).map((s) => s.id)));
      })
      .finally(() => setLoading(false));
  }, [jobId, agencyId]);

  async function handleInvite(talentId: string) {
    setInviting((prev) => new Set(prev).add(talentId));
    const res = await fetch(`/api/jobs/${jobId}/invite`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ talent_id: talentId, agency_id: agencyId }),
    });
    setInviting((prev) => {
      const next = new Set(prev);
      next.delete(talentId);
      return next;
    });
    if (res.ok || res.status === 409) {
      setInvited((prev) => new Set(prev).add(talentId));
    }
  }

  if (!loading && suggestions.length === 0) return null;

  const dateLabel = jobDate
    ? new Date(jobDate + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
          Sugestões
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-lg font-semibold tracking-tight text-zinc-900">
            Talentos Sugeridos
          </p>
          {dateLabel && (
            <span className="text-[13px] text-zinc-400 font-normal">
              · disponíveis em {dateLabel}
            </span>
          )}
          {!loading && (
            <span className="text-[12px] text-zinc-400 font-normal">
              · {suggestions.length} encontrado{suggestions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        {loading ? (
          <div className="divide-y divide-zinc-50">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {suggestions.map((s) => {
              const isInviting = inviting.has(s.id);
              const isInvited  = invited.has(s.id);
              const name       = s.full_name ?? "?";

              return (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50/50 transition-colors">
                  {s.avatar_url ? (
                    <img
                      src={s.avatar_url}
                      alt={name}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}
                    >
                      {initials(name)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-900 truncate">{name}</p>
                    <MatchBadges s={s} />
                    <div className="mt-0.5">
                      <ReliabilityBadge completed={s.jobs_completed} cancelled={s.jobs_cancelled} />
                    </div>
                  </div>

                  <button
                    onClick={() => !isInvited && !isInviting && handleInvite(s.id)}
                    disabled={isInviting || isInvited}
                    className={[
                      "flex-shrink-0 text-[12px] font-semibold px-3.5 py-2 rounded-xl transition-all",
                      isInvited
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-100 cursor-default"
                        : isInviting
                          ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                          : "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white cursor-pointer active:scale-[0.98]",
                    ].join(" ")}
                  >
                    {isInviting ? "…" : isInvited ? "Convidado ✓" : "Convidar"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

