"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserRole } from "@/lib/getUserRole";
import { getAgencyLanding } from "@/lib/getAgencyLanding";
import { buildPlanSettingsFallback, formatPlanPricing, planLimitHighlights, premiumSeatHighlights, type PublicPlanSetting } from "@/lib/planSettings.shared";
import { useT } from "@/lib/LanguageContext";
import LanguageSelector from "@/components/LanguageSelector";
import heroBrandImage from "@/public/landing/brisahub-hero-brand.png";
// Real BrisaHub product screenshots
import ssAgencyDashboard  from "@/public/images/screenshots/agencydashboard.png";
import ssAgencyJobs       from "@/public/images/screenshots/agencyjobs.png";
import ssAgencyJobDetail  from "@/public/images/screenshots/agencyjobid.png";
import ssAgencyTalent     from "@/public/images/screenshots/agencytalent.png";
import ssAgencyBookings   from "@/public/images/screenshots/agencybookings.png";
import ssAgencyContracts  from "@/public/images/screenshots/agencycontracts.png";
import ssAgencyFinances   from "@/public/images/screenshots/agencyfinances.png";
import ssTalentDashboard  from "@/public/images/screenshots/talentdashboard.png";
import ssTalentBookings   from "@/public/images/screenshots/talentbookings.png";
import ssTalentContracts  from "@/public/images/screenshots/talentcontracts.png";
import ssTalentFinances   from "@/public/images/screenshots/talentfinances.png";

const FEATURE_ICON_PATHS = [
  "M12 3l7 4v5c0 4.5-2.9 8.5-7 9-4.1-.5-7-4.5-7-9V7l7-4z",
  "M7 3h7l4 4v14H7V3zm7 0v5h5M9 13h6M9 17h6M9 9h2",
  "M4 7h16v10H4V7zm3 4h.01M17 11h.01M8 17v2m8-2v2M7 7V5m10 2V5",
  "M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 10a4 4 0 100-8 4 4 0 000 8zm10.5 10v-2a3 3 0 00-2-2.83M16 3.13a4 4 0 010 7.75",
  "M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0011.9 3.8M19 9A7 7 0 007.1 5.2",
  "M7 11V8a5 5 0 0110 0v3M6 11h12v10H6V11zm6 4v2",
  "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  "M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129",
] as const;

const SHOWCASE_TABS_STATIC = [
  {
    id: "dashboard",
    labelKey: "landing_tab_dashboard",
    image: ssAgencyDashboard,
    eyebrowKey: "landing_showcase_jobs_eyebrow",
    titleKey:   "landing_tab_dashboard_title",
    descKey:    "landing_tab_dashboard_desc",
  },
  {
    id: "jobs",
    labelKey: "landing_tab_jobs",
    image: ssAgencyJobs,
    eyebrowKey: "landing_showcase_jobs_eyebrow",
    titleKey:   "landing_tab_jobs_title",
    descKey:    "landing_tab_jobs_desc",
  },
  {
    id: "talent",
    labelKey: "landing_tab_talent",
    image: ssAgencyTalent,
    eyebrowKey: "landing_showcase_tal_eyebrow",
    titleKey:   "landing_tab_talent_title",
    descKey:    "landing_tab_talent_desc",
  },
  {
    id: "bookings",
    labelKey: "landing_tab_bookings",
    image: ssAgencyBookings,
    eyebrowKey: "landing_showcase_jobs_eyebrow",
    titleKey:   "landing_tab_bookings_title",
    descKey:    "landing_tab_bookings_desc",
  },
  {
    id: "contracts",
    labelKey: "landing_tab_contracts",
    image: ssAgencyContracts,
    eyebrowKey: "landing_showcase_jobs_eyebrow",
    titleKey:   "landing_tab_contracts_title",
    descKey:    "landing_tab_contracts_desc",
  },
  {
    id: "finances",
    labelKey: "landing_tab_finances",
    image: ssAgencyFinances,
    eyebrowKey: "landing_showcase_fin_eyebrow",
    titleKey:   "landing_tab_finances_title",
    descKey:    "landing_tab_finances_desc",
  },
  {
    id: "portal",
    labelKey: "landing_tab_portal",
    image: ssTalentDashboard,
    eyebrowKey: "landing_showcase_tal_eyebrow",
    titleKey:   "landing_tab_portal_title",
    descKey:    "landing_tab_portal_desc",
  },
] as const;

// ── Reusable primitives ───────────────────────────────────────────────────────

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/8 border border-white/10 px-4 py-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[#1ABC9C]" />
      <span className="text-[12px] font-semibold text-white/60 tracking-wide uppercase">{children}</span>
    </div>
  );
}

function CheckIcon({ className = "text-[#1ABC9C]" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 flex-shrink-0 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FeatureIcon({ path }: { path: string }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1ABC9C] to-[#27C1D6] shadow-[0_8px_20px_rgba(26,188,156,0.28)]">
      <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={path} />
      </svg>
    </div>
  );
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/8 bg-white/5 backdrop-blur-sm p-6 ${className}`}>
      {children}
    </div>
  );
}

function ScreenshotFrame({
  src, alt, width, height, priority = false, className = "", sizes, aspectRatio,
}: {
  src: string | StaticImageData;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  sizes: string;
  aspectRatio?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.28)] ${className}`}>
      <div className="relative w-full overflow-hidden rounded-[1rem]" style={{ aspectRatio: aspectRatio ?? `${width} / ${height}` }}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          className="h-full w-full object-cover object-top"
          sizes={sizes}
        />
      </div>
    </div>
  );
}

