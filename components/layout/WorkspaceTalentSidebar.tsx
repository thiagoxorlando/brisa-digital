"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/LanguageContext";
import { useUserProfile } from "@/lib/useUserProfile";
import { useWorkspacePortal } from "@/lib/WorkspacePortalContext";
import heroBrandImage from "@/public/landing/brisahub-hero-brand.png";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type PortalNavItem = {
  label: string;
  href: string;
  exact?: boolean;
  icon: React.ReactNode;
};

function normalizeHexColor(color: string | null | undefined, fallback: string) {
  if (!color) return fallback;
  const v = color.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : fallback;
}

function hexToRgba(hex: string, alpha: number) {
  const v = hex.replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function agencyInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function WorkspaceTalentSidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();
  const { workspace } = useWorkspacePortal();
  const { displayName, email, initials: userInitials, avatarUrl, loading } = useUserProfile();
  const [imgError, setImgError] = useState(false);

  if (!workspace) return null;

  const primary = normalizeHexColor(workspace.primaryColor, "#1ABC9C");
  const accent  = normalizeHexColor(workspace.accentColor,  "#27C1D6");

  // Active nav item — same pattern as main sidebar's premium section
  const activeItemStyle = {
    background: `linear-gradient(135deg, ${hexToRgba(primary, 0.22)} 0%, ${hexToRgba(accent, 0.14)} 100%)`,
    boxShadow: `0 0 0 1px ${hexToRgba(accent, 0.30)}, 0 4px_12px ${hexToRgba(primary, 0.12)}`,
  };
  const hoverBg = hexToRgba(primary, 0.10);

  const navItems: PortalNavItem[] = [
    {
      label: t("nav_dashboard"),
      href: `/talent/workspaces/${workspace.slug}`,
      exact: true,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 21V12h6v9" />
        </svg>
      ),
    },
    {
      label: t("nav_jobs"),
      href: `/talent/workspaces/${workspace.slug}/jobs`,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: t("workspace_portal_applications"),
      href: `/talent/workspaces/${workspace.slug}/applications`,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      label: t("nav_contracts"),
      href: `/talent/workspaces/${workspace.slug}/contracts`,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      label: t("nav_disputes"),
      href: `/talent/workspaces/${workspace.slug}/disputes`,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      label: t("nav_finances"),
      href: `/talent/workspaces/${workspace.slug}/finances`,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: t("nav_profile"),
      href: `/talent/workspaces/${workspace.slug}/profile`,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      label: t("nav_support"),
      href: `/talent/workspaces/${workspace.slug}/support`,
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed left-0 top-0 z-30 flex h-screen w-64 flex-col overflow-hidden text-[#EAF4F2] transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{ "--workspace-primary": primary, "--workspace-accent": accent } as CSSProperties}
      >
        {/* ── Background layers — mirrors main Sidebar but uses agency colors ── */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at top left, ${hexToRgba(primary, 0.22)} 0%, transparent 40%), radial-gradient(circle at bottom right, ${hexToRgba(accent, 0.18)} 0%, transparent 35%), linear-gradient(180deg, #081718 0%, #041012 100%)`,
          }}
        />
        {/* Grid pattern — white, same as main sidebar */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Right border */}
        <div className="absolute inset-y-0 right-0 w-px bg-white/[0.08]" />

        {/* ── Header — agency logo as the main identity ─────────────────────── */}
        <div className="relative flex h-16 flex-shrink-0 items-center justify-between border-b border-white/[0.08] px-5">
          {/* Agency logo + name */}
          <Link
            href={`/talent/workspaces/${workspace.slug}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20"
              style={{
                background: workspace.logoUrl
                  ? "rgba(255,255,255,0.08)"
                  : `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
              }}
            >
              {workspace.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={workspace.logoUrl}
                  alt={workspace.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[13px] font-black text-white select-none">
                  {agencyInitials(workspace.name)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold leading-tight text-white">
                {workspace.name}
              </p>
              <p className="text-[10px] font-medium text-white/45 leading-none mt-0.5">
                {t("workspace_portal_premium")}
              </p>
            </div>
          </Link>

          {/* Mobile close */}
          <button
            onClick={onClose}
            className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label={t("sidebar_close_menu")}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Navigation ────────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-0">
          {/* Top fade */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-5 z-10 bg-gradient-to-b from-[#081718] to-transparent" />
          {/* Bottom fade */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 z-10 bg-gradient-to-t from-[#041012] to-transparent" />

          <nav className="h-full px-3 py-4 overflow-y-auto sidebar-scroll">
            {/* Nav section card — mirrors premium section card in main sidebar */}
            <div
              className="rounded-[14px] p-1.5 pb-2"
              style={{
                background: hexToRgba(primary, 0.045),
                boxShadow: `inset 0 0 0 1px ${hexToRgba(primary, 0.13)}`,
              }}
            >
              {/* Section label */}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] select-none cursor-default"
                style={{ color: accent }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: primary, boxShadow: `0 0 5px ${hexToRgba(primary, 0.65)}` }}
                />
                {t("workspace_portal_exclusive")}
              </button>

              <ul className="flex flex-col gap-px">
                {navItems.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={[
                          "flex items-center gap-2.5 px-3 py-[7px] rounded-xl text-[13px] font-medium transition-all duration-150",
                          isActive
                            ? "text-white font-semibold"
                            : "text-[#AACCC7] hover:text-white",
                        ].join(" ")}
                        style={
                          isActive
                            ? activeItemStyle
                            : { backgroundColor: "transparent" }
                        }
                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = hoverBg; }}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <span
                          className="flex-shrink-0 transition-colors duration-150"
                          style={{ color: isActive ? "#fff" : accent }}
                        >
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>
        </div>

        {/* ── Footer divider ────────────────────────────────────────────────── */}
        <div className="relative px-5 pb-1">
          <div className="h-px bg-white/[0.08]" />
        </div>

        {/* ── User + Logout + Powered by ────────────────────────────────────── */}
        <div className="relative px-3 py-3 flex-shrink-0 space-y-1">
          {/* User card */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.05]">
            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-white/10">
              {!loading && avatarUrl && !imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={userInitials}
                  className="h-full w-full object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)` }}
                >
                  {loading ? "…" : userInitials}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-none text-[#F3FBF9]">
                {loading ? "…" : (displayName || email)}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-[#9DB8B3]">
                {loading ? "" : email}
              </p>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-[#C7D9D5] hover:bg-white/[0.07] hover:text-[#FFB3B3] transition-all duration-150 cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {t("nav_logout")}
          </button>

          {/* Powered by BrisaHub */}
          <Link
            href="/"
            className="flex items-center justify-center gap-2 py-1.5 opacity-40 hover:opacity-70 transition-opacity"
          >
            <Image
              src={heroBrandImage}
              alt="BrisaHub"
              width={heroBrandImage.width}
              height={heroBrandImage.height}
              className="h-auto w-16"
            />
          </Link>
        </div>
      </aside>
    </>
  );
}
