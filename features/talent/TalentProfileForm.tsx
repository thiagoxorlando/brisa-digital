"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type SocialLink = { id: string; platform: string; handle: string };

type FormData = {
  name: string;
  username: string;
  bio: string;
  imageDataUrl: string;
  categories: string[];
  links: SocialLink[];
};

type FormErrors = {
  name?: string;
  username?: string;
  bio?: string;
  links?: Record<string, string>;
};

type Touched = { name?: boolean; username?: boolean; bio?: boolean };

// ─── Constants ────────────────────────────────────────────────────────────────

const BIO_MAX = 300;

const CATEGORY_SUGGESTIONS = [
  "Lifestyle & Fashion", "Technology", "Food & Cooking",
  "Health & Fitness", "Travel", "Beauty", "Gaming",
  "Music", "Comedy", "Education", "Sports", "Other",
];

const PLATFORMS = [
  { id: "instagram", label: "Instagram", prefix: "@" },
  { id: "tiktok",    label: "TikTok",    prefix: "@" },
  { id: "youtube",   label: "YouTube",   prefix: ""  },
  { id: "twitter",   label: "X (Twitter)", prefix: "@" },
  { id: "website",   label: "Website",   prefix: ""  },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

const PLATFORM_META: Record<PlatformId, { label: string; prefix: string }> = {
  instagram: { label: "Instagram",   prefix: "@" },
  tiktok:    { label: "TikTok",      prefix: "@" },
  youtube:   { label: "YouTube",     prefix: ""  },
  twitter:   { label: "X (Twitter)", prefix: "@" },
  website:   { label: "Website",     prefix: ""  },
};

const CATEGORY_STRIPES: Record<string, string> = {
  "Lifestyle & Fashion": "from-rose-400 via-pink-400 to-fuchsia-400",
  "Technology":          "from-sky-500 via-blue-500 to-indigo-500",
  "Food & Cooking":      "from-amber-400 via-orange-400 to-red-400",
  "Health & Fitness":    "from-emerald-400 via-teal-400 to-cyan-400",
  "Travel":              "from-indigo-400 via-violet-400 to-purple-400",
  "Beauty":              "from-pink-400 via-rose-400 to-red-300",
  "Gaming":              "from-violet-500 via-purple-500 to-indigo-400",
  "Music":               "from-yellow-400 via-amber-400 to-orange-400",
  "Other":               "from-zinc-300 via-zinc-400 to-zinc-500",
};

const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-400 to-purple-600",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[(name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length];
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

function stripeFor(categories: string[]) {
  const first = categories[0];
  return CATEGORY_STRIPES[first] ?? "from-zinc-200 via-zinc-300 to-zinc-400";
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(form: FormData): FormErrors {
  const e: FormErrors = {};
  if (!form.name.trim()) e.name = "Nome é obrigatório.";
  else if (form.name.trim().length < 2) e.name = "Pelo menos 2 caracteres.";
  if (!form.username.trim()) e.username = "Nome de usuário é obrigatório.";
  else if (!/^[a-z0-9_]{3,30}$/.test(form.username)) e.username = "3–30 caracteres · letras minúsculas, números e underscore.";
  if (form.bio.length > BIO_MAX) e.bio = `Máximo de ${BIO_MAX} caracteres.`;
  const le: Record<string, string> = {};
  form.links.forEach((l) => {
    if (l.platform && !l.handle.trim()) le[l.id] = "Handle obrigatório.";
    if (!l.platform && l.handle.trim()) le[l.id] = "Selecione uma plataforma.";
  });
  if (Object.keys(le).length) e.links = le;
  return e;
}

function hasErrors(e: FormErrors) {
  return !!(e.name || e.username || e.bio || (e.links && Object.keys(e.links).length));
}

// ─── Input primitives ─────────────────────────────────────────────────────────

const base = "w-full rounded-xl border bg-white text-[15px] text-zinc-900 placeholder:text-zinc-300 transition-colors duration-150 focus:outline-none";
const ring = (err?: boolean) =>
  err ? "border-rose-300 focus:border-rose-500" : "border-zinc-200 hover:border-zinc-300 focus:border-zinc-900";

function Field({
  label,
  error,
  hint,
  aside,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  aside?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-medium text-zinc-600 tracking-tight">
          {label}
          {required && <span className="text-rose-400 ml-0.5">*</span>}
        </label>
        {aside}
      </div>
      {children}
      {hint && !error && <p className="text-[12px] text-zinc-400">{hint}</p>}
      {error && (
        <p className="flex items-center gap-1 text-[12px] text-rose-500">
          <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" clipRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Image Upload ─────────────────────────────────────────────────────────────

function ImageUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function process(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  if (value) {
    return (
      <div className="flex items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Profile" className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md flex-shrink-0" />
        <div className="space-y-2">
          <button type="button" onClick={() => ref.current?.click()}
            className="block text-[13px] font-medium text-zinc-700 hover:text-zinc-900 transition-colors cursor-pointer">
            Trocar foto
          </button>
          <button type="button" onClick={() => onChange("")}
            className="block text-[13px] text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer">
            Remover
          </button>
        </div>
        <input ref={ref} type="file" accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && process(e.target.files[0])} />
      </div>
    );
  }

  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && process(e.target.files[0])} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) process(f); }}
        className={[
          "w-full border-2 border-dashed rounded-xl py-8 text-center transition-colors cursor-pointer focus:outline-none",
          dragging ? "border-zinc-400 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50",
        ].join(" ")}
      >
        <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-zinc-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-[14px] font-medium text-zinc-600">Clique ou arraste para enviar</p>
        <p className="text-[12px] text-zinc-400 mt-1">PNG, JPG, WEBP · máx 5 MB</p>
      </button>
    </>
  );
}

