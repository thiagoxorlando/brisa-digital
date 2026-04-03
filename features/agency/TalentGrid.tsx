"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  ethnicity: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Actor", "Model", "Influencer", "Dancer", "Singer",
  "Comedian", "Presenter", "Content Creator", "Photographer", "Athlete",
  "Lifestyle & Fashion", "Technology", "Food & Cooking", "Health & Fitness",
  "Travel", "Beauty",
];

const GENDERS = ["Male", "Female", "Non-binary", "Other"];

const ETHNICITIES = [
  "Asian", "Black / African", "Hispanic / Latino",
  "Middle Eastern", "Mixed", "South Asian", "White / Caucasian", "Other",
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
          ? "bg-zinc-900 text-white"
          : "bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-800",
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
      className="group text-left rounded-2xl overflow-hidden bg-zinc-100 relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>

      {/* Bottom info strip */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5 bg-gradient-to-t from-black/70 to-transparent">
        <p className="text-[13px] font-semibold text-white leading-snug truncate">{name}</p>
        {(talent.city || talent.country) && (
          <p className="text-[11px] text-white/60 truncate mt-0.5">
            {[talent.city, talent.country].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      {/* Category badge (top right) */}
      {talent.categories?.[0] && (
        <div className="absolute top-2.5 right-2.5">
          <span className="text-[10px] font-semibold bg-black/40 backdrop-blur-sm text-white/90 px-2 py-0.5 rounded-full">
            {talent.categories[0]}
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
      <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      <input
        type="number"
        placeholder={placeholder}
        min={0} max={100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-[13px] rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
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
  const [ethnicity, setEthnicity]   = useState("");
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
        (t.categories ?? []).some((c) => c.toLowerCase().includes(q));
      if (!hit) return false;
    }
    if (gender    && (t.gender    ?? "").toLowerCase() !== gender.toLowerCase())    return false;
    if (ethnicity && (t.ethnicity ?? "").toLowerCase() !== ethnicity.toLowerCase()) return false;
    if (category  && !(t.categories ?? []).some((c) => c.toLowerCase() === category.toLowerCase())) return false;
    if (ageMin    && (t.age ?? 0)   < parseInt(ageMin)) return false;
    if (ageMax    && (t.age ?? 999) > parseInt(ageMax)) return false;
    return true;
  });

  function clearFilters() {
    setGender(""); setEthnicity(""); setCategory(""); setAgeMin(""); setAgeMax("");
  }

  const activeFilters = [gender, ethnicity, category, ageMin, ageMax].filter(Boolean).length;

  return (
    <div className="max-w-7xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Roster</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Talent</h1>
        </div>
        <p className="text-[13px] text-zinc-400 pb-1">
          {filtered.length} of {talent.length}
        </p>
      </div>

      {/* ── Search + filter toggle ── */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, location, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-zinc-200 rounded-xl placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={[
            "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[13px] font-medium transition-colors cursor-pointer",
            showFilters || activeFilters > 0
              ? "bg-zinc-900 text-white border-zinc-900"
              : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300",
          ].join(" ")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M9 20h6" />
          </svg>
          Filters{activeFilters > 0 ? ` · ${activeFilters}` : ""}
        </button>
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <div className="bg-white border border-zinc-100 rounded-2xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] space-y-5">

          {/* Gender pills */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Gender</p>
            <div className="flex flex-wrap gap-2">
              <Pill label="All" active={!gender} onClick={() => setGender("")} />
              {GENDERS.map((g) => (
                <Pill key={g} label={g} active={gender === g} onClick={() => setGender(gender === g ? "" : g)} />
              ))}
            </div>
          </div>

          {/* Ethnicity pills */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Ethnicity</p>
            <div className="flex flex-wrap gap-2">
              <Pill label="All" active={!ethnicity} onClick={() => setEthnicity("")} />
              {ETHNICITIES.map((e) => (
                <Pill key={e} label={e} active={ethnicity === e} onClick={() => setEthnicity(ethnicity === e ? "" : e)} />
              ))}
            </div>
          </div>

          {/* Category pills */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Category</p>
            <div className="flex flex-wrap gap-2">
              <Pill label="All" active={!category} onClick={() => setCategory("")} />
              {CATEGORIES.map((c) => (
                <Pill key={c} label={c} active={category === c} onClick={() => setCategory(category === c ? "" : c)} />
              ))}
            </div>
          </div>

          {/* Age range */}
          <div className="flex gap-4 items-end">
            <AgeInput label="Min Age" placeholder="18" value={ageMin} onChange={setAgeMin} />
            <AgeInput label="Max Age" placeholder="60" value={ageMax} onChange={setAgeMax} />
            {activeFilters > 0 && (
              <button
                onClick={clearFilters}
                className="mb-0.5 text-[12px] font-medium text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer whitespace-nowrap"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Active filter summary ── */}
      {activeFilters > 0 && !showFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {gender    && <span className="text-[12px] bg-zinc-900 text-white px-3 py-1 rounded-full">{gender}</span>}
          {ethnicity && <span className="text-[12px] bg-zinc-900 text-white px-3 py-1 rounded-full">{ethnicity}</span>}
          {category  && <span className="text-[12px] bg-zinc-900 text-white px-3 py-1 rounded-full">{category}</span>}
          {(ageMin || ageMax) && (
            <span className="text-[12px] bg-zinc-900 text-white px-3 py-1 rounded-full">
              Age {ageMin || "any"}–{ageMax || "any"}
            </span>
          )}
          <button onClick={clearFilters} className="text-[12px] text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer">
            Clear
          </button>
        </div>
      )}

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <div className="py-32 text-center">
          <p className="text-[15px] font-medium text-zinc-500">No talent found</p>
          <p className="text-[13px] text-zinc-400 mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">

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
