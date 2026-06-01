"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/LanguageContext";
import PhoneInput from "@/components/ui/PhoneInput";
import { TALENT_CATEGORY_LABELS, talentCategoryLabel } from "@/lib/talentCategories";
import { formatCpf, isValidCpf, digitsOnly, formatCpfCnpj, isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/cpf";
import { buildPlanSettingsFallback, formatPlanMonthlyPrice, planLimitHighlights, type PublicPlanSetting } from "@/lib/planSettings.shared";

type Role = "agency" | "talent" | null;
type AgencyPlan = "free" | "pro" | "premium";
type LivePlans = Record<AgencyPlan, PublicPlanSetting>;

type TalentForm = {
  fullName: string;
  cpf: string;
  phone: string;
  country: string;
  city: string;
  gender: string;
  age: string;
  bio: string;
  categories: string[];
  instagram: string;
  tiktok: string;
  youtube: string;
  linkedin: string;
  website: string;
};

type AgencyForm = {
  companyName: string;
  contactName: string;
  phone: string;
  country: string;
  city: string;
  description: string;
  website: string;
  cpfCnpj: string;
  plan: AgencyPlan;
};

type AgencyRow = {
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  description?: string | null;
  website?: string | null;
  avatar_url?: string | null;
};

type TalentRow = {
  full_name?: string | null;
  phone?: string | null;
  country?: string | null;
  city?: string | null;
  gender?: string | null;
  age?: number | null;
  bio?: string | null;
  categories?: string[] | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  linkedin?: string | null;
  website?: string | null;
  avatar_url?: string | null;
};

type ProfileRow = {
  cpf_cnpj?: string | null;
};

type TalentErrors = {
  fullName?: string;
  cpf?: string;
  phone?: string;
  country?: string;
  city?: string;
  bio?: string;
  categories?: string;
  customOther?: string;
};

type AgencyErrors = Partial<Record<keyof AgencyForm, string>>;

function planDisplayPrice(plan: PublicPlanSetting) {
  return plan.is_available ? formatPlanMonthlyPrice(plan.price) : "Em breve";
}

const TALENT_DEFAULTS: TalentForm = {
  fullName: "",
  cpf: "",
  phone: "",
  country: "",
  city: "",
  gender: "",
  age: "",
  bio: "",
  categories: [],
  instagram: "",
  tiktok: "",
  youtube: "",
  linkedin: "",
  website: "",
};

const AGENCY_DEFAULTS: AgencyForm = {
  companyName: "",
  contactName: "",
  phone: "",
  country: "",
  city: "",
  description: "",
  website: "",
  cpfCnpj: "",
  plan: "free",
};

const BIO_MAX = 300;
const TALENT_CATEGORIES = TALENT_CATEGORY_LABELS;

const inputBase =
  "w-full rounded-2xl border px-4 py-3 text-[14px] transition-colors outline-none bg-white placeholder:text-zinc-400";

const labelCls = "mb-1.5 block text-[12px] font-medium text-[#516667]";

function inputCls(hasError = false) {
  return `${inputBase} ${hasError ? "border-rose-300 focus:border-rose-400" : "border-[#DDE6E6] hover:border-zinc-300 focus:border-[#0E7C86]"}`;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1.5 text-[12px] text-rose-500">{msg}</p>;
}

function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {error ? <FieldError msg={error} /> : hint ? <p className="mt-1 text-[11px] text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-zinc-100 bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{eyebrow}</p>
        <h2 className="mt-1 text-[1.05rem] font-semibold tracking-tight text-zinc-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function AvatarUpload({
  label,
  preview,
  onChange,
}: {
  label: string;
  preview: string | null;
  onChange: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className={labelCls}>{label}</p>
      <div
        onClick={() => ref.current?.click()}
        className="flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 transition-colors hover:border-zinc-400"
      >
        {preview ? (
          <img src={preview} alt="preview" className="h-full w-full object-cover" />
        ) : (
          <svg className="h-6 w-6 text-[#647B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
          </svg>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.[0]) onChange(event.target.files[0]);
        }}
      />
      <p className="mt-1.5 text-[11px] text-zinc-400">Clique para enviar · JPG, PNG, WebP</p>
    </div>
  );
}

