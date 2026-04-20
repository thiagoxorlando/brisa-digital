"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export type TalentJobDetailProps = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  deadline: string;
  agencyName: string;
  location: string;
  gender: string;
  ageMin: number | null;
  ageMax: number | null;
  applicationRequirements?: string[];
};

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const CATEGORY_STRIPES: Record<string, string> = {
  "Lifestyle & Fashion": "from-rose-400 to-pink-500",
  "Technology":          "from-sky-400 to-blue-500",
  "Food & Cooking":      "from-amber-400 to-orange-500",
  "Health & Fitness":    "from-emerald-400 to-teal-500",
  "Travel":              "from-indigo-400 to-violet-500",
  "Beauty":              "from-fuchsia-400 to-pink-500",
};

function stripe(cat: string) {
  return CATEGORY_STRIPES[cat] ?? "from-zinc-300 to-zinc-400";
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PhotoSet = {
  front: File | null;
  left:  File | null;
  right: File | null;
};

// ── Photo slot ────────────────────────────────────────────────────────────────

function PhotoSlot({
  label, hint, file, onChange,
}: {
  label: string;
  hint: string;
  file: File | null;
  onChange: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const preview = file ? URL.createObjectURL(file) : null;

  return (
    <div>
      <div
        onClick={() => ref.current?.click()}
        className={[
          "aspect-[3/4] rounded-xl border-2 border-dashed cursor-pointer transition-colors overflow-hidden",
          "flex flex-col items-center justify-center bg-zinc-50",
          file
            ? "border-emerald-300 hover:border-emerald-400"
            : "border-zinc-200 hover:border-zinc-400",
        ].join(" ")}
      >
        {preview ? (
          <img src={preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="text-center px-2">
            <svg className="w-6 h-6 text-zinc-300 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-[10px] text-zinc-400 leading-tight">Clique para enviar</p>
          </div>
        )}
      </div>
      <div className="mt-1.5 text-center">
        <p className="text-[11px] font-semibold text-zinc-700">{label}</p>
        <p className="text-[10px] text-zinc-400 leading-tight">{hint}</p>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onChange(e.target.files[0]); }}
      />
    </div>
  );
}

// ── Photo step ────────────────────────────────────────────────────────────────

function PhotoStep({
  photos,
  onChange,
  onNext,
  stepLabel,
  nextLabel,
}: {
  photos: PhotoSet;
  onChange: (key: keyof PhotoSet, file: File) => void;
  onNext: () => void;
  stepLabel: string;
  nextLabel: string;
}) {
  const slots: { key: keyof PhotoSet; label: string; hint: string }[] = [
    { key: "front", label: "Frente",          hint: "Olhe para frente, expressão neutra" },
    { key: "left",  label: "Perfil Esquerdo", hint: "Vire a cabeça para a esquerda" },
    { key: "right", label: "Perfil Direito",  hint: "Vire a cabeça para a direita" },
  ];

  const allUploaded = slots.every(({ key }) => photos[key] !== null);
  const uploadedCount = slots.filter(({ key }) => photos[key] !== null).length;

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{stepLabel}</p>
          <h2 className="text-[1.1rem] font-semibold tracking-tight text-zinc-900">Enviar 3 Fotos</h2>
          <p className="text-[13px] text-zinc-400 mt-0.5">Vista frontal, perfil esquerdo e perfil direito.</p>
        </div>
        <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
          allUploaded ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
        }`}>
          {uploadedCount}/3
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {slots.map(({ key, label, hint }) => (
          <PhotoSlot
            key={key}
            label={label}
            hint={hint}
            file={photos[key]}
            onChange={(f) => onChange(key, f)}
          />
        ))}
      </div>

      {!allUploaded && (
        <p className="text-[12px] text-zinc-400 text-center">
          Envie as 3 fotos para continuar · JPG, PNG ou WebP
        </p>
      )}

      <button
        onClick={onNext}
        disabled={!allUploaded}
        className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
      >
        {nextLabel}
      </button>
    </div>
  );
}

// ── Video step ────────────────────────────────────────────────────────────────

function VideoStep({
  video,
  onVideoChange,
  onBack,
  onNext,
  submitting,
  uploadProgress,
  stepLabel,
  nextLabel,
}: {
  video: File | null;
  onVideoChange: (f: File) => void;
  onBack: () => void;
  onNext: () => void;
  submitting: boolean;
  uploadProgress: string;
  stepLabel: string;
  nextLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const videoUrl = video ? URL.createObjectURL(video) : null;

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{stepLabel}</p>
        <h2 className="text-[1.1rem] font-semibold tracking-tight text-zinc-900">Enviar Vídeo de Apresentação</h2>
        <p className="text-[13px] text-zinc-400 mt-0.5">30–60 segundos. Apresente-se e diga por que seria uma ótima escolha.</p>
      </div>

      <div
        onClick={() => !submitting && ref.current?.click()}
        className={[
          "w-full aspect-video rounded-xl border-2 border-dashed transition-colors overflow-hidden",
          "flex items-center justify-center",
          submitting ? "cursor-not-allowed bg-zinc-50" :
            video ? "border-emerald-300 hover:border-emerald-400 bg-zinc-50 cursor-pointer"
                  : "border-zinc-200 hover:border-zinc-400 bg-zinc-50 cursor-pointer",
        ].join(" ")}
      >
        {videoUrl ? (
          <video src={videoUrl} controls className="w-full h-full" />
        ) : (
          <div className="text-center px-4">
            <svg className="w-10 h-10 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <p className="text-[13px] font-medium text-zinc-500">Clique para enviar vídeo</p>
            <p className="text-[11px] text-zinc-400 mt-1">MP4, MOV · máx 500 MB</p>
          </div>
        )}
      </div>

      {video && !submitting && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
          <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-[12px] text-emerald-700 font-medium truncate">{video.name}</p>
          <p className="text-[11px] text-emerald-600 flex-shrink-0">
            {(video.size / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>
      )}

      <input
        ref={ref}
        type="file"
        accept="video/mp4,video/quicktime,video/*"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onVideoChange(e.target.files[0]); }}
      />

      {submitting && (
        <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3.5">
          <svg className="w-4 h-4 text-zinc-500 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-[13px] text-zinc-600 font-medium">{uploadProgress || "Preparando envio…"}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={submitting}
          className="flex-1 bg-white border border-zinc-200 hover:border-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-700 text-[14px] font-semibold py-3.5 rounded-xl transition-colors cursor-pointer"
        >
          ← Voltar
        </button>
        <button
          onClick={onNext}
          disabled={!video || submitting}
          className="flex-2 flex-1 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
        >
          {submitting ? "Enviando…" : nextLabel}
        </button>
      </div>
    </div>
  );
}

// ── Curriculum step ───────────────────────────────────────────────────────────

function CurriculumStep({
  file, onFileChange, onBack, onNext, submitting, uploadProgress, stepLabel, nextLabel,
}: {
  file: File | null;
  onFileChange: (f: File) => void;
  onBack: () => void;
  onNext: () => void;
  submitting: boolean;
  uploadProgress: string;
  stepLabel: string;
  nextLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{stepLabel}</p>
        <h2 className="text-[1.1rem] font-semibold tracking-tight text-zinc-900">Enviar Currículo</h2>
        <p className="text-[13px] text-zinc-400 mt-0.5">PDF, DOC ou DOCX · máx 10 MB.</p>
      </div>
      <div
        onClick={() => !submitting && ref.current?.click()}
        className={[
          "w-full rounded-xl border-2 border-dashed transition-colors p-8 flex flex-col items-center justify-center",
          submitting ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          file ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 hover:border-zinc-400 bg-zinc-50",
        ].join(" ")}
      >
        {file ? (
          <div className="text-center">
            <svg className="w-8 h-8 text-emerald-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[13px] font-medium text-emerald-700 truncate max-w-[200px]">{file.name}</p>
            <p className="text-[11px] text-emerald-600">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        ) : (
          <div className="text-center">
            <svg className="w-8 h-8 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-[13px] font-medium text-zinc-500">Clique para enviar currículo</p>
          </div>
        )}
        <input ref={ref} type="file" accept=".pdf,.doc,.docx" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) onFileChange(e.target.files[0]); }} />
      </div>
      {submitting && uploadProgress && (
        <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3.5">
          <svg className="w-4 h-4 text-zinc-500 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-[13px] text-zinc-600 font-medium">{uploadProgress}</p>
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={onBack} disabled={submitting}
          className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer disabled:opacity-50">
          ← Voltar
        </button>
        <button onClick={onNext} disabled={!file || submitting}
          className="flex-1 py-2.5 text-[13px] font-semibold bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white rounded-xl transition-colors cursor-pointer">
          {submitting ? "Enviando…" : nextLabel}
        </button>
      </div>
    </div>
  );
}

// ── Portfolio step ────────────────────────────────────────────────────────────

function PortfolioStep({
  file, onFileChange, onBack, onNext, submitting, uploadProgress, stepLabel, nextLabel,
}: {
  file: File | null;
  onFileChange: (f: File) => void;
  onBack: () => void;
  onNext: () => void;
  submitting: boolean;
  uploadProgress: string;
  stepLabel: string;
  nextLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{stepLabel}</p>
        <h2 className="text-[1.1rem] font-semibold tracking-tight text-zinc-900">Enviar Portfólio</h2>
        <p className="text-[13px] text-zinc-400 mt-0.5">PDF, imagem ou documento · máx 20 MB.</p>
      </div>
      <div
        onClick={() => !submitting && ref.current?.click()}
        className={[
          "w-full rounded-xl border-2 border-dashed transition-colors p-8 flex flex-col items-center justify-center",
          submitting ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          file ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 hover:border-zinc-400 bg-zinc-50",
        ].join(" ")}
      >
        {file ? (
          <div className="text-center">
            <svg className="w-8 h-8 text-emerald-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[13px] font-medium text-emerald-700 truncate max-w-[200px]">{file.name}</p>
            <p className="text-[11px] text-emerald-600">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        ) : (
          <div className="text-center">
            <svg className="w-8 h-8 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-[13px] font-medium text-zinc-500">Clique para enviar portfólio</p>
          </div>
        )}
        <input ref={ref} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) onFileChange(e.target.files[0]); }} />
      </div>
      {submitting && uploadProgress && (
        <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3.5">
          <svg className="w-4 h-4 text-zinc-500 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-[13px] text-zinc-600 font-medium">{uploadProgress}</p>
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={onBack} disabled={submitting}
          className="flex-1 py-2.5 text-[13px] font-medium border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer disabled:opacity-50">
          ← Voltar
        </button>
        <button onClick={onNext} disabled={!file || submitting}
          className="flex-1 py-2.5 text-[13px] font-semibold bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white rounded-xl transition-colors cursor-pointer">
          {submitting ? "Enviando…" : nextLabel}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ReferralForm = { name: string; email: string; bio: string };

function ReferralModal({
  jobId, onClose, onDone,
}: {
  jobId: string; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm]         = useState<ReferralForm>({ name: "", email: "", bio: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError("Nome e email são obrigatórios.");
      return;
    }
    setSubmitting(true);
    setError("");
    const { data: { user } } = await (await import("@/lib/supabase")).supabase.auth.getUser();
    if (!user?.id) { setError("Não autenticado."); setSubmitting(false); return; }

    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id:      jobId,
        talent_name: form.name.trim(),
        email:       form.email.trim(),
        bio:         form.bio.trim() || null,
        mode:        "referral",
        referrer_id: user.id,
      }),
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Falha na indicação. Tente novamente.");
      setSubmitting(false);
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_8px_48px_rgba(0,0,0,0.12)] w-full max-w-md">
        <div className="p-6 border-b border-zinc-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[1rem] font-semibold text-zinc-900">Indicar um Talento</h2>
              <p className="text-[13px] text-zinc-400 mt-0.5">
                Você ganha 2% se eles forem reservados.
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Nome Completo *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full px-4 py-2.5 text-[13px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@example.com"
              className="w-full px-4 py-2.5 text-[13px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-zinc-600 mb-1.5">Por que seriam uma boa escolha? (opcional)</label>
            <textarea
              rows={3}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="Conte-nos um pouco sobre esta pessoa…"
              className="w-full px-4 py-2.5 text-[13px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none transition-colors resize-none"
            />
          </div>

          {error && (
            <p className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 text-[13px] font-medium py-2.5 rounded-xl transition-colors cursor-pointer">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-[13px] font-medium py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed">
              {submitting ? "Enviando…" : "Enviar Indicação"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type StepId = "info" | "photos" | "video" | "curriculum" | "portfolio" | "done" | "referral_done";

const ALL_STEP_ORDER = ["photos", "video", "curriculum", "portfolio"] as const;
type ActiveStep = typeof ALL_STEP_ORDER[number];

const STEP_CHECKLIST: Record<ActiveStep, string[]> = {
  photos:     ["Foto — vista frontal", "Foto — perfil esquerdo", "Foto — perfil direito"],
  video:      ["Vídeo de apresentação (30–60 segundos)"],
  curriculum: ["Currículo (PDF ou DOC)"],
  portfolio:  ["Portfólio (PDF ou imagens)"],
};

const STEP_NEXT_LABELS: Record<ActiveStep, string> = {
  photos:     "Próximo: Vídeo →",
  video:      "Próximo: Currículo →",
  curriculum: "Próximo: Portfólio →",
  portfolio:  "Enviar Candidatura",
};

export default function TalentJobDetail({
  job,
  talentGender = null,
  talentAge = null,
}: {
  job: TalentJobDetailProps | null;
  talentGender?: string | null;
  talentAge?: number | null;
}) {
  const router = useRouter();
  const [step, setStep]             = useState<StepId>("info");
  const [showReferral, setShowReferral] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError]           = useState("");
  const [photos, setPhotos]         = useState<PhotoSet>({ front: null, left: null, right: null });
  const [video, setVideo]           = useState<File | null>(null);
  const [curriculum, setCurriculum] = useState<File | null>(null);
  const [portfolio, setPortfolio]   = useState<File | null>(null);

  if (!job) {
    return (
      <div className="max-w-sm mx-auto pt-20 text-center">
        <p className="text-[15px] font-medium text-zinc-700">Vaga não encontrada</p>
        <Link href="/talent/jobs" className="text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors mt-3 inline-block">
          ← Voltar para Vagas
        </Link>
      </div>
    );
  }

  // Compute ordered active steps from job requirements (default to photos + video)
  const activeReqs = job.applicationRequirements && job.applicationRequirements.length > 0
    ? job.applicationRequirements
    : ["photos", "video"];
  const orderedSteps = ALL_STEP_ORDER.filter((s) => activeReqs.includes(s));

  const getStepLabel = (s: ActiveStep) => {
    const idx = orderedSteps.indexOf(s);
    return `Etapa ${idx + 1} de ${orderedSteps.length}`;
  };

  const getNextStepId = (s: ActiveStep): StepId => {
    const idx = orderedSteps.indexOf(s);
    return (orderedSteps[idx + 1] ?? "done") as StepId;
  };

  const getPrevStepId = (s: ActiveStep): StepId => {
    const idx = orderedSteps.indexOf(s);
    return (idx <= 0 ? "info" : orderedSteps[idx - 1]) as StepId;
  };

  const isLastStep = (s: ActiveStep) => orderedSteps[orderedSteps.length - 1] === s;

  const getNextLabel = (s: ActiveStep): string => {
    if (isLastStep(s)) return "Enviar Candidatura";
    const nextS = orderedSteps[orderedSteps.indexOf(s) + 1];
    const labelMap: Record<ActiveStep, string> = {
      photos:     "Próximo: Fotos →",
      video:      "Próximo: Vídeo →",
      curriculum: "Próximo: Currículo →",
      portfolio:  "Próximo: Portfólio →",
    };
    return labelMap[nextS] ?? "Próximo →";
  };

  async function uploadFile(file: File, path: string): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    form.append("path", path);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "Upload failed");
    }
    const { url } = await res.json();
    return url;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    try {
      const uid = user.id;
      const ts  = Date.now();
      const payload: Record<string, string | null> = {
        job_id:      job.id,
        talent_id:   uid,
        email:       user.email ?? "",
        bio:         "",
        mode:        "self",
        referrer_id: null,
      };

      let fileNum = 0;
      const totalFiles =
        (orderedSteps.includes("photos") ? 3 : 0) +
        (orderedSteps.includes("video") ? 1 : 0) +
        (orderedSteps.includes("curriculum") ? 1 : 0) +
        (orderedSteps.includes("portfolio") ? 1 : 0);

      if (orderedSteps.includes("photos")) {
        setUploadProgress(`Enviando foto 1 de ${totalFiles}…`);
        payload.photo_front_url = await uploadFile(photos.front!, `submissions/${uid}/${ts}_front.jpg`);
        fileNum++;
        setUploadProgress(`Enviando foto 2 de ${totalFiles}…`);
        payload.photo_left_url = await uploadFile(photos.left!, `submissions/${uid}/${ts}_left.jpg`);
        fileNum++;
        setUploadProgress(`Enviando foto 3 de ${totalFiles}…`);
        payload.photo_right_url = await uploadFile(photos.right!, `submissions/${uid}/${ts}_right.jpg`);
        fileNum++;
      }

      if (orderedSteps.includes("video")) {
        fileNum++;
        setUploadProgress(`Enviando vídeo (${fileNum} de ${totalFiles})…`);
        payload.video_url = await uploadFile(video!, `submissions/${uid}/${ts}_intro.mp4`);
      }

      if (orderedSteps.includes("curriculum")) {
        fileNum++;
        setUploadProgress(`Enviando currículo (${fileNum} de ${totalFiles})…`);
        payload.curriculum_url = await uploadFile(curriculum!, `submissions/${uid}/${ts}_curriculum.pdf`);
      }

      if (orderedSteps.includes("portfolio")) {
        fileNum++;
        setUploadProgress(`Enviando portfólio (${fileNum} de ${totalFiles})…`);
        payload.portfolio_url = await uploadFile(portfolio!, `submissions/${uid}/${ts}_portfolio.pdf`);
      }

      setUploadProgress("Salvando candidatura…");

      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Submission failed");
      }

      setStep("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Algo deu errado. Tente novamente.");
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  }

  if (step === "referral_done") {
    return (
      <div className="max-w-sm mx-auto pt-20 text-center">
        <div className="w-14 h-14 rounded-full bg-violet-500 flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-[1.25rem] font-semibold tracking-tight text-zinc-900 mb-2">Indicação enviada!</h2>
        <p className="text-[14px] text-zinc-400 mb-7">
          Você ganhará <strong className="text-zinc-700">2%</strong> se eles forem reservados para{" "}
          <span className="font-medium text-zinc-700">"{job!.title}"</span>.
        </p>
        <Link
          href="/talent/dashboard"
          className="inline-flex items-center justify-center gap-2 bg-zinc-900 text-white text-[13px] font-medium px-5 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors"
        >
          Ir para o Painel
        </Link>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="max-w-sm mx-auto pt-20 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-[1.25rem] font-semibold tracking-tight text-zinc-900 mb-2">Candidatura enviada!</h2>
        <p className="text-[14px] text-zinc-400 mb-7">
          Sua candidatura para <span className="font-medium text-zinc-700">"{job.title}"</span> está em análise.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/talent/jobs"
            className="inline-flex items-center justify-center gap-2 bg-zinc-900 text-white text-[13px] font-medium px-5 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            Ver mais vagas
          </Link>
          <Link
            href="/talent/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-white border border-zinc-200 text-zinc-700 text-[13px] font-medium px-5 py-2.5 rounded-xl hover:border-zinc-300 transition-colors"
          >
            Ir para o Painel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      {showReferral && job && (
        <ReferralModal
          jobId={job.id}
          onClose={() => setShowReferral(false)}
          onDone={() => { setShowReferral(false); setStep("referral_done"); }}
        />
      )}

      {/* Back */}
      <Link
        href="/talent/jobs"
        className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Todas as Vagas
      </Link>

      {/* Job card */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className={`h-[3px] bg-gradient-to-r ${stripe(job.category)}`} />
        <div className="p-7 space-y-5">
          <div>
            <div className="flex items-start justify-between gap-4 mb-3">
              <h1 className="text-[1.35rem] font-semibold tracking-tight text-zinc-900 leading-snug">{job.title}</h1>
              <span className="text-[12px] font-medium bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-full flex-shrink-0">
                {job.category}
              </span>
            </div>
            <p className="text-[14px] text-zinc-500 leading-relaxed">{job.description}</p>
          </div>

          {job.applicationRequirements && job.applicationRequirements.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">O que você precisa enviar</p>
              <div className="flex flex-wrap gap-2">
                {job.applicationRequirements.map((req) => {
                  const labels: Record<string, string> = { photos: "Fotos", video: "Vídeo", curriculum: "Currículo", portfolio: "Portfólio" };
                  return (
                    <span key={req} className="inline-flex items-center gap-1 text-[12px] font-semibold bg-white border border-amber-200 text-amber-700 px-2.5 py-1 rounded-lg">
                      {labels[req] ?? req}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-50">
            {job.agencyName && (
              <div className="col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Agência</p>
                <p className="text-[14px] font-semibold text-zinc-900">{job.agencyName}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Orçamento</p>
              <p className="text-[16px] font-semibold text-zinc-900">{brl(job.budget)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Prazo</p>
              <p className="text-[16px] font-semibold text-zinc-900">{formatDate(job.deadline)}</p>
            </div>
            {job.location && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Localização</p>
                <p className="text-[14px] font-semibold text-zinc-900">{job.location}</p>
              </div>
            )}
            {job.gender && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Gênero</p>
                <p className="text-[14px] font-semibold text-zinc-900">{job.gender}</p>
              </div>
            )}
            {(job.ageMin !== null || job.ageMax !== null) && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Idade</p>
                <p className="text-[14px] font-semibold text-zinc-900">
                  {job.ageMin !== null && job.ageMax !== null
                    ? `${job.ageMin}–${job.ageMax} anos`
                    : job.ageMin !== null
                    ? `${job.ageMin}+ anos`
                    : `Até ${job.ageMax} anos`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3.5">
          <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-[13px] text-rose-600">{error}</p>
        </div>
      )}

      {/* Apply flow — Info */}
      {step === "info" && (() => {
        const blockReasons: string[] = [];
        if (job.gender && talentGender && job.gender !== talentGender) {
          const label = job.gender === "male" ? "Masculino" : job.gender === "female" ? "Feminino" : "Outro";
          blockReasons.push(`Esta vaga é exclusiva para o gênero ${label}.`);
        }
        if (job.ageMin !== null && talentAge !== null && talentAge < job.ageMin) {
          blockReasons.push(`Idade mínima exigida: ${job.ageMin} anos.`);
        }
        if (job.ageMax !== null && talentAge !== null && talentAge > job.ageMax) {
          blockReasons.push(`Idade máxima permitida: ${job.ageMax} anos.`);
        }
        const blocked = blockReasons.length > 0;
        const checklist = orderedSteps.flatMap((s) => STEP_CHECKLIST[s]);
        return (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-4">
            <div>
              <h2 className="text-[1rem] font-semibold text-zinc-900 mb-1">Candidatar-se a esta vaga</h2>
              <p className="text-[13px] text-zinc-400">
                Para se candidatar você precisará enviar os seguintes itens:
              </p>
            </div>
            {blocked ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 space-y-1">
                <p className="text-[13px] font-semibold text-amber-800">Você não atende aos requisitos desta vaga</p>
                {blockReasons.map((r, i) => (
                  <p key={i} className="text-[12px] text-amber-700">• {r}</p>
                ))}
              </div>
            ) : (
              <ul className="space-y-2">
                {checklist.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px] text-zinc-600">
                    <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setStep(orderedSteps[0] as StepId)}
                disabled={blocked}
                className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3.5 rounded-xl transition-all duration-150 active:scale-[0.99] cursor-pointer"
              >
                Iniciar Candidatura
              </button>
              <button
                onClick={() => setShowReferral(true)}
                className="w-full bg-white border border-zinc-200 hover:border-violet-300 hover:bg-violet-50 text-zinc-700 hover:text-violet-700 text-[14px] font-semibold py-3.5 rounded-xl transition-all duration-150 active:scale-[0.99] cursor-pointer"
              >
                Indicar um Talento — ganhe 2%
              </button>
            </div>
          </div>
        );
      })()}

      {/* Apply flow — Photos */}
      {step === "photos" && (
        <PhotoStep
          photos={photos}
          onChange={(key, file) => setPhotos((p) => ({ ...p, [key]: file }))}
          onNext={isLastStep("photos") ? handleSubmit : () => setStep(getNextStepId("photos"))}
          stepLabel={getStepLabel("photos")}
          nextLabel={getNextLabel("photos")}
        />
      )}

      {/* Apply flow — Video */}
      {step === "video" && (
        <VideoStep
          video={video}
          onVideoChange={setVideo}
          onBack={() => setStep(getPrevStepId("video"))}
          onNext={isLastStep("video") ? handleSubmit : () => setStep(getNextStepId("video"))}
          submitting={isLastStep("video") ? submitting : false}
          uploadProgress={isLastStep("video") ? uploadProgress : ""}
          stepLabel={getStepLabel("video")}
          nextLabel={getNextLabel("video")}
        />
      )}

      {/* Apply flow — Curriculum */}
      {step === "curriculum" && (
        <CurriculumStep
          file={curriculum}
          onFileChange={setCurriculum}
          onBack={() => setStep(getPrevStepId("curriculum"))}
          onNext={isLastStep("curriculum") ? handleSubmit : () => setStep(getNextStepId("curriculum"))}
          submitting={isLastStep("curriculum") ? submitting : false}
          uploadProgress={isLastStep("curriculum") ? uploadProgress : ""}
          stepLabel={getStepLabel("curriculum")}
          nextLabel={getNextLabel("curriculum")}
        />
      )}

      {/* Apply flow — Portfolio */}
      {step === "portfolio" && (
        <PortfolioStep
          file={portfolio}
          onFileChange={setPortfolio}
          onBack={() => setStep(getPrevStepId("portfolio"))}
          onNext={isLastStep("portfolio") ? handleSubmit : () => setStep(getNextStepId("portfolio"))}
          submitting={isLastStep("portfolio") ? submitting : false}
          uploadProgress={isLastStep("portfolio") ? uploadProgress : ""}
          stepLabel={getStepLabel("portfolio")}
          nextLabel={getNextLabel("portfolio")}
        />
      )}
    </div>
  );
}
