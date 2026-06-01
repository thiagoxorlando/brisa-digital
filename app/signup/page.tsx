"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import heroBrandImage from "@/public/landing/brisahub-hero-brand.png";
import PhoneInput from "@/components/ui/PhoneInput";
import { supabase } from "@/lib/supabase";
import { TALENT_CATEGORY_LABELS, talentCategoryLabelForLang } from "@/lib/talentCategories";
import { formatCpf, formatCpfCnpj, isValidCpfCnpj, normalizeCpfCnpj, digitsOnly } from "@/lib/cpf";
import { buildPlanSettingsFallback, formatPlanPricing, planLimitHighlights, premiumSeatHighlights, type PublicPlanSetting } from "@/lib/planSettings.shared";
import { useT } from "@/lib/LanguageContext";
import LanguageSelector from "@/components/LanguageSelector";
// ProTrialCheckoutModal removed — PRO signup now redirects to Stripe Checkout.

type LivePlans = Record<Plan, PublicPlanSetting>;

type Role = "agency" | "talent";
type Plan = "free" | "pro" | "premium";

type TalentForm = {
  fullName: string;
  cpf: string;
  phone: string;
  country: string;
  city: string;
  state: string;
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
  agencyName: string;
  responsibleName: string;
  cpfCnpj: string;
  phone: string;
  country: string;
  city: string;
  state: string;
  website: string;
  description: string;
  plan: Plan;
};

type AccountForm = {
  role: Role;
  email: string;
  password: string;
  termsAccepted: boolean;
};

type FormErrors = Record<string, string | undefined>;

// Countries shown in signup dropdowns with their dial codes.
const SIGNUP_COUNTRIES = [
  { label: "United States", value: "United States", phone: "+1"   },
  { label: "Brazil",        value: "Brasil",        phone: "+55"  },
  { label: "Canada",        value: "Canada",        phone: "+1"   },
  { label: "United Kingdom",value: "United Kingdom",phone: "+44"  },
  { label: "Australia",     value: "Australia",     phone: "+61"  },
  { label: "Portugal",      value: "Portugal",      phone: "+351" },
  { label: "Mexico",        value: "Mexico",        phone: "+52"  },
  { label: "Argentina",     value: "Argentina",     phone: "+54"  },
] as const;

const COUNTRY_PHONE_MAP: Record<string, string> = Object.fromEntries(
  SIGNUP_COUNTRIES.map((c) => [c.value, c.phone])
);

const TALENT_DEFAULTS: TalentForm = {
  fullName: "",
  cpf: "",
  phone: "",
  country: "",
  city: "",
  state: "",
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
  agencyName: "",
  responsibleName: "",
  cpfCnpj: "",
  phone: "",
  country: "",
  city: "",
  state: "",
  website: "",
  description: "",
  plan: "free",
};

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function loginHref(refToken: string | null, jobId: string | null, nextPath: string | null, email?: string) {
  const params = new URLSearchParams();
  if (refToken) params.set("ref", refToken);
  if (jobId) params.set("job", jobId);
  if (nextPath) params.set("next", nextPath);
  if (email) params.set("email", email);
  const qs = params.toString();
  return qs ? `/login?${qs}` : "/login";
}

function FeaturePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white/88 backdrop-blur-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
      {children}
    </span>
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
    <section className="rounded-[28px] border border-[#E3ECEC] p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#647B7B]">{eyebrow}</p>
        <h3 className="mt-1 text-lg font-semibold text-[#102224]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1.5 text-[12px] text-rose-500">{error}</p>;
}

function inputClass(hasError = false, locked = false) {
  if (locked) return "w-full rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-[14px] text-teal-900 cursor-not-allowed outline-none";
  return `w-full rounded-2xl border px-4 py-3 text-[14px] outline-none transition-colors ${hasError ? "border-rose-300 focus:border-rose-400" : "border-[#DDE6E6] focus:border-[#0E7C86]"}`;
}

