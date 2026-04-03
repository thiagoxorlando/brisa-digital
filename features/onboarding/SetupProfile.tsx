"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "agency" | "talent" | null;

type TalentForm = {
  fullName: string;
  phone: string;
  country: string;
  city: string;
  bio: string;
  categories: string[];
  instagram: string;
  tiktok: string;
  youtube: string;
};

type AgencyForm = {
  companyName: string;
  contactName: string;
  phone: string;
  country: string;
  city: string;
  description: string;
  website: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TALENT_CATEGORIES = [
  "Actor", "Model", "Influencer", "Dancer", "Singer",
  "Comedian", "Presenter", "Content Creator", "Photographer", "Athlete",
];

const TALENT_DEFAULTS: TalentForm = {
  fullName: "", phone: "", country: "", city: "",
  bio: "", categories: [], instagram: "", tiktok: "", youtube: "",
};

const AGENCY_DEFAULTS: AgencyForm = {
  companyName: "", contactName: "", phone: "",
  country: "", city: "", description: "", website: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputBase =
  "w-full px-4 py-3 text-[14px] rounded-xl border hover:border-zinc-300 focus:outline-none transition-colors bg-white placeholder:text-zinc-400";

const inputCls = `${inputBase} border-zinc-200 focus:border-zinc-900`;

function inputErrCls(hasError: boolean) {
  return `${inputBase} ${hasError ? "border-rose-300 focus:border-rose-400" : "border-zinc-200 focus:border-zinc-900"}`;
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
}: { label: string; children: React.ReactNode; hint?: string; error?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {error ? <FieldError msg={error} /> : hint && <p className="text-[11px] text-zinc-400 mt-1">{hint}</p>}
    </div>
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
          <svg className="w-6 h-6 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M12 4v16m8-8H4" />
          </svg>
        )}
      </div>
      <input
        ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onChange(e.target.files[0]); }}
      />
      <p className="text-[11px] text-zinc-400 mt-1.5">Click to upload · JPG, PNG, WebP</p>
    </div>
  );
}

// ── Talent form ───────────────────────────────────────────────────────────────

type TalentErrors = Partial<Record<keyof TalentForm, string>>;
const BIO_MAX = 300;

function validateTalent(form: TalentForm): TalentErrors {
  const e: TalentErrors = {};
  if (!form.fullName.trim()) e.fullName = "Full name is required.";
  else if (form.fullName.trim().length < 2) e.fullName = "Name must be at least 2 characters.";
  if (form.bio.length > BIO_MAX) e.bio = `Bio must be ${BIO_MAX} characters or fewer.`;
  if (form.instagram && /[\s@]/.test(form.instagram)) e.instagram = "Enter handle without @ or spaces.";
  if (form.tiktok && /[\s@]/.test(form.tiktok)) e.tiktok = "Enter handle without @ or spaces.";
  return e;
}

