"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAgencyLanding } from "@/lib/getAgencyLanding";
import { getTalentLanding } from "@/lib/getTalentLanding";
import { useT } from "@/lib/LanguageContext";
import LanguageSelector from "@/components/LanguageSelector";
import heroBrandImage from "@/public/landing/brisahub-hero-brand.png";

const ROLE_HOME: Record<string, string> = {
  talent: "/talent/dashboard",
  admin:  "/admin/dashboard",
};

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function onboardingHref(nextPath: string | null) {
  const params = new URLSearchParams();
  if (nextPath) params.set("next", nextPath);
  const qs = params.toString();
  return qs ? `/onboarding?${qs}` : "/onboarding";
}

function LoginPageContent() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const refToken = searchParams.get("ref")?.trim() || null;
  const jobId = searchParams.get("job")?.trim() || null;
  const nextPath = safeNextPath(searchParams.get("next")) ?? (jobId ? `/talent/jobs/${jobId}` : null);

  const [email,          setEmail]          = useState("");
  const [password,       setPassword]       = useState("");
  const [error,          setError]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [showRoleChoice, setShowRoleChoice] = useState(false);
  const [referredEmail,  setReferredEmail]  = useState<string | null>(null);

  useEffect(() => {
    if (!refToken) return;
    void fetch(`/api/referrals/info?token=${encodeURIComponent(refToken)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json() as { referred_email?: string | null };
        if (data.referred_email) setReferredEmail(data.referred_email.trim().toLowerCase());
      })
      .catch(() => undefined);
  }, [refToken]);

  function talentSignupHref() {
    const params = new URLSearchParams({ role: "talent" });
    if (refToken) params.set("ref", refToken);
    if (jobId) params.set("job", jobId);
    if (nextPath) params.set("next", nextPath);
    return `/signup?${params.toString()}`;
  }

  async function linkReferral(userId: string): Promise<{ mismatch: boolean }> {
    if (!refToken) return { mismatch: false };
    const res = await fetch("/api/referrals/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: refToken, user_id: userId }),
    });
    return { mismatch: res.status === 403 };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !data.user) {
      setError(authError?.message ?? t("login_failed"));
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, onboarding_completed")
      .eq("id", data.user.id)
      .single();

    let destination: string;

    if (profile?.role === "agency") {
      if (profile.onboarding_completed === false) {
        destination = onboardingHref(nextPath);
      } else {
        destination = nextPath ?? await getAgencyLanding(data.user.id);
      }
    } else if (profile?.role === "talent") {
      const linkResult = await linkReferral(data.user.id);
      if (linkResult.mismatch) {
        setError(`Este convite só pode ser usado com o e-mail ${referredEmail ?? "indicado"}. Faça login com esse e-mail.`);
        setLoading(false);
        return;
      }
      // Portal-only talents (marketplace_visible=false) land directly on their
      // workspace portal, avoiding the double redirect via /talent/dashboard.
      destination = profile.onboarding_completed === false
        ? onboardingHref(nextPath)
        : (nextPath ?? await getTalentLanding(data.user.id));
    } else {
      destination = "/onboarding/role";
    }

    window.location.assign(destination);
  }

  return (
    <div className="min-h-screen bg-[#061214] flex">

      {/* â”€â”€ Left panel (decorative, hidden on mobile) â”€â”€ */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col justify-between px-12 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(39,193,214,0.22),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(26,188,156,0.18),transparent_35%),linear-gradient(180deg,#081718_0%,#041012_100%)]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)",backgroundSize:"48px 48px"}} />

        <div className="relative">
          <Image
            src={heroBrandImage}
            alt="BrisaHub"
            width={heroBrandImage.width}
            height={heroBrandImage.height}
            className="h-auto w-full max-w-[120px]"
            priority
          />
        </div>

        <div className="relative space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/8 border border-white/10 px-4 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1ABC9C]" />
            <span className="text-[12px] font-semibold text-white/60 tracking-wide">{t("login_tagline")}</span>
          </div>
          <h2 className="text-[2.6rem] font-black tracking-[-0.04em] leading-[1.1] text-white">
            {t("login_hero_line1")}<br />
            <span className="bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] bg-clip-text text-transparent">
              {t("login_hero_gradient")}
            </span><br />
            {t("login_hero_line3")}
          </h2>
          <p className="text-[15px] leading-7 text-white/50 max-w-sm">
            {t("login_hero_subtitle")}
          </p>
        </div>

        <div className="relative flex items-center gap-8">
          {[
            { value: "100%", label: t("login_stat_secure") },
            { value: "PIX",  label: t("login_stat_payments") },
            { value: "24h",  label: t("login_stat_support") },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-[1.25rem] font-black text-white tracking-tight">{value}</p>
              <p className="text-[11px] text-white/40 font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* â”€â”€ Right panel (form) â”€â”€ */}
      <div className="flex flex-1 flex-col px-5 pt-6 pb-10 lg:px-12">
        <div className="flex justify-end">
          <LanguageSelector variant="dark" />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[400px]">

            {/* Mobile logo */}
            <div className="flex justify-center mb-10 lg:hidden">
              <Image
                src={heroBrandImage}
                alt="BrisaHub"
                width={heroBrandImage.width}
                height={heroBrandImage.height}
                priority
                className="h-auto w-full max-w-[140px]"
              />
            </div>

            {/* Form card */}
            <div className="rounded-[28px] border border-white/8 bg-white/5 backdrop-blur-sm p-8 shadow-[0_24px_64px_rgba(0,0,0,0.4)]">
              <h1 className="text-[1.6rem] font-black tracking-[-0.03em] text-white mb-1">
                {t("login_title")}
              </h1>
              <p className="text-[13px] text-white/40 mb-8">
                {t("login_subtitle")}
              </p>

              {referredEmail && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-teal-500/20 bg-teal-500/10 px-4 py-3">
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[13px] text-teal-200">Este convite está vinculado ao e-mail <strong className="text-white">{referredEmail}</strong>. Faça login com esse e-mail.</p>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-white/50 uppercase tracking-widest mb-2">
                    {t("login_email_label")}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t("login_email_placeholder")}
                    className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white placeholder-white/20 focus:border-[#1ABC9C]/60 focus:ring-2 focus:ring-[#1ABC9C]/15 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-white/50 uppercase tracking-widest mb-2">
                    {t("login_password_label")}
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t("login_password_placeholder")}
                    className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white placeholder-white/20 focus:border-[#1ABC9C]/60 focus:ring-2 focus:ring-[#1ABC9C]/15 focus:outline-none transition-all"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                    <svg className="w-4 h-4 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[13px] text-rose-300">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white text-[15px] font-bold tracking-tight shadow-[0_8px_24px_rgba(26,188,156,0.28)] hover:shadow-[0_12px_32px_rgba(26,188,156,0.36)] hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
                >
                  {loading ? t("login_loading") : t("login_submit")}
                </button>
              </form>
            </div>

            {/* Sign up link */}
            <div className="mt-6 text-center">
              <p className="text-[13px] text-white/30">
                {t("login_no_account")}{" "}
                <button
                  type="button"
                  onClick={() => setShowRoleChoice((v) => !v)}
                  className="text-[#1ABC9C] font-semibold hover:text-[#27C1D6] transition-colors cursor-pointer"
                >
                  {t("login_create_account")}
                </button>
              </p>
              {showRoleChoice && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    href="/signup?role=agency"
                    className="flex flex-col items-center gap-1.5 px-4 py-3.5 rounded-2xl border border-white/10 bg-white/5 hover:border-[#1ABC9C]/40 hover:bg-white/8 transition-all"
                  >
                    <svg className="w-4 h-4 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="text-[13px] font-semibold text-white/80">{t("login_role_agency")}</span>
                    <span className="text-[11px] text-white/35">{t("login_role_agency_sub")}</span>
                  </Link>
                  <Link
                    href={talentSignupHref()}
                    className="flex flex-col items-center gap-1.5 px-4 py-3.5 rounded-2xl border border-white/10 bg-white/5 hover:border-[#1ABC9C]/40 hover:bg-white/8 transition-all"
                  >
                    <svg className="w-4 h-4 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-[13px] font-semibold text-white/80">{t("login_role_talent")}</span>
                    <span className="text-[11px] text-white/35">{t("login_role_talent_sub")}</span>
                  </Link>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