// ─── Categories Editor ────────────────────────────────────────────────────────

function CategoriesEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");

  function add(tag: string) {
    const t = tag.trim();
    if (!t || value.includes(t) || value.length >= 5) return;
    onChange([...value, t]);
    setInput("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  const available = CATEGORY_SUGGESTIONS.filter((s) => !value.includes(s));

  return (
    <div className="space-y-3">
      {/* Selected tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1.5 text-[12px] font-medium bg-zinc-900 text-white pl-3 pr-2 py-1.5 rounded-full">
              {tag}
              <button type="button" onClick={() => remove(tag)}
                className="w-4 h-4 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Custom input */}
      {value.length < 5 && (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
            if (e.key === "Backspace" && !input && value.length) remove(value[value.length - 1]);
          }}
          placeholder={value.length ? "Adicionar outra…" : "Digite uma categoria e pressione Enter…"}
          className={`${base} ${ring()} px-4 py-3`}
        />
      )}

      {/* Suggestions */}
      {available.length > 0 && value.length < 5 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className="text-[12px] text-zinc-500 bg-zinc-100 hover:bg-zinc-200 hover:text-zinc-700 px-2.5 py-1 rounded-full transition-colors cursor-pointer">
              + {s}
            </button>
          ))}
        </div>
      )}

      <p className="text-[12px] text-zinc-400">{value.length}/5 categorias</p>
    </div>
  );
}

// ─── Social Links Editor ──────────────────────────────────────────────────────

