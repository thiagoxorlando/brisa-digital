"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PhoneInput from "@/components/ui/PhoneInput";
import { TALENT_CATEGORY_LABELS, talentCategoryLabel } from "@/lib/talentCategories";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "agency" | "talent" | null;

type TalentForm = {
  fullName:   string;
  phone:      string;
  country:    string;
  city:       string;
  gender:     string;
  age:        string;
  bio:        string;
  categories: string[];
  instagram:  string;
  tiktok:     string;
  youtube:    string;
  linkedin:   string;
  website:    string;
  main_role:  string;
};

type AgencyForm = {
  companyName:  string;
  contactName:  string;
  phone:        string;
  country:      string;
  city:         string;
  description:  string;
  website:      string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TALENT_CATEGORIES = TALENT_CATEGORY_LABELS;

const TALENT_DEFAULTS: TalentForm = {
  fullName: "", phone: "", country: "", city: "",
  gender: "", age: "",
  bio: "", categories: [],
  instagram: "", tiktok: "", youtube: "",
  linkedin: "", website: "",
  main_role: "",
};

const AGENCY_DEFAULTS: AgencyForm = {
  companyName: "", contactName: "", phone: "",
  country: "", city: "", description: "", website: "",
};

const STEPS = [
  { label: "Básico",       subtitle: "Informações pessoais" },
  { label: "Profissional", subtitle: "Habilidades e experiência" },
  { label: "Social",       subtitle: "Redes e links" },
  { label: "Revisão",      subtitle: "Confirmar e salvar" },
] as const;

// ── Shared helpers ────────────────────────────────────────────────────────────

const inputBase =
  "w-full px-4 py-3 text-[14px] rounded-xl border hover:border-zinc-300 focus:outline-none transition-colors bg-white placeholder:text-zinc-400";

const inputCls = `${inputBase} border-zinc-200 focus:border-zinc-900`;

function inputErrCls(hasError: boolean) {
  return `${inputBase} ${
    hasError ? "border-rose-300 focus:border-rose-400" : "border-zinc-200 focus:border-zinc-900"
  }`;
}

const labelCls = "block text-[12px] font-medium text-zinc-600 mb-1.5";

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

function Field({
  label, children, hint, error,
}: {
  label: string; children: React.ReactNode; hint?: string; error?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {error ? <FieldError msg={error} /> : hint && <p className="text-[11px] text-zinc-400 mt-1">{hint}</p>}
    </div>
  );
}

function AvatarUpload({
  label, preview, onChange,
}: { label: string; preview: string | null; onChange: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className={labelCls}>{label}</p>
      <div
        onClick={() => ref.current?.click()}
        className="w-24 h-24 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 cursor-pointer transition-colors flex items-center justify-center overflow-hidden bg-zinc-50"
      >
        {preview ? (
          <img src={preview} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <svg className="w-6 h-6 text-[#647B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
          </svg>
        )}
      </div>
      <input
        ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onChange(e.target.files[0]); }}
      />
      <p className="text-[11px] text-zinc-400 mt-1.5">Clique para enviar · JPG, PNG, WebP</p>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => {
        const done    = i < current;
        const active  = i === current;
        const isLast  = i === STEPS.length - 1;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={[
                "w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all",
                done   ? "bg-[#1F2D2E] text-white" :
                active ? "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white ring-4 ring-[#1ABC9C]/20" :
                         "bg-zinc-100 text-zinc-400",
              ].join(" ")}>
                {done ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={[
                "text-[10px] font-semibold whitespace-nowrap",
                active ? "text-zinc-900" : "text-zinc-400",
              ].join(" ")}>
                {s.label}
              </span>
            </div>
            {!isLast && (
              <div className={[
                "flex-1 h-[2px] mx-2 mb-4 rounded-full transition-all",
                done ? "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6]" : "bg-[#DDE6E6]",
              ].join(" ")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1 — Basic info ───────────────────────────────────────────────────────

type Step1Errors = { fullName?: string; phone?: string; country?: string; city?: string };

function validateStep1(form: TalentForm): Step1Errors {
  const e: Step1Errors = {};
  if (!form.fullName.trim()) e.fullName = "Nome completo é obrigatório.";
  else if (form.fullName.trim().length < 2) e.fullName = "Mínimo de 2 caracteres.";
  if (!form.phone.trim()) e.phone = "Telefone é obrigatório.";
  if (!form.country.trim()) e.country = "País é obrigatório.";
  if (!form.city.trim()) e.city = "Cidade é obrigatória.";
  return e;
}

function Step1({
  form, onChange, avatar, preview, onAvatar,
}: {
  form: TalentForm;
  onChange: (k: keyof TalentForm, v: string) => void;
  avatar: File | null;
  preview: string | null;
  onAvatar: (f: File) => void;
}) {
  const [errors, setErrors] = useState<Step1Errors>({});
  // expose validate to parent via event
  return (
    <div className="space-y-5" id="step1-form">
      <AvatarUpload label="Foto de Perfil" preview={preview} onChange={onAvatar} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Nome Completo *" error={errors.fullName}>
            <input
              className={inputErrCls(!!errors.fullName)}
              placeholder="Sofia Mendes"
              value={form.fullName}
              onChange={(e) => {
                onChange("fullName", e.target.value);
                setErrors((prev) => ({ ...prev, fullName: undefined }));
              }}
            />
          </Field>
        </div>
        <Field label="Telefone *" error={errors.phone}>
          <PhoneInput
            value={form.phone}
            onChange={(v) => {
              onChange("phone", v);
              setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            hasError={!!errors.phone}
            required
          />
        </Field>
        <div />
        <Field label="País *" error={errors.country}>
          <input
            className={inputErrCls(!!errors.country)}
            placeholder="Brasil"
            value={form.country}
            onChange={(e) => {
              onChange("country", e.target.value);
              setErrors((prev) => ({ ...prev, country: undefined }));
            }}
          />
        </Field>
        <Field label="Cidade *" error={errors.city}>
          <input
            className={inputErrCls(!!errors.city)}
            placeholder="São Paulo"
            value={form.city}
            onChange={(e) => {
              onChange("city", e.target.value);
              setErrors((prev) => ({ ...prev, city: undefined }));
            }}
          />
        </Field>
        <Field label="Função Principal">
          <input
            className={inputCls}
            placeholder="ex: Modelo, Ator, Influenciador"
            value={form.main_role}
            onChange={(e) => onChange("main_role", e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

// ── Step 2 — Professional info ────────────────────────────────────────────────

const BIO_MAX = 300;

function Step2({
  form, onChange,
}: {
  form: TalentForm;
  onChange: (k: keyof TalentForm, v: string | string[]) => void;
}) {
  const [customCategory, setCustomCategory] = useState("");

  function toggleCategory(cat: string) {
    onChange(
      "categories",
      form.categories.some((c) => talentCategoryLabel(c) === cat)
        ? form.categories.filter((c) => talentCategoryLabel(c) !== cat)
        : [...form.categories, cat]
    );
  }

  function addCustomCategory() {
    const category = customCategory.trim();
    if (!category || form.categories.some((c) => talentCategoryLabel(c).toLowerCase() === category.toLowerCase())) return;
    onChange("categories", [...form.categories, category]);
    setCustomCategory("");
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Gênero">
          <select className={inputCls} value={form.gender} onChange={(e) => onChange("gender", e.target.value)}>
            <option value="">Selecione</option>
            <option value="male">Masculino</option>
            <option value="female">Feminino</option>
            <option value="other">Outro</option>
          </select>
        </Field>
        <Field label="Idade">
          <input
            type="number" min={16} max={99}
            className={inputCls} placeholder="25"
            value={form.age}
            onChange={(e) => onChange("age", e.target.value)}
          />
        </Field>
      </div>

      <Field
        label={`Bio — ${form.bio.length}/${BIO_MAX}`}
        hint="Conte às agências o que te torna único."
        error={form.bio.length > BIO_MAX ? `Máximo de ${BIO_MAX} caracteres.` : undefined}
      >
        <textarea
          rows={4}
          className={`${inputErrCls(form.bio.length > BIO_MAX)} resize-none`}
          placeholder="Sou um criador de lifestyle baseado em São Paulo…"
          value={form.bio}
          onChange={(e) => onChange("bio", e.target.value)}
        />
      </Field>

      <div>
        <p className={labelCls}>Categorias <span className="text-zinc-400 font-normal">(selecione todas que se aplicam)</span></p>
        {form.categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {form.categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(talentCategoryLabel(cat))}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1F2D2E] px-3 py-1.5 text-[12px] font-semibold text-white"
              >
                {talentCategoryLabel(cat)}
                <span className="text-white/60">×</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-1.5">
          {TALENT_CATEGORIES.map((cat) => {
            const active = form.categories.some((c) => talentCategoryLabel(c) === cat);
            return (
              <button
                key={cat} type="button" onClick={() => toggleCategory(cat)}
                className={[
                  "px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer",
                  active
                    ? "bg-[#1F2D2E] text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                ].join(" ")}
              >
                {cat === "Outro" ? "Outro / Personalizado" : cat}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className={inputCls}
            placeholder="Digite uma categoria personalizada"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomCategory();
              }
            }}
          />
          <button
            type="button"
            onClick={addCustomCategory}
            className="rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-4 text-[13px] font-semibold text-white transition-colors hover:from-[#17A58A] hover:to-[#22B5C2]"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 3 — Social links ─────────────────────────────────────────────────────

function SocialInput({
  label, prefix, placeholder, value, onChange, hint,
}: {
  label: string; prefix?: string; placeholder: string;
  value: string; onChange: (v: string) => void; hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {prefix ? (
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 select-none">{prefix}</span>
          <input
            className={`${inputCls} pl-8`}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/^[@\s]+/, ""))}
          />
        </div>
      ) : (
        <input
          className={inputCls}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function Step3({
  form, onChange,
}: {
  form: TalentForm;
  onChange: (k: keyof TalentForm, v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-zinc-400">Todos os campos são opcionais — adicione os que usar.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SocialInput
          label="Instagram"
          prefix="@"
          placeholder="seuhandle"
          value={form.instagram}
          onChange={(v) => onChange("instagram", v)}
        />
        <SocialInput
          label="TikTok"
          prefix="@"
          placeholder="seuhandle"
          value={form.tiktok}
          onChange={(v) => onChange("tiktok", v)}
        />
        <SocialInput
          label="YouTube"
          placeholder="https://youtube.com/@canal"
          value={form.youtube}
          onChange={(v) => onChange("youtube", v)}
        />
        <SocialInput
          label="LinkedIn"
          placeholder="https://linkedin.com/in/seuperfil"
          value={form.linkedin}
          onChange={(v) => onChange("linkedin", v)}
        />
        <SocialInput
          label="Website"
          placeholder="https://seuperfil.com"
          value={form.website}
          onChange={(v) => onChange("website", v)}
        />
      </div>
    </div>
  );
}

// ── Step 4 — Review ───────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-50 last:border-0">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 w-32 flex-shrink-0 mt-0.5">{label}</p>
      <p className="text-[13px] text-zinc-700 flex-1 leading-snug">{value}</p>
    </div>
  );
}

function Step4({
  form, preview,
}: {
  form: TalentForm;
  preview: string | null;
}) {
  const socials = [
    form.instagram && `Instagram: @${form.instagram}`,
    form.tiktok    && `TikTok: @${form.tiktok}`,
    form.youtube   && `YouTube: ${form.youtube}`,
    form.linkedin  && `LinkedIn: ${form.linkedin}`,
    form.website   && `Website: ${form.website}`,
  ].filter(Boolean).join("\n");

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-zinc-500">Revise suas informações antes de salvar. Você pode editar depois.</p>

      {/* Avatar preview */}
      {preview && (
        <div className="flex items-center gap-3">
          <img src={preview} alt="avatar" className="w-14 h-14 rounded-2xl object-cover" />
          <p className="text-[13px] font-medium text-zinc-700">{form.fullName || "—"}</p>
        </div>
      )}

      {/* Data summary */}
      <div className="bg-zinc-50 rounded-2xl border border-zinc-100 px-5 py-1">
        <ReviewRow label="Nome"       value={form.fullName} />
        <ReviewRow label="Telefone"   value={form.phone} />
        <ReviewRow label="País"       value={form.country} />
        <ReviewRow label="Cidade"     value={form.city} />
        <ReviewRow label="Gênero"     value={
          form.gender === "male" ? "Masculino" :
          form.gender === "female" ? "Feminino" :
          form.gender === "other" ? "Outro" : undefined
        } />
        <ReviewRow label="Idade"      value={form.age || undefined} />
        <ReviewRow label="Bio"        value={form.bio || undefined} />
        <ReviewRow label="Categorias" value={form.categories.length ? form.categories.map(talentCategoryLabel).join(", ") : undefined} />
        <ReviewRow label="Redes"      value={socials || undefined} />
      </div>
    </div>
  );
}

// ── Multi-step talent form ────────────────────────────────────────────────────

function TalentSetup({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [step, setStep]       = useState(0);
  const [form, setForm]       = useState<TalentForm>(TALENT_DEFAULTS);
  const [avatar, setAvatar]   = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  function update(k: keyof TalentForm, v: string | string[]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleAvatar(file: File) {
    setAvatar(file);
    setPreview(URL.createObjectURL(file));
  }

  // Per-step validation before allowing Next
  function canProceed(): { ok: boolean; msg: string } {
    if (step === 0) {
      const errs = validateStep1(form);
      if (Object.keys(errs).length > 0) {
        const first = Object.values(errs)[0]!;
        return { ok: false, msg: first };
      }
    }
    if (step === 1 && form.bio.length > BIO_MAX) {
      return { ok: false, msg: `Bio deve ter no máximo ${BIO_MAX} caracteres.` };
    }
    return { ok: true, msg: "" };
  }

  function handleNext() {
    const { ok, msg } = canProceed();
    if (!ok) { setError(msg); return; }
    setError("");
    setStep((s) => s + 1);
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");

    let avatarUrl: string | undefined;
    if (avatar) {
      const ext = avatar.name.split(".").pop();
      const fd  = new FormData();
      fd.append("file", avatar);
      fd.append("path", `avatars/${userId}.${ext}`);
      const res  = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError("Falha ao enviar foto: " + (json.error ?? "Erro desconhecido"));
        setLoading(false);
        return;
      }
      avatarUrl = json.url;
    }

    const payload: Record<string, unknown> = {
      id:         userId,
      full_name:  form.fullName.trim(),
      phone:      form.phone.trim(),
      country:    form.country.trim(),
      city:       form.city.trim(),
      gender:     form.gender   || null,
      age:        form.age      ? parseInt(form.age, 10) : null,
      bio:        form.bio.trim(),
      categories: form.categories,
      instagram:  form.instagram.trim() || null,
      tiktok:     form.tiktok.trim()    || null,
      youtube:    form.youtube.trim()   || null,
      linkedin:   form.linkedin.trim()  || null,
      website:    form.website.trim()   || null,
      main_role:  form.main_role.trim()  || null,
    };
    if (avatarUrl) payload.avatar_url = avatarUrl;

    const { error: dbErr } = await supabase
      .from("talent_profiles")
      .upsert(payload, { onConflict: "id" });

    if (dbErr) {
      setError(dbErr.message);
      setLoading(false);
      return;
    }

    // Mark onboarding complete
    await fetch("/api/auth/complete-onboarding", { method: "POST" });

    onDone();
  }

  const stepTitles = ["Informações Básicas", "Perfil Profissional", "Redes Sociais", "Revisão"];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Card */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-0.5">
            Etapa {step + 1} de {STEPS.length}
          </p>
          <h2 className="text-[1.1rem] font-semibold text-zinc-900">{stepTitles[step]}</h2>
        </div>

        {step === 0 && (
          <Step1 form={form} onChange={update} avatar={avatar} preview={preview} onAvatar={handleAvatar} />
        )}
        {step === 1 && <Step2 form={form} onChange={update} />}
        {step === 2 && <Step3 form={form} onChange={update} />}
        {step === 3 && <Step4 form={form} preview={preview} />}

        {/* Inline error */}
        {error && (
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-[13px] text-rose-600">{error}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => { setError(""); setStep((s) => s - 1); }}
            className="flex-1 px-5 py-3 text-[14px] font-semibold border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer"
          >
            Voltar
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            className="flex-1 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] text-white text-[14px] font-semibold py-3 rounded-xl transition-colors cursor-pointer"
          >
            Próximo
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
          >
            {loading ? "Salvando…" : "Salvar Perfil"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Agency form (unchanged single-step) ──────────────────────────────────────

type AgencyErrors = Partial<Record<keyof AgencyForm, string>>;

function validateAgency(form: AgencyForm): AgencyErrors {
  const e: AgencyErrors = {};
  if (!form.companyName.trim()) e.companyName = "Nome da empresa é obrigatório.";
  else if (form.companyName.trim().length < 2) e.companyName = "Deve ter pelo menos 2 caracteres.";
  if (!form.contactName.trim()) e.contactName = "Nome do contato é obrigatório.";
  if (!form.phone.trim()) e.phone = "Telefone é obrigatório.";
  if (!form.country.trim()) e.country = "País é obrigatório.";
  if (!form.city.trim()) e.city = "Cidade é obrigatória.";
  if (form.description.length > 500) e.description = "Descrição deve ter no máximo 500 caracteres.";
  return e;
}

function AgencySetup({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [form, setForm]       = useState<AgencyForm>(AGENCY_DEFAULTS);
  const [errors, setErrors]   = useState<AgencyErrors>({});
  const [logo, setLogo]       = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  // Pre-populate from DB in case signup already saved some fields
  useEffect(() => {
    supabase
      .from("agencies")
      .select("company_name, contact_name, phone, country, city, description, website, avatar_url")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setForm({
          companyName:  (data as any).company_name  ?? "",
          contactName:  (data as any).contact_name  ?? "",
          phone:        (data as any).phone         ?? "",
          country:      (data as any).country       ?? "",
          city:         (data as any).city          ?? "",
          description:  (data as any).description   ?? "",
          website:      (data as any).website       ?? "",
        });
        if ((data as any).avatar_url) setPreview((data as any).avatar_url);
      });
  }, [userId]);

  function set(key: keyof AgencyForm, value: string) {
    const updated = { ...form, [key]: value };
    setForm(updated);
    setErrors(validateAgency(updated));
  }

  function handleLogo(file: File) {
    setLogo(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateAgency(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setServerError("");
    setLoading(true);

    let logoUrl: string | undefined;
    if (logo) {
      const ext = logo.name.split(".").pop();
      const fd  = new FormData();
      fd.append("file", logo);
      fd.append("path", `agency-avatars/${userId}.${ext}`);
      const res  = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setServerError("Falha ao enviar logo: " + (json.error ?? "Erro desconhecido"));
        setLoading(false);
        return;
      }
      logoUrl = json.url;
    }

    const payload: Record<string, unknown> = {
      id:           userId,
      company_name: form.companyName.trim(),
      contact_name: form.contactName.trim(),
      phone:        form.phone.trim(),
      country:      form.country.trim(),
      city:         form.city.trim(),
      description:  form.description.trim(),
      website:      form.website.trim(),
    };
    if (logoUrl) payload.avatar_url = logoUrl;

    const { error: dbError } = await supabase.from("agencies").upsert(payload, { onConflict: "id" });

    if (dbError) {
      setServerError(dbError.message);
      setLoading(false);
      return;
    }

    // Mark onboarding complete
    await fetch("/api/auth/complete-onboarding", { method: "POST" });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Logo da Empresa</p>
        <AvatarUpload label="Logo" preview={preview} onChange={handleLogo} />
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Dados da Empresa</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome da Empresa *" error={errors.companyName}>
            <input className={inputErrCls(!!errors.companyName)} placeholder="Spark Agency" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
          </Field>
          <Field label="Nome do Contato *" error={errors.contactName}>
            <input className={inputErrCls(!!errors.contactName)} placeholder="Carlos Rodrigues" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="Telefone *" error={errors.phone}>
            <PhoneInput
              value={form.phone}
              onChange={(v) => set("phone", v)}
              hasError={!!errors.phone}
              required
            />
          </Field>
          <Field label="Website">
            <input className={inputCls} placeholder="https://sparkagency.com" value={form.website} onChange={(e) => set("website", e.target.value)} />
          </Field>
          <Field label="País *" error={errors.country}>
            <input className={inputErrCls(!!errors.country)} placeholder="Brasil" value={form.country} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="Cidade *" error={errors.city}>
            <input className={inputErrCls(!!errors.city)} placeholder="São Paulo" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
        </div>
        <Field label={`Descrição — ${form.description.length}/500`} hint="O que faz a sua agência?" error={errors.description}>
          <textarea rows={4} className={`${inputErrCls(!!errors.description)} resize-none`}
            placeholder="Conectamos os melhores criadores com marcas líderes…"
            value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3.5">
          <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-[13px] text-rose-600">{serverError}</p>
        </div>
      )}

      <button
        type="submit" disabled={loading}
        className="w-full bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
      >
        {loading ? "Salvando…" : "Salvar Perfil"}
      </button>
    </form>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

export default function SetupProfile() {
  const router              = useRouter();
  const [role, setRole]     = useState<Role>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      setUserId(user.id);
      setRole((data?.role as Role) ?? null);
      setChecking(false);
    }
    load();
  }, [router]);

  function handleDone() {
    if (role === "agency") router.push("/agency/first-job");
    else router.push("/talent/dashboard");
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
            {role === "agency" ? "Configuração da Agência" : "Configure seu Perfil"}
          </p>
          <h1 className="text-[1.5rem] font-semibold tracking-tight text-zinc-900">
            {role === "agency" ? "Dados da empresa" : "Bem-vindo à Brisa Digital"}
          </h1>
          {role === "talent" && (
            <p className="text-[13px] text-zinc-400 mt-1">
              Complete seu perfil para ter acesso a vagas e contratos.
            </p>
          )}
        </div>

        {userId && role === "talent" && (
          <TalentSetup userId={userId} onDone={handleDone} />
        )}
        {userId && role === "agency" && (
          <AgencySetup userId={userId} onDone={handleDone} />
        )}
        {!role && (
          <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center">
            <p className="text-[14px] text-zinc-500">Nenhuma função encontrada.</p>
            <button
              onClick={() => router.push("/onboarding/role")}
              className="mt-4 text-[13px] font-medium text-zinc-900 underline"
            >
              Selecione uma função primeiro
            </button>
          </div>
        )}

      </div>
    </div>
  );
}