function ProductPreview({ alt }: { alt: string }) {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:max-w-2xl lg:justify-self-end">
      <div className="absolute -left-6 top-10 h-40 w-40 rounded-full bg-[#1ABC9C]/20 blur-3xl lg:-left-10 lg:h-48 lg:w-48" />
      <div className="absolute -right-6 bottom-8 h-44 w-44 rounded-full bg-[#27C1D6]/10 blur-3xl lg:-right-8 lg:h-56 lg:w-56" />
      <div className="relative rounded-[2.1rem] bg-[linear-gradient(135deg,rgba(26,188,156,0.20),rgba(255,255,255,0.06)_42%,rgba(255,255,255,0.02))] p-px shadow-[0_22px_54px_rgba(0,0,0,0.32)]">
        <ScreenshotFrame
          src={ssAgencyDashboard}
          alt={alt}
          width={ssAgencyDashboard.width}
          height={ssAgencyDashboard.height}
          priority
          className="rounded-[2rem] bg-white/[0.04] backdrop-blur-sm"
          sizes="(min-width: 1024px) 52vw, 94vw"
          aspectRatio={`${ssAgencyDashboard.width} / ${ssAgencyDashboard.height}`}
        />
      </div>
    </div>
  );
}

const primaryLink =
  "inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-6 py-4 text-[15px] font-black text-white shadow-[0_16px_36px_rgba(26,188,156,0.28)] transition-all hover:-translate-y-0.5 hover:brightness-105";

const ghostLink =
  "inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/8 px-6 py-4 text-[15px] font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-white/12";

function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function GridTexture() {
  return (
    <div
      className="absolute inset-0 opacity-[0.04] pointer-events-none"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)",
        backgroundSize: "48px 48px",
      }}
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type LivePlanMap = Record<string, PublicPlanSetting>;

