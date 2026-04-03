"use client";

import Link from "next/link";

type TalentProfile = {
  id: string;
  full_name: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  categories: string[] | null;
  avatar_url: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  gender: string | null;
  age: number | null;
  photo_front_url: string | null;
  photo_left_url: string | null;
  photo_right_url: string | null;
};

const GRADIENTS = [
  "from-violet-500 to-indigo-600", "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",      "from-fuchsia-400 to-purple-600",
];

function avatarGradient(name: string) {
  return GRADIENTS[(name.charCodeAt(0) ?? 0) % GRADIENTS.length];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const card = "bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]";

export default function TalentProfilePreview({ talent }: { talent: TalentProfile }) {
  const name   = talent.full_name ?? "Unknown";
  const photos = [talent.photo_front_url, talent.photo_left_url, talent.photo_right_url, talent.avatar_url]
    .filter((p): p is string => !!p);

  return (
    <div className="min-h-screen bg-zinc-50">

      {/* Top nav */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-zinc-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/agency/talent"
            className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Talent Roster
          </Link>
          <span className="text-[13px] font-semibold tracking-tight text-zinc-900">ucastanet</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">

        {/* Hero card */}
        <div className={`${card} overflow-hidden`}>
          <div className={`h-[3px] bg-gradient-to-r ${avatarGradient(name)}`} />

          <div className="p-7 space-y-6">
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              {/* Avatar */}
              <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                {talent.avatar_url ? (
                  <img src={talent.avatar_url} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-[1.5rem] font-bold text-white`}>
                    {initials(name)}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <h1 className="text-[1.375rem] font-semibold tracking-tight text-zinc-900">{name}</h1>
                {(talent.city || talent.country) && (
                  <p className="text-[13px] text-zinc-400 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {[talent.city, talent.country].filter(Boolean).join(", ")}
                  </p>
                )}
                {(talent.gender || talent.age) && (
                  <p className="text-[13px] text-zinc-400">
                    {[talent.gender, talent.age ? `Age ${talent.age}` : null].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>

            {/* Bio */}
            {talent.bio && (
              <div className="pt-5 border-t border-zinc-50">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">About</p>
                <p className="text-[15px] text-zinc-600 leading-relaxed">{talent.bio}</p>
              </div>
            )}
          </div>
        </div>

        {/* Categories */}
        {talent.categories && talent.categories.length > 0 && (
          <div className={`${card} p-6`}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">Categories</p>
            <div className="flex flex-wrap gap-2">
              {talent.categories.map((c) => (
                <span key={c} className="text-[13px] font-medium bg-zinc-100 text-zinc-600 px-3.5 py-1.5 rounded-full">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Social profiles */}
        {(talent.instagram || talent.tiktok || talent.youtube) && (
          <div className={`${card} p-6`}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">Social Profiles</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {talent.instagram && (
                <a href={`https://instagram.com/${talent.instagram}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 transition-colors group">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 group-hover:bg-zinc-200 flex items-center justify-center text-zinc-500 flex-shrink-0 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Instagram</p>
                    <p className="text-[13px] font-medium text-zinc-800 truncate mt-0.5">@{talent.instagram}</p>
                  </div>
                </a>
              )}
              {talent.tiktok && (
                <a href={`https://tiktok.com/@${talent.tiktok}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 transition-colors group">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 group-hover:bg-zinc-200 flex items-center justify-center text-zinc-500 flex-shrink-0 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.73a8.19 8.19 0 004.79 1.53V6.79a4.86 4.86 0 01-1.02-.1z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">TikTok</p>
                    <p className="text-[13px] font-medium text-zinc-800 truncate mt-0.5">@{talent.tiktok}</p>
                  </div>
                </a>
              )}
              {talent.youtube && (
                <a href={talent.youtube.startsWith("http") ? talent.youtube : `https://youtube.com/@${talent.youtube}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 transition-colors group">
                  <div className="w-9 h-9 rounded-xl bg-zinc-100 group-hover:bg-zinc-200 flex items-center justify-center text-zinc-500 flex-shrink-0 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">YouTube</p>
                    <p className="text-[13px] font-medium text-zinc-800 truncate mt-0.5">{talent.youtube}</p>
                  </div>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div className={`${card} p-6`}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">Photos</p>
            <div className="grid grid-cols-3 gap-3">
              {photos.map((url, i) => (
                <div key={i} className="aspect-[3/4] rounded-xl overflow-hidden bg-zinc-100">
                  <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
