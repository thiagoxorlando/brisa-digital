"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const TALENT_CATEGORIES = [
  "Actor", "Model", "Influencer", "Dancer", "Singer",
  "Comedian", "Presenter", "Content Creator", "Photographer", "Athlete",
];

const GENDER_OPTIONS = ["", "Male", "Female", "Non-binary", "Other", "Prefer not to say"];

const COUNTRY_CODES = [
  { code: "+1",  flag: "🇺🇸", label: "US" },
  { code: "+1",  flag: "🇨🇦", label: "CA" },
  { code: "+55", flag: "🇧🇷", label: "BR" },
  { code: "+44", flag: "🇬🇧", label: "UK" },
  { code: "+34", flag: "🇪🇸", label: "ES" },
  { code: "+33", flag: "🇫🇷", label: "FR" },
  { code: "+49", flag: "🇩🇪", label: "DE" },
  { code: "+39", flag: "🇮🇹", label: "IT" },
  { code: "+52", flag: "🇲🇽", label: "MX" },
  { code: "+54", flag: "🇦🇷", label: "AR" },
  { code: "+61", flag: "🇦🇺", label: "AU" },
  { code: "+81", flag: "🇯🇵", label: "JP" },
  { code: "+86", flag: "🇨🇳", label: "CN" },
  { code: "+91", flag: "🇮🇳", label: "IN" },
  { code: "+7",  flag: "🇷🇺", label: "RU" },
];

const inputBase =
  "w-full px-4 py-3 text-[14px] rounded-xl border hover:border-zinc-300 focus:outline-none transition-colors bg-white placeholder:text-zinc-400";

function inputCls(hasError: boolean) {
  return `${inputBase} ${hasError ? "border-rose-300 focus:border-rose-400" : "border-zinc-200 focus:border-zinc-900"}`;
}

const labelCls = "block text-[12px] font-medium text-zinc-600 mb-1.5";

type Form = {
  fullName:    string;
  phoneCode:   string;
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
  imdb:        string;
};

type FormErrors = Partial<Record<keyof Form, string>>;

const DEFAULTS: Form = {
  fullName: "", phoneCode: "+1", phone: "", country: "", city: "",
  bio: "", categories: [], age: "", gender: "",
  instagram: "", tiktok: "", youtube: "", xHandle: "", website: "", imdb: "",
};

const BIO_MAX = 300;

