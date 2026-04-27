"use client";

import Link from "next/link";
import { useState } from "react";
import { useSubscription } from "@/lib/SubscriptionContext";
import { talentCategoryLabel } from "@/lib/talentCategories";

type TalentRow = {
  id: string;
  full_name: string | null;
  bio: string | null;
  country: string | null;
  city: string | null;
  categories: string[] | null;
  avatar_url: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  twitter: string | null;
  website: string | null;
  phone: string | null;
  gender: string | null;
  age: number | null;
  photo_front_url?: string | null;
  photo_left_url?: string | null;
  photo_right_url?: string | null;
};

type Job = { id: string; title: string };

const GRADIENTS = [
  "from-violet-500 to-indigo-600", "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500", "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
];

function avatarGradient(name: string) {
  return GRADIENTS[(name.charCodeAt(0) ?? 0) % GRADIENTS.length];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function AgencyTalentProfile({
  talent,
  jobs,
  appliedJobIds = [],
}: {
  talent: TalentRow | null;
  jobs: Job[];
  appliedJobIds?: string[];
}) {
  const { isActive } = useSubscription();
  const [selectedJob, setSelectedJob] = useState("");
  const [attaching, setAttaching]     = useState(false);
  const [attached, setAttached]       = useState(false);
  const [attachError, setAttachError] = useState("");
  const [showJobDropdown, setShowJobDropdown] = useState(false);

  if (!talent) {
    return (
      <div className="max-w-md mx-auto pt-20 text-center">
        <p className="text-[15px] font-medium text-zinc-700">Talento não encontrado</p>
        <Link href="/agency/talent" className="text-[13px] text-zinc-400 hover:text-zinc-700 mt-3 inline-block transition-colors">
          ← Voltar para Talentos
        </Link>
      </div>
    );
  }

  const name  = talent.full_name ?? "Sem nome";
  const photos = [
    talent.photo_front_url,
    talent.photo_left_url,
    talent.photo_right_url,
    talent.avatar_url,
  ].filter((p): p is string => !!p);

  async function handleAttach() {
    if (!talent || !selectedJob) return;
    setAttaching(true);
    setAttachError("");

    const res = await fetch("/api/jobs/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: selectedJob, talent_ids: [talent.id] }),
    });

    setAttaching(false);

    if (res.ok) {
      setAttached(true);
      setShowJobDropdown(false);
    } else {
      const d = await res.json().catch(() => ({}));
      setAttachError(d.error ?? "Falha ao enviar convite");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">

      {/* Back */}
      <Link
        href="/agency/talent"
        className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Todos os Talentos
      </Link>

      {/* Hero card */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className={`h-[3px] bg-gradient-to-r ${avatarGradient(name)}`} />
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-start gap-6">

          {/* Avatar */}
          <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0">
            {talent.avatar_url ? (
              <img src={talent.avatar_url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-[28px] font-bold text-white`}>
                {initials(name)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-[1.5rem] font-semibold tracking-tight text-zinc-900 leading-tight mb-1">
              {name}
            </h1>
            {(talent.city || talent.country) && (
              <p className="text-[13px] text-zinc-400 mb-3">
                <svg className="inline w-3.5 h-3.5 mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {[talent.city, talent.country].filter(Boolean).join(", ")}
              </p>
            )}
            {talent.bio && (
              <p className="text-[14px] text-zinc-600 leading-relaxed mb-4">{talent.bio}</p>
            )}
            {talent.categories?.length && (
              <div className="flex flex-wrap gap-1.5">
                {talent.categories.map((c) => (
                  <span key={c} className="text-[11px] font-medium bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-full">
                    {talentCategoryLabel(c)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Social links */}
        {(talent.instagram || talent.tiktok || talent.youtube || talent.twitter || talent.website) && (
          <div className="px-6 sm:px-8 pb-6 flex flex-wrap gap-3">
            {talent.instagram && (
              <a href={`https://instagram.com/${talent.instagram}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                @{talent.instagram}
              </a>
            )}
            {talent.tiktok && (
              <a href={`https://tiktok.com/@${talent.tiktok}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.73a8.19 8.19 0 004.79 1.53V6.79a4.86 4.86 0 01-1.02-.1z"/>
                </svg>
                @{talent.tiktok}
              </a>
            )}
            {talent.youtube && (
              <a href={talent.youtube.startsWith("http") ? talent.youtube : `https://youtube.com/@${talent.youtube}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                YouTube
              </a>
            )}
            {talent.twitter && (
              <a href={`https://x.com/${talent.twitter}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                @{talent.twitter}
              </a>
            )}
            {talent.website && (
              <a href={talent.website.startsWith("http") ? talent.website : `https://${talent.website}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Website
              </a>
            )}
          </div>
        )}
      </div>

      {/* Photos grid */}
      {photos.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Fotos</p>
          <div className="grid grid-cols-3 gap-3">
            {photos.map((url, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl overflow-hidden bg-zinc-100">
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!isActive ? (
          /* Subscription inactive — replace all actions */
          <Link
            href="/agency/finances"
            className="flex-1 flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white text-[14px] font-semibold py-3 rounded-xl transition-colors cursor-pointer"
          >
            Reativar Assinatura
          </Link>
        ) : (
          /* Attach to Job */
          <div className="flex-1">
            {attached ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-[13px] text-emerald-700 font-medium">Convite enviado ao talento</p>
              </div>
            ) : showJobDropdown ? (
              <div className="space-y-2">
                <select
                  value={selectedJob}
                  onChange={(e) => setSelectedJob(e.target.value)}
                  className="w-full px-4 py-3 text-[13px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors bg-white"
                >
                  <option value="">Selecione uma vaga…</option>
                  {jobs.filter((j) => !appliedJobIds.includes(j.id)).map((j) => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleAttach}
                    disabled={!selectedJob || attaching}
                    className="flex-1 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    {attaching ? "Anexando…" : "Confirmar"}
                  </button>
                  <button
                    onClick={() => { setShowJobDropdown(false); setSelectedJob(""); }}
                    className="px-4 py-2.5 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 text-[13px] font-medium rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
                {attachError && (
                  <p className="text-[12px] text-rose-500">{attachError}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowJobDropdown(true)}
                disabled={jobs.filter((j) => !appliedJobIds.includes(j.id)).length === 0}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3 rounded-xl transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {jobs.filter((j) => !appliedJobIds.includes(j.id)).length === 0 ? "Já candidatado a todas as vagas" : "Adicionar à Vaga"}
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

