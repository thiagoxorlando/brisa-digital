"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSubscription } from "@/lib/SubscriptionContext";
import PaywallModal from "@/components/agency/PaywallModal";

// ─── Types & constants ────────────────────────────────────────────────────────

type FormData = {
  title: string;
  description: string;
  category: string;
  budget: string;
  deadline: string;
  job_date: string;
  job_time: string;
  job_role: string;
  location: string;
  gender: string;
  age_min: string;
  age_max: string;
  number_of_talents_required: string;
  auto_invite: boolean;
  visibility: "public" | "private";
  application_requirements: string[];
};

type FormErrors = Partial<Record<keyof FormData, string>>;

const GENDER_OPTIONS = ["any", "male", "female"];

const CATEGORIES = [
  "Lifestyle & Fashion",
  "Technology",
  "Food & Cooking",
  "Health & Fitness",
  "Travel",
  "Beauty",
  "Gaming",
  "Music",
  "Comedy",
  "Education",
  "Sports",
  "Other",
];

const CATEGORY_LABELS: Record<string, string> = {
  "Lifestyle & Fashion": "Lifestyle & Moda",
  "Technology":          "Tecnologia",
  "Food & Cooking":      "Gastronomia",
  "Health & Fitness":    "Saúde & Fitness",
  "Travel":              "Viagem",
  "Beauty":              "Beleza",
  "Gaming":              "Games",
  "Music":               "Música",
  "Comedy":              "Humor",
  "Education":           "Educação",
  "Sports":              "Esportes",
  "Other":               "Outro",
};

const DESC_MAX = 600;

const APPLICATION_REQUIREMENT_OPTIONS = [
  { value: "photos",     label: "Fotos" },
  { value: "video",      label: "Vídeo" },
  { value: "curriculum", label: "Currículo" },
  { value: "portfolio",  label: "Portfólio" },
];