function validate(form: Form): FormErrors {
  const e: FormErrors = {};
  if (!form.fullName.trim())
    e.fullName = "Full name is required.";
  else if (form.fullName.trim().length < 2)
    e.fullName = "Name must be at least 2 characters.";
  if (form.bio.length > BIO_MAX)
    e.bio = `Bio must be ${BIO_MAX} characters or fewer (currently ${form.bio.length}).`;
  if (form.instagram && /[\s@]/.test(form.instagram))
    e.instagram = "Enter your handle without @ or spaces.";
  if (form.tiktok && /[\s@]/.test(form.tiktok))
    e.tiktok = "Enter your handle without @ or spaces.";
  if (form.xHandle && /[\s@]/.test(form.xHandle))
    e.xHandle = "Enter your handle without @ or spaces.";
  if (form.age && (isNaN(Number(form.age)) || Number(form.age) < 1 || Number(form.age) > 120))
    e.age = "Enter a valid age.";
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
        // Parse stored phone into code + number
        const storedPhone: string = data.phone ?? "";
        let phoneCode = "+1";
        let phone = storedPhone;
        for (const cc of COUNTRY_CODES) {
          if (storedPhone.startsWith(cc.code + " ")) {
            phoneCode = cc.code;
            phone = storedPhone.slice(cc.code.length + 1);
            break;
          }
        }

        setForm({
          fullName:   data.full_name   ?? "",
          phoneCode,
          phone,
          country:    data.country     ?? "",
          city:       data.city        ?? "",
          bio:        data.bio         ?? "",
          categories: data.categories  ?? [],
          age:        data.age != null ? String(data.age) : "",
          gender:     data.gender      ?? "",
          instagram:  data.instagram   ?? "",
          tiktok:     data.tiktok      ?? "",
          youtube:    data.youtube     ?? "",
          xHandle:    data.x_handle    ?? "",
          website:    data.website     ?? "",
          imdb:       data.imdb        ?? "",
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
      categories: f.categories.includes(cat)
        ? f.categories.filter((c) => c !== cat)
        : [...f.categories, cat],
    }));
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
    if (!user) { setServerError("Not authenticated."); setSaving(false); return; }

    let avatarUrl: string | undefined;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const formData = new FormData();
      formData.append("file", avatarFile);
      formData.append("path", `avatars/${user.id}.${ext}`);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setServerError("Photo upload failed: " + (json.error ?? "Unknown error"));
        setSaving(false);
        return;
      }
      avatarUrl = json.url;
    }

    const fullPhone = form.phone.trim()
      ? `${form.phoneCode} ${form.phone.trim()}`
      : "";

    const payload: Record<string, unknown> = {
      id:         user.id,
      user_id:    user.id,
      full_name:  form.fullName.trim(),
      phone:      fullPhone || null,
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
      imdb:       form.imdb.trim()     || null,
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
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Account</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-zinc-900 leading-tight">My Profile</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">

        {/* Profile Photo */}
        <Section title="Profile Photo">
          <div>
            <p className={labelCls}>Photo</p>
            <div
              onClick={() => fileRef.current?.click()}
              className="w-24 h-24 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-zinc-400 cursor-pointer transition-colors flex items-center justify-center overflow-hidden bg-zinc-50"
            >
              {preview ? (
                <img src={preview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-6 h-6 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </div>
            <input
              ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleAvatarChange(e.target.files[0]); }}
            />
            <p className="text-[11px] text-zinc-400 mt-1.5">Click to upload · JPG, PNG, WebP · max 5 MB</p>
          </div>
        </Section>

        {/* Personal Info */}
        <Section title="Personal Info">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Full Name <span className="text-rose-400">*</span></label>
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
              <label className={labelCls}>Phone Number</label>
              <div className="flex gap-2">
                <div className="relative">
                  <select
                    value={form.phoneCode}
                    onChange={(e) => set("phoneCode", e.target.value)}
                    className="pl-3 pr-8 py-3 text-[14px] rounded-xl border border-zinc-200 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none bg-white appearance-none cursor-pointer transition-colors"
                  >
                    {COUNTRY_CODES.map((cc) => (
                      <option key={`${cc.flag}-${cc.code}`} value={cc.code}>
                        {cc.flag} {cc.code}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <input
                  className={`${inputCls(false)} flex-1`}
                  placeholder="(555) 000-0000"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Country</label>
              <input className={inputCls(false)} placeholder="Brazil" value={form.country}
                onChange={(e) => set("country", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input className={inputCls(false)} placeholder="São Paulo" value={form.city}
                onChange={(e) => set("city", e.target.value)} />
            </div>

            <div>
              <label className={labelCls}>Age</label>
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
              <label className={labelCls}>Gender</label>
              <div className="relative">
                <select
                  value={form.gender}
                  onChange={(e) => set("gender", e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select…</option>
                  {GENDER_OPTIONS.filter(Boolean).map((g) => (
                    <option key={g} value={g}>{g}</option>
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
              <span className={`ml-2 font-normal ${form.bio.length > BIO_MAX ? "text-rose-400" : "text-zinc-300"}`}>
                {form.bio.length}/{BIO_MAX}
              </span>
            </label>
            <textarea
              rows={4} className={`${inputCls(!!errors.bio && !!touched.bio)} resize-none`}
              placeholder="Tell agencies what makes you unique."
              value={form.bio} onChange={(e) => set("bio", e.target.value)}
            />
            {touched.bio && <FieldError msg={errors.bio} />}
          </div>
        </Section>

        {/* Categories */}
        <Section title="Categories">
          <div className="flex flex-wrap gap-2">
            {TALENT_CATEGORIES.map((cat) => {
              const active = form.categories.includes(cat);
              return (
                <button
                  key={cat} type="button" onClick={() => toggleCategory(cat)}
                  className={[
                    "px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer",
                    active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                  ].join(" ")}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Social Links */}
        <Section title="Social Links">
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

          {/* IMDb */}
          <div>
            <label className={labelCls}>IMDb</label>
            <input className={inputCls(false)} placeholder="https://imdb.com/name/nm..." value={form.imdb}
              onChange={(e) => set("imdb", e.target.value)} />
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
            <p className="text-[13px] text-emerald-700 font-medium">Profile saved successfully.</p>
          </div>
        )}

        <button
          type="submit" disabled={saving}
          className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
        >
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
