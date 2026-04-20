"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
};

type FormErrors = Partial<Record<keyof FormData, string>>;

const CATEGORIES = [
  "Lifestyle & Fashion", "Technology", "Food & Cooking",
  "Health & Fitness", "Travel", "Beauty", "Gaming",
  "Music", "Comedy", "Education", "Sports", "Other",
];

const CATEGORY_LABELS: Record<string, string> = {
  "Lifestyle & Fashion": "Lifestyle & Moda",
  "Technology": "Tecnologia",
  "Food & Cooking": "Gastronomia",
  "Health & Fitness": "Saúde & Fitness",
  "Travel": "Viagem",
  "Beauty": "Beleza",
  "Gaming": "Games",
  "Music": "Música",
  "Comedy": "Humor",
  "Education": "Educação",
  "Sports": "Esportes",
  "Other": "Outro",
};

const DESC_MAX = 600;

const INITIAL: FormData = {
  title: "", description: "", category: "", budget: "",
  deadline: "", job_date: "", job_time: "", job_role: "",
  location: "", gender: "any",
  age_min: "", age_max: "", number_of_talents_required: "1",
};

const STEPS = [
  { label: "Criar vaga",         icon: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { label: "Convidar talentos",   icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { label: "Enviar contrato",     icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
];

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

const completionItems = (f: FormData) => [
  { label: "Título",    done: f.title.trim().length >= 5 },
  { label: "Descrição", done: f.description.trim().length > 0 },
  { label: "Categoria", done: !!f.category },
  { label: "Orçamento", done: f.budget.trim() !== "" && !isNaN(Number(f.budget)) },
  { label: "Prazo",     done: !!f.deadline },
];

// ─── Primitives ───────────────────────────────────────────────────────────────

const base =
  "w-full rounded-xl border bg-white text-[15px] text-zinc-900 placeholder:text-zinc-300 transition-colors duration-150 focus:outline-none";

const ring = (err?: boolean) =>
  err
    ? "border-rose-300 focus:border-rose-400"
    : "border-zinc-200 hover:border-zinc-300 focus:border-zinc-900";

function Field({
  label, hint, error, aside, required, children,
}: {
  label: string; hint?: string; error?: string;
  aside?: React.ReactNode; required?: boolean; children: React.ReactNode;
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
      {hint && !error && <p className="text-[12px] text-zinc-400 leading-snug">{hint}</p>}
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

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ current, pct }: { current: number; pct: number }) {
  return (
    <div className="w-full">
      {/* Steps row */}
      <div className="flex items-start justify-between relative mb-3">
        {/* Connector line behind steps */}
        <div className="absolute top-4 left-0 right-0 h-px bg-zinc-100" />
        {STEPS.map((step, i) => {
          const done    = i < current || (i === 0 && current === 1);
          const active  = i === current && current === 0;
          const future  = i > current;
          return (
            <div key={step.label} className="flex flex-col items-center gap-2 relative z-10 flex-1">
              <div className={[
                "w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-300",
                done   ? "bg-emerald-500 border-emerald-500"      : "",
                active ? "bg-zinc-900 border-zinc-900"            : "",
                future ? "bg-white border-zinc-200 text-zinc-300" : "",
              ].join(" ")}>
                {done ? (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className={["w-4 h-4", active ? "text-white" : "text-zinc-300"].join(" ")}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={step.icon} />
                  </svg>
                )}
              </div>
              <span className={[
                "text-[11px] font-medium text-center leading-tight",
                done   ? "text-emerald-600" : "",
                active ? "text-zinc-900"    : "",
                future ? "text-zinc-300"    : "",
              ].join(" ")}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar (only shown on step 0) */}
      {current === 0 && (
        <div className="space-y-1.5">
          <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct === 100
                  ? "linear-gradient(90deg,#10b981,#059669)"
                  : "linear-gradient(90deg,#18181b,#3f3f46)",
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-zinc-400">Complete os campos obrigatórios</p>
            <span className={[
              "text-[11px] font-semibold tabular-nums",
              pct === 100 ? "text-emerald-600" : "text-zinc-500",
            ].join(" ")}>
              {pct}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ title, jobId }: { title: string; jobId: string }) {
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto text-center space-y-8 py-4">
      {/* Icon */}
      <div className="relative w-20 h-20 mx-auto">
        <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-25" />
        <div className="relative w-20 h-20 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
          <svg className="w-9 h-9 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      {/* Message */}
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold text-zinc-900 tracking-tight">
          Vaga publicada!
        </h2>
        <p className="text-[15px] text-zinc-500 leading-relaxed">
          <span className="font-medium text-zinc-700">&ldquo;{title}&rdquo;</span>
          <br />
          Seu primeiro job está ativo — agora é só escolher talentos.
        </p>
      </div>

      {/* Next-steps cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
        {[
          {
            n: "1", done: true,
            title: "Vaga criada",
            desc: "Sua vaga está visível para talentos.",
            color: "emerald",
          },
          {
            n: "2", done: false,
            title: "Talentos aplicam",
            desc: "Receba candidaturas e revise os perfis.",
            color: "indigo",
          },
          {
            n: "3", done: false,
            title: "Envie o contrato",
            desc: "Selecione quem você quer e formalize.",
            color: "violet",
          },
        ].map((s) => (
          <div
            key={s.n}
            className={[
              "rounded-2xl border p-4 space-y-2",
              s.done
                ? "bg-emerald-50 border-emerald-100"
                : "bg-white border-zinc-100",
            ].join(" ")}
          >
            <div className={[
              "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold",
              s.done
                ? "bg-emerald-500 text-white"
                : "bg-zinc-100 text-zinc-400",
            ].join(" ")}>
              {s.done ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : s.n}
            </div>
            <p className={[
              "text-[13px] font-semibold",
              s.done ? "text-emerald-700" : "text-zinc-700",
            ].join(" ")}>
              {s.title}
            </p>
            <p className="text-[12px] text-zinc-400 leading-snug">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={() => router.push(`/agency/jobs/${jobId}`)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[15px] font-medium px-7 py-3 rounded-xl transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Ver talentos desta vaga
        </button>
        <button
          onClick={() => router.push("/agency/jobs")}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 text-[15px] font-medium px-7 py-3 rounded-xl transition-all"
        >
          Ir para vagas
        </button>
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function AgencyFirstJobWizard() {
  const router = useRouter();
  const { isActive } = useSubscription();

  const [form, setForm]                   = useState<FormData>(INITIAL);
  const [touched, setTouched]             = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading]             = useState(false);
  const [submitError, setSubmitError]     = useState<string | null>(null);
  const [postedTitle, setPostedTitle]     = useState("");
  const [postedJobId, setPostedJobId]     = useState("");
  const [paywallOpen, setPaywallOpen]     = useState(false);

  const errors    = validate(form);
  const hasErrors = Object.keys(errors).length > 0;
  const items     = completionItems(form);
  const pct       = Math.round((items.filter((i) => i.done).length / items.length) * 100);
  const currentStep = postedJobId ? 1 : 0;

  function set<K extends keyof FormData>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  function touch(k: keyof FormData) {
    setTouched((p) => ({ ...p, [k]: true }));
  }
  function err(k: keyof FormData) {
    return submitAttempted || touched[k] ? errors[k] : undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    if (hasErrors) return;

    setLoading(true);
    setSubmitError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitError("Não autenticado. Faça login novamente.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:                       form.title.trim(),
        description:                 form.description.trim(),
        category:                    form.category,
        budget:                      Number(form.budget),
        deadline:                    form.deadline,
        job_date:                    form.job_date || null,
        job_time:                    form.job_time.trim() || null,
        job_role:                    form.job_role.trim() || null,
        agency_id:                   user.id,
        location:                    form.location.trim() || null,
        gender:                      form.gender !== "any" ? form.gender : null,
        age_min:                     form.age_min ? Number(form.age_min) : null,
        age_max:                     form.age_max ? Number(form.age_max) : null,
        number_of_talents_required:  Number(form.number_of_talents_required) || 1,
        status:                      "open",
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json();
      if (body.error === "plan_limit") { setPaywallOpen(true); return; }
      setSubmitError(body.error ?? "Algo deu errado. Tente novamente.");
      return;
    }

    const json = await res.json();
    setPostedTitle(form.title.trim());
    setPostedJobId(json.job?.id ?? json.id ?? "");
    router.refresh();
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (postedJobId) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl bg-white rounded-3xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.06)] p-8 sm:p-12 space-y-8">
          <StepBar current={1} pct={100} />
          <SuccessScreen title={postedTitle} jobId={postedJobId} />
        </div>
      </div>
    );
  }

  // ── Form state ───────────────────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Primeiros passos
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            Publique sua primeira vaga
          </h1>
          <p className="text-[15px] text-zinc-400 leading-relaxed">
            Em menos de 2 minutos seu job estará ativo e visível para talentos.
          </p>
        </div>

        {/* Wizard card */}
        <div className="bg-white rounded-3xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.06)] p-8 sm:p-10 space-y-8">

          {/* Step bar + progress */}
          <StepBar current={0} pct={pct} />

          {/* Subscription guard */}
          {!isActive && (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 px-5 py-4 flex items-start gap-3">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" clipRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
              </svg>
              <div>
                <p className="text-[13px] font-medium text-amber-800">Assinatura inativa</p>
                <p className="text-[12px] text-amber-600 mt-0.5">
                  Ative seu plano para publicar vagas.{" "}
                  <button
                    onClick={() => router.push("/agency/finances")}
                    className="underline underline-offset-2 font-medium"
                  >
                    Ativar agora
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-6">

            {/* Job details */}
            <div className="space-y-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                Detalhes da Vaga
              </p>

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

              <Field
                label="Descrição" error={err("description")} required
                aside={
                  <span className={[
                    "text-[12px] tabular-nums",
                    form.description.length > DESC_MAX ? "text-rose-400 font-medium" : "text-zinc-400",
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
                  rows={5}
                  className={`${base} ${ring(!!err("description"))} px-4 py-3 resize-none leading-relaxed`}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

                <Field label="Localização" hint="Cidade, estado, ou 'Remoto'">
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    placeholder="ex: São Paulo, SP ou Remoto"
                    className={`${base} ${ring()} px-4 py-3`}
                  />
                </Field>
              </div>
            </div>

            {/* Terms */}
            <div className="space-y-5 pt-2 border-t border-zinc-50">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 pt-2">
                Termos
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Orçamento (BRL)" error={err("budget")} hint="Remuneração total pela vaga" required>
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

                <Field label="Prazo de Candidatura" error={err("deadline")} hint="Último dia para se candidatar" required>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => set("deadline", e.target.value)}
                    onBlur={() => touch("deadline")}
                    min={new Date().toISOString().split("T")[0]}
                    className={`${base} ${ring(!!err("deadline"))} px-4 py-3`}
                  />
                </Field>

                <Field label="Data da Vaga" hint="Quando o trabalho acontece (opcional)">
                  <input
                    type="date"
                    value={form.job_date}
                    onChange={(e) => set("job_date", e.target.value)}
                    className={`${base} ${ring()} px-4 py-3`}
                  />
                </Field>

                <Field label="Horário da Vaga">
                  <input
                    type="time"
                    value={form.job_time}
                    onChange={(e) => set("job_time", e.target.value)}
                    className={`${base} ${ring()} px-4 py-3`}
                  />
                </Field>

                <Field label="Função / Cargo">
                  <input
                    type="text"
                    value={form.job_role}
                    onChange={(e) => set("job_role", e.target.value)}
                    placeholder="ex: Modelo, Ator, Apresentador"
                    className={`${base} ${ring()} px-4 py-3`}
                  />
                </Field>

                <Field label="Talentos Necessários">
                  <input
                    type="number"
                    min="1"
                    value={form.number_of_talents_required}
                    onChange={(e) => set("number_of_talents_required", e.target.value)}
                    placeholder="1"
                    className={`${base} ${ring()} px-4 py-3`}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <Field label="Gênero">
                  <div className="relative">
                    <select
                      value={form.gender}
                      onChange={(e) => set("gender", e.target.value)}
                      className={`${base} ${ring()} px-4 py-3 appearance-none pr-10 cursor-pointer`}
                    >
                      <option value="any">Qualquer gênero</option>
                      <option value="male">Masculino</option>
                      <option value="female">Feminino</option>
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
                    type="number" min="1" max="100"
                    value={form.age_min}
                    onChange={(e) => set("age_min", e.target.value)}
                    onBlur={() => touch("age_min")}
                    placeholder="ex: 18"
                    className={`${base} ${ring(!!err("age_min"))} px-4 py-3`}
                  />
                </Field>

                <Field label="Idade Máxima" error={err("age_max")}>
                  <input
                    type="number" min="1" max="100"
                    value={form.age_max}
                    onChange={(e) => set("age_max", e.target.value)}
                    onBlur={() => touch("age_max")}
                    placeholder="ex: 35"
                    className={`${base} ${ring(!!err("age_max"))} px-4 py-3`}
                  />
                </Field>
              </div>
            </div>

            {/* Errors */}
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
                <p className="text-[13px] text-rose-600">{submitError}</p>
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading || !isActive}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[15px] font-medium px-8 py-3.5 rounded-xl transition-all duration-150"
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
                    {pct === 100 && (
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => router.push("/agency/dashboard")}
                className="text-[14px] text-zinc-400 hover:text-zinc-700 px-4 py-3 rounded-xl hover:bg-zinc-50 transition-all"
              >
                Pular por agora
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    {paywallOpen && <PaywallModal variant="limit" onClose={() => setPaywallOpen(false)} />}
    </>
  );
}
