"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import PhoneInput from "@/components/ui/PhoneInput";
import { TALENT_CATEGORY_LABELS, talentCategoryLabel } from "@/lib/talentCategories";

const TALENT_CATEGORIES = TALENT_CATEGORY_LABELS;

const GENDER_OPTIONS = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "other", label: "Outro" },
  { value: "prefer_not_to_say", label: "Prefiro não informar" },
];


const inputBase =
  "w-full px-4 py-3 text-[14px] rounded-xl border hover:border-zinc-300 focus:outline-none transition-colors bg-white placeholder:text-zinc-400";

function inputCls(hasError: boolean) {
  return `${inputBase} ${hasError ? "border-rose-300 focus:border-rose-400" : "border-zinc-200 focus:border-zinc-900"}`;
}

const labelCls = "block text-[12px] font-medium text-zinc-600 mb-1.5";

type Form = {
  fullName:    string;
  phone:       string;
  country:     string;
  city:        string;
  bio:         string;
  categories:  string[];
  age:         string;
  gender:      string;
  instagram:   string;
  tiktok:      string;
  youtube:     string;
  xHandle:     string;
  website:     string;
};

type FormErrors = Partial<Record<keyof Form, string>>;

const DEFAULTS: Form = {
  fullName: "", phone: "", country: "", city: "",
  bio: "", categories: [], age: "", gender: "",
  instagram: "", tiktok: "", youtube: "", xHandle: "", website: "",
};

const BIO_MAX = 300;

function validate(form: Form): FormErrors {
  const e: FormErrors = {};
  if (!form.fullName.trim())
    e.fullName = "Nome completo é obrigatório.";
  else if (form.fullName.trim().length < 2)
    e.fullName = "O nome deve ter pelo menos 2 caracteres.";
  if (form.bio.length > BIO_MAX)
    e.bio = `A bio deve ter no máximo ${BIO_MAX} caracteres (atualmente ${form.bio.length}).`;
  if (form.instagram && /[\s@]/.test(form.instagram))
    e.instagram = "Digite seu @ sem o símbolo ou espaços.";
  if (form.tiktok && /[\s@]/.test(form.tiktok))
    e.tiktok = "Digite seu @ sem o símbolo ou espaços.";
  if (form.xHandle && /[\s@]/.test(form.xHandle))
    e.xHandle = "Digite seu @ sem o símbolo ou espaços.";
  if (form.age && (isNaN(Number(form.age)) || Number(form.age) < 1 || Number(form.age) > 120))
    e.age = "Digite uma idade válida.";
  return e;
}

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] p-6 space-y-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{title}</p>
      {children}
    </div>
  );
}

function normalizeGender(value: string | null | undefined) {
  if (value === "Male") return "male";
  if (value === "Female") return "female";
  if (value === "Other" || value === "Non-binary") return "other";
  if (value === "Prefer not to say") return "prefer_not_to_say";
  return value ?? "";
}