function TalentSetup({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [form, setForm]       = useState<TalentForm>(TALENT_DEFAULTS);
  const [errors, setErrors]   = useState<TalentErrors>({});
  const [avatar, setAvatar]   = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  function set(key: keyof TalentForm, value: string) {
    const updated = { ...form, [key]: value };
    setForm(updated);
    setErrors(validateTalent(updated));
  }

  function toggleCategory(cat: string) {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter((c) => c !== cat)
        : [...f.categories, cat],
    }));
  }

  function handleAvatar(file: File) {
    setAvatar(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateTalent(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setServerError("");
    setLoading(true);

    // Upload avatar if selected
    let avatarUrl: string | undefined;
    if (avatar) {
      const ext = avatar.name.split(".").pop();
      const formData = new FormData();
      formData.append("file", avatar);
      formData.append("path", `avatars/${userId}.${ext}`);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setServerError("Photo upload failed: " + (json.error ?? "Unknown error"));
        setLoading(false);
        return;
      }
      avatarUrl = json.url;
    }

    const payload: Record<string, unknown> = {
      id:         userId,
      user_id:    userId,
      full_name:  form.fullName.trim(),
      phone:      form.phone.trim(),
      country:    form.country.trim(),
      city:       form.city.trim(),
      bio:        form.bio.trim(),
      categories: form.categories,
      instagram:  form.instagram.trim(),
      tiktok:     form.tiktok.trim(),
      youtube:    form.youtube.trim(),
    };
    if (avatarUrl) payload.avatar_url = avatarUrl;

    const { error: dbError } = await supabase
      .from("talent_profiles")
      .upsert(payload, { onConflict: "id" });

    if (dbError) {
      setServerError(dbError.message);
      setLoading(false);
      return;
    }

    onDone();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      <Section title="Profile Photo">
        <AvatarUpload label="Photo" preview={preview} onChange={handleAvatar} />
      </Section>

      <Section title="Personal Info">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name *" error={errors.fullName}>
            <input
              className={inputErrCls(!!errors.fullName)}
              placeholder="Sofia Mendes"
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
            />
          </Field>
          <Field label="Phone Number">
            <input className={inputCls} placeholder="+55 11 99999-9999" value={form.phone}
              onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Country">
            <input className={inputCls} placeholder="Brazil" value={form.country}
              onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="City">
            <input className={inputCls} placeholder="São Paulo" value={form.city}
              onChange={(e) => set("city", e.target.value)} />
          </Field>
        </div>
        <Field
          label={`Bio — ${form.bio.length}/${BIO_MAX}`}
          hint="Tell agencies what makes you unique."
          error={errors.bio}
        >
          <textarea
            rows={4} className={`${inputErrCls(!!errors.bio)} resize-none`}
            placeholder="I'm a lifestyle creator based in São Paulo…"
            value={form.bio} onChange={(e) => set("bio", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Categories">
        <div className="flex flex-wrap gap-2">
          {TALENT_CATEGORIES.map((cat) => {
            const active = form.categories.includes(cat);
            return (
              <button
                key={cat} type="button" onClick={() => toggleCategory(cat)}
                className={[
                  "px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer",
                  active
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                ].join(" ")}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Social Links">
        <Field label="Instagram" error={errors.instagram}>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">@</span>
            <input
              className={`${inputErrCls(!!errors.instagram)} pl-8`}
              placeholder="yourhandle"
              value={form.instagram}
              onChange={(e) => set("instagram", e.target.value)}
            />
          </div>
        </Field>
        <Field label="TikTok" error={errors.tiktok}>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">@</span>
            <input
              className={`${inputErrCls(!!errors.tiktok)} pl-8`}
              placeholder="yourhandle"
              value={form.tiktok}
              onChange={(e) => set("tiktok", e.target.value)}
            />
          </div>
        </Field>
        <Field label="YouTube">
          <input className={inputCls} placeholder="https://youtube.com/@channel" value={form.youtube}
            onChange={(e) => set("youtube", e.target.value)} />
        </Field>
      </Section>

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
        className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
      >
        {loading ? "Saving…" : "Save Profile"}
      </button>
    </form>
  );
}

// ── Agency form ───────────────────────────────────────────────────────────────

type AgencyErrors = Partial<Record<keyof AgencyForm, string>>;

function validateAgency(form: AgencyForm): AgencyErrors {
  const e: AgencyErrors = {};
  if (!form.companyName.trim()) e.companyName = "Company name is required.";
  else if (form.companyName.trim().length < 2) e.companyName = "Must be at least 2 characters.";
  if (form.description.length > 500) e.description = "Description must be 500 characters or fewer.";
  return e;
}

function AgencySetup({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [form, setForm]       = useState<AgencyForm>(AGENCY_DEFAULTS);
  const [errors, setErrors]   = useState<AgencyErrors>({});
  const [logo, setLogo]       = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

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

    const { error: dbError } = await supabase.from("agencies").upsert({
      id:           userId,
      company_name: form.companyName.trim(),
      contact_name: form.contactName.trim(),
      phone:        form.phone.trim(),
      country:      form.country.trim(),
      city:         form.city.trim(),
      description:  form.description.trim(),
      website:      form.website.trim(),
    }, { onConflict: "id" });

    if (dbError) {
      setServerError(dbError.message);
      setLoading(false);
      return;
    }

    onDone();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      <Section title="Company Logo">
        <AvatarUpload label="Logo" preview={preview} onChange={handleLogo} />
      </Section>

      <Section title="Company Info">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Company Name *" error={errors.companyName}>
            <input
              className={inputErrCls(!!errors.companyName)}
              placeholder="Spark Agency"
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
            />
          </Field>
          <Field label="Contact Name">
            <input className={inputCls} placeholder="Carlos Rodrigues" value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="Phone Number">
            <input className={inputCls} placeholder="+55 11 99999-9999" value={form.phone}
              onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Website">
            <input className={inputCls} placeholder="https://sparkagency.com" value={form.website}
              onChange={(e) => set("website", e.target.value)} />
          </Field>
          <Field label="Country">
            <input className={inputCls} placeholder="Brazil" value={form.country}
              onChange={(e) => set("country", e.target.value)} />
          </Field>
          <Field label="City">
            <input className={inputCls} placeholder="São Paulo" value={form.city}
              onChange={(e) => set("city", e.target.value)} />
          </Field>
        </div>
        <Field
          label={`Company Description — ${form.description.length}/500`}
          hint="What does your agency do?"
          error={errors.description}
        >
          <textarea
            rows={4} className={`${inputErrCls(!!errors.description)} resize-none`}
            placeholder="We connect top creators with leading brands across Latin America…"
            value={form.description} onChange={(e) => set("description", e.target.value)}
          />
        </Field>
      </Section>

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
        className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors cursor-pointer active:scale-[0.99]"
      >
        {loading ? "Saving…" : "Save Profile"}
      </button>
    </form>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

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
    if (role === "agency") router.push("/agency/dashboard");
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">
              {role === "agency" ? "Agency Setup" : "Talent Setup"}
            </p>
            <h1 className="text-[1.5rem] font-semibold tracking-tight text-zinc-900">
              Set up your profile
            </h1>
          </div>
          <button
            onClick={handleDone}
            className="text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
          >
            Skip for now
          </button>
        </div>

        {/* Form */}
        {userId && role === "talent" && (
          <TalentSetup userId={userId} onDone={handleDone} />
        )}
        {userId && role === "agency" && (
          <AgencySetup userId={userId} onDone={handleDone} />
        )}
        {!role && (
          <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center">
            <p className="text-[14px] text-zinc-500">No role found.</p>
            <button
              onClick={() => router.push("/onboarding/role")}
              className="mt-4 text-[13px] font-medium text-zinc-900 underline"
            >
              Select a role first
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