function SocialLinksEditor({
  links, errors, onChange,
}: {
  links: SocialLink[];
  errors?: Record<string, string>;
  onChange: (v: SocialLink[]) => void;
}) {
  const used = links.map((l) => l.platform).filter(Boolean);

  function add() {
    onChange([...links, { id: crypto.randomUUID(), platform: "", handle: "" }]);
  }
  function remove(id: string) { onChange(links.filter((l) => l.id !== id)); }
  function update(id: string, field: "platform" | "handle", value: string) {
    onChange(links.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  return (
    <div className="space-y-3">
      {links.map((link) => {
        const meta = link.platform ? PLATFORM_META[link.platform as PlatformId] : null;
        const error = errors?.[link.id];
        return (
          <div key={link.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              {/* Platform */}
              <div className="relative flex-shrink-0 w-36">
                <select
                  value={link.platform}
                  onChange={(e) => update(link.id, "platform", e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none bg-white text-[14px] text-zinc-900 px-3 py-3 appearance-none pr-8 transition-colors cursor-pointer"
                >
                  <option value="">Plataforma</option>
                  {PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}
                      disabled={used.includes(p.id) && p.id !== link.platform}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Handle */}
              <div className="flex-1 relative">
                {meta?.prefix && (
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-zinc-400 pointer-events-none select-none">
                    {meta.prefix}
                  </span>
                )}
                <input
                  type="text"
                  value={link.handle}
                  onChange={(e) => update(link.id, "handle", e.target.value)}
                  placeholder={
                    link.platform === "website" ? "yoursite.com"
                    : link.platform === "youtube" ? "channel name"
                    : "username"
                  }
                  className={`${base} ${ring(!!error)} py-3 ${meta?.prefix ? "pl-8 pr-4" : "px-4"}`}
                />
              </div>

              {/* Remove */}
              <button type="button" onClick={() => remove(link.id)}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {error && (
              <p className="text-[12px] text-rose-500 pl-[152px]">{error}</p>
            )}
          </div>
        );
      })}

      {links.length < PLATFORMS.length && (
        <button type="button" onClick={add}
          className="flex items-center gap-2 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors group cursor-pointer">
          <span className="w-7 h-7 rounded-lg border-2 border-dashed border-zinc-200 group-hover:border-zinc-400 flex items-center justify-center transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </span>
          Adicionar rede social
        </button>
      )}
    </div>
  );
}

// ─── Social icon (preview only) ───────────────────────────────────────────────

function SocialIcon({ platform }: { platform: string }) {
  const icons: Record<string, React.ReactNode> = {
    instagram: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
    tiktok: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.3 6.3 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z" />
      </svg>
    ),
    youtube: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
    twitter: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    website: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  };
  return <>{icons[platform] ?? null}</>;
}

// ─── Profile Preview ──────────────────────────────────────────────────────────

function completionPct(form: FormData) {
  let score = 0;
  if (form.name.trim().length >= 2) score += 20;
  if (/^[a-z0-9_]{3,30}$/.test(form.username)) score += 20;
  if (form.bio.trim().length > 0) score += 20;
  if (form.imageDataUrl) score += 15;
  if (form.categories.length > 0) score += 10;
  if (form.links.some((l) => l.platform && l.handle)) score += 15;
  return score;
}

function ProfilePreview({ form }: { form: FormData }) {
  const pct = completionPct(form);
  const filledLinks = form.links.filter((l) => l.platform && l.handle.trim());
  const hasName = form.name.trim().length > 0;
  const hasBio  = form.bio.trim().length > 0;

  const checklist = [
    { label: "Nome",           done: form.name.trim().length >= 2 },
    { label: "Usuário",        done: /^[a-z0-9_]{3,30}$/.test(form.username) },
    { label: "Bio",            done: hasBio },
    { label: "Foto de perfil", done: !!form.imageDataUrl },
    { label: "Categoria",      done: form.categories.length > 0 },
    { label: "Rede social",    done: form.links.some((l) => l.platform && l.handle) },
  ];

  return (
    <div className="sticky top-6 space-y-4">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          Prévia
        </p>
        <span className={[
          "text-[11px] font-medium px-2.5 py-0.5 rounded-full",
          pct === 100 ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500",
        ].join(" ")}>
          {pct}% completo
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
        <div className="h-full bg-zinc-900 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }} />
      </div>

      {/* ── Realistic profile preview ── */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">

        {/* Cover gradient */}
        <div className={`h-16 bg-gradient-to-br ${stripeFor(form.categories)} transition-all duration-500`} />

        <div className="px-5 pb-5">
          {/* Avatar — overlaps cover */}
          <div className="-mt-8 mb-3">
            <div className={[
              "w-16 h-16 rounded-full border-[3px] border-white shadow-md overflow-hidden flex items-center justify-center font-bold text-white text-lg",
              form.imageDataUrl ? "" : `bg-gradient-to-br ${avatarGradient(form.name || "u")}`,
            ].join(" ")}>
              {form.imageDataUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={form.imageDataUrl} alt="" className="w-full h-full object-cover" />
                : <span>{initials(form.name)}</span>
              }
            </div>
          </div>

          {/* Identity */}
          <div className="mb-4 space-y-1">
            <p className={`text-[15px] font-semibold leading-snug ${hasName ? "text-zinc-900" : "text-zinc-300"}`}>
              {form.name.trim() || "Seu Nome"}
            </p>
            <p className={`text-[12px] font-mono ${form.username ? "text-zinc-400" : "text-zinc-200"}`}>
              @{form.username || "username"}
            </p>
            {form.categories.length > 0 && (
              <span className="inline-block text-[11px] font-medium bg-zinc-100 text-zinc-500 px-2.5 py-0.5 rounded-full mt-0.5">
                {form.categories[0]}
              </span>
            )}
          </div>

          {/* Bio */}
          <div className="pt-3 border-t border-zinc-50 mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5">Sobre</p>
            <p className={`text-[12px] leading-relaxed line-clamp-3 ${hasBio ? "text-zinc-500" : "text-zinc-300 italic"}`}>
              {form.bio.trim() || "Sua bio aparecerá aqui…"}
            </p>
          </div>

          {/* All categories */}
          {form.categories.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Categorias</p>
              <div className="flex flex-wrap gap-1.5">
                {form.categories.map((c) => (
                  <span key={c} className="text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-2.5 py-1 rounded-full transition-colors">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Social links */}
          {filledLinks.length > 0 && (
            <div className="mb-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">Redes Sociais</p>
              <div className="space-y-1.5">
                {filledLinks.map((l) => {
                  const meta = PLATFORM_META[l.platform as PlatformId];
                  return (
                    <div key={l.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-zinc-100 bg-zinc-50/60">
                      <div className="w-7 h-7 rounded-lg bg-white border border-zinc-100 flex items-center justify-center text-zinc-500 flex-shrink-0">
                        <SocialIcon platform={l.platform} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-zinc-400 leading-none mb-0.5">{meta.label}</p>
                        <p className="text-[12px] font-medium text-zinc-800 truncate">
                          {meta.prefix}{l.handle}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex gap-2">
            <div className="flex-1 bg-zinc-900 text-white text-[12px] font-medium py-2.5 rounded-xl flex items-center justify-center gap-1.5 opacity-50 select-none">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Contratar
            </div>
            <div className="flex-1 border border-zinc-200 text-zinc-400 text-[12px] font-medium py-2.5 rounded-xl flex items-center justify-center gap-1.5 opacity-50 select-none">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Salvar
            </div>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] px-4 py-4 space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">
          Checklist de Perfil
        </p>
        {checklist.map(({ label, done }) => (
          <div key={label} className="flex items-center gap-2.5">
            <div className={[
              "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300",
              done ? "bg-emerald-500" : "bg-zinc-100",
            ].join(" ")}>
              {done && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className={`text-[13px] transition-colors duration-300 ${done ? "text-zinc-600" : "text-zinc-400"}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ name }: { name: string }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-30" />
          <div className="relative w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 tracking-tight">Perfil salvo!</h2>
        <p className="text-[14px] text-zinc-500 mt-2 leading-relaxed">
          <span className="font-medium text-zinc-700">{name}</span> agora está visível para agências.
        </p>
        <p className="text-[12px] text-zinc-400 mt-6 flex items-center justify-center gap-1.5">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Redirecionando para o perfil…
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const INITIAL: FormData = {
  name: "", username: "", bio: "", imageDataUrl: "", categories: [], links: [],
};

const card = "bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-7 space-y-7";

export default function TalentProfileForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(INITIAL);
  const [touched, setTouched] = useState<Touched>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const errors = validate(form);

  const set = useCallback(<K extends keyof FormData>(k: K, v: FormData[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
  }, []);

  function touch(k: keyof Touched) { setTouched((p) => ({ ...p, [k]: true })); }
  function err(k: keyof Touched) { return (submitAttempted || touched[k]) ? errors[k] : undefined; }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    if (hasErrors(errors)) return;
    setSubmitted(true);
    setTimeout(() => router.push(`/talent/profile/${form.username}`), 1800);
  }

  if (submitted) return <SuccessScreen name={form.name} />;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Crie seu perfil
          </h1>
          <p className="text-[14px] text-zinc-400 mt-1">
            Preencha seus dados para ser descoberto por agências.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* ── Form — 3 cols ── */}
          <form onSubmit={handleSubmit} noValidate className="lg:col-span-3 space-y-4">

            {/* Basic info */}
            <div className={card}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                Informações Básicas
              </p>

              <Field label="Nome Completo" error={err("name")} required>
                <input type="text" value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  onBlur={() => touch("name")}
                  placeholder="Sofia Mendes"
                  className={`${base} ${ring(!!err("name"))} px-4 py-3`}
                />
              </Field>

              <Field
                label="Nome de Usuário"
                error={err("username")}
                hint={`brisadigital.com/talent/profile/${form.username || "usuario"}`}
                required
              >
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-zinc-400 pointer-events-none select-none">@</span>
                  <input type="text" value={form.username}
                    onChange={(e) => set("username", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    onBlur={() => touch("username")}
                    placeholder="sofiam"
                    className={`${base} ${ring(!!err("username"))} pl-8 pr-4 py-3`}
                  />
                </div>
              </Field>

              <Field
                label="Bio"
                error={err("bio")}
                aside={
                  <span className={`text-[12px] tabular-nums ${form.bio.length > BIO_MAX ? "text-rose-400 font-medium" : "text-zinc-400"}`}>
                    {form.bio.length}/{BIO_MAX}
                  </span>
                }
              >
                <textarea
                  value={form.bio}
                  onChange={(e) => set("bio", e.target.value)}
                  onBlur={() => touch("bio")}
                  placeholder="Conte às agências sobre você e o que você cria…"
                  rows={4}
                  className={`${base} ${ring(!!err("bio"))} px-4 py-3 resize-none leading-relaxed`}
                />
              </Field>
            </div>

            {/* Profile photo */}
            <div className={card}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                Foto de Perfil
              </p>
              <p className="text-[13px] text-zinc-400 leading-relaxed -mt-4">
                Exibida no perfil e nos cards de talento. Imagens quadradas funcionam melhor.
              </p>
              <ImageUpload value={form.imageDataUrl} onChange={(v) => set("imageDataUrl", v)} />
            </div>

            {/* Categories */}
            <div className={card}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                Categorias
              </p>
              <p className="text-[13px] text-zinc-400 leading-relaxed -mt-4">
                Escolha até 5 categorias. Isso ajuda as agências a encontrarem o talento certo.
              </p>
              <CategoriesEditor value={form.categories} onChange={(v) => set("categories", v)} />
            </div>

            {/* Social links */}
            <div className={card}>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                Redes Sociais
              </p>
              <p className="text-[13px] text-zinc-400 leading-relaxed -mt-4">
                Adicione suas plataformas. Pelo menos uma rede social é recomendada.
              </p>
              <SocialLinksEditor
                links={form.links}
                errors={submitAttempted ? errors.links : undefined}
                onChange={(v) => set("links", v)}
              />
            </div>

            {/* Submit */}
            <div className="space-y-3 pt-1">
              {submitAttempted && hasErrors(errors) && (
                <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" clipRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" />
                  </svg>
                  <p className="text-[13px] text-rose-600">Corrija os campos destacados antes de salvar.</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button type="submit"
                  className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-white text-[15px] font-medium px-7 py-3 rounded-xl transition-all duration-150 cursor-pointer">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 13l4 4L19 7" />
                  </svg>
                  Salvar Perfil
                </button>
                <button type="button" onClick={() => setForm(INITIAL)}
                  className="text-[15px] font-medium text-zinc-400 hover:text-zinc-700 px-4 py-3 rounded-xl hover:bg-zinc-50 transition-all duration-150 cursor-pointer">
                  Limpar
                </button>
              </div>
            </div>
          </form>

          {/* ── Preview — 2 cols ── */}
          <div className="lg:col-span-2">
            <ProfilePreview form={form} />
          </div>
        </div>
      </div>
    </div>
  );
}