const INITIAL: FormData = {
  title: "",
  description: "",
  category: "",
  budget: "",
  deadline: "",
  job_date: "",
  job_time: "",
  job_role: "",
  location: "",
  gender: "any",
  age_min: "",
  age_max: "",
  number_of_talents_required: "1",
  auto_invite: false,
  visibility: "public",
  application_requirements: [],
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(f: FormData): FormErrors {
  const e: FormErrors = {};
  if (!f.title.trim()) e.title = "Título da vaga é obrigatório.";
  else if (f.title.trim().length < 5) e.title = "Mínimo de 5 caracteres.";
  if (!f.description.trim()) e.description = "Descrição é obrigatória.";
  else if (f.description.length > DESC_MAX) e.description = `Máximo de ${DESC_MAX} caracteres.`;
  if (!f.category) e.category = "Selecione uma categoria.";
  if (!f.budget.trim()) e.budget = "Orçamento é obrigatório.";
  else if (isNaN(Number(f.budget)) || Number(f.budget) < 0) e.budget = "Informe um valor válido.";
  if (!f.deadline) e.deadline = "Prazo é obrigatório.";
  else if (new Date(f.deadline) <= new Date()) e.deadline = "Deve ser uma data futura.";
  if (f.age_min && (isNaN(Number(f.age_min)) || Number(f.age_min) < 1)) e.age_min = "Idade inválida.";
  if (f.age_max && (isNaN(Number(f.age_max)) || Number(f.age_max) < 1)) e.age_max = "Idade inválida.";
  if (f.age_min && f.age_max && Number(f.age_min) > Number(f.age_max)) e.age_max = "Deve ser ≥ idade mínima.";
  return e;
}

// ─── Input primitives ─────────────────────────────────────────────────────────

const base =
  "w-full rounded-xl border bg-white text-[15px] text-zinc-900 placeholder:text-zinc-300 transition-colors duration-150 focus:outline-none";

const ring = (err?: boolean) =>
  err
    ? "border-rose-300 focus:border-rose-400"
    : "border-zinc-200 hover:border-zinc-300 focus:border-zinc-900";

function Field({
  label,
  hint,
  error,
  aside,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  aside?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-medium text-zinc-500 tracking-tight">
          {label}
          {required && <span className="text-rose-400 ml-0.5">*</span>}
        </label>
        {aside}
      </div>
      {children}
      {hint && !error && (
        <p className="text-[12px] text-zinc-400 leading-snug">{hint}</p>
      )}
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

// ─── Live job preview ─────────────────────────────────────────────────────────

function formatBudget(raw: string) {
  const n = Number(raw);
  if (!raw || isNaN(n) || n <= 0) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDeadline(raw: string) {
  if (!raw) return null;
  return new Date(raw + "T00:00:00").toLocaleDateString("pt-BR", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const checklist = (f: FormData) => [
  { label: "Título",       done: f.title.trim().length >= 5 },
  { label: "Descrição",    done: f.description.trim().length > 0 },
  { label: "Categoria",    done: !!f.category },
  { label: "Orçamento",    done: f.budget.trim() !== "" && !isNaN(Number(f.budget)) },
  { label: "Prazo",        done: !!f.deadline },
];

function JobPreview({ form }: { form: FormData }) {
  const budget   = formatBudget(form.budget);
  const deadline = formatDeadline(form.deadline);
  const items    = checklist(form);
  const pct      = Math.round((items.filter((i) => i.done).length / items.length) * 100);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
          Prévia
        </p>
        <span className={[
          "text-[11px] font-medium px-2 py-0.5 rounded-full",
          pct === 100 ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-500",
        ].join(" ")}>
          {pct}% completo
        </span>
      </div>

      {/* Progress */}
      <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
        <div
          className="h-full bg-zinc-900 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Job card preview */}
      <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
        {/* Top stripe */}
        <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400" />

        <div className="p-5 space-y-4">
          {/* Title + category */}
          <div>
            <p className={[
              "font-semibold text-zinc-900 leading-snug",
              form.title ? "text-base" : "text-base text-zinc-300",
            ].join(" ")}>
              {form.title || "O título da vaga aparecerá aqui"}
            </p>
            {form.category ? (
              <span className="inline-block mt-2 text-[11px] font-medium bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">
                {CATEGORY_LABELS[form.category] ?? form.category}
              </span>
            ) : (
              <span className="inline-block mt-2 text-[11px] bg-zinc-100 text-zinc-300 px-2.5 py-1 rounded-full">
                Categoria
              </span>
            )}
          </div>

          {/* Description */}
          <p className={[
            "text-[13px] leading-relaxed line-clamp-3",
            form.description ? "text-zinc-500" : "text-zinc-300 italic",
          ].join(" ")}>
            {form.description || "A descrição da vaga aparecerá aqui…"}
          </p>

          {/* Budget + deadline */}
          <div className="flex items-center gap-4 pt-1 border-t border-zinc-50">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={[
                "text-[13px] font-medium",
                budget ? "text-zinc-700" : "text-zinc-300",
              ].join(" ")}>
                {budget ?? "Orçamento"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className={[
                "text-[13px] font-medium",
                deadline ? "text-zinc-700" : "text-zinc-300",
              ].join(" ")}>
                {deadline ?? "Prazo"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-2xl border border-zinc-100 bg-white px-4 py-4 space-y-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">
          Checklist
        </p>
        {items.map(({ label, done }) => (
          <div key={label} className="flex items-center gap-2.5">
            <div className={[
              "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
              done ? "bg-emerald-500" : "bg-zinc-100",
            ].join(" ")}>
              {done && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className={[
              "text-[13px]",
              done ? "text-zinc-600" : "text-zinc-400",
            ].join(" ")}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ title, draft }: { title: string; draft?: boolean }) {
  return (
    <div className="max-w-sm mx-auto pt-16 text-center">
      <div className="relative w-16 h-16 mx-auto mb-6">
        <div className={`absolute inset-0 rounded-full ${draft ? "bg-amber-100" : "bg-emerald-100"} animate-ping opacity-30`} />
        <div className={`relative w-16 h-16 rounded-full ${draft ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"} border flex items-center justify-center`}>
          <svg className={`w-7 h-7 ${draft ? "text-amber-500" : "text-emerald-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={draft ? "M5 5h14M5 12h14M5 19h14" : "M5 13l4 4L19 7"} />
          </svg>
        </div>
      </div>
      <h2 className="text-xl font-semibold text-zinc-900 tracking-tight">{draft ? "Rascunho salvo!" : "Vaga publicada!"}</h2>
      <p className="text-sm text-zinc-500 mt-2.5 leading-relaxed">
        <span className="font-medium text-zinc-700">&ldquo;{title}&rdquo;</span>{" "}
        {draft ? "foi salva como rascunho. Você pode publicá-la a partir da lista de vagas." : "está no ar e visível para os talentos."}
      </p>
      <p className="text-xs text-zinc-400 mt-6 flex items-center justify-center gap-1.5">
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        Redirecionando para vagas…
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PostJobForm() {
  const router = useRouter();
  const { isActive, isPremium } = useSubscription();
  const [form, setForm]       = useState<FormData>(INITIAL);
  const [touched, setTouched] = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitted, setSubmitted] = useState<"posted" | "draft" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [postedTitle, setPostedTitle] = useState("");
  const [paywallOpen, setPaywallOpen] = useState(false);

  const errors    = validate(form);
  const hasErrors = Object.keys(errors).length > 0;

  function set<K extends keyof FormData>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  function toggle(k: keyof FormData) {
    setForm((p) => ({ ...p, [k]: !(p[k] as boolean) }));
  }
  function touch(k: keyof FormData) {
    setTouched((p) => ({ ...p, [k]: true }));
  }
  function err(k: keyof FormData) {
    return submitAttempted || touched[k] ? errors[k] : undefined;
  }

  async function postJob(status: "open" | "draft") {
    setSubmitError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitError("Não autenticado. Faça login novamente.");
      return false;
    }
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        budget: Number(form.budget),
        deadline: form.deadline,
        job_date: form.job_date || null,
        job_time: form.job_time.trim() || null,
        job_role: form.job_role.trim() || null,
        agency_id: user.id,
        location: form.location.trim() || null,
        gender: form.gender !== "any" ? form.gender : null,
        age_min: form.age_min ? Number(form.age_min) : null,
        age_max: form.age_max ? Number(form.age_max) : null,
        number_of_talents_required: Number(form.number_of_talents_required) || 1,
        auto_invite: status === "open" ? form.auto_invite : false,
        visibility: isPremium ? form.visibility : "public",
        application_requirements: form.application_requirements,
        status,
      }),
    });
    if (!res.ok) {
      const body = await res.json();
      if (body.error === "plan_limit") {
        setPaywallOpen(true);
        return false;
      }
      setSubmitError(body.error ?? "Algo deu errado. Tente novamente.");
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    if (hasErrors) return;

    setLoading(true);
    const ok = await postJob("open");
    setLoading(false);
    if (!ok) return;

    setPostedTitle(form.title.trim());
    setForm(INITIAL);
    setTouched({});
    setSubmitAttempted(false);
    setSubmitted("posted");
    router.refresh();
    setTimeout(() => router.push("/agency/jobs"), 2200);
  }

  async function handleSaveDraft() {
    if (!form.title.trim()) {
      setSubmitError("Um título é necessário para salvar o rascunho.");
      return;
    }
    setSavingDraft(true);
    const ok = await postJob("draft");
    setSavingDraft(false);
    if (!ok) return;

    setPostedTitle(form.title.trim());
    setForm(INITIAL);
    setTouched({});
    setSubmitAttempted(false);
    setSubmitted("draft");
    router.refresh();
    setTimeout(() => router.push("/agency/jobs"), 2200);
  }

  if (submitted) return <SuccessScreen title={postedTitle} draft={submitted === "draft"} />;

  return (
    <div className="max-w-5xl space-y-8">
      {paywallOpen && <PaywallModal variant="limit" onClose={() => setPaywallOpen(false)} />}

      {/* ── Page header ── */}
      <div>
        <Link
          href="/agency/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors mb-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Publicar Vaga
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Crie uma vaga e encontre o talento certo no seu elenco.
        </p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* Form — 3 cols */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="lg:col-span-3 space-y-4"
        >
          {/* Job details card */}
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-7 space-y-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              Detalhes da Vaga
            </p>

            {/* Title */}
            <Field label="Título da Vaga" error={err("title")} required>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                onBlur={() => touch("title")}
                placeholder="ex: Criador de Moda para Campanha de Primavera"
                className={`${base} ${ring(!!err("title"))} px-4 py-3`}
              />
            </Field>

            {/* Description */}
            <Field
              label="Descrição"
              error={err("description")}
              required
              aside={
                <span className={[
                  "text-[12px] tabular-nums",
                  form.description.length > DESC_MAX
                    ? "text-rose-400 font-medium"
                    : "text-zinc-400",
                ].join(" ")}>
                  {form.description.length}/{DESC_MAX}
                </span>
              }
            >
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                onBlur={() => touch("description")}
                placeholder="O que a vaga envolve? Que tipo de criador você busca? Liste as entregas e expectativas…"
                rows={6}
                className={`${base} ${ring(!!err("description"))} px-4 py-3 resize-none leading-relaxed`}
              />
            </Field>

            {/* Category */}
            <Field label="Categoria" error={err("category")} required>
              <div className="relative">
                <select
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  onBlur={() => touch("category")}
                  className={`${base} ${ring(!!err("category"))} px-4 py-3 appearance-none pr-10 cursor-pointer`}
                >
                  <option value="">Selecione uma categoria…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </Field>
            {/* Location */}
            <Field label="Localização" error={err("location")} hint="Cidade, estado, ou 'Remoto'">
              <input
                type="text"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                onBlur={() => touch("location")}
                placeholder="ex: São Paulo, SP ou Remoto"
                className={`${base} ${ring(!!err("location"))} px-4 py-3`}
              />
            </Field>
          </div>

          {/* Terms card */}
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-7 space-y-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              Termos
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Budget */}
              <Field
                label="Orçamento (BRL)"
                error={err("budget")}
                hint="Remuneração total pela vaga"
                required
              >
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-zinc-400 pointer-events-none select-none">
                    R$
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={form.budget}
                    onChange={(e) => set("budget", e.target.value)}
                    onBlur={() => touch("budget")}
                    placeholder="5,000"
                    className={`${base} ${ring(!!err("budget"))} pl-10 pr-4 py-3`}
                  />
                </div>
              </Field>

              {/* Deadline */}
              <Field
                label="Prazo de Candidatura"
                error={err("deadline")}
                hint="Último dia para se candidatar à vaga"
                required
              >
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => set("deadline", e.target.value)}
                  onBlur={() => touch("deadline")}
                  min={new Date().toISOString().split("T")[0]}
                  className={`${base} ${ring(!!err("deadline"))} px-4 py-3`}
                />
              </Field>

              {/* Job Date */}
              <Field
                label="Data da Vaga"
                hint="Quando o trabalho de fato acontece"
              >
                <input
                  type="date"
                  value={form.job_date}
                  onChange={(e) => set("job_date", e.target.value)}
                  className={`${base} ${ring()} px-4 py-3`}
                />
              </Field>

              {/* Job Time */}
              <Field label="Horário da Vaga">
                <input
                  type="time"
                  value={form.job_time}
                  onChange={(e) => set("job_time", e.target.value)}
                  className={`${base} ${ring()} px-4 py-3`}
                />
              </Field>

              {/* Job Role */}
              <Field label="Função / Cargo">
                <input
                  type="text"
                  value={form.job_role}
                  onChange={(e) => set("job_role", e.target.value)}
                  placeholder="ex: Modelo, Ator, Apresentador"
                  className={`${base} ${ring()} px-4 py-3`}
                />
              </Field>
            </div>

            {/* Gender + Age range */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Field label="Gênero" error={err("gender")}>
                <div className="relative">
                  <select
                    value={form.gender}
                    onChange={(e) => set("gender", e.target.value)}
                    className={`${base} ${ring()} px-4 py-3 appearance-none pr-10 cursor-pointer capitalize`}
                  >
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g} className="capitalize">{g === "any" ? "Qualquer gênero" : g === "male" ? "Masculino" : g === "female" ? "Feminino" : g.charAt(0).toUpperCase() + g.slice(1)}</option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </Field>
              <Field label="Idade Mínima" error={err("age_min")}>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={form.age_min}
                  onChange={(e) => set("age_min", e.target.value)}
                  onBlur={() => touch("age_min")}
                  placeholder="ex: 18"
                  className={`${base} ${ring(!!err("age_min"))} px-4 py-3`}
                />
              </Field>
              <Field label="Idade Máxima" error={err("age_max")}>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={form.age_max}
                  onChange={(e) => set("age_max", e.target.value)}
                  onBlur={() => touch("age_max")}
                  placeholder="ex: 35"
                  className={`${base} ${ring(!!err("age_max"))} px-4 py-3`}
                />
              </Field>
            </div>

            {/* Talents required */}
            <Field label="Talentos Necessários" hint="Quantos talentos você precisa para esta vaga?">
              <input
                type="number"
                min="1"
                value={form.number_of_talents_required}
                onChange={(e) => set("number_of_talents_required", e.target.value)}
                placeholder="1"
                className={`${base} ${ring()} px-4 py-3`}
              />
            </Field>

            {/* Application requirements */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-zinc-500 tracking-tight">
                O que o talento deve enviar ao se candidatar?
              </label>
              <div className="flex flex-wrap gap-2">
                {APPLICATION_REQUIREMENT_OPTIONS.map((opt) => {
                  const checked = form.application_requirements.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((p) => ({
                        ...p,
                        application_requirements: checked
                          ? p.application_requirements.filter((v) => v !== opt.value)
                          : [...p.application_requirements, opt.value],
                      }))}
                      className={[
                        "px-3.5 py-2 rounded-xl text-[13px] font-medium border transition-colors cursor-pointer",
                        checked
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px] text-zinc-400">Opcional. Deixe em branco para aceitar qualquer candidatura.</p>
            </div>

            {/* Private job toggle — premium only */}
            {isPremium && (
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, visibility: p.visibility === "private" ? "public" : "private" }))}
                className={[
                  "w-full flex items-start gap-4 px-5 py-4 rounded-2xl border text-left transition-all cursor-pointer",
                  form.visibility === "private"
                    ? "bg-violet-50 border-violet-200"
                    : "bg-zinc-50 border-zinc-100 hover:border-zinc-200",
                ].join(" ")}
              >
                <div className={[
                  "relative flex-shrink-0 w-10 h-6 rounded-full transition-colors mt-0.5",
                  form.visibility === "private" ? "bg-violet-600" : "bg-zinc-300",
                ].join(" ")}>
                  <div className={[
                    "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    form.visibility === "private" ? "translate-x-5" : "translate-x-1",
                  ].join(" ")} />
                </div>
                <div>
                  <p className={[
                    "text-[14px] font-semibold",
                    form.visibility === "private" ? "text-violet-900" : "text-zinc-700",
                  ].join(" ")}>
                    Vaga privada (apenas convidados)
                  </p>
                  <p className={[
                    "text-[12px] mt-0.5 leading-relaxed",
                    form.visibility === "private" ? "text-violet-600" : "text-zinc-400",
                  ].join(" ")}>
                    A vaga não aparece no marketplace público. Somente talentos que você convidar poderão se candidatar.
                  </p>
                </div>
              </button>
            )}

            {/* Auto-invite toggle */}
            <button
              type="button"
              onClick={() => toggle("auto_invite")}
              className={[
                "w-full flex items-start gap-4 px-5 py-4 rounded-2xl border text-left transition-all cursor-pointer",
                form.auto_invite
                  ? "bg-violet-50 border-violet-200"
                  : "bg-zinc-50 border-zinc-100 hover:border-zinc-200",
              ].join(" ")}
            >
              {/* Toggle pill */}
              <div className={[
                "relative flex-shrink-0 w-10 h-6 rounded-full transition-colors mt-0.5",
                form.auto_invite ? "bg-violet-600" : "bg-zinc-300",
              ].join(" ")}>
                <div className={[
                  "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                  form.auto_invite ? "translate-x-5" : "translate-x-1",
                ].join(" ")} />
              </div>
              <div>
                <p className={[
                  "text-[14px] font-semibold",
                  form.auto_invite ? "text-violet-900" : "text-zinc-700",
                ].join(" ")}>
                  Convidar talentos compatíveis automaticamente
                </p>
                <p className={[
                  "text-[12px] mt-0.5 leading-relaxed",
                  form.auto_invite ? "text-violet-600" : "text-zinc-400",
                ].join(" ")}>
                  Ao publicar, enviaremos convites para até 5 talentos disponíveis na data da vaga com perfil compatível com o seu histórico.
                </p>
              </div>
            </button>
          </div>

          {/* Submit */}
          <div className="space-y-3 pt-1">
            {submitAttempted && hasErrors && (
              <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" />
                </svg>
                <p className="text-[13px] text-rose-600">
                  Corrija os campos destacados antes de publicar.
                </p>
              </div>
            )}

            {submitError && (
              <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" />
                </svg>
                <p className="text-[13px] text-rose-600">
                  {submitError}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              {!isActive ? (
                <Link
                  href="/agency/finances"
                  className="inline-flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white text-[15px] font-medium px-7 py-3 rounded-xl transition-colors cursor-pointer"
                >
                  Reativar Assinatura
                </Link>
              ) : (
                <>
                  <button
                    type="submit"
                    disabled={loading || savingDraft}
                    className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 text-white text-[15px] font-medium px-7 py-3 rounded-xl transition-all duration-150 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Publicando…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Publicar Vaga
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={loading || savingDraft}
                    onClick={handleSaveDraft}
                    className="inline-flex items-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-[15px] font-medium px-5 py-3 rounded-xl transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savingDraft ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Salvando…
                      </>
                    ) : "Salvar Rascunho"}
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={loading || savingDraft}
                onClick={() => router.push("/agency/dashboard")}
                className="text-[15px] font-medium text-zinc-400 hover:text-zinc-700 px-4 py-3 rounded-xl hover:bg-zinc-50 transition-all duration-150 cursor-pointer disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>

        {/* Preview — 2 cols */}
        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <JobPreview form={form} />
          </div>
        </div>

      </div>
    </div>
  );
}
