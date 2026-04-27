"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

type Job = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  deadline: string;
};

type Mode = "self" | "other";
type SuccessVariant = "application" | "referral_sent" | "referral_warning";
type SubmitResponse = {
  error?: string;
  emailSent?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_STRIPES: Record<string, string> = {
  "Lifestyle & Fashion": "from-pink-400 to-rose-400",
  "Technology":          "from-sky-400 to-blue-500",
  "Food & Cooking":      "from-orange-400 to-amber-400",
  "Health & Fitness":    "from-emerald-400 to-green-500",
  "Travel":              "from-violet-400 to-purple-500",
  "Beauty":              "from-fuchsia-400 to-pink-500",
};
function stripe(cat: string) {
  return CATEGORY_STRIPES[cat] ?? "from-zinc-300 to-zinc-400";
}
function formatBudget(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}
function formatDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
}

async function uploadFile(file: File, path: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("path", path);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Falha no upload do arquivo.");
  }

  const { url } = await res.json();
  return url;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <p className="text-[13px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Vaga Não Encontrada</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 mb-2">Esta vaga não existe</h1>
        <p className="text-[15px] text-zinc-500 mb-6">Ela pode ter sido removida ou o link está incorreto.</p>
        <Link href="/agency/jobs" className="inline-flex items-center gap-2 bg-[#1F2D2E] text-white text-[13px] font-medium px-5 py-2.5 rounded-xl hover:bg-[#2D4142] transition-colors">
          ← Voltar para Vagas
        </Link>
      </div>
    </div>
  );
}

