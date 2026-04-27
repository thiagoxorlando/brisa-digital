"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type FormData = {
  name: string;
  bio: string;
  category: string;
  location: string;
  instagram: string;
  tiktok: string;
  youtube: string;
};

type FormErrors = Partial<Record<keyof FormData, string>>;

const INITIAL: FormData = {
  name: "", bio: "", category: "", location: "",
  instagram: "", tiktok: "", youtube: "",
};

const CATEGORIES = [
  "Lifestyle & Fashion", "Technology", "Food & Cooking", "Health & Fitness",
  "Travel", "Beauty", "Gaming", "Music", "Comedy", "Education", "Other",
];

function validate(form: FormData): FormErrors {
  const e: FormErrors = {};
  if (!form.name.trim())
    e.name = "Nome completo é obrigatório.";
  else if (form.name.trim().length < 2)
    e.name = "Nome deve ter pelo menos 2 caracteres.";
  if (form.bio.length > 400)
    e.bio = "Bio deve ter no máximo 400 caracteres.";
  if (form.instagram && /[\s@]/.test(form.instagram))
    e.instagram = "Informe o @ sem espaços.";
  if (form.tiktok && /[\s@]/.test(form.tiktok))
    e.tiktok = "Informe o @ sem espaços.";
  return e;
}

const inputBase =
  "w-full rounded-xl border bg-white px-4 py-3 text-[15px] text-zinc-900 placeholder:text-zinc-400 hover:border-zinc-300 focus:outline-none transition-colors duration-150";

function inputCls(hasError: boolean) {
  return `${inputBase} ${hasError ? "border-rose-300 focus:border-rose-400" : "border-zinc-200 focus:border-zinc-900"}`;
}

const labelClass = "block text-[13px] font-medium text-zinc-600 mb-1.5";

const card = "bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-7";

const sectionHeader = "text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-5";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-[12px] text-rose-500 mt-1.5">
      <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      {msg}
    </p>
  );
}

function SuccessScreen() {
  return (
    <div className="max-w-md mx-auto pt-20 text-center">
      <div className="relative w-16 h-16 mx-auto mb-6">
        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-25" />
        <span className="relative flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500 text-white shadow-sm">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 mb-2">Perfil Criado</p>
      <h2 className="text-[1.5rem] font-semibold tracking-tight text-zinc-900 mb-2">Talento adicionado ao elenco</h2>
      <p className="text-[14px] text-zinc-500 mb-1">Redirecionando para a lista de talentos…</p>
      <p className="text-[12px] text-zinc-400 flex items-center justify-center gap-1.5 mt-4">
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Aguarde
      </p>
    </div>
  );
}

export default function CreateTalentForm() {
  const router = useRouter();
  const [form, setForm]           = useState<FormData>(INITIAL);
  const [errors, setErrors]       = useState<FormErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverError, setServerError] = useState("");
  const [saving, setSaving]       = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function set(field: keyof FormData, value: string) {
    const updated = { ...form, [field]: value };
    setForm(updated);
    if (submitAttempted) setErrors(validate(updated));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    setServerError("");

    const city    = form.location.split(",")[0]?.trim() ?? "";
    const country = form.location.split(",")[1]?.trim() ?? "";

    const { error } = await supabase.from("talent_profiles").insert({
      id:         crypto.randomUUID(),
      full_name:  form.name.trim(),
      bio:        form.bio.trim() || null,
      categories: form.category ? [form.category] : [],
      city:       city || null,
      country:    country || null,
      instagram:  form.instagram.trim() || null,
      tiktok:     form.tiktok.trim()    || null,
      youtube:    form.youtube.trim()   || null,
    });

    setSaving(false);

    if (error) {
      setServerError(error.message);
      return;
    }

    setSubmitted(true);
    setTimeout(() => router.push("/agency/talent"), 1800);
  }

  if (submitted) return <SuccessScreen />;

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="max-w-2xl space-y-6">

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Roster</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Adicionar Talento</h1>
        <p className="text-[13px] text-zinc-400 mt-1">Crie um novo perfil e adicione ao seu elenco de talentos.</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">

        {/* ── Validation banner ── */}
        {submitAttempted && hasErrors && (
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3.5">
            <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-[13px] text-rose-600">Corrija os erros abaixo antes de continuar.</p>
          </div>
        )}

        {serverError && (
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3.5">
            <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-[13px] text-rose-600">{serverError}</p>
          </div>
        )}

        {/* ── Basic Info ── */}
        <div className={card}>
          <p className={sectionHeader}>Informações Básicas</p>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>
                  Nome Completo <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Sofia Mendes"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputCls(!!errors.name)}
                />
                <FieldError msg={errors.name} />
              </div>
              <div>
                <label className={labelClass}>Categoria</label>
                <div className="relative">
                  <select
                    value={form.category}
                    onChange={(e) => set("category", e.target.value)}
                    className={`${inputCls(false)} appearance-none pr-10 cursor-pointer`}
                  >
                    <option value="">Selecione uma categoria…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Bio
                <span className={`ml-2 font-normal ${form.bio.length > 400 ? "text-rose-400" : "text-[#647B7B]"}`}>
                  {form.bio.length}/400
                </span>
              </label>
              <textarea
                rows={4}
                placeholder="Conte sobre este talento — nicho, estilo e o que o diferencia…"
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
                className={`${inputCls(!!errors.bio)} resize-none leading-relaxed`}
              />
              <FieldError msg={errors.bio} />
            </div>

            <div>
              <label className={labelClass}>Localização</label>
              <input
                type="text"
                placeholder="São Paulo, BR"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                className={inputCls(false)}
              />
              <p className="text-[11px] text-zinc-400 mt-1">Cidade, País — ex: São Paulo, Brasil</p>
            </div>
          </div>
        </div>

        {/* ── Social Links ── */}
        <div className={card}>
          <p className={sectionHeader}>Redes Sociais</p>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {([
                { key: "instagram" as const, label: "Instagram" },
                { key: "tiktok"    as const, label: "TikTok"    },
              ] as const).map(({ key, label }) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 pointer-events-none select-none">@</span>
                    <input
                      type="text"
                      placeholder="username"
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      className={`${inputCls(!!errors[key])} pl-8`}
                    />
                  </div>
                  <FieldError msg={errors[key]} />
                </div>
              ))}
            </div>
            <div>
              <label className={labelClass}>YouTube</label>
              <input
                type="text"
                placeholder="channel handle"
                value={form.youtube}
                onChange={(e) => set("youtube", e.target.value)}
                className={inputCls(false)}
              />
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:bg-zinc-300 disabled:cursor-not-allowed active:scale-[0.98] text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-all duration-150 shadow-sm cursor-pointer"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Salvando…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Criar Perfil
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push("/agency/talent")}
            className="text-[14px] font-medium text-zinc-400 hover:text-zinc-700 px-4 py-3 rounded-xl hover:bg-zinc-50 transition-all duration-150 cursor-pointer"
          >
            Cancelar
          </button>
        </div>

      </form>
    </div>
  );
}


