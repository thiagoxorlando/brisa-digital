"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TALENT_CATEGORY_OPTIONS,
  talentCategoryLabel,
  talentCategoryMatches,
} from "@/lib/talentCategories";

// ─── Types ────────────────────────────────────────────────────────────────────

type Talent = {
  id: string;
  full_name: string;
  bio: string | null;
  country: string | null;
  city: string | null;
  categories: string[] | null;
  avatar_url: string | null;
  photo_front_url: string | null;
  gender: string | null;
  age: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = TALENT_CATEGORY_OPTIONS;

const GENDERS: { label: string; value: string }[] = [
  { label: "Masculino", value: "male" },
  { label: "Feminino",  value: "female" },
  { label: "Outro",     value: "other" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GRADIENTS = [
  "from-violet-400 to-indigo-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-400 to-purple-600",
];

function gradient(name: string) {
  return GRADIENTS[(name.charCodeAt(0) ?? 0) % GRADIENTS.length];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-100 cursor-pointer whitespace-nowrap",
        active
          ? "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white font-bold shadow-[0_6px_16px_rgba(26,188,156,0.28)]"
          : "bg-white border border-[#DDE6E6] text-[#647B7B] hover:border-[#B8D4D4] hover:text-[#1F2D2E]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ─── Talent card ──────────────────────────────────────────────────────────────

function TalentCard({ talent, onClick }: { talent: Talent; onClick: () => void }) {
  const cover = talent.photo_front_url ?? talent.avatar_url;
  const name  = talent.full_name;

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-[1.45rem] overflow-hidden bg-[#E6F0F0] relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1ABC9C] shadow-[0_1px_4px_rgba(0,0,0,0.04),0_14px_34px_rgba(0,0,0,0.10)] ring-1 ring-[#DDE6E6] hover:-translate-y-1 hover:shadow-[0_18px_46px_rgba(0,0,0,0.14)] transition-all duration-300"
    >
      {/* Portrait image */}
      <div className="aspect-[2/3] w-full overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient(name)} flex items-center justify-center`}>
            <span className="text-[2rem] font-bold text-white/90">{initials(name)}</span>
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/10 to-black/0 opacity-90 group-hover:opacity-100 transition-opacity duration-200" />
      </div>

      {/* Bottom info strip */}
      <div className="absolute bottom-0 left-0 right-0 px-3.5 py-3.5 bg-gradient-to-t from-black/88 to-transparent">
        <p className="text-[14px] font-black text-white leading-snug truncate">
          {name}
          {talent.age && <span className="ml-1.5 text-[11px] font-semibold text-white/65">{talent.age} anos</span>}
        </p>
        {(talent.city || talent.country) && (
          <p className="text-[11px] font-medium text-white/65 truncate mt-0.5">
            {[talent.city, talent.country].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      {/* Category badge (top right) */}
      {talent.categories?.[0] && (
        <div className="absolute top-2.5 right-2.5">
          <span className="text-[10px] font-black bg-white/90 backdrop-blur-sm text-[#0E7C86] px-2.5 py-1 rounded-full shadow-sm">
            {talentCategoryLabel(talent.categories[0])}
          </span>
        </div>
      )}
    </button>
  );
}

// ─── Age range slider labels ──────────────────────────────────────────────────

function AgeInput({
  label, value, placeholder, onChange,
}: {
  label: string; value: string; placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">{label}</label>
      <input
        type="number"
        placeholder={placeholder}
        min={0} max={100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-[13px] rounded-xl border border-[#DDE6E6] bg-white hover:border-[#B8D4D4] focus:border-[#1ABC9C] focus:outline-none transition-colors"
      />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TalentGrid({ talent: initialTalent }: { talent: Talent[] }) {
  const router = useRouter();

  const [talent]                    = useState<Talent[]>(initialTalent);
  const [search, setSearch]         = useState("");
  const [gender, setGender]         = useState("");
  const [category, setCategory]     = useState("");
  const [ageMin, setAgeMin]         = useState("");
  const [ageMax, setAgeMax]         = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = talent.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      const hit =
        t.full_name.toLowerCase().includes(q) ||
        (t.city ?? "").toLowerCase().includes(q) ||
        (t.country ?? "").toLowerCase().includes(q) ||
        (t.categories ?? []).some((c) =>
          c.toLowerCase().includes(q) || talentCategoryLabel(c).toLowerCase().includes(q)
        );
      if (!hit) return false;
    }
    if (gender    && (t.gender    ?? "") !== gender)    return false;
    if (category  && !(t.categories ?? []).some((c) => talentCategoryMatches(c, category))) return false;
    if (ageMin    && (t.age ?? 0)   < parseInt(ageMin)) return false;
    if (ageMax    && (t.age ?? 999) > parseInt(ageMax)) return false;
    return true;
  });

  function clearFilters() {
    setGender(""); setCategory(""); setAgeMin(""); setAgeMax("");
  }

  const activeFilters = [gender, category, ageMin, ageMax].filter(Boolean).length;

  return (
    <div className="max-w-7xl space-y-6">

      {/* ── Search + filter toggle ── */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nome, localização, categoria…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 text-[13px] bg-white border border-[#DDE6E6] rounded-2xl placeholder:text-[#647B7B] hover:border-[#B8D4D4] focus:border-[#1ABC9C] focus:ring-2 focus:ring-[#1ABC9C]/20 focus:outline-none transition-colors shadow-sm"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={[
            "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] font-medium transition-colors cursor-pointer",
            showFilters || activeFilters > 0
              ? "bg-[#1F2D2E] text-white border-[#1F2D2E]"
              : "bg-white text-[#647B7B] border-[#DDE6E6] hover:border-[#B8D4D4]",
          ].join(" ")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M9 20h6" />
          </svg>
          Filtros{activeFilters > 0 ? ` · ${activeFilters}` : ""}
        </button>
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <div className="bg-white border border-[#DDE6E6] rounded-2xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] space-y-5">

          {/* Gender pills */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">Gênero</p>
            <div className="flex flex-wrap gap-2">
              <Pill label="Todos" active={!gender} onClick={() => setGender("")} />
              {GENDERS.map((g) => (
                <Pill key={g.value} label={g.label} active={gender === g.value} onClick={() => setGender(gender === g.value ? "" : g.value)} />
              ))}
            </div>
          </div>

          {/* Category pills */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#647B7B]">Categoria</p>
            <div className="flex flex-wrap gap-2">
              <Pill label="Todas" active={!category} onClick={() => setCategory("")} />
              {CATEGORIES.map((c) => (
                <Pill key={c.value} label={c.label} active={category === c.value} onClick={() => setCategory(category === c.value ? "" : c.value)} />
              ))}
            </div>
          </div>

          {/* Age range */}
          <div className="flex gap-4 items-end">
            <AgeInput label="Idade Mín." placeholder="18" value={ageMin} onChange={setAgeMin} />
            <AgeInput label="Idade Máx." placeholder="60" value={ageMax} onChange={setAgeMax} />
            {activeFilters > 0 && (
              <button
                onClick={clearFilters}
                className="mb-0.5 text-[12px] font-medium text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer whitespace-nowrap"
              >
                Limpar tudo
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Active filter summary ── */}
      {activeFilters > 0 && !showFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {gender    && <span className="text-[12px] bg-[#1F2D2E] text-white px-3 py-1 rounded-full">{GENDERS.find((g) => g.value === gender)?.label ?? gender}</span>}
          {category  && <span className="text-[12px] bg-[#1F2D2E] text-white px-3 py-1 rounded-full">{CATEGORIES.find((c) => c.value === category)?.label ?? category}</span>}
          {(ageMin || ageMax) && (
            <span className="text-[12px] bg-[#1F2D2E] text-white px-3 py-1 rounded-full">
              Idade {ageMin || "qualquer"}–{ageMax || "qualquer"}
            </span>
          )}
          <button onClick={clearFilters} className="text-[12px] text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer">
            Limpar
          </button>
        </div>
      )}

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <div className="py-32 text-center">
          <p className="text-[15px] font-medium text-zinc-500">Nenhum talento encontrado</p>
          <p className="text-[13px] text-zinc-400 mt-1">Tente ajustar sua busca ou filtros.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">

          {filtered.map((t) => (
            <TalentCard
              key={t.id}
              talent={t}
              onClick={() => router.push(`/agency/talent/${t.id}`)}
            />
          ))}
        </div>
      )}

    </div>
  );
}