function LabeledInput({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[#516667]">{label}</label>
      {children}
      {error ? <FieldError error={error} /> : hint ? <p className="mt-1 text-[11px] text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function UploadTile({
  label,
  preview,
  onChange,
}: {
  label: string;
  preview: string | null;
  onChange: (file: File) => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 block text-[12px] font-medium text-[#516667]">{label}</p>
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
      <p className="mt-1.5 text-[11px] text-zinc-400">{t("signup_photo_hint")}</p>
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
    <LabeledInput label={label}>
      {prefix ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">{prefix}</span>
          <input
            className={`${inputClass()} pl-8`}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value.replace(/^[@\s]+/, ""))}
          />
        </div>
      ) : (
        <input className={inputClass()} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </LabeledInput>
  );
}

function SignupPageContent() {
  const { t, lang } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get("role") ?? "agency") as Role;
  // When role=talent is explicitly set (e.g. via portal invite link), lock it — don't allow switching to agency
  const roleLocked = searchParams.get("role") === "talent";
  const refToken = searchParams.get("ref") ?? null;
  const jobId = searchParams.get("job") ?? null;
  const nextPath = safeNextPath(searchParams.get("next")) ?? (jobId ? `/talent/jobs/${jobId}` : null);
  const isPortalWorkspaceSignup = Boolean(nextPath?.startsWith("/talent/workspaces/"));
  // Free plan is hidden from signup UI but remains valid internally for enforcement.
  // Default to Pro so users start the trial-first conversion funnel.
  const initialPlan = (["pro", "premium"].includes(searchParams.get("plan") ?? "") ? searchParams.get("plan") : "pro") as Plan;

  const [account, setAccount] = useState<AccountForm>({
    role: initialRole === "talent" ? "talent" : "agency",
    email: "",
    password: "",
    termsAccepted: false,
  });
  // Default country depends on language: EN → United States, PT → Brasil.
  const defaultCountry = lang === "en" ? "United States" : "Brasil";
  const [talent, setTalent] = useState<TalentForm>(() => ({ ...TALENT_DEFAULTS, country: defaultCountry }));
  const [agency, setAgency] = useState<AgencyForm>(() => ({ ...AGENCY_DEFAULTS, plan: initialPlan, country: defaultCountry }));
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [customOtherText, setCustomOtherText] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState("");
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [manualCheckMsg, setManualCheckMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [livePlans, setLivePlans] = useState<LivePlans>(buildPlanSettingsFallback);
  useEffect(() => {
    void fetch("/api/plan-settings").then(async (res) => {
      if (!res.ok) return;
      const data = await res.json() as LivePlans;
      setLivePlans((prev) => ({ ...prev, ...data }));
    }).catch(() => undefined);
  }, []);

  const [referredEmail, setReferredEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!refToken || account.role !== "talent") return;
    void fetch(`/api/referrals/info?token=${encodeURIComponent(refToken)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json() as { referred_email?: string | null };
        if (data.referred_email) setReferredEmail(data.referred_email.trim().toLowerCase());
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refToken, account.role]);

  useEffect(() => {
    if (referredEmail && !account.email) {
      setAccount((prev) => ({ ...prev, email: referredEmail }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referredEmail]);

  const roleCopyMap = {
    agency: { title: t("signup_agency_title"), subtitle: t("signup_agency_subtitle"), cta: t("signup_agency_cta") },
    talent: { title: t("signup_talent_title"), subtitle: t("signup_talent_subtitle"), cta: t("signup_talent_cta") },
  };
  const roleCopy = roleCopyMap[account.role];
  const selectedPlan = useMemo(() => livePlans[agency.plan] ?? buildPlanSettingsFallback()[agency.plan], [agency.plan, livePlans]);

  const formatPlanLine = (plan: PublicPlanSetting) =>
    plan.is_available ? formatPlanPricing(plan, lang).primaryPrice : t("plan_coming_soon");

  const isEmailLocked = !!(referredEmail && account.role === "talent");

  function setAccountField<K extends keyof AccountForm>(key: K, value: AccountForm[K]) {
    setAccount((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setServerError("");
    setShowSignInPrompt(false);
  }

  function setTalentField<K extends keyof TalentForm>(key: K, value: TalentForm[K]) {
    setTalent((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setServerError("");
  }

  function setAgencyField<K extends keyof AgencyForm>(key: K, value: AgencyForm[K]) {
    setAgency((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setServerError("");
  }

  function setRole(role: Role) {
    setAccount((current) => ({ ...current, role }));
    setErrors({});
    setServerError("");
  }

  function validateTalent() {
    const nextErrors: FormErrors = {};
    if (!account.email.trim()) nextErrors.email = t("signup_val_email");
    if (!account.password.trim()) nextErrors.password = t("signup_val_password");
    else if (account.password.trim().length < 6) nextErrors.password = t("signup_val_password_len");
    if (!talent.fullName.trim()) nextErrors.fullName = t("signup_val_full_name");
    // Document number: required but no format validation — field is international.
    if (!talent.cpf.trim()) nextErrors.cpf = t("signup_val_cpf");
    if (!talent.phone.trim()) nextErrors.phone = t("signup_val_phone");
    if (!talent.country.trim()) nextErrors.country = t("signup_val_country");
    if (!talent.city.trim()) nextErrors.city = t("signup_val_city");
    if (!talent.state.trim()) nextErrors.state = t("signup_val_state");
    if (talent.bio.length > 300) nextErrors.bio = t("signup_val_bio_len");
    if (talent.categories.includes("Outro") && !customOtherText.trim()) nextErrors.customOther = t("signup_val_custom_other");
    if (talent.categories.length === 0) nextErrors.categories = t("signup_val_categories");
    if (!account.termsAccepted) nextErrors.termsAccepted = t("signup_val_terms");
    return nextErrors;
  }

  function validateAgency() {
    const nextErrors: FormErrors = {};
    if (!account.email.trim()) nextErrors.email = t("signup_val_email");
    if (!account.password.trim()) nextErrors.password = t("signup_val_password");
    else if (account.password.trim().length < 6) nextErrors.password = t("signup_val_password_len");
    if (!agency.agencyName.trim()) nextErrors.agencyName = t("signup_val_agency_name");
    if (!agency.responsibleName.trim()) nextErrors.responsibleName = t("signup_val_responsible");
    // CPF/CNPJ is required only for Brazilian (PT) signups.
    // US/EN agencies use Stripe Checkout; Stripe handles billing identity.
    if (lang !== "en") {
      if (!agency.cpfCnpj.trim()) nextErrors.cpfCnpj = t("signup_val_cpfcnpj");
      else if (!isValidCpfCnpj(agency.cpfCnpj)) nextErrors.cpfCnpj = t("signup_val_cpfcnpj_invalid");
    }
    if (!agency.phone.trim()) nextErrors.phone = t("signup_val_phone_agency");
    if (!agency.country.trim()) nextErrors.country = t("signup_val_country_agency");
    if (!agency.city.trim()) nextErrors.city = t("signup_val_city_agency");
    if (!agency.state.trim()) nextErrors.state = t("signup_val_state_agency");
    if (agency.description.length > 500) nextErrors.description = t("signup_val_desc_len");
    if (!livePlans[agency.plan]?.is_available) nextErrors.plan = t("signup_val_plan_unavail");
    if (!account.termsAccepted) nextErrors.termsAccepted = t("signup_val_terms");
    return nextErrors;
  }

  async function uploadAsset(file: File, path: string) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("path", path);
    const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
    const uploadJson = await uploadRes.json().catch(() => ({})) as { error?: string; url?: string };
    if (!uploadRes.ok || !uploadJson.url) {
      throw new Error(uploadJson.error ?? "Erro ao enviar arquivo.");
    }
    return uploadJson.url;
  }

  async function linkReferral(userId: string) {
    if (!refToken) return;
    await fetch("/api/referrals/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: refToken, user_id: userId }),
    });
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
        const params = new URLSearchParams();
        if (nextPath) params.set("next", nextPath);
        if (account.role === "agency" && livePlans[agency.plan]?.price > 0) params.set("plan", agency.plan);
        const qs = params.toString();
        router.push(qs ? `/onboarding?${qs}` : "/onboarding");
      } else {
        setManualCheckMsg(t("signup_payment_not_confirmed"));
      }
    } catch {
      setManualCheckMsg(t("signup_payment_check_error"));
    }
  }


  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError("");

    const validation = account.role === "agency" ? validateAgency() : validateTalent();
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    // PRO: create auth user + profile, then redirect to Stripe Checkout.
    // No card data is collected by BrisaHub — Stripe handles payment securely.
    if (account.role === "agency" && agency.plan === "pro") {
      setLoading(true);

      const { data: suData, error: suError } = await supabase.auth.signUp({
        email:    account.email.trim(),
        password: account.password,
      });

      if (suError || !suData.user) {
        if (suError && /already registered/i.test(suError.message)) {
          setShowSignInPrompt(true);
        } else {
          setServerError(suError?.message ?? t("signup_error_account"));
        }
        setLoading(false);
        return;
      }

      // Upload logo NOW — after signUp the Supabase client has the session.
      // This was missing from the PRO path; avatar_url was hardcoded null.
      let proLogoUrl: string | null = null;
      if (logo) {
        try {
          const ext  = logo.name.split(".").pop() ?? "jpg";
          const path = `agency-avatars/${suData.user.id}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("talent-media")
            .upload(path, logo, { upsert: true });
          if (upErr) {
            console.error("[signup/pro] logo upload failed:", upErr.message);
          } else {
            proLogoUrl = supabase.storage.from("talent-media").getPublicUrl(path).data.publicUrl;
          }
        } catch (err) {
          console.error("[signup/pro] logo upload exception:", err);
        }
      }

      // Create profile + agency records before redirecting to Stripe.
      // /api/auth/signup is the same route used by free agency signup.
      const profileRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id:       suData.user.id,
          role:          "agency",
          lang,
          termsAccepted: account.termsAccepted,
          agency: {
            company_name: agency.agencyName.trim(),
            contact_name: agency.responsibleName.trim(),
            cpf_cnpj:     normalizeCpfCnpj(agency.cpfCnpj),
            phone:         agency.phone.trim(),
            country:       agency.country.trim(),
            city:          agency.city.trim(),
            state:         agency.state.trim(),
            website:       agency.website.trim()     || null,
            description:   agency.description.trim() || null,
            avatar_url:    proLogoUrl,
          },
        }),
      });

      if (!profileRes.ok) {
        const profileJson = await profileRes.json().catch(() => ({})) as { error?: string };
        setServerError(profileJson.error ?? t("signup_error_config"));
        setLoading(false);
        return;
      }

      // Redirect to Stripe Checkout — no card data is ever handled by BrisaHub.
      const checkoutRes = await fetch("/api/stripe/create-checkout", { method: "POST" });
      const checkoutJson = await checkoutRes.json().catch(() => ({})) as { url?: string; error?: string };

      if (!checkoutRes.ok || !checkoutJson.url) {
        setServerError(checkoutJson.error ?? t("signup_error_payment"));
        setLoading(false);
        return;
      }

      window.location.assign(checkoutJson.url);
      return;
    }

    setLoading(true);

    if (refToken && referredEmail && account.role === "talent" && account.email.trim().toLowerCase() !== referredEmail) {
      setServerError(`Este convite só pode ser usado com o e-mail ${referredEmail}.`);
      setLoading(false);
      return;
    }

    // Only open a payment tab for non-PRO paid plans (premium) that return a hosted checkout URL
    let paymentWindow: Window | null = null;
    if (account.role === "agency" && selectedPlan.price > 0) {
      paymentWindow = window.open("", "_blank", "noopener,noreferrer");
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: account.email.trim(),
        password: account.password,
      });

      if (signUpError || !data.user) {
        paymentWindow?.close();
        if (signUpError && /already registered/i.test(signUpError.message)) {
          setShowSignInPrompt(true);
        } else {
          setServerError(signUpError?.message ?? t("signup_error_account"));
        }
        setLoading(false);
        return;
      }

      let avatarUrl: string | undefined;
      let logoUrl: string | undefined;

      // Upload directly via the client-side Supabase storage (not /api/upload).
      // After supabase.auth.signUp() the session is in the client's memory but
      // may not have been flushed to cookies yet, causing /api/upload to 401.
      // The client-side supabase instance already holds the session and can
      // write to storage without cookie authentication.
      if (account.role === "talent" && avatar) {
        try {
          const ext  = avatar.name.split(".").pop() ?? "jpg";
          const path = `avatars/${data.user.id}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("talent-media")
            .upload(path, avatar, { upsert: true });
          if (upErr) {
            console.error("[signup] talent avatar upload failed:", upErr.message);
          } else {
            avatarUrl = supabase.storage.from("talent-media").getPublicUrl(path).data.publicUrl;
          }
        } catch (err) {
          console.error("[signup] talent avatar upload exception:", err);
        }
      }

      if (account.role === "agency" && logo) {
        try {
          const ext  = logo.name.split(".").pop() ?? "jpg";
          const path = `agency-avatars/${data.user.id}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("talent-media")
            .upload(path, logo, { upsert: true });
          if (upErr) {
            console.error("[signup] agency logo upload failed:", upErr.message);
          } else {
            logoUrl = supabase.storage.from("talent-media").getPublicUrl(path).data.publicUrl;
          }
        } catch (err) {
          console.error("[signup] agency logo upload exception:", err);
        }
      }

      const payload =
        account.role === "agency"
          ? {
              user_id: data.user.id,
              role: account.role,
              lang,          // saved to profiles.language_preference — overrides DEFAULT 'pt-BR'
              termsAccepted: account.termsAccepted,
              agency: {
                company_name: agency.agencyName.trim(),
                contact_name: agency.responsibleName.trim(),
                cpf_cnpj: normalizeCpfCnpj(agency.cpfCnpj),
                phone: agency.phone.trim(),
                country: agency.country.trim(),
                city: agency.city.trim(),
                state: agency.state.trim(),
                website: agency.website.trim() || null,
                description: agency.description.trim() || null,
                avatar_url: logoUrl ?? null,
              },
            }
          : {
              user_id: data.user.id,
              role: account.role,
              lang,          // saved to profiles.language_preference — overrides DEFAULT 'pt-BR'
              termsAccepted: account.termsAccepted,
              marketplaceVisible: !isPortalWorkspaceSignup,
              talent: {
                full_name: talent.fullName.trim(),
                cpf: digitsOnly(talent.cpf),
                phone: talent.phone.trim(),
                country: talent.country.trim(),
                city: talent.city.trim(),
                state: talent.state.trim(),
                gender: talent.gender || null,
                age: talent.age ? parseInt(talent.age, 10) : null,
                bio: talent.bio.trim() || null,
                categories: talent.categories.map((category) => category === "Outro" && customOtherText.trim() ? customOtherText.trim() : category),
                instagram: talent.instagram.trim() || null,
                tiktok: talent.tiktok.trim() || null,
                youtube: talent.youtube.trim() || null,
                linkedin: talent.linkedin.trim() || null,
                website: talent.website.trim() || null,
                avatar_url: avatarUrl ?? null,
              },
            };

      const profileRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!profileRes.ok) {
        paymentWindow?.close();
        const profileJson = await profileRes.json().catch(() => ({})) as { error?: string };
        setServerError(profileJson.error ?? t("signup_error_config"));
        setLoading(false);
        return;
      }

      if (account.role === "agency" && agency.plan === "free") {
        await fetch("/api/auth/agency-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: data.user.id, plan: "free" }),
        });
      }

      await linkReferral(data.user.id);

      if (account.role === "agency" && selectedPlan.price > 0) {
        const checkoutRes = await fetch("/api/asaas/plan/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cpfCnpj: normalizeCpfCnpj(agency.cpfCnpj), plan: agency.plan }),
        });
        const checkoutJson = await checkoutRes.json().catch(() => ({})) as { url?: string; error?: string };

        if (!checkoutRes.ok || !checkoutJson.url) {
          paymentWindow?.close();
          setServerError(checkoutJson.error ?? t("signup_error_payment"));
          setLoading(false);
          return;
        }

        if (paymentWindow) paymentWindow.location.href = checkoutJson.url;
        else setPopupBlocked(true);

        setPaymentUrl(checkoutJson.url);
        setWaitingForPayment(true);
        pollRef.current = setInterval(() => {
          void (async () => {
            try {
              const res = await fetch("/api/asaas/plan/status");
              const json = await res.json() as { paid?: boolean };
              if (json.paid) {
                if (pollRef.current) clearInterval(pollRef.current);
                const params = new URLSearchParams();
                if (nextPath) params.set("next", nextPath);
                params.set("plan", agency.plan);
                const qs = params.toString();
                router.push(qs ? `/onboarding?${qs}` : "/onboarding");
              }
            } catch {}
          })();
        }, 4000);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (nextPath) params.set("next", nextPath);
      const qs = params.toString();
      router.push(qs ? `/onboarding?${qs}` : "/onboarding");
    } catch (error) {
      paymentWindow?.close();
      setServerError(error instanceof Error ? error.message : t("signup_error_unexpected"));
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  if (waitingForPayment) {
    return (
      <div className="min-h-screen bg-[#061214] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-[32px] border border-white/8 bg-white/5 p-8 text-center backdrop-blur-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10">
            <svg className="h-7 w-7 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t("signup_payment_title_prefix")} {selectedPlan.name}</h1>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-white/70">
            {t("signup_payment_desc")}
          </p>
          {popupBlocked ? (
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left text-[13px] text-amber-100">
              {t("signup_payment_popup_blocked")}
            </div>
          ) : null}
          {manualCheckMsg ? <p className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-[13px] text-white/70">{manualCheckMsg}</p> : null}
          <div className="mt-6 space-y-3">
            {paymentUrl ? (
              <button
                type="button"
                onClick={() => openPaymentTab(paymentUrl)}
                className="w-full rounded-2xl bg-gradient-to-r from-[#0E7C86] via-[#15A6A8] to-[#1ABC9C] px-5 py-4 text-[15px] font-semibold text-white"
              >
                {t("signup_payment_reopen")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => { void handleManualCheck(); }}
              className="w-full rounded-2xl border border-white/15 px-5 py-4 text-[15px] font-semibold text-white/85"
            >
              {t("signup_payment_check")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-[#061214] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col lg:flex-row">
        <section className="relative overflow-hidden border-b border-white/8 px-6 py-10 lg:w-[44%] lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(39,193,214,0.28),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(26,188,156,0.2),transparent_28%),linear-gradient(180deg,#081718_0%,#041012_100%)]" />
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="relative flex h-full flex-col">
            <div>
              <Image
                src={heroBrandImage}
                alt="BrisaHub"
                width={heroBrandImage.width}
                height={heroBrandImage.height}
                priority
                className="h-auto w-full max-w-[120px]"
              />
            </div>

            <div className="mt-10 space-y-5 lg:mt-16">
              <span className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                {t("signup_badge")}
              </span>
              <div className="space-y-4">
                <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white lg:text-[2.45rem]">
                  {roleCopy.title}
                </h2>
                <p className="max-w-lg text-[15px] leading-7 text-white/70">
                  {roleCopy.subtitle}
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <FeaturePill>{t("signup_pill1")}</FeaturePill>
                <FeaturePill>{t("signup_pill2")}</FeaturePill>
                <FeaturePill>{t("signup_pill3")}</FeaturePill>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <div className="flex justify-end">
            <LanguageSelector variant="dark" />
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-3xl rounded-[32px] border border-white/8 bg-white px-5 py-6 text-[#1F2D2E] shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:px-7 sm:py-7 lg:px-8">
              <div className="space-y-6">
                {!roleLocked && (
                  <div className="flex flex-col gap-5 rounded-[28px] border border-[#DDE6E6] bg-[#F7FBFB] p-5 sm:p-6">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#647B7B]">{t("signup_form_account_label")}</p>
                      <h3 className="text-2xl font-semibold tracking-tight text-[#102224]">{t("signup_form_account_title")}</h3>
                      <p className="text-sm leading-6 text-[#5A7273]">
                        {t("signup_form_account_desc")}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {(["agency", "talent"] as const).map((roleOption) => {
                        const active = account.role === roleOption;
                        const copy = roleOption === "agency"
                          ? { title: t("signup_role_agency_title"), body: t("signup_role_agency_body") }
                          : { title: t("signup_role_talent_title"), body: t("signup_role_talent_body") };
                        return (
                          <button
                            key={roleOption}
                            type="button"
                            onClick={() => setRole(roleOption)}
                            className={[
                              "rounded-[24px] border px-4 py-4 text-left transition-all",
                              active
                                ? "border-[#0E7C86] bg-[#0E7C86] text-white shadow-[0_10px_30px_rgba(14,124,134,0.22)]"
                                : "border-[#DDE6E6] bg-white hover:border-[#A6CACA]",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className={`text-[15px] font-semibold ${active ? "text-white" : "text-[#102224]"}`}>{copy.title}</p>
                                <p className={`mt-1 text-[13px] leading-5 ${active ? "text-white/78" : "text-[#647B7B]"}`}>{copy.body}</p>
                              </div>
                              <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? "border-white/60 bg-white/15" : "border-[#C7D6D7] bg-white"}`}>
                                {active ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  {referredEmail && account.role === "talent" && (
                    <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3">
                      <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-[13px] text-teal-700">Este convite está vinculado ao e-mail <strong>{referredEmail}</strong>. O cadastro deve ser feito com esse e-mail.</p>
                    </div>
                  )}
                  <SectionCard eyebrow={t("signup_creds_eyebrow")} title={t("signup_creds_title")}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <LabeledInput label={t("signup_email_label")} error={errors.email}>
                          <input type="email" required value={account.email} onChange={isEmailLocked ? undefined : (event) => setAccountField("email", event.target.value)} readOnly={isEmailLocked} placeholder={lang === "en" ? "you@company.com" : "voce@empresa.com"} className={inputClass(!!errors.email, isEmailLocked)} />
                        </LabeledInput>
                        {isEmailLocked && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-teal-600">
                            <svg className="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            E-mail vinculado ao convite. Não pode ser alterado.
                          </p>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <LabeledInput label={t("signup_password_label")} error={errors.password}>
                          <input type="password" required minLength={6} value={account.password} onChange={(event) => setAccountField("password", event.target.value)} placeholder={t("signup_password_placeholder")} className={inputClass(!!errors.password)} />
                        </LabeledInput>
                      </div>
                    </div>
                  </SectionCard>

                  {account.role === "talent" ? (
                    <>
                      <SectionCard eyebrow={t("signup_talent_info_eyebrow")} title={t("signup_talent_info_title")}>
                        <div className="grid gap-5 lg:grid-cols-[140px_minmax(0,1fr)]">
                          <UploadTile
                            label={t("signup_photo_label")}
                            preview={avatarPreview}
                            onChange={(file) => {
                              setAvatar(file);
                              setAvatarPreview(URL.createObjectURL(file));
                            }}
                          />
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <LabeledInput label={t("signup_full_name_label")} error={errors.fullName}>
                                <input className={inputClass(!!errors.fullName)} placeholder={lang === "en" ? "Alex Johnson" : "Sofia Mendes"} value={talent.fullName} onChange={(event) => setTalentField("fullName", event.target.value)} />
                              </LabeledInput>
                            </div>
                            <LabeledInput label={t("signup_cpf_label")} error={errors.cpf} hint={t("signup_cpf_hint")}>
                              <input
                                className={inputClass(!!errors.cpf)}
                                placeholder={lang === "en" ? "Passport, SSN, National ID, Tax ID, etc." : "000.000.000-00"}
                                inputMode={lang === "en" ? "text" : "numeric"}
                                maxLength={lang === "en" ? 50 : 14}
                                value={talent.cpf}
                                onChange={(event) => setTalentField("cpf", lang === "en" ? event.target.value : formatCpf(event.target.value))}
                              />
                            </LabeledInput>
                            <div className="sm:col-span-2">
                              <LabeledInput label={t("signup_phone_label")} error={errors.phone}>
                                <PhoneInput value={talent.phone} onChange={(value) => setTalentField("phone", value)} hasError={!!errors.phone} required countryCode={COUNTRY_PHONE_MAP[talent.country]} />
                              </LabeledInput>
                            </div>
                            <LabeledInput label={t("signup_country_label")} error={errors.country}>
                              <select
                                className={inputClass(!!errors.country)}
                                value={talent.country}
                                onChange={(event) => {
                                  setTalentField("country", event.target.value);
                                  // Auto-update phone dial code when country changes
                                  const dialCode = COUNTRY_PHONE_MAP[event.target.value];
                                  if (dialCode) setTalentField("phone", `${dialCode} `);
                                }}
                              >
                                <option value="">{t("signup_state_placeholder")}</option>
                                {SIGNUP_COUNTRIES.map((c) => (
                                  <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                              </select>
                            </LabeledInput>
                            <LabeledInput label={t("signup_city_label")} error={errors.city}>
                              <input className={inputClass(!!errors.city)} placeholder="Miami" value={talent.city} onChange={(event) => setTalentField("city", event.target.value)} />
                            </LabeledInput>
                            <LabeledInput label={t("signup_state_label")} error={errors.state}>
                              <input
                                className={inputClass(!!errors.state)}
                                placeholder="FL"
                                value={talent.state}
                                onChange={(event) => setTalentField("state", event.target.value)}
                              />
                            </LabeledInput>
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard eyebrow={t("signup_professional_eyebrow")} title={t("signup_professional_title")}>
                        <div className="space-y-5">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <LabeledInput label={t("signup_gender_label")}>
                              <select className={inputClass()} value={talent.gender} onChange={(event) => setTalentField("gender", event.target.value)}>
                                <option value="">{t("signup_state_placeholder")}</option>
                                <option value="male">{t("signup_gender_male")}</option>
                                <option value="female">{t("signup_gender_female")}</option>
                                <option value="other">{t("signup_gender_other")}</option>
                              </select>
                            </LabeledInput>
                            <LabeledInput label={t("signup_age_label")}>
                              <input type="number" min={16} max={99} className={inputClass()} placeholder="25" value={talent.age} onChange={(event) => setTalentField("age", event.target.value)} />
                            </LabeledInput>
                          </div>
                          <LabeledInput label={`${t("signup_bio_label")} — ${talent.bio.length}/300`} error={errors.bio}>
                            <textarea rows={4} className={`${inputClass(!!errors.bio)} resize-none`} placeholder={lang === "en" ? "Tell agencies what makes you unique and what you do..." : "Sou um criador de lifestyle baseado em São Paulo..."} value={talent.bio} onChange={(event) => setTalentField("bio", event.target.value)} />
                          </LabeledInput>
                          <div>
                            <p className="mb-1.5 block text-[12px] font-medium text-[#516667]">{t("signup_categories_label")}</p>
                            <p className="mb-3 text-[12px] text-zinc-400">{t("signup_categories_hint")}</p>
                            <div className="flex flex-wrap gap-2">
                              {TALENT_CATEGORY_LABELS.map((category) => {
                                const key = category === "Outro" ? "Outro" : category;
                                const active = talent.categories.includes(key);
                                return (
                                  <button
                                    key={category}
                                    type="button"
                                    onClick={() => {
                                      const next = active ? talent.categories.filter((item) => item !== key) : [...talent.categories, key];
                                      setTalentField("categories", next);
                                      if (active && key === "Outro") setCustomOtherText("");
                                    }}
                                    className={[
                                      "rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all",
                                      active ? "bg-[#1F2D2E] text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                                    ].join(" ")}
                                  >
                                    {category === "Outro" ? t("signup_category_other") : talentCategoryLabelForLang(category, lang)}
                                  </button>
                                );
                              })}
                            </div>
                            {talent.categories.includes("Outro") ? (
                              <div className="mt-4">
                                <LabeledInput label={t("signup_other_desc_label")} error={errors.customOther}>
                                  <input className={inputClass(!!errors.customOther)} placeholder={lang === "en" ? "e.g. DJ, Magician, Voice Actor..." : "Ex: DJ, Mágico, Dublador..."} value={customOtherText} onChange={(event) => setCustomOtherText(event.target.value)} />
                                </LabeledInput>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard eyebrow={t("signup_social_eyebrow")} title={t("signup_social_title")}>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <SocialInput label="Instagram" prefix="@" placeholder="yourhandle" value={talent.instagram} onChange={(value) => setTalentField("instagram", value)} />
                          <SocialInput label="TikTok" prefix="@" placeholder="yourhandle" value={talent.tiktok} onChange={(value) => setTalentField("tiktok", value)} />
                          <SocialInput label="YouTube" placeholder="https://youtube.com/@channel" value={talent.youtube} onChange={(value) => setTalentField("youtube", value)} />
                          <SocialInput label="LinkedIn" placeholder="https://linkedin.com/in/yourprofile" value={talent.linkedin} onChange={(value) => setTalentField("linkedin", value)} />
                          <div className="sm:col-span-2">
                            <SocialInput label={t("signup_website_label")} placeholder="https://seuperfil.com" value={talent.website} onChange={(value) => setTalentField("website", value)} />
                          </div>
                        </div>
                      </SectionCard>
                    </>
                  ) : (
                    <>
                      <SectionCard eyebrow={t("signup_agency_data_eyebrow")} title={t("signup_agency_data_title")}>
                        <div className="grid gap-5 lg:grid-cols-[140px_minmax(0,1fr)]">
                          <UploadTile
                            label={t("signup_agency_logo_label")}
                            preview={logoPreview}
                            onChange={(file) => {
                              setLogo(file);
                              setLogoPreview(URL.createObjectURL(file));
                            }}
                          />
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <LabeledInput label={t("signup_agency_name_label")} error={errors.agencyName}>
                                <input className={inputClass(!!errors.agencyName)} placeholder="Brisa Creative" value={agency.agencyName} onChange={(event) => setAgencyField("agencyName", event.target.value)} />
                              </LabeledInput>
                            </div>
                            <div className="sm:col-span-2">
                              <LabeledInput label={t("signup_agency_contact_label")} error={errors.responsibleName}>
                                <input className={inputClass(!!errors.responsibleName)} placeholder="Carla Mendes" value={agency.responsibleName} onChange={(event) => setAgencyField("responsibleName", event.target.value)} />
                              </LabeledInput>
                            </div>
                            {/* CPF/CNPJ shown only for Brazilian (PT) signups */}
                            {lang !== "en" && (
                              <LabeledInput label={t("signup_cpfcnpj_label")} error={errors.cpfCnpj}>
                                <input className={inputClass(!!errors.cpfCnpj)} inputMode="numeric" maxLength={18} placeholder="00.000.000/0001-00" value={agency.cpfCnpj} onChange={(event) => setAgencyField("cpfCnpj", formatCpfCnpj(event.target.value))} />
                              </LabeledInput>
                            )}
                            <div className="sm:col-span-2">
                              <LabeledInput label={t("signup_phone_label")} error={errors.phone}>
                                <PhoneInput value={agency.phone} onChange={(value) => setAgencyField("phone", value)} hasError={!!errors.phone} required countryCode={COUNTRY_PHONE_MAP[agency.country]} />
                              </LabeledInput>
                            </div>
                            <LabeledInput label={t("signup_country_label")} error={errors.country}>
                              <select
                                className={inputClass(!!errors.country)}
                                value={agency.country}
                                onChange={(event) => {
                                  setAgencyField("country", event.target.value);
                                  const dialCode = COUNTRY_PHONE_MAP[event.target.value];
                                  if (dialCode) setAgencyField("phone", `${dialCode} `);
                                }}
                              >
                                <option value="">{t("signup_state_placeholder")}</option>
                                {SIGNUP_COUNTRIES.map((c) => (
                                  <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                              </select>
                            </LabeledInput>
                            <LabeledInput label={t("signup_city_label")} error={errors.city}>
                              <input className={inputClass(!!errors.city)} placeholder="Miami" value={agency.city} onChange={(event) => setAgencyField("city", event.target.value)} />
                            </LabeledInput>
                            <LabeledInput label={t("signup_state_label")} error={errors.state}>
                              <input
                                className={inputClass(!!errors.state)}
                                placeholder="FL"
                                value={agency.state}
                                onChange={(event) => setAgencyField("state", event.target.value)}
                              />
                            </LabeledInput>
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard eyebrow={t("signup_agency_profile_eyebrow")} title={t("signup_agency_profile_title")}>
                        <div className="grid grid-cols-1 gap-4">
                          <LabeledInput label={t("signup_website_label")}>
                            <input className={inputClass()} placeholder={lang === "en" ? "https://youragency.com" : "https://suaagencia.com"} value={agency.website} onChange={(event) => setAgencyField("website", event.target.value)} />
                          </LabeledInput>
                          <LabeledInput label={`${t("signup_desc_label")} — ${agency.description.length}/500`} error={errors.description}>
                            <textarea rows={4} className={`${inputClass(!!errors.description)} resize-none`} placeholder={lang === "en" ? "Briefly describe what your agency does..." : "Conte rapidamente o que faz a sua agência..."} value={agency.description} onChange={(event) => setAgencyField("description", event.target.value)} />
                          </LabeledInput>
                        </div>
                      </SectionCard>

                      <SectionCard eyebrow={t("signup_plan_eyebrow")} title={t("signup_plan_title")}>
                        <div className="space-y-3">

                          {/* ── Pro (featured, default) ── */}
                          {(() => {
                            const active = agency.plan === "pro";
                            const proAvailable = livePlans.pro.is_available;
                            const proPricing = formatPlanPricing(livePlans.pro, lang);
                            return (
                              <button
                                type="button"
                                onClick={() => { if (proAvailable) setAgencyField("plan", "pro"); }}
                                disabled={!proAvailable}
                                className="w-full flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all duration-200 relative overflow-hidden shadow-[0_4px_20px_rgba(26,188,156,0.2)] hover:shadow-[0_8px_28px_rgba(26,188,156,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
                                style={{ background: "linear-gradient(135deg, #0C9E87 0%, #1ABC9C 50%, #22BDD0 100%)" }}
                              >
                                <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "18px 18px"}} />
                                <div className="relative flex items-center gap-4 w-full">
                                  <span className={["flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors", active ? "border-white bg-white" : "border-white/50 bg-white/10"].join(" ")}>
                                    {active && <span className="w-2 h-2 rounded-full bg-[#1ABC9C]" />}
                                  </span>
                                  <div className="flex-shrink-0 w-28 text-left">
                                    <p className="text-[18px] font-black tracking-tight text-white leading-none">{proPricing.primaryPrice}</p>
                                    {proAvailable ? (
                                      <p className="text-[11px] text-white/70 mt-0.5 leading-snug">
                                        {proPricing.isIntroOffer && proPricing.recurringLine
                                          ? proPricing.recurringLine
                                          : proPricing.trialLine ?? t("plan_per_month_label")}
                                      </p>
                                    ) : null}
                                    {proAvailable && proPricing.isIntroOffer && proPricing.trialLine ? (
                                      <p className="text-[10px] text-white/60 mt-0.5">{proPricing.trialLine}</p>
                                    ) : null}
                                  </div>
                                  <div className="flex-shrink-0 h-10 w-px bg-white/20" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="text-[14px] font-bold text-white">{livePlans.pro.name}</p>
                                      <span className="text-[10px] font-black text-[#0C9E87] bg-white px-2 py-0.5 rounded-full tracking-wide">{proAvailable ? t("plan_popular_short") : t("plan_coming_soon")}</span>
                                    </div>
                                    <p className="text-[12px] text-white/80 leading-relaxed">{proAvailable ? planLimitHighlights(livePlans.pro, lang).slice(0, 2).join(" · ") : t("plan_coming_soon")}</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })()}

                          {/* ── Premium (coming soon) ── */}
                          {(() => {
                            const active = agency.plan === "premium";
                            const available = livePlans.premium.is_available;
                            return (
                              <button
                                type="button"
                                onClick={() => { if (available) setAgencyField("plan", "premium"); }}
                                disabled={!available}
                                className={[
                                  "w-full flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
                                  active && available
                                    ? "border-[#1ABC9C] bg-[#F0FDF9] shadow-[0_0_0_3px_rgba(26,188,156,0.1)]"
                                    : "border-zinc-200 bg-white hover:border-[#A8D8D8] hover:bg-[#FAFEFE]",
                                ].join(" ")}
                              >
                                <span className={["flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors", active && available ? "border-[#1ABC9C] bg-[#1ABC9C]" : "border-zinc-300 bg-white"].join(" ")}>
                                  {active && available ? <span className="w-2 h-2 rounded-full bg-white" /> : null}
                                </span>
                                <div className="flex-shrink-0 w-24 text-left">
                                  <p className={["text-[18px] font-black tracking-tight leading-none", available ? "text-zinc-900" : "text-zinc-500"].join(" ")}>{formatPlanLine(livePlans.premium)}</p>
                                  {available ? <p className="text-[11px] text-zinc-400 mt-0.5">{t("plan_per_month_label")}</p> : null}
                                </div>
                                <div className="flex-shrink-0 h-10 w-px bg-zinc-200" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className={["text-[14px] font-bold", available ? "text-zinc-800" : "text-zinc-500"].join(" ")}>{livePlans.premium.name}</p>
                                    {!available ? <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">{t("plan_coming_soon")}</span> : null}
                                  </div>
                                  <p className={["text-[12px] leading-relaxed", available ? "text-zinc-500" : "text-zinc-400"].join(" ")}>
                                    {available
                                      ? [...premiumSeatHighlights(livePlans.premium, lang), ...planLimitHighlights(livePlans.premium, lang).slice(0, 1)].join(" · ")
                                      : t("plan_coming_soon")}
                                  </p>
                                </div>
                              </button>
                            );
                          })()}

                        </div>
                        {errors.plan ? <FieldError error={errors.plan} /> : null}
                        <div className="mt-4 rounded-2xl border border-[#DDE6E6] bg-[#F7FBFB] px-4 py-3">
                          <p className="text-[12px] font-semibold text-[#1F2D2E]">
                            {t("signup_chosen_plan_prefix")}{" "}
                            {agency.plan === "pro"
                              ? (lang === "en" ? "Pro Trial" : "Teste PRO")
                              : selectedPlan.name}
                          </p>
                          <p className="mt-1 text-[12px] leading-5 text-[#647B7B]">
                            {(() => {
                              if (!selectedPlan.is_available) return t("signup_plan_unavail_msg");
                              // Pro trial: show clear trial → intro → recurring breakdown
                              if (agency.plan === "pro") {
                                const pp = formatPlanPricing(selectedPlan, lang);
                                const trial   = pp.trialLine   ?? (lang === "en" ? "7-day free trial" : "7 dias grátis");
                                const intro   = pp.introLine   ?? "";
                                const recur   = pp.recurringLine ?? "";
                                return lang === "en"
                                  ? `You will start with a ${trial}. Your first charge is ${intro}, ${recur}.`
                                  : `Você começará com ${trial}. Sua primeira cobrança será ${intro}, ${recur}.`;
                              }
                              // Premium / other paid plans
                              if (selectedPlan.price > 0) {
                                return `${t("signup_plan_paid_desc_a")} ${selectedPlan.name} ${t("signup_plan_paid_desc_b")}`;
                              }
                              return t("signup_plan_unavail_msg");
                            })()}
                          </p>
                        </div>
                      </SectionCard>
                    </>
                  )}

                  <SectionCard eyebrow={t("signup_terms_eyebrow")} title={t("signup_terms_title")}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#DDE6E6] bg-[#F7FBFB] px-4 py-4 transition-colors hover:border-[#A6CACA]">
                      <input
                        id="termsAccepted"
                        name="termsAccepted"
                        type="checkbox"
                        checked={account.termsAccepted}
                        required
                        onInvalid={(event) => {
                          event.currentTarget.setCustomValidity(t("signup_val_terms"));
                        }}
                        onChange={(event) => {
                          event.currentTarget.setCustomValidity("");
                          setAccountField("termsAccepted", event.target.checked);
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-[#A7B9BA] text-[#0E7C86] focus:ring-[#0E7C86]"
                      />
                      <span className="text-[14px] leading-6 text-[#516667]">
                        {t("signup_terms_text1")}{" "}
                        <Link href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#102224] underline decoration-[#0E7C86]/55 underline-offset-4">
                          {t("signup_terms_link")}
                        </Link>{" "}
                        {t("signup_terms_text2")}
                      </span>
                    </label>
                    <FieldError error={errors.termsAccepted} />
                  </SectionCard>

                  {showSignInPrompt ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                      <p className="text-[13px] font-semibold text-amber-800">{t("signup_duplicate_email_title")}</p>
                      <p className="mt-1 text-[13px] text-amber-700">{t("signup_duplicate_email_body")}</p>
                      <Link
                        href={loginHref(refToken, jobId, nextPath, account.email.trim())}
                        className="mt-3 inline-flex items-center rounded-xl bg-amber-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-amber-700 transition-colors"
                      >
                        {t("signup_duplicate_sign_in")}
                      </Link>
                    </div>
                  ) : serverError ? (
                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">{serverError}</div>
                  ) : null}

                  <div className="space-y-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-2xl bg-gradient-to-r from-[#0E7C86] via-[#15A6A8] to-[#1ABC9C] px-5 py-4 text-[15px] font-semibold text-white shadow-[0_14px_28px_rgba(18,150,153,0.22)] transition-all hover:translate-y-[-1px] hover:shadow-[0_18px_30px_rgba(18,150,153,0.26)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? t("signup_loading") : roleCopy.cta}
                    </button>
                    <p className="text-center text-[13px] text-[#647B7B]">
                      {t("signup_already_account")}{" "}
                      <Link href={loginHref(refToken, jobId, nextPath)} className="font-semibold text-[#102224] hover:text-[#0E7C86]">
                        {t("signup_signin_link")}
                      </Link>
                    </p>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    {/* ProTrialCheckoutModal removed — PRO signup now uses Stripe Checkout */}
    </>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}