export default function Home() {
  const router = useRouter();
  const { t, lang } = useT();
  const [checking, setChecking] = useState(true);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [livePlans, setLivePlans] = useState<LivePlanMap>(buildPlanSettingsFallback);
  const [paymentMode, setPaymentMode] = useState<"escrow" | "internal">("escrow");
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const isEscrow = paymentMode === "escrow";

  // ── Translated data arrays ────────────────────────────────────────────────

  const howItWorks = [
    { step: "01", title: t("landing_hiw_step1_title"), description: t("landing_hiw_step1_desc") },
    { step: "02", title: t("landing_hiw_step2_title"), description: t("landing_hiw_step2_desc") },
    { step: "03", title: t("landing_hiw_step3_title"), description: t(isEscrow ? "landing_hiw_step3_desc" : "landing_hiw_step3_desc_internal") },
    { step: "04", title: t("landing_hiw_step4_title"), description: t("landing_hiw_step4_desc") },
  ];

  const features = [
    { title: t("landing_feat1_title"), description: t(isEscrow ? "landing_feat1_desc" : "landing_feat1_desc_internal"), icon: FEATURE_ICON_PATHS[0] },
    { title: t("landing_feat2_title"), description: t("landing_feat2_desc"), icon: FEATURE_ICON_PATHS[1] },
    { title: t("landing_feat3_title"), description: t("landing_feat3_desc"), icon: FEATURE_ICON_PATHS[2] },
    { title: t("landing_feat4_title"), description: t("landing_feat4_desc"), icon: FEATURE_ICON_PATHS[3] },
    { title: t("landing_feat5_title"), description: t("landing_feat5_desc"), icon: FEATURE_ICON_PATHS[4] },
    { title: t("landing_feat6_title"), description: t("landing_feat6_desc"), icon: FEATURE_ICON_PATHS[5] },
    { title: t("landing_feat7_title"), description: t("landing_feat7_desc"), icon: FEATURE_ICON_PATHS[6] },
    { title: t("landing_feat8_title"), description: t("landing_feat8_desc"), icon: FEATURE_ICON_PATHS[7] },
    { title: t("landing_feat9_title"), description: t("landing_feat9_desc"), icon: FEATURE_ICON_PATHS[8] },
  ];

  const painItems = [
    { title: t("landing_pain1_title"), desc: t("landing_pain1_desc"), icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
    { title: t("landing_pain2_title"), desc: t("landing_pain2_desc"), icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
    { title: t("landing_pain3_title"), desc: t("landing_pain3_desc"), icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { title: t("landing_pain4_title"), desc: t("landing_pain4_desc"), icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  ];

  const wsFeatures = [
    { title: t("landing_ws1_title"), desc: t("landing_ws1_desc"), icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { title: t("landing_ws2_title"), desc: t("landing_ws2_desc"), icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
    { title: t("landing_ws3_title"), desc: t("landing_ws3_desc"), icon: "M7 11V8a5 5 0 0110 0v3M6 11h12v10H6V11zm6 4v2" },
    { title: t(isEscrow ? "landing_ws4_title" : "landing_ws4_title_internal"), desc: t(isEscrow ? "landing_ws4_desc" : "landing_ws4_desc_internal"), icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
    { title: t("landing_ws5_title"), desc: t("landing_ws5_desc"), icon: "M7 3h7l4 4v14H7V3zm7 0v5h5M9 13h6M9 17h6M9 9h2" },
    { title: t("landing_ws6_title"), desc: t("landing_ws6_desc"), icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  ];

  const statsItems = [
    { value: "100%", label: t("landing_stat1_label"), desc: t("landing_stat1_desc") },
    { value: "2",    label: t("landing_stat2_label"), desc: t("landing_stat2_desc") },
    { value: "PIX",  label: t("landing_stat3_label"), desc: t("landing_stat3_desc") },
    { value: "PT/EN", label: t("landing_stat4_label"), desc: t("landing_stat4_desc") },
  ];

  const trustPillars = [
    { title: t("landing_trust1_title"), description: t(isEscrow ? "landing_trust1_desc" : "landing_trust1_desc_internal") },
    { title: t("landing_trust2_title"), description: t("landing_trust2_desc") },
    { title: t("landing_trust3_title"), description: t("landing_trust3_desc") },
  ];

  const businessTypes = [
    t("landing_biz_marketing"),
    t("landing_biz_content"),
    t("landing_biz_audiovisual"),
    t("landing_biz_freelancers"),
    t("landing_biz_smb"),
  ];

  const showcaseTabs = SHOWCASE_TABS_STATIC.map((tab) => ({
    ...tab,
    label:   t(tab.labelKey   as never),
    eyebrow: t(tab.eyebrowKey as never),
    title:   t(tab.titleKey   as never),
    desc:    t(tab.descKey    as never),
  }));
  const activeShowcase = showcaseTabs.find((t) => t.id === activeTab) ?? showcaseTabs[0];

  const plans = [
    { key: "free"    as const, audience: t("landing_plan_free_audience"),    summary: t("landing_plan_free_summary"),    featured: false, premium: false },
    { key: "pro"     as const, audience: t("landing_plan_pro_audience"),     summary: t("landing_plan_pro_summary"),     featured: true,  premium: false },
    { key: "premium" as const, audience: t("landing_plan_premium_audience"), summary: t("landing_plan_premium_summary"), featured: false, premium: true  },
  ];

  const ctrustItems = [t("landing_ctrust_item1"), t("landing_ctrust_item2"), t("landing_ctrust_item3")];

  function getPlanHighlights(livePlan: PublicPlanSetting) {
    if (livePlan.plan_key === "pro") {
      return [
        "Contratos digitais",
        "Upload de comprovantes",
        "Dashboard operacional",
        "Compartilhamento por WhatsApp",
        "Gestão de talentos",
        "Workflow completo",
      ];
    }
    const liveHighlights = planLimitHighlights(livePlan, lang);
    return livePlan.plan_key === "premium"
      ? [t("plan_everything_in_pro"), ...premiumSeatHighlights(livePlan, lang), ...liveHighlights]
      : liveHighlights;
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    getUserRole().then(async (role) => {
      if (role === "agency") router.replace(await getAgencyLanding());
      else if (role === "talent") router.replace("/talent/dashboard");
      else if (role === "admin") router.replace("/admin/dashboard");
      else setChecking(false);
    });
  }, [router]);

  useEffect(() => {
    void fetch("/api/plan-settings").then(async (res) => {
      if (!res.ok) return;
      const data = await res.json() as LivePlanMap;
      setLivePlans((prev) => ({ ...prev, ...data }));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/platform/mode").then(async (res) => {
      if (!res.ok) return;
      const { mode } = await res.json() as { mode: "escrow" | "internal" };
      if (mode === "internal") setPaymentMode("internal");
    }).catch(() => undefined);
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#061214]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-[#1ABC9C]" />
      </div>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#061214] text-white">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-20 border-b border-white/8 bg-[#061214]/95 px-5 backdrop-blur-md lg:px-10">
        <div className="mx-auto flex h-16 max-w-7xl items-center">
          <Link href="/" aria-label="BrisaHub">
            <Image
              src={heroBrandImage}
              alt="BrisaHub"
              width={heroBrandImage.width}
              height={heroBrandImage.height}
              className="h-auto w-full max-w-[80px]"
            />
          </Link>

          {/* Center section links — hidden on mobile */}
          <div className="hidden flex-1 items-center justify-center gap-0.5 md:flex">
            {(
              [
                { id: "como-funciona",  label: "Como funciona"   },
                { id: "funcionalidades", label: "Funcionalidades" },
                { id: "workspace",      label: "Workspace"       },
                { id: "planos",         label: "Planos"          },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollToSection(id)}
                className="rounded-xl px-3 py-2 text-[13px] font-semibold text-white/50 transition-colors hover:bg-white/8 hover:text-white cursor-pointer"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <LanguageSelector variant="dark" />
            <Link
              href="/login"
              className="rounded-xl px-3 py-2 text-[13px] font-semibold text-white/50 transition-colors hover:bg-white/8 hover:text-white"
            >
              {t("landing_nav_signin")}
            </Link>
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowRoleMenu((v) => !v)}
                className="rounded-xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-4 py-2 text-[13px] font-black text-white shadow-[0_4px_16px_rgba(26,188,156,0.28)] transition-all hover:brightness-105 cursor-pointer"
              >
                {t("landing_nav_register")}
              </button>
              {showRoleMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowRoleMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-40 w-48 rounded-2xl border border-white/10 bg-[#081718] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
                    <Link
                      href="/signup?role=agency"
                      onClick={() => setShowRoleMenu(false)}
                      className="flex items-center gap-3 px-4 py-3.5 text-[13px] font-semibold text-white hover:bg-white/8 transition-colors"
                    >
                      <span className="w-7 h-7 rounded-lg bg-[#1ABC9C]/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </span>
                      <div>
                        <p>{t("landing_nav_agency")}</p>
                        <p className="text-[11px] font-normal text-white/40">{t("landing_nav_agency_sub")}</p>
                      </div>
                    </Link>
                    <div className="h-px bg-white/8 mx-4" />
                    <Link
                      href="/signup?role=talent"
                      onClick={() => setShowRoleMenu(false)}
                      className="flex items-center gap-3 px-4 py-3.5 text-[13px] font-semibold text-white hover:bg-white/8 transition-colors"
                    >
                      <span className="w-7 h-7 rounded-lg bg-[#1ABC9C]/15 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </span>
                      <div>
                        <p>{t("landing_nav_talent")}</p>
                        <p className="text-[11px] font-normal text-white/40">{t("landing_nav_talent_sub")}</p>
                      </div>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Layered background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-5%,rgba(26,188,156,0.26),transparent),radial-gradient(ellipse_60%_45%_at_50%_78%,rgba(26,188,156,0.11),transparent_65%),radial-gradient(circle_at_80%_85%,rgba(39,193,214,0.10),transparent_40%),radial-gradient(circle_at_12%_70%,rgba(26,188,156,0.07),transparent_35%),linear-gradient(180deg,#071516_0%,#041012_100%)]" />
        <div className="absolute inset-0 opacity-[0.035]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)",backgroundSize:"48px 48px"}} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_34%,rgba(4,12,14,0.88)_100%)]" />

        <div className="relative mx-auto max-w-7xl px-5 lg:px-10">

          {/* Text block — centered */}
          <div className="flex flex-col items-center pb-6 pt-10 text-center sm:pt-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1ABC9C]" />
              <span className="text-[12px] font-semibold uppercase tracking-wide text-white/60">{t("landing_hero_badge")}</span>
            </div>
            <h1 className="mt-5 max-w-4xl text-[2.8rem] font-black leading-[1.04] tracking-[-0.04em] text-white sm:text-[3.8rem] lg:text-[5.2rem]">
              {t("landing_hero_title_line1")}<br />
              <span className="bg-gradient-to-r from-[#1ABC9C] via-[#20D4BE] to-[#27C1D6] bg-clip-text text-transparent">
                {t("landing_hero_title_gradient")}
              </span><br />
              {t("landing_hero_title_line3")}
            </h1>
            <p className="mt-5 max-w-md text-[16px] leading-7 text-white/62">
              {t("landing_hero_subtitle")}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup?role=agency&plan=premium" className={primaryLink}>
                {t("landing_hero_cta_agency")}
              </Link>
              <Link href="/signup?role=talent" className={ghostLink}>
                {t("landing_hero_cta_talent")}
              </Link>
            </div>
          </div>

          {/* Dashboard + floating feature cards — 3-col grid on xl */}
          <div className="grid items-center gap-4 pb-4 xl:grid-cols-[190px_1fr_190px]">

            {/* Left cards */}
            <div className="hidden flex-col gap-3.5 xl:flex">
              {[
                { path: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", title: t("landing_hero_callout1"), sub: t("landing_hero_callout1_sub") },
                { path: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", title: t("landing_hero_callout2"), sub: t("landing_hero_callout2_sub") },
                { path: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", title: t("landing_hero_callout3"), sub: t("landing_hero_callout3_sub") },
              ].map((card) => (
                <div key={card.title} className="relative flex items-start gap-3 rounded-2xl border border-white/[0.10] bg-[#071314]/95 px-4 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-md">
                  {/* connector dot + line */}
                  <span className="absolute -right-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#1ABC9C] shadow-[0_0_12px_rgba(26,188,156,1)]" />
                  <span className="absolute right-[-5px] top-1/2 hidden h-px w-5 -translate-y-px bg-gradient-to-r from-[#1ABC9C]/65 to-transparent xl:block" />
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#1ABC9C]/25 bg-[#1ABC9C]/12">
                    <svg className="h-4 w-4 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={card.path} />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-black leading-tight text-white">{card.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-white/45">{card.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Central dashboard mockup */}
            <div className="relative">
              {/* Glow halo behind dashboard */}
              <div className="absolute -inset-10 bg-[radial-gradient(ellipse_at_center,rgba(26,188,156,0.28),transparent_58%)] blur-3xl" />
              {/* Device frame */}
              <div className="relative overflow-hidden rounded-[1.4rem] bg-[#050f10] shadow-[0_48px_120px_rgba(0,0,0,0.88),0_0_80px_rgba(26,188,156,0.22),inset_0_1px_0_rgba(255,255,255,0.07)] ring-1 ring-[#1ABC9C]/35">
                {/* Glass top highlight */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                {/* Minimal top chrome */}
                <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#050f10] px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                  </div>
                  <span className="text-[10px] text-white/20">app.brisahub.com</span>
                  <div className="w-12" />
                </div>
                {/* Dashboard screenshot */}
                <Image
                  src={ssAgencyDashboard}
                  alt={t("landing_alt_dashboard")}
                  width={ssAgencyDashboard.width}
                  height={ssAgencyDashboard.height}
                  priority
                  className="block w-full"
                  sizes="(min-width: 1280px) 62vw, (min-width: 768px) 82vw, 96vw"
                />
                {/* Bottom depth fade */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#050f10]/55 to-transparent" />
              </div>
            </div>

            {/* Right cards */}
            <div className="hidden flex-col gap-3.5 xl:flex">
              {[
                { path: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z", title: t("landing_hero_callout4"), sub: t("landing_hero_callout4_sub") },
                { path: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z", title: t("landing_hero_callout5"), sub: t("landing_hero_callout5_sub") },
                { path: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z", title: t("landing_hero_callout6"), sub: t("landing_hero_callout6_sub") },
              ].map((card) => (
                <div key={card.title} className="relative flex items-start gap-3 rounded-2xl border border-white/[0.10] bg-[#071314]/95 px-4 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-md">
                  {/* connector dot + line */}
                  <span className="absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#1ABC9C] shadow-[0_0_12px_rgba(26,188,156,1)]" />
                  <span className="absolute left-[-5px] top-1/2 hidden h-px w-5 -translate-y-px bg-gradient-to-l from-[#1ABC9C]/65 to-transparent xl:block" />
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#1ABC9C]/25 bg-[#1ABC9C]/12">
                    <svg className="h-4 w-4 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={card.path} />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-black leading-tight text-white">{card.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-white/45">{card.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics glass bar */}
          <div className="pb-4">
            <div className="overflow-hidden rounded-[1.5rem] border border-[#1ABC9C]/18 bg-white/[0.055] shadow-[0_8px_48px_rgba(0,0,0,0.45),0_0_0_1px_rgba(26,188,156,0.07)] backdrop-blur-md">
              <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.07] lg:grid-cols-4 lg:divide-y-0">
                {[
                  { path: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", value: isEscrow ? "Escrow" : t("landing_metric1_value_internal"), desc: t(isEscrow ? "landing_metric1_desc" : "landing_metric1_desc_internal") },
                  { path: "M17 20v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm13 9v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75", value: "Portal", desc: t("landing_metric2_desc") },
                  { path: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z", value: "PT/EN", desc: t("landing_metric3_desc") },
                  { path: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", value: "100% Digital", desc: t("landing_metric4_desc") },
                ].map((m) => (
                  <div key={m.value} className="flex items-center gap-4 px-6 py-7 sm:px-8">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-[#1ABC9C]/25 bg-[#1ABC9C]/12">
                      <svg className="h-[22px] w-[22px] text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={m.path} />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[18px] font-black leading-tight text-white">{m.value}</p>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-white/45">{m.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Bottom logo — centered, glowing */}
        <div className="relative flex justify-center pb-12 pt-6">
          <div className="absolute left-1/2 top-0 h-px w-80 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#1ABC9C]/45 to-transparent" />
          <Image
            src={heroBrandImage}
            alt="BrisaHub"
            width={heroBrandImage.width}
            height={heroBrandImage.height}
            className="h-auto w-full max-w-[130px] opacity-78 drop-shadow-[0_0_32px_rgba(26,188,156,0.75)]"
          />
        </div>
      </section>

      {/* ── Problem / Solution ── */}
      <section className="relative overflow-hidden px-5 py-20 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(26,188,156,0.07),transparent_40%)]" />
        <GridTexture />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center mb-14">
            <Pill>{t("landing_pain_pill")}</Pill>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              {t("landing_pain_title")}
            </h2>
            <p className="mt-5 text-base leading-7 text-white/50">{t("landing_pain_desc")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-12">
            {painItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-red-900/30 bg-red-950/20 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-900/30 mb-4">
                  <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.icon} />
                  </svg>
                </div>
                <h3 className="text-[14px] font-black text-white/80">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-white/40">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[2rem] border border-[#1ABC9C]/25 bg-[radial-gradient(circle_at_14%_0%,rgba(26,188,156,0.14),transparent_50%)] p-8 lg:p-12">
            <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1ABC9C] to-[#27C1D6] shadow-[0_12px_32px_rgba(26,188,156,0.30)] flex-shrink-0">
                <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#1ABC9C] mb-2">{t("landing_solution_label")}</p>
                <p className="text-[17px] leading-8 font-semibold text-white/90">{t("landing_solution_text")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="como-funciona" className="relative overflow-hidden px-5 py-20 lg:px-10 scroll-mt-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,rgba(39,193,214,0.08),transparent_40%)]" />
        <GridTexture />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <Pill>{t("landing_hiw_pill1")}</Pill>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              {t("landing_hiw_title1")}
            </h2>
            <p className="mt-5 text-base leading-7 text-white/50">
              {t("landing_hiw_desc1")}
            </p>
          </div>

          <div className="mx-auto mt-14 max-w-2xl text-center">
            <Pill>{t("landing_hiw_pill2")}</Pill>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              {t("landing_hiw_title2")}
            </h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((item) => (
              <GlassCard key={item.step} className="transition-transform duration-200 hover:-translate-y-1">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1ABC9C]/20 to-[#27C1D6]/20 text-sm font-black text-[#1ABC9C] border border-[#1ABC9C]/20">
                  {item.step}
                </span>
                <h3 className="mt-6 text-base font-black text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/50">{item.description}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── Premium Workspace ── */}
      <section id="workspace" className="relative overflow-hidden px-5 py-24 lg:px-10 scroll-mt-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(39,193,214,0.10),transparent_40%),radial-gradient(circle_at_10%_80%,rgba(26,188,156,0.08),transparent_40%)]" />
        <GridTexture />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <Pill>{t("landing_ws_pill")}</Pill>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              {t("landing_ws_title")}
            </h2>
            <p className="mt-5 text-base leading-7 text-white/50">{t("landing_ws_subtitle")}</p>
          </div>

          {/* Visual workspace mockup */}
          <div className="mb-14 overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(26,188,156,0.12),rgba(39,193,214,0.06)_50%,rgba(255,255,255,0.03))] p-px shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
            <div className="rounded-[calc(2rem-1px)] bg-[#071314] px-6 py-8 sm:px-10 sm:py-10">
              {/* Mock browser bar */}
              <div className="mb-6 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-white/10" />
                  <span className="h-3 w-3 rounded-full bg-white/10" />
                  <span className="h-3 w-3 rounded-full bg-white/10" />
                </div>
                <div className="flex-1 rounded-full border border-white/8 bg-white/5 px-4 py-1.5 text-[11px] text-white/30 max-w-xs">
                  brisahub.com/<span className="text-[#1ABC9C]/70">sua-agencia</span>
                </div>
              </div>
              {/* Mock workspace header */}
              <div className="mb-6 overflow-hidden rounded-2xl border border-white/8">
                <div className="flex items-center gap-4 bg-gradient-to-r from-[#1ABC9C]/20 to-[#27C1D6]/10 px-5 py-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1ABC9C] to-[#27C1D6] text-[13px] font-black text-white">SA</div>
                  <div>
                    <p className="text-[14px] font-black text-white">Studio Alpha</p>
                    <p className="text-[11px] text-white/40">Espaço Premium · Proprietário</p>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[10px] font-semibold text-white/50">4 agentes</span>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-400">Ativo</span>
                  </div>
                </div>
              </div>
              {/* Mock feature grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: "Portal", sub: "Branded", color: "from-violet-500/20 to-violet-600/10", dot: "bg-violet-400" },
                  { label: "Vagas", sub: "Privadas", color: "from-indigo-500/20 to-indigo-600/10", dot: "bg-indigo-400" },
                  { label: "Agentes", sub: "4 ativos", color: "from-sky-500/20 to-sky-600/10", dot: "bg-sky-400" },
                  { label: "Carteira", sub: "R$ 8.400", color: "from-[#1ABC9C]/20 to-[#1ABC9C]/10", dot: "bg-[#1ABC9C]" },
                  { label: "Contratos", sub: "12 ativos", color: "from-amber-500/20 to-amber-600/10", dot: "bg-amber-400" },
                  { label: "Talentos", sub: "28 na base", color: "from-pink-500/20 to-pink-600/10", dot: "bg-pink-400" },
                ].map((tile) => (
                  <div key={tile.label} className={`rounded-xl border border-white/8 bg-gradient-to-br ${tile.color} p-4`}>
                    <div className={`mb-2 h-2 w-2 rounded-full ${tile.dot}`} />
                    <p className="text-[13px] font-black text-white">{tile.label}</p>
                    <p className="text-[11px] text-white/45">{tile.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wsFeatures.map((feat) => (
              <div key={feat.title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-transform duration-200 hover:-translate-y-0.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1ABC9C]/20 to-[#27C1D6]/15 mb-4">
                  <svg className="h-5 w-5 text-[#1ABC9C]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={feat.icon} />
                  </svg>
                </div>
                <h3 className="text-[14px] font-black text-white">{feat.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-white/50">{feat.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link href="/signup?role=agency&plan=premium" className={primaryLink}>
              {t("landing_ws_cta")}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="funcionalidades" className="relative overflow-hidden px-5 py-20 lg:px-10 scroll-mt-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_60%,rgba(26,188,156,0.10),transparent_35%),radial-gradient(circle_at_90%_40%,rgba(39,193,214,0.07),transparent_35%)]" />
        <GridTexture />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <Pill>{t("landing_feat_pill")}</Pill>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              {t("landing_feat_title")}
            </h2>
            <p className="mt-5 text-base leading-7 text-white/50">
              {t("landing_feat_desc")}
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <GlassCard key={feature.title}>
                <FeatureIcon path={feature.icon} />
                <h3 className="mt-5 text-base font-black text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/50">{feature.description}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ── */}
      <section className="relative overflow-hidden px-5 py-20 lg:px-10">
        <GridTexture />
        <div className="relative mx-auto max-w-7xl">
          <div className="rounded-[2rem] border border-white/8 bg-[radial-gradient(circle_at_14%_0%,rgba(26,188,156,0.12),transparent_40%)] p-8 lg:p-14">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <Pill>{t("landing_use_pill")}</Pill>
                <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
                  {t("landing_use_title")}
                </h2>
                <p className="mt-5 text-base leading-7 text-white/50">
                  {t("landing_use_desc")}
                </p>

                <div className="mt-8 rounded-2xl border border-white/8 bg-white/5 p-5">
                  <p className="text-sm font-black text-white">{t("landing_use_for_whom")}</p>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    {t("landing_use_who_desc")}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {businessTypes.map((type) => (
                      <span key={type} className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] font-medium text-white/60 capitalize">
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                {trustPillars.map((pillar) => (
                  <div key={pillar.title} className="rounded-2xl border border-white/8 bg-white/5 px-6 py-5 flex items-start gap-4">
                    <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-xl bg-[#1ABC9C]/15 flex items-center justify-center">
                      <CheckIcon />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white">{pillar.title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-white/50">{pillar.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tabbed Screenshot Showcase ── */}
      <section id="workspace" className="relative overflow-hidden px-5 pb-28 pt-20 lg:px-10 scroll-mt-20">
        {/* Rich layered background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(26,188,156,0.13),transparent_55%)]" />
        <div className="absolute left-1/4 top-1/3 h-96 w-96 rounded-full bg-[#27C1D6]/8 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-72 w-72 rounded-full bg-[#1ABC9C]/6 blur-[100px]" />
        <GridTexture />

        <div className="relative mx-auto max-w-7xl">

          {/* Header — centered */}
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <Pill>{t("landing_ss_pill")}</Pill>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              {t("landing_ss_title")}
            </h2>
            <p className="mt-5 text-base leading-7 text-white/40">
              {t("landing_ss_desc")}
            </p>
          </div>

          {/* ── DESKTOP: vertical tabs left + large screenshot right ── */}
          <div className="hidden lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">

            {/* Vertical tab list */}
            <div className="flex flex-col gap-1 pt-2">
              {showcaseTabs.map((tab, i) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-200",
                      isActive
                        ? "bg-white/[0.08] ring-1 ring-white/10"
                        : "hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    {/* Active indicator bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-[#1ABC9C] shadow-[0_0_10px_rgba(26,188,156,0.8)]" />
                    )}
                    {/* Number badge */}
                    <span className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black transition-colors",
                      isActive
                        ? "bg-[#1ABC9C] text-white shadow-[0_2px_8px_rgba(26,188,156,0.45)]"
                        : "bg-white/[0.06] text-white/30 group-hover:bg-white/[0.09] group-hover:text-white/50",
                    ].join(" ")}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={[
                      "text-[13px] font-semibold transition-colors",
                      isActive ? "text-white" : "text-white/40 group-hover:text-white/65",
                    ].join(" ")}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Large screenshot panel */}
            <div className="relative min-w-0">
              {/* Ambient glow rings */}
              <div className="absolute -inset-px rounded-[1.6rem] bg-gradient-to-br from-[#1ABC9C]/25 via-transparent to-[#27C1D6]/15 blur-sm" />
              <div className="absolute inset-0 rounded-[1.5rem] shadow-[0_0_80px_rgba(26,188,156,0.12)]" />

              {/* Frame */}
              <div className="relative overflow-hidden rounded-[1.5rem] border border-white/[0.10] bg-[#050f10] shadow-[0_32px_80px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]">
                {/* Browser chrome */}
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.025] px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28C940]" />
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1">
                    <svg className="h-3 w-3 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                    <span className="text-[11px] text-white/30">app.brisahub.com.br</span>
                  </div>
                  <div className="w-14" />
                </div>

                {/* Screenshot */}
                <div className="relative">
                  <Image
                    src={activeShowcase.image}
                    alt={activeShowcase.title}
                    width={activeShowcase.image.width}
                    height={activeShowcase.image.height}
                    className="block w-full"
                    sizes="(min-width: 1280px) 72vw, 80vw"
                    priority={activeTab === "dashboard"}
                  />
                  {/* Bottom gradient overlay with label */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#050f10]/85 via-[#050f10]/30 to-transparent pb-5 pt-14 pl-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1ABC9C]">{activeShowcase.eyebrow}</p>
                    <p className="mt-1 text-[15px] font-black text-white">{activeShowcase.title}</p>
                  </div>
                </div>
              </div>

              {/* Description card — below screenshot */}
              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-6 py-5 backdrop-blur-sm">
                <p className="text-[14px] leading-7 text-white/60">{activeShowcase.desc}</p>
              </div>
            </div>
          </div>

          {/* ── MOBILE: scrollable tabs + full screenshot ── */}
          <div className="lg:hidden">
            {/* Scrollable tab pills */}
            <div className="mb-6 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {showcaseTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "flex-shrink-0 rounded-xl px-4 py-2 text-[13px] font-semibold transition-all",
                    activeTab === tab.id
                      ? "bg-[#1ABC9C] text-white shadow-[0_4px_14px_rgba(26,188,156,0.35)]"
                      : "bg-white/[0.07] text-white/45 hover:text-white/70",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Screenshot */}
            <div className="relative">
              <div className="absolute -inset-3 rounded-3xl bg-[radial-gradient(ellipse_at_50%_50%,rgba(26,188,156,0.2),transparent_65%)] blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
                <div className="flex items-center gap-1.5 border-b border-white/[0.07] bg-[#050f10] px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-white/20" /><span className="h-2 w-2 rounded-full bg-white/20" /><span className="h-2 w-2 rounded-full bg-white/20" />
                  <span className="ml-2 text-[10px] text-white/25">app.brisahub.com.br</span>
                </div>
                <Image src={activeShowcase.image} alt={activeShowcase.title}
                  width={activeShowcase.image.width} height={activeShowcase.image.height}
                  className="block w-full" sizes="96vw" />
              </div>
            </div>

            {/* Text */}
            <div className="mt-6 space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-5">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#1ABC9C]">{activeShowcase.eyebrow}</p>
              <h3 className="text-xl font-black leading-tight text-white">{activeShowcase.title}</h3>
              <p className="text-[14px] leading-6 text-white/55">{activeShowcase.desc}</p>
            </div>

            {/* Thumbnail strip */}
            <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {showcaseTabs.filter((tab) => tab.id !== activeTab).map((tab) => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className="flex-shrink-0 overflow-hidden rounded-xl border border-white/[0.08] opacity-40 transition-all hover:opacity-75" style={{ width: 160 }}>
                  <Image src={tab.image} alt={tab.label}
                    width={tab.image.width} height={tab.image.height}
                    className="block w-full object-cover object-top" sizes="160px" />
                </button>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── Stats ── */}
      <section className="relative overflow-hidden px-5 py-20 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(26,188,156,0.07),transparent_50%)]" />
        <GridTexture />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <Pill>{t("landing_stats_pill")}</Pill>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
              {t("landing_stats_title")}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statsItems.map((item) => (
              <div key={item.label} className="rounded-[1.5rem] border border-white/8 bg-[radial-gradient(circle_at_30%_0%,rgba(26,188,156,0.10),transparent_50%)] p-7 text-center">
                <p className="text-[2.6rem] font-black tracking-[-0.04em] text-white leading-none">{item.value}</p>
                <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#1ABC9C]">{item.label}</p>
                <p className="mt-3 text-[12px] leading-5 text-white/45">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="planos" className="relative overflow-hidden px-5 pb-20 pt-24 lg:px-10 lg:pt-28 scroll-mt-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(26,188,156,0.12),transparent_40%)]" />
        <GridTexture />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <Pill>{t("landing_plans_pill")}</Pill>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              {t("landing_plans_title")}
            </h2>
            <p className="mt-5 text-base leading-7 text-white/50">
              {t("landing_plans_desc")}
            </p>
          </div>

          <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
            {plans.map((plan) => {
              const livePlan = livePlans[plan.key] ?? buildPlanSettingsFallback()[plan.key];
              const isDisabled = !livePlan.is_available;
              const highlights = getPlanHighlights(livePlan);
              const pricing = formatPlanPricing(livePlan, lang);

              return <div
                key={plan.key}
                className={[
                  "relative flex h-full flex-col rounded-[1.5rem] border p-8 transition-all",
                  plan.featured
                    ? "border-[#1ABC9C]/40 bg-[radial-gradient(circle_at_50%_0%,rgba(26,188,156,0.15),transparent_50%)] shadow-[0_24px_70px_rgba(26,188,156,0.18)]"
                    : plan.key === "premium"
                    ? "border-white/8 bg-white/[0.03]"
                    : "border-white/8 bg-white/5",
                ].join(" ")}
              >
                {plan.featured && (
                  <span className="absolute right-5 top-5 rounded-full bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_4px_16px_rgba(26,188,156,0.28)]">
                    {t("plan_popular_badge")}
                  </span>
                )}
                {isDisabled && (
                  <span className="absolute right-5 top-5 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/50">
                    {t("plan_coming_soon")}
                  </span>
                )}
                <div className={plan.featured || plan.key === "premium" ? "flex h-full flex-col pt-8" : "flex h-full flex-col"}>
                  <p className="text-sm font-bold text-white/40">{plan.audience}</p>
                  <h3 className="mt-4 text-2xl font-black text-white">{livePlan.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/50">{plan.summary}</p>
                  {livePlan.is_available ? (
                    <div className="mt-4">
                      <span className="text-4xl font-black tracking-[-0.04em] text-white">{pricing.primaryPrice}</span>
                      {plan.key !== "free" && pricing.isIntroOffer && (
                        <div className="mt-3 space-y-1.5">
                          {pricing.trialLine && (
                            <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-400">
                              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              {pricing.trialLine}
                            </p>
                          )}
                          {pricing.introLine && (
                            <p className="flex items-center gap-2 text-[13px] text-white/70">
                              <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              {pricing.introLine}
                            </p>
                          )}
                          {pricing.recurringLine && (
                            <p className="flex items-center gap-2 text-[13px] text-white/50">
                              <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                              {pricing.recurringLine}
                            </p>
                          )}
                        </div>
                      )}
                      {plan.key !== "free" && !pricing.isIntroOffer && pricing.trialLine && (
                        <p className="mt-2 text-[13px] font-semibold text-emerald-400">{pricing.trialLine}</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-4xl font-black tracking-[-0.04em] text-white/45">{t("plan_coming_soon")}</p>
                  )}
                  {livePlan.is_available && plan.key === "free" && (
                    <p className="mt-5 text-[13px] font-semibold text-white/50">20% por contratação concluída</p>
                  )}
                  <ul className="mt-6 space-y-3 pb-7">
                    {highlights.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm leading-6 text-white/60">
                        <CheckIcon />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {isDisabled ? (
                    <span className="mt-auto inline-flex w-full items-center justify-center rounded-2xl px-5 py-3.5 text-sm font-black border border-white/10 bg-white/5 text-white/30 cursor-not-allowed">
                      {t("plan_coming_soon")}
                    </span>
                  ) : (
                    <Link
                      href={`/signup?role=agency&plan=${plan.key}`}
                      className={[
                        "mt-auto inline-flex w-full items-center justify-center rounded-2xl px-5 py-3.5 text-sm font-black transition-all",
                        plan.featured
                          ? "bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] text-white shadow-[0_8px_24px_rgba(26,188,156,0.28)] hover:brightness-105"
                          : "border border-white/12 bg-white/8 text-white hover:bg-white/12",
                      ].join(" ")}
                    >
                      {t("plan_cta_prefix")} {livePlan.name}
                    </Link>
                  )}
                </div>
              </div>;
            })}
          </div>
        </div>
      </section>

      {/* ── Trust ── */}
      <section className="relative overflow-hidden px-5 py-20 lg:px-10">
        <GridTexture />
        <div className="relative mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <Pill>{t("landing_ctrust_pill")}</Pill>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              {t("landing_ctrust_title")}
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/50">
              {t("landing_ctrust_desc")}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {ctrustItems.map((item) => (
              <GlassCard key={item}>
                <CheckIcon />
                <p className="mt-4 text-sm font-black leading-6 text-white">{item}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden px-5 py-20 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(26,188,156,0.18),transparent_32%),radial-gradient(circle_at_80%_100%,rgba(39,193,214,0.12),transparent_32%)]" />
        <GridTexture />
        <div className="relative mx-auto max-w-7xl">
          <div className="rounded-[2rem] border border-white/8 bg-white/[0.03] px-6 py-14 text-center sm:px-10">
            <Pill>{t("landing_cta_pill")}</Pill>
            <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              {t("landing_cta_title")}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/50">
              {t("landing_cta_desc")}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup?role=agency" className={primaryLink}>
                {t("landing_cta_btn_agency")}
              </Link>
              <Link href="/signup?role=talent" className={ghostLink}>
                {t("landing_cta_btn_talent")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/8 px-5 py-7 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <Image
            src={heroBrandImage}
            alt="BrisaHub"
            width={heroBrandImage.width}
            height={heroBrandImage.height}
            className="h-auto w-full max-w-[64px] mx-auto sm:mx-0 opacity-70"
          />
          <p className="text-[12px] text-white/30">{t("landing_footer_rights")}</p>
        </div>
      </footer>

    </main>
  );
}