function SuccessScreen({ jobTitle }: { jobTitle: string }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-30" />
          <span className="relative flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500 text-white">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </div>
        <p className="text-[13px] font-semibold uppercase tracking-widest text-emerald-600 mb-2">Candidatura Recebida</p>
        <h2 className="text-[1.5rem] font-semibold tracking-tight text-zinc-900 mb-2">Talento enviado!</h2>
        <p className="text-[15px] text-zinc-500 mb-8">
          Sua candidatura para <span className="font-medium text-zinc-700">"{jobTitle}"</span> está em análise.
          {" Se selecionado, você receberá sua comissão de indicação."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/agency/jobs" className="inline-flex items-center justify-center gap-2 bg-[#1F2D2E] text-white text-[13px] font-medium px-5 py-2.5 rounded-xl hover:bg-[#2D4142] transition-colors">
            ← Voltar para Vagas
          </Link>
          <Link href="/agency/dashboard" className="inline-flex items-center justify-center gap-2 bg-white border border-zinc-200 text-zinc-700 text-[13px] font-medium px-5 py-2.5 rounded-xl hover:border-zinc-300 transition-colors">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

function ReferralSuccessScreen({
  jobTitle,
  variant,
}: {
  jobTitle: string;
  variant: Exclude<SuccessVariant, "application">;
}) {
  const isWarning = variant === "referral_warning";
  const pulseClass = isWarning ? "bg-amber-400" : "bg-emerald-400";
  const badgeClass = isWarning ? "text-amber-600" : "text-emerald-600";
  const iconClass = isWarning ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <span className={`absolute inset-0 rounded-full ${pulseClass} animate-ping opacity-30`} />
          <span className={`relative flex items-center justify-center w-16 h-16 rounded-full ${iconClass} text-white`}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </div>
        <p className={`text-[13px] font-semibold uppercase tracking-widest ${badgeClass} mb-2`}>
          {isWarning ? "Indicação Registrada" : "Indicação Enviada"}
        </p>
        <h2 className="text-[1.5rem] font-semibold tracking-tight text-zinc-900 mb-2">
          {isWarning ? "Convite pendente" : "Indicação enviada!"}
        </h2>
        <p className="text-[15px] text-zinc-500 mb-8">
          {isWarning
            ? <>A indicação para <span className="font-medium text-zinc-700">"{jobTitle}"</span> foi salva, mas o email do convite não pôde ser enviado agora.</>
            : <>O convite foi enviado por email para o talento indicado para <span className="font-medium text-zinc-700">"{jobTitle}"</span>.</>}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/talent/jobs" className="inline-flex items-center justify-center gap-2 bg-[#1F2D2E] text-white text-[13px] font-medium px-5 py-2.5 rounded-xl hover:bg-[#2D4142] transition-colors">
            ← Voltar para Vagas
          </Link>
          <Link href="/talent/referrals" className="inline-flex items-center justify-center gap-2 bg-white border border-zinc-200 text-zinc-700 text-[13px] font-medium px-5 py-2.5 rounded-xl hover:border-zinc-300 transition-colors">
            Minhas Indicações
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function JobSubmitForm({ job }: { job: Job | null }) {
  const mode: Mode = "other";
  const [form, setForm] = useState({ talentName: "", contactInfo: "", bio: "", referrerName: "" });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [referralSuccess, setReferralSuccess] = useState<Exclude<SuccessVariant, "application"> | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [referrerId, setReferrerId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadReferrer() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !active) return;

      const metadataName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split("@")[0] ??
        "";

      const [{ data: profile }, { data: talentProfile }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("talent_profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);

      if (!active || profile?.role !== "talent") return;

      setReferrerId(user.id);

      const resolvedName = talentProfile?.full_name ?? metadataName;
      if (resolvedName) {
        setForm((current) =>
          current.referrerName
            ? current
            : { ...current, referrerName: resolvedName }
        );
      }
    }

    void loadReferrer();

    return () => {
      active = false;
    };
  }, []);

  if (!job) return <NotFound />;
  if (referralSuccess) return <ReferralSuccessScreen jobTitle={job.title} variant={referralSuccess} />;
  if (submitted) return <SuccessScreen jobTitle={job.title} />;

  function validate() {
    const e: Record<string, string> = {};
    if (!form.talentName.trim()) e.talentName = "Nome é obrigatório";
    if (!form.contactInfo.trim()) e.contactInfo = "E-mail é obrigatório";
    else if (!/\S+@\S+\.\S+/.test(form.contactInfo)) e.contactInfo = "Informe um e-mail válido";
    if (!form.bio.trim()) e.bio = "Bio é obrigatória";
    if (!form.referrerName.trim()) e.referrerName = "Seu nome é obrigatório";
    return e;
  }

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setSubmitError(null);

    try {
      const isReferral = Boolean(referrerId);
      const endpoint = isReferral ? "/api/referrals/invite" : "/api/submissions";

      let videoUrl: string | null = null;
      if (videoFile) {
        const ownerId = referrerId ?? "public";
        const extension = videoFile.name.split(".").pop()?.toLowerCase() ?? "mp4";
        videoUrl = await uploadFile(
          videoFile,
          `submissions/${ownerId}/${Date.now()}_intro.${extension}`
        );
      }

      const payload = isReferral
        ? {
            job_id:         job!.id,
            referrer_id:    referrerId,
            referred_email: form.contactInfo.trim(),
            referred_name:  form.talentName.trim(),
            bio:            form.bio.trim(),
            video_url:      videoUrl,
          }
        : {
            job_id:        job!.id,
            talent_name:   form.talentName.trim(),
            email:         form.contactInfo.trim(),
            bio:           form.bio.trim(),
            referrer_name: form.referrerName.trim(),
            referrer_id:   null,
            mode,
            video_url:     videoUrl,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = (await res.json().catch(() => null)) as SubmitResponse | null;

      if (!res.ok) {
        const error = response?.error;
        console.error("Submission failed:", error);
        setSubmitError(error ?? "Algo deu errado. Tente novamente.");
        return;
      }

      if (isReferral) {
        setReferralSuccess(response?.emailSent === false ? "referral_warning" : "referral_sent");
        return;
      }

      setSubmitted(true);
    } catch (error) {
      console.error("Submission failed:", error);
      setSubmitError(error instanceof Error ? error.message : "Algo deu errado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (err?: string) =>
    `w-full rounded-xl border ${err ? "border-rose-300 focus:border-rose-500" : "border-zinc-200 hover:border-zinc-300 focus:border-zinc-900"} bg-white px-4 py-3 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors`;

  const labelClass = "block text-[13px] font-medium text-zinc-600 mb-1.5";

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href={`/agency/jobs/${job.id}`} className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar para Vaga
          </Link>
          <span className="text-[14px] font-semibold text-zinc-900 tracking-tight">Brisa Digital</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">

        {/* Job Info */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className={`h-[3px] bg-gradient-to-r ${stripe(job.category)}`} />
          <div className="p-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Candidatando-se para</p>
            <h1 className="text-[1.35rem] font-semibold tracking-tight text-zinc-900 mb-2 leading-snug">{job.title}</h1>
            <p className="text-[14px] text-zinc-500 leading-relaxed line-clamp-3 mb-4">{job.description}</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatBudget(job.budget)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500">
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Due {formatDate(job.deadline)}
              </span>
              <span className="text-[12px] font-medium bg-zinc-100 text-zinc-500 px-2.5 py-1 rounded-full">
                {job.category}
              </span>
            </div>
          </div>
        </div>

        {/* Commission Banner */}
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-[14px] text-emerald-800 font-medium leading-snug">
            Ganhe comissão se sua indicação for selecionada
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Detalhes da Candidatura</p>

            <div>
              <label className={labelClass}>Nome do Talento</label>
              <input
                type="text"
                placeholder="ex: Lucas Ferreira"
                value={form.talentName}
                onChange={(e) => field("talentName", e.target.value)}
                className={inputClass(errors.talentName)}
              />
              {errors.talentName && <p className="text-[12px] text-rose-500 mt-1">{errors.talentName}</p>}
            </div>

            <div>
              <label className={labelClass}>E-mail do Talento</label>
              <input
                type="email"
                placeholder="contato@exemplo.com"
                value={form.contactInfo}
                onChange={(e) => field("contactInfo", e.target.value)}
                className={inputClass(errors.contactInfo)}
              />
              {errors.contactInfo && <p className="text-[12px] text-rose-500 mt-1">{errors.contactInfo}</p>}
            </div>

            <div>
              <label className={labelClass}>Bio do Talento</label>
              <textarea
                rows={4}
                placeholder="Conte à marca sobre este criador — nicho, estilo, audiência e por que ele é ideal para esta campanha."
                value={form.bio}
                onChange={(e) => field("bio", e.target.value)}
                className={`${inputClass(errors.bio)} resize-none`}
              />
              {errors.bio && <p className="text-[12px] text-rose-500 mt-1">{errors.bio}</p>}
            </div>

            <div>
                <label className={labelClass}>Seu Nome (Indicador)</label>
                <input
                  type="text"
                  placeholder="ex: Carlos Rodrigues"
                  value={form.referrerName}
                  onChange={(e) => field("referrerName", e.target.value)}
                  className={inputClass(errors.referrerName)}
                />
                {errors.referrerName && <p className="text-[12px] text-rose-500 mt-1">{errors.referrerName}</p>}
            </div>

            {/* Video Upload */}
            <div>
              <label className={labelClass}>Vídeo ou Link do Portfólio (opcional)</label>
              <div
                className="rounded-xl border-2 border-dashed border-zinc-200 hover:border-zinc-300 transition-colors cursor-pointer"
                onClick={() => document.getElementById("video-upload")?.click()}
              >
                {videoFile ? (
                  <div className="px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-zinc-900 truncate max-w-[280px]">{videoFile.name}</p>
                        <p className="text-[12px] text-zinc-400">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setVideoFile(null); }}
                      className="text-[12px] text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center mb-1">
                      <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-[14px] font-medium text-zinc-600">Enviar vídeo de amostra</p>
                    <p className="text-[12px] text-zinc-400">MP4, MOV até 500 MB</p>
                  </div>
                )}
              </div>
              <input
                id="video-upload"
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) setVideoFile(e.target.files[0]); }}
              />
            </div>
          </div>

          {submitError && (
            <div className="mt-4 flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" clipRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" />
              </svg>
              <p className="text-[13px] text-rose-600">{submitError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 text-white text-[15px] font-semibold py-4 rounded-xl transition-all duration-150 cursor-pointer shadow-sm"
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Enviando…
              </span>
            ) : (
              "Enviar Candidatura"
            )}
          </button>
          <p className="text-center text-[12px] text-zinc-400 mt-3">
            Ao enviar você concorda com os termos de submissão da Brisa Digital.
          </p>
        </form>
      </div>
    </div>
  );
}