function SocialInput({
  label,
  prefix,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  prefix?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      {prefix ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">{prefix}</span>
          <input
            className={`${inputCls()} pl-8`}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value.replace(/^[@\s]+/, ""))}
          />
        </div>
      ) : (
        <input
          className={inputCls()}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

function validateTalent(form: TalentForm, customOtherText: string, lang: string): TalentErrors {
  const errors: TalentErrors = {};
  if (!form.fullName.trim()) errors.fullName = lang === "en" ? "Full name is required." : "Nome completo é obrigatório.";
  else if (form.fullName.trim().length < 2) errors.fullName = lang === "en" ? "Minimum 2 characters." : "Mínimo de 2 caracteres.";
  if (!form.cpf.trim()) errors.cpf = lang === "en" ? "Document number is required." : "Documento é obrigatório.";
  else if (lang !== "en" && !isValidCpf(digitsOnly(form.cpf))) errors.cpf = "CPF inválido. Verifique os números.";
  if (!form.phone.trim()) errors.phone = "Telefone é obrigatório.";
  if (!form.country.trim()) errors.country = "País é obrigatório.";
  if (!form.city.trim()) errors.city = "Cidade é obrigatória.";
  if (form.bio.length > BIO_MAX) errors.bio = `Máximo de ${BIO_MAX} caracteres.`;
  if (form.categories.includes("Outro") && !customOtherText.trim()) {
    errors.customOther = "Descreva sua categoria personalizada.";
  }
  return errors;
}

function validateAgency(form: AgencyForm, lang: string): AgencyErrors {
  const errors: AgencyErrors = {};
  if (!form.companyName.trim()) errors.companyName = lang === "en" ? "Company name is required." : "Nome da empresa é obrigatório.";
  else if (form.companyName.trim().length < 2) errors.companyName = lang === "en" ? "Must be at least 2 characters." : "Deve ter pelo menos 2 caracteres.";
  if (!form.contactName.trim()) errors.contactName = lang === "en" ? "Contact name is required." : "Nome do contato é obrigatório.";
  if (!form.phone.trim()) errors.phone = lang === "en" ? "Phone is required." : "Telefone é obrigatório.";
  if (!form.country.trim()) errors.country = lang === "en" ? "Country is required." : "País é obrigatório.";
  if (!form.city.trim()) errors.city = lang === "en" ? "City is required." : "Cidade é obrigatória.";
  if (form.description.length > 500) errors.description = lang === "en" ? "Description must be at most 500 characters." : "Descrição deve ter no máximo 500 caracteres.";
  // CPF/CNPJ only required for PT/Brazilian users — EN users use Stripe (no CPF needed)
  if (lang !== "en") {
    if (!form.cpfCnpj.trim()) errors.cpfCnpj = "CPF ou CNPJ é obrigatório.";
    else if (!isValidCpfCnpj(normalizeCpfCnpj(form.cpfCnpj))) errors.cpfCnpj = "CPF (11 dígitos) ou CNPJ (14 dígitos) inválido.";
  }
  return errors;
}

function TalentSetup({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { lang } = useT();
  const [form, setForm] = useState<TalentForm>(TALENT_DEFAULTS);
  const [errors, setErrors] = useState<TalentErrors>({});
  const [customOtherText, setCustomOtherText] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    async function loadInitialData() {
      const [talentResult, profileResult] = await Promise.all([
        supabase
          .from("talent_profiles")
          .select("full_name, phone, country, city, gender, age, bio, categories, instagram, tiktok, youtube, linkedin, website, avatar_url")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("cpf_cnpj")
          .eq("id", userId)
          .maybeSingle(),
      ]);

      const talent = talentResult.data as TalentRow | null;
      const profile = profileResult.data as ProfileRow | null;

      if (talent) {
        const initialCategories = talent.categories ?? [];
        const presetCategories = initialCategories.filter((category) => TALENT_CATEGORIES.includes(category as never));
        const customCategory = initialCategories.find((category) => !TALENT_CATEGORIES.includes(category as never));

        setForm((current) => ({
          ...current,
          fullName: talent.full_name ?? current.fullName,
          cpf: formatCpf(profile?.cpf_cnpj ?? current.cpf),
          phone: talent.phone ?? current.phone,
          country: talent.country ?? current.country,
          city: talent.city ?? current.city,
          gender: talent.gender ?? current.gender,
          age: talent.age != null ? String(talent.age) : current.age,
          bio: talent.bio ?? current.bio,
          categories: customCategory ? [...presetCategories, "Outro"] : presetCategories,
          instagram: talent.instagram ?? current.instagram,
          tiktok: talent.tiktok ?? current.tiktok,
          youtube: talent.youtube ?? current.youtube,
          linkedin: talent.linkedin ?? current.linkedin,
          website: talent.website ?? current.website,
        }));

        if (customCategory) setCustomOtherText(customCategory);
        if (talent.avatar_url) setPreview(talent.avatar_url);
        return;
      }

      if (profile?.cpf_cnpj) {
        setForm((current) => ({ ...current, cpf: formatCpf(profile.cpf_cnpj ?? current.cpf) }));
      }
    }

    void loadInitialData();
  }, [userId]);

  function update<K extends keyof TalentForm>(key: K, value: TalentForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setServerError("");
  }

  function handleAvatar(file: File) {
    setAvatar(file);
    setPreview(URL.createObjectURL(file));
  }

  function toggleCategory(category: string) {
    const value = category === "Outro" ? "Outro" : category;
    const active = form.categories.includes(value);
    update(
      "categories",
      active ? form.categories.filter((item) => item !== value) : [...form.categories, value],
    );

    if (active && value === "Outro") {
      setCustomOtherText("");
      setErrors((current) => ({ ...current, customOther: undefined }));
    }
  }

  async function handleSubmit() {
    if (loading) return;

    const validation = validateTalent(form, customOtherText, lang);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setLoading(true);
    setServerError("");

    let avatarUrl: string | undefined;
    if (avatar) {
      const ext = avatar.name.split(".").pop();
      const fd = new FormData();
      fd.append("file", avatar);
      fd.append("path", `avatars/${userId}.${ext}`);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      const uploadJson = await uploadRes.json().catch(() => ({})) as { error?: string; url?: string };
      if (!uploadRes.ok) {
        setServerError("Falha ao enviar foto: " + (uploadJson.error ?? "Erro desconhecido"));
        setLoading(false);
        return;
      }
      avatarUrl = uploadJson.url;
    }

    const resolvedCategories = form.categories.map((category) =>
      category === "Outro" && customOtherText.trim() ? customOtherText.trim() : category,
    );

    const talent: Record<string, unknown> = {
      full_name: form.fullName.trim(),
      cpf: digitsOnly(form.cpf),
      phone: form.phone.trim(),
      country: form.country.trim(),
      city: form.city.trim(),
      gender: form.gender || null,
      age: form.age ? parseInt(form.age, 10) : null,
      bio: form.bio.trim(),
      categories: resolvedCategories,
      instagram: form.instagram.trim() || null,
      tiktok: form.tiktok.trim() || null,
      youtube: form.youtube.trim() || null,
      linkedin: form.linkedin.trim() || null,
      website: form.website.trim() || null,
    };
    if (avatarUrl) talent.avatar_url = avatarUrl;

    try {
      const res = await fetch("/api/auth/setup-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "talent", talent }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string };

      if (!res.ok) {
        setServerError(json.error ?? "Erro ao salvar perfil. Tente novamente.");
        setLoading(false);
        return;
      }
    } catch {
      setServerError("Erro de conexão. Verifique sua internet e tente novamente.");
      setLoading(false);
      return;
    }

    onDone();
  }

  return (
    <div className="space-y-5">
      <SectionCard eyebrow="Perfil" title="Foto e informações principais">
        <div className="grid gap-5 lg:grid-cols-[140px_minmax(0,1fr)]">
          <AvatarUpload label="Foto de perfil" preview={preview} onChange={handleAvatar} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nome completo *" error={errors.fullName}>
                <input
                  className={inputCls(!!errors.fullName)}
                  placeholder="Sofia Mendes"
                  value={form.fullName}
                  onChange={(event) => update("fullName", event.target.value)}
                />
              </Field>
            </div>
            <Field
              label={lang === "en" ? "Document Number *" : "Documento *"}
              error={errors.cpf}
              hint={lang === "en" ? "Enter your identification document number" : "Somente números — 11 dígitos (CPF)"}
            >
              <input
                className={inputCls(!!errors.cpf)}
                placeholder={lang === "en" ? "Passport, SSN, National ID, Tax ID, etc." : "000.000.000-00"}
                inputMode={lang === "en" ? "text" : "numeric"}
                maxLength={lang === "en" ? 50 : 14}
                value={form.cpf}
                onChange={(event) => update("cpf", lang === "en" ? event.target.value : formatCpf(event.target.value))}
              />
            </Field>
            <Field label="Telefone *" error={errors.phone}>
              <PhoneInput value={form.phone} onChange={(value) => update("phone", value)} hasError={!!errors.phone} required />
            </Field>
            <Field label="País *" error={errors.country}>
              <input
                className={inputCls(!!errors.country)}
                placeholder="Brasil"
                value={form.country}
                onChange={(event) => update("country", event.target.value)}
              />
            </Field>
            <Field label="Cidade *" error={errors.city}>
              <input
                className={inputCls(!!errors.city)}
                placeholder="São Paulo"
                value={form.city}
                onChange={(event) => update("city", event.target.value)}
              />
            </Field>
            <div className="sm:col-span-2 rounded-2xl border border-[#DDE6E6] bg-[#F8FAFC] px-4 py-3">
              <p className="text-[12px] font-medium text-[#1F2D2E]">Estado</p>
              <p className="mt-1 text-[12px] text-[#647B7B]">Este perfil ainda não possui um campo separado de estado no cadastro detalhado atual.</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Profissional" title="Como você quer se apresentar">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Gênero">
              <select className={inputCls()} value={form.gender} onChange={(event) => update("gender", event.target.value)}>
                <option value="">Selecione</option>
                <option value="male">Masculino</option>
                <option value="female">Feminino</option>
                <option value="other">Outro</option>
              </select>
            </Field>
            <Field label="Idade">
              <input
                type="number"
                min={16}
                max={99}
                className={inputCls()}
                placeholder="25"
                value={form.age}
                onChange={(event) => update("age", event.target.value)}
              />
            </Field>
          </div>

          <Field
            label={`Bio — ${form.bio.length}/${BIO_MAX}`}
            hint="Conte às agências o que te torna único."
            error={errors.bio}
          >
            <textarea
              rows={4}
              className={`${inputCls(!!errors.bio)} resize-none`}
              placeholder="Sou um criador de lifestyle baseado em São Paulo…"
              value={form.bio}
              onChange={(event) => update("bio", event.target.value)}
            />
          </Field>

          <div>
            <p className={labelCls}>Categorias</p>
            <p className="mb-3 text-[12px] text-zinc-400">Selecione todas as categorias que fazem sentido para o seu perfil.</p>
            <div className="flex flex-wrap gap-2">
              {TALENT_CATEGORIES.map((category) => {
                const key = category === "Outro" ? "Outro" : category;
                const active = form.categories.includes(key);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={[
                      "rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all",
                      active ? "bg-[#1F2D2E] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                    ].join(" ")}
                  >
                    {category === "Outro" ? "Outro / Personalizado" : category}
                  </button>
                );
              })}
            </div>
            {form.categories.includes("Outro") ? (
              <div className="mt-4">
                <Field label="Descreva sua categoria *" error={errors.customOther}>
                  <input
                    className={inputCls(!!errors.customOther)}
                    placeholder="Ex: DJ, Mágico, Dublador…"
                    value={customOtherText}
                    onChange={(event) => {
                      setCustomOtherText(event.target.value);
                      setErrors((current) => ({ ...current, customOther: undefined }));
                    }}
                  />
                </Field>
              </div>
            ) : null}
            {errors.categories ? <FieldError msg={errors.categories} /> : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Redes" title="Links e canais sociais">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SocialInput label="Instagram" prefix="@" placeholder="seuhandle" value={form.instagram} onChange={(value) => update("instagram", value)} />
          <SocialInput label="TikTok" prefix="@" placeholder="seuhandle" value={form.tiktok} onChange={(value) => update("tiktok", value)} />
          <SocialInput label="YouTube" placeholder="https://youtube.com/@canal" value={form.youtube} onChange={(value) => update("youtube", value)} />
          <SocialInput label="LinkedIn" placeholder="https://linkedin.com/in/seuperfil" value={form.linkedin} onChange={(value) => update("linkedin", value)} />
          <div className="sm:col-span-2">
            <SocialInput label="Website" placeholder="https://seuperfil.com" value={form.website} onChange={(value) => update("website", value)} />
          </div>
        </div>
      </SectionCard>

      {serverError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3.5 text-[13px] text-rose-600">
          {serverError}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => { void handleSubmit(); }}
        disabled={loading}
        className="w-full rounded-2xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] py-3.5 text-[14px] font-semibold text-white transition-colors hover:from-[#17A58A] hover:to-[#22B5C2] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Salvando..." : "Salvar Perfil"}
      </button>
    </div>
  );
}

function AgencySetup({
  userId,
  onDone,
  initialPlan = "free",
}: {
  userId: string;
  onDone: () => void;
  initialPlan?: "free" | "pro" | "premium";
}) {
  const { lang } = useT();
  const [form, setForm] = useState<AgencyForm>({ ...AGENCY_DEFAULTS, plan: initialPlan });
  const [errors, setErrors] = useState<AgencyErrors>({});
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [manualCheckMsg, setManualCheckMsg] = useState<string | null>(null);
  const [livePlans, setLivePlans] = useState<LivePlans>(buildPlanSettingsFallback);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void fetch("/api/plan-settings").then(async (res) => {
      if (!res.ok) return;
      const data = await res.json() as LivePlans;
      setLivePlans((prev) => ({ ...prev, ...data }));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!waitingForPayment) return;

    async function checkStatus() {
      try {
        const res = await fetch("/api/asaas/plan/status");
        const json = await res.json() as { paid?: boolean };
        if (json.paid) {
          if (pollRef.current) clearInterval(pollRef.current);
          onDone();
        }
      } catch {}
    }

    pollRef.current = setInterval(() => { void checkStatus(); }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [waitingForPayment, onDone]);

  useEffect(() => {
    Promise.all([
      supabase
        .from("agencies")
        .select("company_name, contact_name, phone, country, city, description, website, avatar_url")
        .eq("id", userId)
        .single(),
      supabase
        .from("profiles")
        .select("cpf_cnpj")
        .eq("id", userId)
        .maybeSingle(),
    ]).then(([agencyResult, profileResult]) => {
      const agency = agencyResult.data as AgencyRow | null;
      const profile = profileResult.data as ProfileRow | null;
      if (!agency && !profile) return;

      setForm((current) => ({
        ...current,
        companyName: agency?.company_name ?? current.companyName,
        contactName: agency?.contact_name ?? current.contactName,
        phone: agency?.phone ?? current.phone,
        country: agency?.country ?? current.country,
        city: agency?.city ?? current.city,
        description: agency?.description ?? current.description,
        website: agency?.website ?? current.website,
        cpfCnpj: formatCpfCnpj(profile?.cpf_cnpj ?? current.cpfCnpj),
      }));

      if (agency?.avatar_url) setPreview(agency.avatar_url);
    });
  }, [userId]);

  function set<K extends keyof AgencyForm>(key: K, value: AgencyForm[K]) {
    const updated = { ...form, [key]: value };
    setForm(updated);
    setErrors(validateAgency(updated, lang));
    setServerError("");
  }

  function handleLogo(file: File) {
    setLogo(file);
    setPreview(URL.createObjectURL(file));
  }

  function openPaymentTab(url: string) {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    setPopupBlocked(popup === null);
  }

  async function handleManualCheck() {
    setManualCheckMsg(null);
    try {
      const res = await fetch("/api/asaas/plan/status");
      const json = await res.json() as { paid?: boolean };
      if (json.paid) {
        if (pollRef.current) clearInterval(pollRef.current);
        onDone();
      } else {
        setManualCheckMsg("Pagamento ainda não confirmado. Aguarde alguns instantes.");
      }
    } catch {
      setManualCheckMsg("Erro ao verificar pagamento. Tente novamente.");
    }
  }

  async function handleSubmit() {
    if (loading) return;

    const validation = validateAgency(form, lang);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const selectedPlan = livePlans[form.plan];
    if (!selectedPlan?.is_available) {
      setErrors({ plan: "Este plano ainda não está disponível." });
      return;
    }

    setServerError("");
    setLoading(true);

    let paymentWindow: Window | null = null;
    if (selectedPlan.price > 0) {
      paymentWindow = window.open("", "_blank", "noopener,noreferrer");
    }

    try {
      let logoUrl: string | undefined;
      if (logo) {
        const ext = logo.name.split(".").pop();
        const fd = new FormData();
        fd.append("file", logo);
        fd.append("path", `agency-avatars/${userId}.${ext}`);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
        const uploadJson = await uploadRes.json().catch(() => ({}) as Record<string, unknown>);
        if (!uploadRes.ok) {
          paymentWindow?.close();
          setServerError("Falha ao enviar logo: " + ((uploadJson as { error?: string }).error ?? "Erro desconhecido"));
          setLoading(false);
          return;
        }
        logoUrl = (uploadJson as { url?: string }).url;
      }

      const agency: Record<string, unknown> = {
        company_name: form.companyName.trim(),
        contact_name: form.contactName.trim(),
        phone: form.phone.trim(),
        country: form.country.trim(),
        city: form.city.trim(),
        description: form.description.trim(),
        website: form.website.trim(),
        cpf_cnpj: normalizeCpfCnpj(form.cpfCnpj),
      };
      if (logoUrl) agency.avatar_url = logoUrl;

      const res = await fetch("/api/auth/setup-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "agency", agency }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string };

      if (!res.ok) {
        paymentWindow?.close();
        setServerError(json.error ?? "Erro ao salvar perfil. Tente novamente.");
        setLoading(false);
        return;
      }

      if (selectedPlan.price > 0) {
        const cleanDoc = normalizeCpfCnpj(form.cpfCnpj);
        if (!isValidCpfCnpj(cleanDoc)) {
          paymentWindow?.close();
          setServerError(lang === "en" ? "Invalid document number. Please check and try again." : "CPF/CNPJ inválido. Verifique os números e tente novamente.");
          setLoading(false);
          return;
        }

        const checkoutRes = await fetch("/api/asaas/plan/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cpfCnpj: cleanDoc, plan: form.plan }),
        });
        const checkoutJson = await checkoutRes.json().catch(() => ({})) as { url?: string; error?: string };

        if (!checkoutRes.ok || !checkoutJson.url) {
          paymentWindow?.close();
          setServerError(checkoutJson.error ?? "Erro ao iniciar pagamento. Tente novamente.");
          setLoading(false);
          return;
        }

        if (paymentWindow) paymentWindow.location.href = checkoutJson.url;
        else setPopupBlocked(true);

        setPaymentUrl(checkoutJson.url);
        setWaitingForPayment(true);
        setLoading(false);
        return;
      }

      onDone();
    } catch {
      paymentWindow?.close();
      setServerError("Erro de conexão. Verifique sua internet e tente novamente.");
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  if (waitingForPayment) {
    return (
      <div className="space-y-4">
        <div className="rounded-[28px] border border-zinc-100 bg-white p-8 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <svg className="h-7 w-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="mt-4 text-[1.15rem] font-semibold text-zinc-900">Aguardando pagamento</h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-zinc-500">
            Finalize o pagamento na aba do Asaas. Assim que o pagamento for confirmado, continuaremos automaticamente.
          </p>
          {popupBlocked ? (
            <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-left text-[13px] text-amber-700">
              Não foi possível abrir a aba de pagamento. Clique em “Abrir pagamento novamente”.
            </div>
          ) : null}
          {manualCheckMsg ? (
            <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-[13px] text-zinc-500">{manualCheckMsg}</p>
          ) : null}
          <div className="mt-5 flex items-center justify-center gap-2 text-[12px] text-zinc-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-amber-500" />
            Verificando automaticamente...
          </div>
        </div>
        <div className="space-y-2.5">
          {paymentUrl ? (
            <button
              type="button"
              onClick={() => openPaymentTab(paymentUrl)}
              className="w-full rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] py-3.5 text-[14px] font-semibold text-white transition-colors hover:from-[#17A58A] hover:to-[#22B5C2]"
            >
              Abrir pagamento novamente
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { void handleManualCheck(); }}
            className="w-full rounded-xl border border-zinc-200 py-3.5 text-[14px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Verificar pagamento
          </button>
          <button
            type="button"
            onClick={() => {
              if (pollRef.current) clearInterval(pollRef.current);
              setWaitingForPayment(false);
              setManualCheckMsg(null);
              setPopupBlocked(false);
            }}
            className="w-full py-2 text-[13px] text-zinc-400 transition-colors hover:text-zinc-600"
          >
            Cancelar e voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard eyebrow="Marca" title="Logo da empresa">
        <AvatarUpload label="Logo" preview={preview} onChange={handleLogo} />
      </SectionCard>

      <SectionCard eyebrow="Empresa" title="Informações da agência">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome da empresa *" error={errors.companyName}>
            <input className={inputCls(!!errors.companyName)} placeholder="Spark Agency" value={form.companyName} onChange={(event) => set("companyName", event.target.value)} />
          </Field>
          <Field label="Nome do contato/responsável *" error={errors.contactName}>
            <input className={inputCls(!!errors.contactName)} placeholder="Carlos Rodrigues" value={form.contactName} onChange={(event) => set("contactName", event.target.value)} />
          </Field>
          {lang !== "en" && (
            <Field label="CPF / CNPJ *" error={errors.cpfCnpj} hint="Necessário para emissão de cobranças">
              <input
                className={inputCls(!!errors.cpfCnpj)}
                placeholder="000.000.000-00 ou 00.000.000/0001-00"
                inputMode="numeric"
                maxLength={18}
                value={form.cpfCnpj}
                onChange={(event) => set("cpfCnpj", formatCpfCnpj(event.target.value))}
              />
            </Field>
          )}
          <Field label="Telefone *" error={errors.phone}>
            <PhoneInput value={form.phone} onChange={(value) => set("phone", value)} hasError={!!errors.phone} required />
          </Field>
          <Field label="País *" error={errors.country}>
            <input className={inputCls(!!errors.country)} placeholder="Brasil" value={form.country} onChange={(event) => set("country", event.target.value)} />
          </Field>
          <Field label="Cidade *" error={errors.city}>
            <input className={inputCls(!!errors.city)} placeholder="São Paulo" value={form.city} onChange={(event) => set("city", event.target.value)} />
          </Field>
          <div className="sm:col-span-2 rounded-2xl border border-[#DDE6E6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-[12px] font-medium text-[#1F2D2E]">Estado</p>
            <p className="mt-1 text-[12px] text-[#647B7B]">Este cadastro detalhado ainda não possui um campo separado de estado na estrutura atual do perfil da agência.</p>
          </div>
          <div className="sm:col-span-2">
            <Field label="Website">
              <input className={inputCls()} placeholder="https://sparkagency.com" value={form.website} onChange={(event) => set("website", event.target.value)} />
            </Field>
          </div>
        </div>
        <div className="mt-4">
          <Field label={`Descrição — ${form.description.length}/500`} hint="O que faz a sua agência?" error={errors.description}>
            <textarea
              rows={4}
              className={`${inputCls(!!errors.description)} resize-none`}
              placeholder="Conectamos os melhores criadores com marcas líderes..."
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Plano" title="Escolha seu plano de início">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => { if (livePlans.free.is_available) set("plan", "free"); }}
            disabled={!livePlans.free.is_available}
            className={[
              "rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
              form.plan === "free" && livePlans.free.is_available ? "border-zinc-900 bg-zinc-50 shadow-sm" : "border-zinc-200 hover:border-zinc-300",
            ].join(" ")}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-zinc-900">{livePlans.free.name}</span>
              <span className="text-[13px] font-bold text-zinc-900">{planDisplayPrice(livePlans.free)}</span>
            </div>
            <ul className="space-y-1">
              {livePlans.free.is_available
                ? planLimitHighlights(livePlans.free).map((item) => <li key={item} className="text-[12px] text-zinc-500">· {item}</li>)
                : <li className="text-[12px] text-zinc-500">· Em breve</li>}
            </ul>
          </button>

          <button
            type="button"
            onClick={() => { if (livePlans.pro.is_available) set("plan", "pro"); }}
            disabled={!livePlans.pro.is_available}
            className={[
              "rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
              form.plan === "pro" && livePlans.pro.is_available ? "border-indigo-600 bg-indigo-50 shadow-sm" : "border-zinc-200 hover:border-indigo-300",
            ].join(" ")}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[14px] font-semibold text-zinc-900">{livePlans.pro.name}</span>
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white">{livePlans.pro.is_available ? "POPULAR" : "Em breve"}</span>
            </div>
            <p className="mb-2 text-[13px] font-bold text-indigo-700">{planDisplayPrice(livePlans.pro)}</p>
            <ul className="space-y-1">
              {livePlans.pro.is_available
                ? planLimitHighlights(livePlans.pro).map((item) => <li key={item} className="text-[12px] text-zinc-500">· {item}</li>)
                : <li className="text-[12px] text-zinc-500">· Em breve</li>}
            </ul>
          </button>

          <button
            type="button"
            onClick={() => { if (livePlans.premium.is_available) set("plan", "premium"); }}
            disabled={!livePlans.premium.is_available}
            className={[
              "rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
              form.plan === "premium" && livePlans.premium.is_available ? "border-indigo-600 bg-indigo-50 shadow-sm" : "border-zinc-200 hover:border-indigo-300",
            ].join(" ")}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[14px] font-semibold text-zinc-900">{livePlans.premium.name}</span>
              {!livePlans.premium.is_available ? <span className="rounded-full bg-zinc-400 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white">Em breve</span> : null}
            </div>
            <p className="mb-2 text-[13px] font-bold text-indigo-700">{planDisplayPrice(livePlans.premium)}</p>
            <ul className="space-y-1">
              {livePlans.premium.is_available
                ? planLimitHighlights(livePlans.premium).map((item) => <li key={item} className="text-[12px] text-zinc-500">· {item}</li>)
                : <li className="text-[12px] text-zinc-500">· Em breve</li>}
            </ul>
          </button>
        </div>
        {errors.plan ? <p className="mt-3 text-[12px] text-rose-600">{errors.plan}</p> : null}
      </SectionCard>

      {serverError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3.5 text-[13px] text-rose-600">
          {serverError}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => { void handleSubmit(); }}
        disabled={loading}
        className="w-full rounded-2xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] py-3.5 text-[14px] font-semibold text-white transition-colors hover:from-[#17A58A] hover:to-[#22B5C2] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Salvando..." : "Salvar Perfil"}
      </button>
    </div>
  );
}

export default function SetupProfile({
  nextPath = null,
  initialPlan = "free",
}: {
  nextPath?: string | null;
  initialPlan?: "free" | "pro" | "premium";
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      setUserId(user.id);
      setRole((data?.role as Role) ?? null);
      setChecking(false);
    }

    void load();
  }, [router]);

  function handleDone() {
    if (role === "agency") router.push("/agency/first-job");
    else router.push(nextPath ?? "/talent/dashboard");
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            {role === "agency" ? "Configuração da Agência" : "Configure seu Perfil"}
          </p>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-zinc-900">
            {role === "agency" ? "Complete os dados da sua agência" : "Bem-vindo à BrisaHub"}
          </h1>
          <p className="mt-2 text-[13px] text-zinc-500">
            {role === "agency"
              ? "Preencha tudo em uma única página para seguir para a próxima etapa da operação."
              : "Complete seu perfil em uma única página para entrar no painel e começar a se candidatar."}
          </p>
        </div>

        {userId && role === "talent" ? <TalentSetup userId={userId} onDone={handleDone} /> : null}
        {userId && role === "agency" ? <AgencySetup userId={userId} onDone={handleDone} initialPlan={initialPlan} /> : null}

        {!role ? (
          <div className="rounded-2xl border border-zinc-100 bg-white p-8 text-center">
            <p className="text-[14px] text-zinc-500">Nenhuma função encontrada.</p>
            <button
              onClick={() => router.push("/onboarding/role")}
              className="mt-4 text-[13px] font-medium text-zinc-900 underline"
            >
              Selecione uma função primeiro
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