export default function TalentProfileEdit() {
  const [form, setForm]       = useState<Form>(DEFAULTS);
  const [errors, setErrors]   = useState<FormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from("talent_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setForm({
          fullName:   data.full_name   ?? "",
          phone:      data.phone       ?? "",
          country:    data.country     ?? "",
          city:       data.city        ?? "",
          bio:        data.bio         ?? "",
          categories: data.categories  ?? [],
          age:        data.age != null ? String(data.age) : "",
          gender:     normalizeGender(data.gender),
          instagram:  data.instagram   ?? "",
          tiktok:     data.tiktok      ?? "",
          youtube:    data.youtube     ?? "",
          xHandle:    data.x_handle    ?? "",
          website:    data.website     ?? "",
        });
        if (data.avatar_url) setPreview(data.avatar_url);
      }
      setLoading(false);
    }
    load();
  }, []);

  function set(key: keyof Form, value: string) {
    const updated = { ...form, [key]: value };
    setForm(updated);
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors(validate(updated));
  }

  function toggleCategory(cat: string) {
    setForm((f) => ({
      ...f,
      categories: f.categories.some((c) => talentCategoryLabel(c) === cat)
        ? f.categories.filter((c) => talentCategoryLabel(c) !== cat)
        : [...f.categories, cat],
    }));
  }

  function addCustomCategory() {
    const category = customCategory.trim();
    if (!category || form.categories.some((c) => talentCategoryLabel(c).toLowerCase() === category.toLowerCase())) return;
    setForm((f) => ({ ...f, categories: [...f.categories, category] }));
    setCustomCategory("");
  }

  function handleAvatarChange(file: File) {
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ fullName: true, bio: true, instagram: true, tiktok: true, xHandle: true, age: true });
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setServerError("");
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setServerError("Não autenticado."); setSaving(false); return; }

    let avatarUrl: string | undefined;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const formData = new FormData();
      formData.append("file", avatarFile);
      formData.append("path", `avatars/${user.id}.${ext}`);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setServerError("Falha no envio da foto: " + (json.error ?? "Erro desconhecido"));
        setSaving(false);
        return;
      }
      avatarUrl = json.url;
    }

    const payload: Record<string, unknown> = {
      id:         user.id,
      user_id:    user.id,
      full_name:  form.fullName.trim(),
      phone:      form.phone.trim() || null,
      country:    form.country.trim() || null,
      city:       form.city.trim()    || null,
      bio:        form.bio.trim()     || null,
      categories: form.categories,
      age:        form.age ? Number(form.age) : null,
      gender:     form.gender || null,
      instagram:  form.instagram.trim() || null,
      tiktok:     form.tiktok.trim()    || null,
      youtube:    form.youtube.trim()   || null,
      x_handle:   form.xHandle.trim()  || null,
      website:    form.website.trim()  || null,
    };
    if (avatarUrl) payload.avatar_url = avatarUrl;

    const { error: dbError } = await supabase
      .from("talent_profiles")
      .upsert(payload, { onConflict: "id" });

    if (dbError) {
      setServerError(dbError.message);
      setSaving(false);
      return;
    }

    setSuccess(true);
    setSaving(false);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
      </div>
    );
  }

  const selectCls = `${inputBase} appearance-none pr-10 cursor-pointer`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Conta</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">Meu Perfil</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">

        {/* Profile Photo */}
        <Section title="Foto de Perfil">
          <div>
            <p className={labelCls}>Foto</p>
            <div
              onClick={() => fileRef.current?.click()}
              className="w-24 h-24 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 cursor-pointer transition-colors flex items-center justify-center overflow-hidden bg-zinc-50"
            >
              {preview ? (
                <img src={preview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-6 h-6 text-[#647B7B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </div>
            <input
              ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleAvatarChange(e.target.files[0]); }}
            />
            <p className="text-[11px] text-zinc-400 mt-1.5">Clique para enviar · JPG, PNG, WebP · máx 5 MB</p>
          </div>
        </Section>

        {/* Personal Info */}
        <Section title="Informações Pessoais">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Nome Completo <span className="text-rose-400">*</span></label>
              <input
                className={inputCls(!!errors.fullName && !!touched.fullName)}
                placeholder="Sofia Mendes"
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
              />
              {touched.fullName && <FieldError msg={errors.fullName} />}
            </div>

            {/* Phone with country code */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Telefone</label>
              <PhoneInput
                value={form.phone}
                onChange={(v) => set("phone", v)}
              />
            </div>

            <div>
              <label className={labelCls}>País</label>
              <input className={inputCls(false)} placeholder="Brasil" value={form.country}
                onChange={(e) => set("country", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Cidade</label>
              <input className={inputCls(false)} placeholder="São Paulo" value={form.city}
                onChange={(e) => set("city", e.target.value)} />
            </div>

            <div>
              <label className={labelCls}>Idade</label>
              <input
                type="number" min="1" max="120"
                className={inputCls(!!errors.age && !!touched.age)}
                placeholder="25"
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
              />
              {touched.age && <FieldError msg={errors.age} />}
            </div>

            <div>
              <label className={labelCls}>Gênero</label>
              <div className="relative">
                <select
                  value={form.gender}
                  onChange={(e) => set("gender", e.target.value)}
                  className={selectCls}
                >
                  <option value="">Selecione…</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Bio
              <span className={`ml-2 font-normal ${form.bio.length > BIO_MAX ? "text-rose-400" : "text-[#647B7B]"}`}>
                {form.bio.length}/{BIO_MAX}
              </span>
            </label>
            <textarea
              rows={4} className={`${inputCls(!!errors.bio && !!touched.bio)} resize-none`}
              placeholder="Conte às agências o que te torna único(a)."
              value={form.bio} onChange={(e) => set("bio", e.target.value)}
            />
            {touched.bio && <FieldError msg={errors.bio} />}
          </div>
        </Section>

        {/* Categories */}
        <Section title="Categorias">
          {form.categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
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
          <div className="flex flex-wrap gap-2">
            {TALENT_CATEGORIES.map((cat) => {
              const active = form.categories.some((c) => talentCategoryLabel(c) === cat);
              return (
                <button
                  key={cat} type="button" onClick={() => toggleCategory(cat)}
                  className={[
                    "px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer",
                    active ? "bg-[#1F2D2E] text-white" : "bg-[#E6F0F0] text-[#647B7B] hover:bg-[#DDE6E6]",
                  ].join(" ")}
                >
                  {cat === "Outro" ? "Outro / Personalizado" : cat}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls(false)}
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
        </Section>

        {/* Social Links */}
        <Section title="Redes Sociais">
          {/* Instagram */}
          <div>
            <label className={labelCls}>Instagram</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">@</span>
              <input
                className={`${inputCls(!!errors.instagram && !!touched.instagram)} pl-8`}
                placeholder="yourhandle"
                value={form.instagram}
                onChange={(e) => set("instagram", e.target.value)}
              />
            </div>
            {touched.instagram && <FieldError msg={errors.instagram} />}
          </div>

          {/* TikTok */}
          <div>
            <label className={labelCls}>TikTok</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">@</span>
              <input
                className={`${inputCls(!!errors.tiktok && !!touched.tiktok)} pl-8`}
                placeholder="yourhandle"
                value={form.tiktok}
                onChange={(e) => set("tiktok", e.target.value)}
              />
            </div>
            {touched.tiktok && <FieldError msg={errors.tiktok} />}
          </div>

          {/* X (Twitter) */}
          <div>
            <label className={labelCls}>X (Twitter)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">@</span>
              <input
                className={`${inputCls(!!errors.xHandle && !!touched.xHandle)} pl-8`}
                placeholder="yourhandle"
                value={form.xHandle}
                onChange={(e) => set("xHandle", e.target.value)}
              />
            </div>
            {touched.xHandle && <FieldError msg={errors.xHandle} />}
          </div>

          {/* YouTube */}
          <div>
            <label className={labelCls}>YouTube</label>
            <input className={inputCls(false)} placeholder="https://youtube.com/@channel" value={form.youtube}
              onChange={(e) => set("youtube", e.target.value)} />
          </div>

          {/* Website */}
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls(false)} placeholder="https://yourwebsite.com" value={form.website}
              onChange={(e) => set("website", e.target.value)} />
          </div>

        </Section>

        {serverError && (
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3.5">
            <p className="text-[13px] text-rose-600">{serverError}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3.5">
            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-[13px] text-emerald-700 font-medium">Perfil salvo com sucesso.</p>
          </div>
        )}

        <button
          type="submit" disabled={saving}
          className="w-full bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] hover:from-[#17A58A] hover:to-[#22B5C2] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
        >
          {saving ? "Salvando…" : "Salvar Perfil"}
        </button>
      </form>
    </div>
  );
}



